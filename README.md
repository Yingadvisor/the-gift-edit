# The Gift Edit

A recipient-first gift concierge prototype: understand the recipient, search real merchant products through **Shop MCP**, explain matches, refine exclusions, choose an exact variant, and hand the buyer to the merchant to review and pay.

**Live commerce integration, transparent rules-based ranking. No LLM is connected yet.** The app never pays, places an order, or handles payment credentials.

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

`build` creates static assets in `dist/`. The local server also handles `/api/shop`. An `api/shop.mjs` serverless entry and `vercel.json` are supplied for a separately authorized Vercel deployment. **A repository import is not a deployment.**

## The working flow

1. Enter the recipient, occasion, item-price budget, likes, avoidances and a separate product query.
2. The server calls anonymous Shop MCP `search_catalog`. Only the visible query, USD budget and explicit US demo-market context are sent, never the recipient name or private profile fields.
3. The browser ranks the returned products with documented keyword rules. It excludes above-budget or non-USD prices, unavailable featured variants, explicit avoidances and products with no recipient-interest overlap. Empty results stay empty; no sample items are substituted.
4. “Not this one” or category rejection reranks the current visible results without another network call. The page retains results only in its current state; no persistent catalog cache is created.
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
- Browser visual/interactive QA remains unverified in this execution environment. The optional browser smoke suite uses synthetic intercepted API responses and never creates a merchant checkout. Run it in a supported Chromium environment before presenting the UI as browser-verified.
- See `docs/VERIFICATION.md` for the final test count and limits.

## Project map

- `public/`: responsive navy/gold UI, browser-local recipient profile, original artwork inspiration.
- `src/shop-catalog.mjs`: live result ranking, rendering helpers, constraints and briefs.
- `src/product-review.mjs`: canonical public details for pre-checkout drift detection.
- `server/shop-mcp.mjs`: anonymous protocol adapter, strict tool allowlist and bounded responses.
- `server/shop-api.mjs`: same-origin API, validation, refresh-before-checkout and safe merchant handoff.
- `api/shop.mjs`: Vercel Node entry.
- `src/catalog.mjs`, `src/recommender.mjs`, `src/brief.mjs`: retained original-art prototype modules and their tests; these are not the live Shop catalog and do not supply fallback shopping results.
- `tests/`: dependency-free Node regression suite with synthetic commerce fixtures.

## Expression Atelier and pre-existing artwork

Expression Atelier is untouched. Its homepage is only a separate, manual original-art exploration link. It does not receive the brief automatically and is not the checkout for Shop merchant products. Do not recreate another merchant's product design through Atelier.

The hero uses earlier original Arcade digital renders as clearly labeled inspiration, not current Shop products or physical sample photos. Eight original renders are retained with source hashes in `docs/asset-provenance.json`; no private franchise concept art is included. Their old candidate prices are unverified modeling scenarios in the retained offline modules, not live offers. Arcade supplier manufacturing billing is separate from customer checkout.

## AI and competition status

A real LLM agent is still an integration to add after the user's secure provider/credential choice and a bounded live verification. Do not present rules-based ranking as AI reasoning. Never put credentials in browser code, Git, screenshots or chat.

See `docs/BUILD-PROVENANCE.md` for the initial build and Shop pivot timestamps. Some code and original assets predate any unverified official event start. Event eligibility has not been established; disclose pre-existing material and follow organizer rules. Do not rewrite history to imply later creation.

No license has been assigned to code or artwork. Public visibility alone does not grant third-party reuse rights. No existing Expression Atelier source or Git history is imported.
