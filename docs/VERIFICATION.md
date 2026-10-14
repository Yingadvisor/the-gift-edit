# Verification record · 2026-10-14 UTC

## Passed

- Node.js 24.19.0; source supports Node.js 22+ with no runtime package dependencies.
- `npm test`: 107 passing tests at final review, including independent rules and asynchronous UI regression suites.
- Shop MCP `tools/list`: actual HTTP 200; current search_catalog, get_product and create_checkout input schemas inspected. Outgoing arguments validated against those Draft 2020-12 schemas.
- One fresh anonymous generic search (`ocean home gifts`, US/USD, item cap 75 USD, limit 3) succeeded through the implemented adapter and returned three actual merchant products.
- One actual get_product read for a returned optionless product succeeded with the exact product/variant identity, selected:[], USD price and availability. These reads sent no recipient profile, name, address, login or payment data.
- Actual media shape confirmed as type:image, url, alt_text; description.plain is handled as inert text, even when it contains HTML-like markup.
- Build completes without provider calls, keys or remote build services.
- HTTP/static serving checks passed in the original local server. The updated API handler is covered by mocked request/response tests.
- Exact byte hashes for all eight original artwork renders match their source pack. No private franchise art added.
- Checkout mock tests cover exact options, merchant, price, currency, stock, details hash, recipient constraints, duplicate clicks, mandatory warnings, access-link preservation, private-field removal and uncertain writes.
- UI mock tests cover stale product responses, delayed checkout A versus current variant B, local recipient avoidance recheck, private profile exclusion from API payload, uncertainty/no-repeat and combined warning visibility.

## Not performed / not established

- No real create_checkout call, cart, payment, order, Shop sign-in, Arcade billing test or manufacturing order was made. All checkout verification used clearly synthetic fixtures.
- No LLM provider is connected or verified. The ranking is rules-based, not AI reasoning.
- Full desktop/mobile visual/browser interaction remains unverified here. Earlier local Chromium launch was sandbox-blocked and the cloud browser could not access localhost. A separate in-memory preview attempt was rejected before execution by a tool size limit; those routes were not retried.
- scripts/browser_smoke.py is an optional synthetic browser suite. It intercepts all commerce requests and blocks external network calls, so it does not create real checkouts. It must still be run in a supported environment.
- An earlier research-only generic search had an approval canceled with uncertain network execution. It was not treated as success or blindly repeated. The fresh successful search above was a separate approved implementation smoke test.

## Deployment and production caveats

Source import and deployment status must be verified separately against the actual commit and deployment URL. A configuration file is not a successful deployment. In-memory rate/duplicate guards are not distributed production guarantees. Add platform-wide controls before public-scale traffic. No catalog responses, merchant images or checkout access links are persisted in this source tree.
