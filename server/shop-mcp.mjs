import {randomUUID} from 'node:crypto';

// Anonymous, stateless Shop MCP only. Never send provider credentials or follow redirects.
export const SHOP_MCP_ENDPOINT = 'https://mcp.shop.com/';
export const SHOP_MCP_PROTOCOL_VERSION = '2026-07-28';
const ALLOWED_TOOLS = new Set(['search_catalog', 'get_product', 'create_checkout']);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SAFE_MESSAGES = {
  UPSTREAM_TIMEOUT: 'Shop took too long to respond. Please try the read again later.',
  UPSTREAM_UNAVAILABLE: 'Shop is temporarily unavailable. Please try again later.',
  UPSTREAM_RATE_LIMITED: 'Shop is busy. Please wait before trying again.',
  UPSTREAM_AUTH_REQUIRED: 'Anonymous shopping is not available for this request.',
  UPSTREAM_INVALID_REQUEST: 'Shop could not accept this request.',
  UPSTREAM_INVALID_RESPONSE: 'Shop returned an unreadable response.',
  UPSTREAM_ERROR: 'Shop could not finish this request.',
  TOOL_NOT_ALLOWED: 'This Shop operation is not available.',
  CHECKOUT_OUTCOME_UNCERTAIN: 'The checkout request may have reached the merchant. Do not submit it again automatically.',
};

export class ShopError extends Error {
  constructor(code, {status = 502, message, reviewRequired = false, outcomeUncertain = false} = {}) {
    super(message || SAFE_MESSAGES[code] || 'This request could not be completed.');
    this.name = 'ShopError';
    this.code = code;
    this.status = status;
    this.reviewRequired = reviewRequired;
    this.outcomeUncertain = outcomeUncertain;
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function boundedText(response) {
  const declaredLength = response.headers?.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel?.();
    throw new ShopError('UPSTREAM_INVALID_RESPONSE');
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ShopError('UPSTREAM_INVALID_RESPONSE');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function decodeResponse(text, contentType, id) {
  try {
    if (contentType.includes('text/event-stream')) {
      const responses = [];
      for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (!data || data === '[DONE]') continue;
        const value = JSON.parse(data);
        if (isRecord(value) && value.id === id) responses.push(value);
      }
      if (responses.length !== 1) throw new Error('Missing or duplicate response');
      return responses[0];
    }
    if (!contentType.includes('application/json')) throw new Error('Unsupported response type');
    return JSON.parse(text);
  } catch {
    throw new ShopError('UPSTREAM_INVALID_RESPONSE');
  }
}

function rpcError(error) {
  if (error?.code === -32602 || error?.code === -32600) return new ShopError('UPSTREAM_INVALID_REQUEST');
  return new ShopError('UPSTREAM_ERROR');
}

export function createShopClient({fetchImpl = globalThis.fetch, timeoutMs = 20000} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  return Object.freeze({
    async callTool(name, args) {
      if (!ALLOWED_TOOLS.has(name)) throw new ShopError('TOOL_NOT_ALLOWED', {status: 400});
      if (!isRecord(args)) throw new ShopError('UPSTREAM_INVALID_REQUEST', {status: 400});
      const id = randomUUID();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();
      let dispatched = false;
      try {
        dispatched = true;
        const response = await fetchImpl(SHOP_MCP_ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': SHOP_MCP_PROTOCOL_VERSION,
            'Mcp-Method': 'tools/call',
            'Mcp-Name': name,
          },
          body: JSON.stringify({
            jsonrpc: '2.0', id, method: 'tools/call',
            params: {
              name, arguments: args,
              _meta: {
                'io.modelcontextprotocol/protocolVersion': SHOP_MCP_PROTOCOL_VERSION,
                'io.modelcontextprotocol/clientInfo': {name: 'the-gift-edit', version: '0.2.0'},
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          }),
        });
        if (!response.ok) {
          await response.body?.cancel?.();
          if (response.status === 429) throw new ShopError('UPSTREAM_RATE_LIMITED', {status: 429});
          if (response.status === 401 || response.status === 403) throw new ShopError('UPSTREAM_AUTH_REQUIRED');
          if (response.status >= 500) throw new ShopError('UPSTREAM_UNAVAILABLE');
          throw new ShopError('UPSTREAM_INVALID_REQUEST');
        }
        const payload = decodeResponse(await boundedText(response), response.headers?.get('content-type') || '', id);
        if (!isRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== id) {
          throw new ShopError('UPSTREAM_INVALID_RESPONSE');
        }
        if (payload.error) throw rpcError(payload.error);
        if (!isRecord(payload.result)) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
        if (payload.result.isError === true) throw new ShopError('UPSTREAM_ERROR');
        if (!isRecord(payload.result.structuredContent)) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
        return payload.result.structuredContent;
      } catch (error) {
        // A failed write is never retried or replaced, even if the transport outcome is unknown.
        if (name === 'create_checkout' && dispatched) {
          throw new ShopError('CHECKOUT_OUTCOME_UNCERTAIN', {status: 502, outcomeUncertain: true});
        }
        if (error instanceof ShopError) throw error;
        throw new ShopError(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
