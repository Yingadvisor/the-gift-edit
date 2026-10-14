# The Gift Edit

A recipient-first gift concierge prototype: understand the recipient, search real merchant products through **Shop MCP**, explain matches, refine exclusions, choose an exact variant, and hand the buyer to the merchant to review and pay.

**Live Shop commerce with transparent rules, plus an optional real model-driven tool loop through Vercel AI Gateway.** The agent code is implemented and mock-tested; a live model run has not yet been verified. Configuration alone is not proof of a working model. The app never pays, places an order, or handles payment credentials.

## Run locally

Requires Node.js 22+. No package installation, Shop API key, login or CLI is needed.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Use `PORT=4200 npm run dev` for another port.

```sh
npm test
npm run build
npm start
```

`build` creates static assets in `dist/`. The local server also handles `/api/shop` and `/api/agent`. An `api/shop.mjs` serverless entry and `vercel.json` are supplied for a separately authorized Vercel deployment. **A repository import is not a deployment.**

## The working flow

1. Enter the recipient, occasion, item-price budget, likes, avoidances and a separate product query.
2. In the default rules mode, the server calls anonymous Shop MCP `search_catalog`. Only the visible query, USD budget and explicit US demo-market context are sent, never the recipient name or private profile fields.
3. The browser ranks the returned products with documented keyword rules. It excludes above-budget or non-USD prices, unavailable featured variants, explicit avoidances and products with no recipient-interest overlap. Empty results stay empty; no sample items are substituted.
4. Quick exclusion chips screen Clothes & shoes, Food & alcohol, Fragranced items, Requires a size choice, Large/heavy items and High-maintenance gifts. Confirmed evidence excludes; missing evidence is labeled “Can’t verify”, never guaranteed safe. Other things to avoid remains free text. “Not this one”, chips or category rejection reranks the current visible results without another network call. The page retains results only in its current state; no persistent catalog cache is created.
5. “Refresh & choose” calls `get_product` and checks actual selected options, price, currency and stock. Changing an option refreshes again. Recipient checks are rerun locally.
6. The buyer clicks **Create merchant checkout** after reviewing one exact item and merchant. The server refreshes again and rejects changed stock, price, currency, seller, options or reviewed public product details before creating checkout.
7. The app displays merchant warnings, legal links, labeled totals and the unchanged `continue_url`. The buyer clicks **Review & pay at merchant** and enters delivery/payment details there. This app never calls `complete_checkout`.

Prices shown are item prices in the explicitly selected **US / USD demo market**, not the user's detected location. Tax and shipping are extra and may exceed the budget. The merchant determines final charges, fulfillment, terms and availability. A destination-country match is not a delivery-date promise.

## Shop MCP implementation

- Fixed endpoint: https://mcp.shop.com/.
- Stateless JSON-RPC `tools/call`, MCP protocol `2026-07-28`; no initialize/session bootstrap.
- Exact protocol headers and tool arguments verified against the official docs and current `tools/list` schemas.
- Server-only allowlist: `search_catalog`, `get_product`, `create_checkout`.
- No account, OAuth, approval-card, saved-payment or complete-order actions.
- Search/product data use `Cache-Control: no-store`; original merchant image URLs and attribution parameters are preserved, never downloaded or rehosted.
- Checkout IDs and access URLs are not logged. Payment instruments, credentials and buyer profiles are removed from the browser response.
- Checkout writes have UUID idempotency keys, double-click guards and conservative uncertainty handling. There is no automatic write retry or replacement after an uncertain outcome.
- Same-origin POST/JSON only, 16 KB request cap, bounded response size, timeout and per-process rate limits. Public production scale needs platform-wide rate protection and durable duplicate handling.

Documentation: [Quickstart](https://shop.dev/docs/quickstart), [Search](https://shop.dev/docs/search), [Checkout](https://shop.dev/docs/checkout), [Authentication](https://shop.dev/docs/authentication).

## Verification, honestly stated

- Anonymous generic `search_catalog` and one exact `get_product` read succeeded through the implemented adapter on October 14, 2026.
- Current tests cover ranking, exclusions, schemas, exact options, changing price/stock/currency/seller, duplicate clicks, warnings, safe URLs, privacy and uncertain writes.
- **No real checkout was created during testing; checkout responses are synthetic mocks. No charge or order was made.**
- The initial deployment at https://the-gift-edit-seven.vercel.app/ was verified in the cloud browser: real search, exact variant refresh, brief/copy, item exclusion/reset and low-budget results. An oversized hero image was found and corrected locally; the subsequent release remains subject to repository/deployment verification. Mobile and new agent/chip browser flows are not yet verified. The optional browser smoke suite is synthetic and never creates a merchant checkout.
- See `docs/VERIFICATION.md` for the final test count and limits.

## Project map

- `public/`: responsive navy/gold UI, browser-local recipient profile, original artwork inspiration.
- `src/shop-catalog.mjs`: live result ranking, rendering helpers, constraints and briefs.
- `src/product-review.mjs`: canonical public details for pre-checkout drift detection.
- `server/shop-mcp.mjs`: anonymous protocol adapter, strict tool allowlist and bounded responses.
- `server/shop-api.mjs`: same-origin API, validation, refresh-before-checkout and safe merchant handoff.
- `server/gift-agent.mjs`: bounded model-driven read-only Shop tool loop and grounded result validation.
- `server/agent-api.mjs`: model consent, same-origin/body/rate boundary and existing Gateway credential resolution.
- `src/exclusion-factors.mjs`: conservative evidence-based quick exclusion screening.
- `api/shop.mjs`, `api/agent.mjs`: Vercel Node entries.
- `src/catalog.mjs`, `src/recommender.mjs`, `src/brief.mjs`: retained original-art prototype modules and their tests; these are not the live Shop catalog and do not supply fallback shopping results.
- `tests/`: dependency-free Node regression suite with synthetic commerce fixtures.

## Expression Atelier and pre-existing artwork

Expression Atelier is untouched. Its homepage is only a separate, manual original-art exploration link. It does not receive the brief automatically and is not the checkout for Shop merchant products. Do not recreate another merchant's product design through Atelier.

The hero uses earlier original Arcade digital renders as clearly labeled inspiration, not current Shop products or physical sample photos. Eight original renders are retained with source hashes in `docs/asset-provenance.json`; no private franchise concept art is included. Their old candidate prices are unverified modeling scenarios in the retained offline modules, not live offers. Arcade supplier manufacturing billing is separate from customer checkout.

## AI and competition status

The optional agent uses server-only native fetch to Vercel AI Gateway with model `openai/gpt-4.1-mini` by default (`AI_GATEWAY_MODEL` may select a supported model). It consumes only an already configured `AI_GATEWAY_API_KEY`, or an explicitly server-managed `VERCEL_OIDC_TOKEN`. It does not create keys, enable OIDC, or grant access. Credentials are never returned to the browser or written to the repository. This release does not trust any incoming OIDC header. Automatic request-time OIDC integration is not enabled because the plain Function runtime context has not been verified. A manually supplied server OIDC token can expire and has no automatic refresh here; the recommended release configuration is the existing authorized `AI_GATEWAY_API_KEY` secret. Future OIDC support should use Vercel's official helper and a verified trusted runtime, not raw request headers.

Selecting **Use AI-guided search** explicitly shares the non-identifying interests, avoidances, occasion, budget, optional direction and quick exclusions with Vercel AI Gateway and its selected model. The recipient name field and relationship are omitted. Free text cannot be perfectly anonymized: do not enter names, contact details, credentials or sensitive information in shared fields. Rules mode remains model-free, and no model is called automatically on page load.

The model chooses `search_catalog` and `get_product` calls, receives bounded public catalog evidence, then selects observed, refreshed IDs. The loop stops at six model steps, eight read-only tools or 45 seconds. Budget, USD, availability, exact variants, dislikes and evidence-based exclusions remain code-enforced. Unsupported model prose is not shown as merchant fact; reasons use grounded product evidence. Checkout is **not** a model tool. A failed model run does not silently become an “AI” rules result.

Auth/credits are unverified until an actual user-requested run succeeds. No live inference has been made in implementation tests. Use the provider's supported secure setup; never paste credentials into chat, browser code, Git or screenshots. Public-scale deployment also needs distributed rate/cost controls; current process-local gates are only a demo safeguard.

Official references: [Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok), [OIDC](https://vercel.com/docs/oidc), [Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions), [Tool calling](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/tool-calling).

See `docs/BUILD-PROVENANCE.md` for the initial build and Shop pivot timestamps. Some code and original assets predate any unverified official event start. Event eligibility has not been established; disclose pre-existing material and follow organizer rules. Do not rewrite history to imply later creation.

No license has been assigned to code or artwork. Public visibility alone does not grant third-party reuse rights. No existing Expression Atelier source or Git history is imported.
