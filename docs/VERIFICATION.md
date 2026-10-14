# Verification record · 2026-10-14 UTC

## Current local v0.4 gift-set release

- Node.js 24.19.0; source supports Node.js 22+ with no runtime package dependencies.
- `npm test`: 232 passing tests, including independent UI/async review. Production build passed. All local tests use synthetic model and commerce responses; no real checkout is created.
- Primary gifts: default target 10 distinct choices, aiming for at least 5 when real eligible results exist. Cards, wrapping, empty boxes and party add-ons are excluded as primary gifts unless explicitly requested. Fewer real choices are never padded with invented items. Soft value/category preferences never force spending the budget.
- Set constraints: exact USD cents, six unique variants, quantity one each, aggregate budget checks, duplicate rejection, separate merchant groups, current exclusions, exact option review and public-details hashes.
- Merchant-group API: refreshes every item before any write, rejects changed price/stock/currency/seller/options/details, exact returned line-item validation, preserves warnings and complete continue URL, strips private fields. The set refresh phase must finish within a 25-second pre-write budget or no checkout is dispatched. Pending/uncertain variant overlaps are blocked across both group and single-item requests.
- UI regression tests cover add/remove without checkout, budget reduction, changed exclusions/preferences, stale refreshes, delayed checkout modal isolation, merchant notices, optionless products and lost recipient-provenance prevention.
- Strict arrival deadline is a **local fail-closed control**, not completed delivery verification. Current documented Shop catalog responses have no supported destination-specific arrival ETA. Unknown or unsupported arrival evidence cannot qualify, even if stock is available or ships_to matches. No date, address or destination is sent by this control, and no checkout is created to obtain an estimate. Merchant dispatch/policy retrieval is not implemented.
- Ready-made Shop gifts and Custom-made Expression Atelier are separate entry paths. Custom brief copying stays local; there is no automatic handoff, custom quote, stock, shipping or manufacturing promise.
- Self-gifting: explicit Myself mode does not require a recipient name, accepts first-person interests only in that context, uses you-focused labels, and shares only a boolean context with the model. Other-recipient giver-preference guards remain.
- Safe model diagnostics expose only allowlisted error code/stage and fixed text, never prompts, provider bodies, stacks or credentials.
- This v0.4 release is locally prepared. Repository upload, deployment, public gift-set flow and mobile visual QA remain to be verified.

## Previously verified live behavior

- Anonymous Shop `tools/list` returned HTTP 200. The current search_catalog, get_product and create_checkout input schemas were inspected and arguments validated against them.
- A fresh generic anonymous search and exact product/variant refresh succeeded through the implemented adapter on October 14. No recipient identity, address, login or payment data was sent.
- Initial public deployment at https://the-gift-edit-seven.vercel.app/ completed real search, exact product refresh, gift brief/copy, exclusions/reset and low-budget results in the cloud browser.
- User-uploaded commit 789faae8a6953def8756242a5ac19fe8e11563da at 20:01:44 UTC deployed successfully. Desktop hero layout correction and exclusion-chip behavior were verified publicly.
- User configured Gateway access themselves and redeployed around 20:10 UTC. A bounded generic AI smoke run returned a safe failure. The user subsequently reported a connected run with greeting-card products. Successful model/tool output has not yet been independently reproduced; local agent tests use synthetic responses.
- Original artwork file hashes match the source pack. Hero artwork is separate inspiration, not a live Shop catalog or physical sample.

## Not performed / limits

- No real create_checkout, payment, order, Shop sign-in, Arcade billing test or manufacturing order was performed. All checkout tests are mocks.
- No credential was created, entered, printed or saved during implementation. Credentials configured by the user remain server-only.
- No cached catalog, downloaded merchant image, checkout access URL or user profile is included in the repository.
- Mobile visual QA and a public browser run of this gift-set release are pending. Earlier blocked local browser routes were not retried.
- Process-local rate and duplicate guards are demo safeguards, not distributed production guarantees. Add platform-wide cost/rate control and durable idempotency before public-scale traffic.
- `scripts/browser_smoke.py` is an optional synthetic browser suite. It intercepts commerce and blocks other network requests; it has not been run successfully in this environment.

## Delivery sources checked

[Shop search](https://shop.dev/docs/search), [Shop tools](https://shop.dev/docs/tools), [Shop Catalog API](https://shop.dev/docs/catalog-api), [Shopify Global Catalog extension](https://shopify.dev/docs/agents/catalog/global-catalog-extension), and [UCP Catalog specification](https://ucp.dev/latest/specification/shopping/catalog/). Destination hints and ships_to establish context/coverage, not an arrival commitment. Any future delivery evaluator needs verified dispatch, transit, destination, method, cutoffs, calendar semantics, source and freshness before stating an estimate; an estimate is not a guarantee.
