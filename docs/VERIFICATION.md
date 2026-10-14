# Verification record · 2026-10-14 UTC

## Passed

- Node.js 24.19.0; source supports Node.js 22+ with no runtime package dependencies.
- `npm test`: 150 passing tests for the consolidated optional-agent, exclusion-chip and layout release, including independent rules and asynchronous UI regression suites.
- Shop MCP `tools/list`: actual HTTP 200; current search_catalog, get_product and create_checkout input schemas inspected. Outgoing arguments validated against those Draft 2020-12 schemas.
- One fresh anonymous generic search (`ocean home gifts`, US/USD, item cap 75 USD, limit 3) succeeded through the implemented adapter and returned three actual merchant products.
- One actual get_product read for a returned optionless product succeeded with the exact product/variant identity, selected:[], USD price and availability. These reads sent no recipient profile, name, address, login or payment data.
- Actual media shape confirmed as type:image, url, alt_text; description.plain is handled as inert text, even when it contains HTML-like markup.
- Public-browser gift brief, Copy confirmation, item exclusion, reranking and reset passed. A low-budget live search showed only returned items at or below the chosen item-price ceiling. No checkout button was clicked.
- Build completes without provider calls, keys or remote build services.
- HTTP/static serving checks passed in the original local server. The updated API handler is covered by mocked request/response tests.
- Exact byte hashes for all eight original artwork renders match their source pack. No private franchise art added.
- Checkout mock tests cover exact options, merchant, price, currency, stock, details hash, recipient constraints, duplicate clicks, mandatory warnings, access-link preservation, private-field removal and uncertain writes.
- UI mock tests cover stale product responses, delayed checkout A versus current variant B, local recipient avoidance recheck, private profile exclusion from API payload, uncertainty/no-repeat and combined warning visibility.

## Not performed / not established

- No real create_checkout call, cart, payment, order, Shop sign-in, Arcade billing test or manufacturing order was made. All checkout verification used clearly synthetic fixtures.
- The optional Vercel Gateway model-driven tool loop is implemented and covered by synthetic tests. No real model inference or working provider credits/access has been verified. Rules mode remains model-free. New agent/chip release is not yet deployed.
- Public desktop browser verification began at 19:11 UTC at https://the-gift-edit-seven.vercel.app/. The deployed app completed live generic-example search and exact variant refresh. An oversized original hero image was found and corrected locally by setting responsive image height. Prepared fix commit e10bb430ed910cf0642c06c7ad941cd62b03c68b was NOT on main at 19:14 UTC: the branch-update tool was canceled twice, and readback confirmed main remained at 61467bf8ac478d57874c7bf5f7efc662a837f6fb. Mobile visual verification remains pending. Earlier local Chromium and localhost routes were blocked or unavailable and were not retried.
- scripts/browser_smoke.py is an optional synthetic browser suite. It intercepts all commerce requests and blocks external network calls, so it does not create real checkouts. It must still be run in a supported environment.
- An earlier research-only generic search had an approval canceled with uncertain network execution. It was not treated as success or blindly repeated. The fresh successful search above was a separate approved implementation smoke test.

## Deployment and production caveats

Initial full-source commit 61467bf8ac478d57874c7bf5f7efc662a837f6fb was successfully deployed by the user through Vercel at 19:05 UTC. Public frontend and deployed Shop search/get_product were observed in the cloud browser. Later fixes require their own deployment verification. In-memory rate/duplicate guards are not distributed production guarantees. Add platform-wide controls before public-scale traffic. No catalog responses, merchant images or checkout access links are persisted in this source tree.

## Consolidated release review · approximately 19:24 UTC

- 150 tests and production build passed. Independent review checked consent, omitted identity fields, no automatic inference, no fake AI fallback, exact variants, exclusions, origin/body/rate gates and credential redaction.
- Fixed review-content hash coverage for variant metadata and product options, exact model-selected variant presentation, and unrelated one-size accessory evidence.
- Rejected all incoming request-header OIDC; only explicitly configured server credentials are consumed and a giver-only preference guard before model calls.
- Existing authorized credential consumption only; no secret was created, entered or saved. No live model run.
- This release remains local pending a fresh consolidated release approval and verified repository update. The prior canceled layout-only branch operations were not bypassed.

- Final auth hardening: header provenance and plain-handler OIDC runtime support were not established by official sources, so automatic header-token use was removed before release. No secret setup was performed.
