import {createHash, createHmac, randomBytes} from 'node:crypto';
import {createShopClient, isRecord, ShopError} from './shop-mcp.mjs';
import {reviewContent} from '../src/product-review.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_BUDGET_CENTS = 1_000_000;
const CONTEXT = Object.freeze({address_country: 'US', currency: 'USD'});
const CHECKOUT_STATUSES = new Set(['incomplete', 'requires_escalation', 'ready_for_complete', 'complete_in_progress', 'completed', 'canceled']);
const GID = /^gid:\/\/shopify\/[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEYS = /^(?:payment|payments|instruments?|credentials?|authorization|access_token|refresh_token|token|api_key|secret|password|session|buyer|destinations?)$/i;

function fail(code, message, status = 400, extra = {}) {
  throw new ShopError(code, {status, message, ...extra});
}

function exactKeys(value, keys) {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) {
    fail('INVALID_REQUEST', 'This request contains unsupported fields.');
  }
}

function shortString(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('INVALID_REQUEST', `A valid ${label} is required.`);
  }
  return value;
}

function identifier(value, label) {
  shortString(value, 512, label);
  if (!GID.test(value)) fail('INVALID_REQUEST', `A valid ${label} is required.`);
  return value;
}

function domain(value) {
  shortString(value, 253, 'merchant domain');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)) {
    fail('INVALID_REQUEST', 'A valid merchant domain is required.');
  }
  return value;
}

function budgetCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    fail('INVALID_REQUEST', 'Use a USD budget between $0.01 and $10,000 with at most two decimal places.');
  }
  return Math.round(value * 100);
}

function selection(value) {
  if (!Array.isArray(value) || value.length > 16) fail('INVALID_REQUEST', 'Valid product options are required.');
  const seen = new Set();
  return value.map(option => {
    exactKeys(option, ['name', 'label']);
    const name = shortString(option.name, 100, 'option name');
    const label = shortString(option.label, 160, 'option label');
    if (seen.has(name)) fail('INVALID_REQUEST', 'Each product option must be selected only once.');
    seen.add(name);
    return {name, label};
  });
}

function sameSelection(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const names = new Set();
  return actual.every(option => {
    if (!isRecord(option) || typeof option.name !== 'string' || typeof option.label !== 'string' || names.has(option.name)) return false;
    names.add(option.name);
    return expected.some(wanted => wanted.name === option.name && wanted.label === option.label);
  });
}

function hasExactSelection(product, variant, expected) {
  // Some optionless products omit these arrays. Missing data is not a wildcard:
  // only accept that case when every option-bearing field proves there are none.
  const emptyOrAbsent = value => value === undefined || (Array.isArray(value) && value.length === 0);
  if (expected.length === 0) return emptyOrAbsent(product.options) && emptyOrAbsent(product.selected) && emptyOrAbsent(variant.options);
  return sameSelection(product.selected, expected) && sameSelection(variant.options, expected);
}

function catalogContext(max) {
  return {
    context: {...CONTEXT},
    filters: {price: {max}, available: true, ships_to: {country: 'US'}},
  };
}

function messages(document) {
  if (document.messages === undefined) return [];
  if (!Array.isArray(document.messages)) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
  return document.messages;
}

function review(code, message) {
  fail(code, message, 409, {reviewRequired: true});
}

function safeHttps(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) return false;
    return !/(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(url.hostname);
  } catch { return false; }
}

// Keep shopper-facing fields, never payment instruments, credentials, buyer profiles or checkout IDs.
function scrub(value, depth = 0) {
  if (depth > 20) return undefined;
  if (Array.isArray(value)) return value.map(item => scrub(item, depth + 1)).filter(item => item !== undefined);
  if (!isRecord(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if ((key === 'url' || key === 'href') && typeof item === 'string' && !safeHttps(item)) continue;
    const cleaned = scrub(item, depth + 1);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
}

function safeCheckout(document, variantId) {
  if (!CHECKOUT_STATUSES.has(document.status) || typeof document.currency !== 'string' || !Array.isArray(document.totals) || !Array.isArray(document.links) || !safeHttps(document.continue_url)) {
    throw new ShopError('UPSTREAM_INVALID_RESPONSE', {outcomeUncertain: true});
  }
  if (!Array.isArray(document.line_items) || document.line_items.length !== 1 || document.line_items[0]?.item?.id !== variantId || document.line_items[0]?.quantity !== 1) {
    review('CHECKOUT_ITEMS_CHANGED', 'The merchant returned different checkout items. Do not continue without reviewing them.');
  }
  const result = {};
  for (const key of ['status', 'currency', 'line_items', 'totals', 'messages', 'links', 'expires_at']) {
    if (document[key] !== undefined) result[key] = scrub(document[key]);
  }
  result.messages ??= [];
  result.continue_url = document.continue_url; // Preserve the exact URL, including every query parameter.
  return result;
}

function assertRequestHeaders(req) {
  if (req.method !== 'POST') fail('METHOD_NOT_ALLOWED', 'Use POST for this endpoint.', 405);
  const contentType = req.headers?.['content-type'];
  if (typeof contentType !== 'string' || contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail('UNSUPPORTED_MEDIA_TYPE', 'Use application/json for this endpoint.', 415);
  }
  const origin = req.headers?.origin;
  const host = req.headers?.host;
  try {
    const parsed = new URL(origin);
    if (typeof origin !== 'string' || typeof host !== 'string' || !['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.host !== host || parsed.username || parsed.password) throw new Error('Origin mismatch');
    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Insecure origin');
  } catch {
    fail('ORIGIN_NOT_ALLOWED', 'Open this page on the same site before using Shop.', 403);
  }
  if (req.headers?.['sec-fetch-site'] === 'cross-site') fail('ORIGIN_NOT_ALLOWED', 'Cross-site requests are not accepted.', 403);
  const length = req.headers?.['content-length'];
  if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > MAX_BODY_BYTES)) {
    fail('REQUEST_TOO_LARGE', 'Keep requests under 16 KB.', 413);
  }
}

async function readBody(req) {
  let raw;
  if (req.body !== undefined) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) raw = req.body;
    else if (isRecord(req.body)) {
      try { raw = JSON.stringify(req.body); } catch { fail('INVALID_JSON', 'Send a valid JSON object.'); }
    } else fail('INVALID_JSON', 'Send a valid JSON object.');
  } else {
    raw = await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      const timeout = setTimeout(() => finish(new ShopError('REQUEST_TIMEOUT', {status: 408, message: 'The request body took too long to arrive.'})), 10000);
      timeout.unref?.();
      const cleanup = () => {
        clearTimeout(timeout);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.removeListener('aborted', onAbort);
      };
      const finish = error => {
        cleanup();
        if (error) { req.resume?.(); reject(error); }
        else resolve(Buffer.concat(chunks));
      };
      const onData = chunk => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES) return finish(new ShopError('REQUEST_TOO_LARGE', {status: 413, message: 'Keep requests under 16 KB.'}));
        chunks.push(Buffer.from(chunk));
      };
      const onEnd = () => finish();
      const onError = () => finish(new ShopError('INVALID_JSON', {status: 400, message: 'The request body could not be read.'}));
      const onAbort = () => finish(new ShopError('INVALID_JSON', {status: 400, message: 'The request was interrupted.'}));
      req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
    });
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) fail('REQUEST_TOO_LARGE', 'Keep requests under 16 KB.', 413);
  try {
    const body = JSON.parse(raw.toString());
    if (!isRecord(body)) throw new Error('Expected object');
    return body;
  } catch { fail('INVALID_JSON', 'Send a valid JSON object.'); }
}

export function createShopHandler({fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 20000, rateLimit = 120, rateWindowMs = 60000, maxRateEntries = 1024, maxCheckoutEntries = 2048, checkoutTtlMs = 6 * 60 * 60 * 1000} = {}) {
  const client = createShopClient({fetchImpl, timeoutMs});
  const secret = randomBytes(32);
  const rates = new Map();
  const checkoutRequests = new Map();
  const recentCheckouts = new Map();
  const hash = value => createHmac('sha256', secret).update(value).digest('hex');
  const prune = (map, at) => { for (const [key, value] of map) if (value.expiresAt <= at) map.delete(key); };
  const gate = req => {
    const at = now();
    prune(rates, at);
    const key = hash(String(req.socket?.remoteAddress || 'anonymous').slice(0,256));
    let entry = rates.get(key);
    if (!entry) {
      if (rates.size >= maxRateEntries) rates.delete(rates.keys().next().value);
      entry = {count: 0, expiresAt: at + rateWindowMs};
      rates.set(key, entry);
    }
    if (++entry.count > rateLimit) fail('RATE_LIMITED', 'Please wait a moment before trying again.', 429);
    return key;
  };

  return async function shopHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      assertRequestHeaders(req);
      const clientKey = gate(req);
      const body = await readBody(req);
      let result;
      if (body.action === 'search') {
        exactKeys(body, ['action', 'query', 'budget']);
        const query = shortString(body.query, 240, 'search query').trim();
        const max = budgetCents(body.budget);
        const data = await client.callTool('search_catalog', {catalog: {query, ...catalogContext(max), pagination: {limit: 12}}});
        if (!Array.isArray(data.products) || data.products.length > 50 || data.products.some(product => !isRecord(product))) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
        result = {products: data.products, messages: messages(data), fetchedAt: new Date(now()).toISOString(), context: {country: 'US', currency: 'USD'}};
      } else if (body.action === 'product') {
        exactKeys(body, ['action', 'productId', 'selected', 'budget']);
        const id = identifier(body.productId, 'product ID');
        const selected = selection(body.selected);
        const max = budgetCents(body.budget);
        const data = await client.callTool('get_product', {catalog: {id, selected, ...catalogContext(max)}});
        if (!isRecord(data.product) || data.product.id !== id) throw new ShopError('UPSTREAM_INVALID_RESPONSE');
        result = {product: data.product, messages: messages(data), fetchedAt: new Date(now()).toISOString()};
      } else if (body.action === 'checkout') {
        exactKeys(body, ['action', 'productId', 'selected', 'variantId', 'shop', 'budget', 'expectedPrice', 'expectedDetailsHash', 'requestId', 'confirmed']);
        if (body.confirmed !== true) fail('BUYER_CONFIRMATION_REQUIRED', 'Select the checkout button after reviewing this exact item.', 400);
        const productId = identifier(body.productId, 'product ID');
        const variantId = identifier(body.variantId, 'variant ID');
        const selected = selection(body.selected);
        const shop = domain(body.shop);
        const max = budgetCents(body.budget);
        exactKeys(body.expectedPrice, ['amount', 'currency']);
        if (!Number.isSafeInteger(body.expectedPrice.amount) || body.expectedPrice.amount < 0 || body.expectedPrice.amount > MAX_BUDGET_CENTS || body.expectedPrice.currency !== 'USD') {
          fail('INVALID_REQUEST', 'Review a current USD price before opening checkout.');
        }
        if (typeof body.expectedDetailsHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedDetailsHash)) {
          fail('INVALID_REQUEST', 'Review the exact product details before opening checkout.');
        }
        if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) fail('INVALID_REQUEST', 'A fresh checkout request ID is required.');
        const at = now();
        prune(checkoutRequests, at); prune(recentCheckouts, at);
        const requestKey = hash(body.requestId.toLowerCase());
        const fingerprint = hash(JSON.stringify({productId, variantId, selected: [...selected].sort((a,b) => a.name.localeCompare(b.name)), shop, max, expectedPrice: body.expectedPrice, expectedDetailsHash: body.expectedDetailsHash}));
        const recentKey = hash(clientKey + fingerprint);
        if (checkoutRequests.has(requestKey)) fail('CHECKOUT_ALREADY_REQUESTED', 'This checkout request was already submitted. Do not submit it again.', 409);
        if (recentCheckouts.has(recentKey)) fail('CHECKOUT_ALREADY_REQUESTED', 'A checkout for this item was just requested. Please do not double-click.', 409);
        if (checkoutRequests.size >= maxCheckoutEntries || recentCheckouts.size >= maxCheckoutEntries) fail('RATE_LIMITED', 'Checkout is busy. Please try again later.', 429);
        checkoutRequests.set(requestKey, {expiresAt: at + checkoutTtlMs});
        recentCheckouts.set(recentKey, {expiresAt: at + 30000});
        let writeDispatched = false;
        try {
          const data = await client.callTool('get_product', {catalog: {id: productId, selected, ...catalogContext(max)}});
          const product = data.product;
          if (!isRecord(product) || product.id !== productId || !Array.isArray(product.variants)) review('PRODUCT_CHANGED', 'The product changed. Review it again before checkout.');
          const candidates = product.variants.filter(variant => variant?.id === variantId);
          if (candidates.length !== 1) review('VARIANT_CHANGED', 'The selected variant changed. Review the available options again.');
          const variant = candidates[0];
          if (!hasExactSelection(product, variant, selected)) review('OPTIONS_CHANGED', 'The merchant changed or relaxed your selected options. Review them again.');
          if (variant.seller?.domain !== shop) review('MERCHANT_CHANGED', 'The merchant changed. Review the item again.');
          if (variant.availability?.available !== true) review('OUT_OF_STOCK', 'This exact variant is no longer available. Choose another option.');
          if (!Number.isSafeInteger(variant.price?.amount) || variant.price.amount < 0 || variant.price.currency !== 'USD') review('CURRENCY_CHANGED', 'A current USD price is unavailable. Review the item again.');
          if (variant.price.amount > max) review('OVER_BUDGET', 'The current item price is above your budget. Review it again.');
          if (variant.price.amount !== body.expectedPrice.amount || variant.price.currency !== body.expectedPrice.currency) review('PRICE_CHANGED', 'The item price changed. Review the new price before checkout.');
          const detailsHash = createHash('sha256').update(reviewContent(product, variant)).digest('hex');
          if (detailsHash !== body.expectedDetailsHash) review('DETAILS_CHANGED', 'The product details changed. Review them against the recipient\'s requirements before checkout.');
          const refreshedMessages = messages(data);
          writeDispatched = true;
          const checkoutDocument = await client.callTool('create_checkout', {
            shop: variant.seller.domain,
            checkout: {line_items: [{item: {id: variant.id}, quantity: 1}], context: {address_country: 'US'}},
            meta: {'idempotency-key': body.requestId},
          });
          const checkout = safeCheckout(checkoutDocument, variant.id);
          const combinedMessages = [...scrub(refreshedMessages), ...messages(checkout)];
          if (checkout.currency !== 'USD') combinedMessages.push({type: 'warning', code: 'checkout_currency_changed', content: 'The merchant checkout uses a different currency. Review its currency and full total before paying.'});
          result = {checkout, messages: combinedMessages, fetchedAt: new Date(now()).toISOString()};
        } catch (error) {
          if (!writeDispatched) {
            checkoutRequests.delete(requestKey);
            recentCheckouts.delete(recentKey);
          } else {
            // The merchant may already have created the checkout. A malformed or
            // changed response is not permission to open a replacement checkout.
            recentCheckouts.set(recentKey, {expiresAt: at + checkoutTtlMs});
            if (error instanceof ShopError) error.outcomeUncertain = true;
            else throw new ShopError('CHECKOUT_OUTCOME_UNCERTAIN', {outcomeUncertain: true});
          }
          throw error;
        }
      } else {
        fail('ACTION_NOT_ALLOWED', 'Only search, product review, and buyer-confirmed checkout are available.');
      }
      send(200, result);
    } catch (error) {
      const safe = error instanceof ShopError ? error : new ShopError('UPSTREAM_ERROR');
      if (safe.status === 405) res.setHeader('Allow', 'POST');
      if (safe.status === 429) res.setHeader('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
      send(safe.status, {error: {code: safe.code, message: safe.message, reviewRequired: safe.reviewRequired, outcomeUncertain: safe.outcomeUncertain}});
    }
  };
}

export default createShopHandler();
