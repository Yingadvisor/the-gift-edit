# The Gift Edit

A recipient-first gift concierge prototype: understand the recipient, search real merchant products through **Shop MCP**, explain matches, refine exclusions, choose exact variants for a gift set, and hand the buyer to the merchant to review and pay.

**Live Shop commerce with transparent rules, plus an optional real model-driven tool loop through Vercel AI Gateway.** The agent code is implemented and mock-tested; a live coffee/$100 model run was independently verified on October 14 at 21:19:59 UTC: 12 catalog listings found, 10 refreshed and 9 recommendations returned. Configuration alone is not proof of a working model. The app never pays, places an order, or handles payment credentials.

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

1. Enter the recipient, occasion, item-price budget, likes and avoidances, then optionally choose expression chips or add your own meaning near the submit button. Audience, aesthetic Style and Lifestyle are separate fields. There is no separate product-query field. Choose **Myself** for self-gifting: no recipient name is required, labels switch to you, and first-person interests are valid. Switching back restores other-recipient wording and requires fresh set review.
2. Choose Ready-made or Custom-made in the same right-hand workspace. The form, results and selections stay in this tab when switching. After **Find gifts**, Custom-made shows only relevant original Pattern / motif choices using actual flat artwork. Selecting a pattern shows its existing product prototypes, without a product-type selector. No original match produces an honest empty state with separate opt-in browsing; franchise names do not turn generic art into licensed designs. Switching modes reuses the submitted details. Unsubmitted edits do not silently change the displayed custom brief. Expression-based motif suggestions are interpretations within these original designs, not universal cultural claims.
3. In the default rules mode, the server calls anonymous Shop MCP `search_catalog`. Only automatically extracted generic interest queries, USD budget and explicit US demo-market context are sent, never the recipient name field or raw profile prose. The primary extracted interest is searched exactly first; named themes are not burdened with demographic/occasion modifiers. Short novel product-interest phrases are supported beyond the known keyword list. Rules-mode language aliases are limited, not universal translation; AI mode can interpret broader wording when it is configured and consented. Other interests generate up to three focused searches, not one restrictive combined query.
4. Optional generic adult age bands and intended audiences (Any/Men/Women/Unisex) reach both query and model context. Only explicit merchandising/age evidence excludes a result; unknown suitability is disclosed, and necklaces are not gender-banned. Literal Star Wars or quoted-theme requests must be evidenced in merchant text, including negation screening.

The browser initially ranks up to 10 returned primary gifts with documented keyword rules. Greeting cards, packaging and party add-ons appear separately as optional add-ons when the catalog returns eligible examples; they count toward the same set budget. They can be main results when explicitly requested. Optional observed add-ons are not labeled model-selected primary recommendations. A soft value/diversity preference never creates a minimum spend or forces use of the full budget. It excludes above-budget or non-USD prices, unavailable featured variants, explicit avoidances and products with no recipient-interest overlap. Empty results stay empty; no sample items are substituted.
**Show more options** retrieves actual additional catalog pages (up to three) without clearing the selected set. Duplicated products/variants and ineligible listings are not repeated. Extra AI-mode pages are explicitly rules-screened, not model-selected recommendations. No next page means an honest exhausted state. Counts explain what this app received and filtered, not total Shop inventory.

5. Quick exclusion chips screen Clothes & shoes, Food & alcohol, Fragranced items, Requires a size choice, Large/heavy items and High-maintenance gifts. Confirmed evidence excludes; missing evidence is labeled “Can’t verify”, never guaranteed safe. Other things to avoid remains free text. “Not this one”, chips or category rejection reranks the current visible results without another network call. The page retains results only in its current state; no persistent catalog cache is created.
6. “Refresh & choose” calls `get_product` and checks actual selected options, price, currency and stock. Changing an option refreshes again. Recipient checks are rerun locally.
6a. Optional **Must arrive by a date** is strict: current catalog data cannot verify destination-specific arrival, so unverified items are excluded. The date stays local. Stock or ships_to never establishes on-time delivery. Merchant dispatch/policy retrieval is not implemented; no checkout is created to obtain an estimate.
7. Add exact refreshed variants to **Your gift set** (up to six unique variants, quantity one each). Item subtotal and remaining USD budget update immediately; over-budget additions and checkout are blocked. Changed preferences require a new search and review. Merchant groups have separate explicit checkout buttons; each request refreshes every exact item again and rejects changed stock, price, currency, seller, options or reviewed details before one multi-line checkout. Different merchants mean separate charges and deliveries, not one packaged gift set. Single-item checkout remains available separately.
8. The app displays merchant warnings, legal links, labeled totals and the unchanged `continue_url`. The buyer clicks **Review & pay at merchant** and enters delivery/payment details there. This app never calls `complete_checkout`.

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
- Current tests cover primary-gift quality, up to 10 choices, set totals and duplicate/over-budget checks, exclusion evidence, exact options, changing price/stock/currency/seller, multi-line merchant grouping, overlapping uncertain writes, warnings, safe URLs and privacy.
- **No real checkout was created during testing; checkout responses are synthetic mocks. No charge or order was made.**
- The public app at https://the-gift-edit-seven.vercel.app/ was verified in the cloud browser: real search, exact variant refresh, brief/copy, item exclusion/reset and low-budget results. User-uploaded commit 789faae8a6953def8756242a5ac19fe8e11563da deployed successfully, and the hero layout and quick-exclusion behavior were verified. A bounded AI run initially failed; the user later reported a connected result, which has not yet been independently reproduced successfully. The v0.4 gift-set release was deployed and verified for ten live non-card rules results, exact variant refresh, one local set addition, over-budget blocking, removal and strict deadline unknown exclusion. One actual AI run failed at tool-argument validation. This v0.5 repair/context/custom-toggle release is local and still needs deployment and successful model verification. Mobile visual QA is pending.
- See `docs/VERIFICATION.md` for the final test count and limits.

## Project map

- `public/`: responsive navy/gold UI, browser-local recipient profile, original artwork inspiration.
- `src/shop-catalog.mjs`: live result ranking, rendering helpers, constraints and briefs.
- `src/delivery-deadline.mjs`: honest fail-closed delivery eligibility when supported arrival evidence is absent.
- `src/gift-set.mjs`: exact-cent totals, six-variant limits and merchant grouping.
- `src/gift-quality.mjs`: evidence-based main-gift/add-on classification and soft value preference.
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

Expression Atelier is untouched. The right-hand **Custom-made** mode reuses the current profile and lets the buyer choose a product type and original motif immediately. Only eight existing combinations have verified digital prototype renders; unsupported combinations are marked unrendered. A local design brief and a general homepage link are optional, not required to select a concept. It does not receive the brief automatically and is not the checkout for Shop merchant products. Do not recreate another merchant's product design through Atelier.

The hero uses earlier original Arcade digital renders as clearly labeled inspiration, not current Shop products or physical sample photos. Eight original renders are retained with source hashes in `docs/asset-provenance.json`; no private franchise concept art is included. Their old candidate prices are unverified modeling scenarios in the retained offline modules, not live offers. Arcade supplier manufacturing billing is separate from customer checkout.

## AI and competition status

The optional agent uses server-only native fetch to Vercel AI Gateway with model `openai/gpt-4.1-mini` by default (`AI_GATEWAY_MODEL` may select a supported model). It consumes only an already configured `AI_GATEWAY_API_KEY`, or an explicitly server-managed `VERCEL_OIDC_TOKEN`. It does not create keys, enable OIDC, or grant access. Credentials are never returned to the browser or written to the repository. This release does not trust any incoming OIDC header. Automatic request-time OIDC integration is not enabled because the plain Function runtime context has not been verified. A manually supplied server OIDC token can expire and has no automatic refresh here; the recommended release configuration is the existing authorized `AI_GATEWAY_API_KEY` secret. Future OIDC support should use Vercel's official helper and a verified trusted runtime, not raw request headers.

Selecting **Use AI-guided search** explicitly shares the non-identifying interests, avoidances, occasion, budget, optional direction, quick exclusions and a boolean self-gifting context with Vercel AI Gateway and its selected model. The recipient name field and relationship are omitted. Free text cannot be perfectly anonymized: do not enter names, contact details, credentials or sensitive information in shared fields. Rules mode remains model-free, and no model is called automatically on page load.

The model chooses `search_catalog` and `get_product` calls, receives bounded public catalog evidence, then selects observed, refreshed IDs. The loop stops at six model steps, 16 read-only tools (maximum three concurrent) or 45 seconds. Budget, USD, availability, exact variants, dislikes and evidence-based exclusions remain code-enforced. Unsupported model prose is not shown as merchant fact; reasons use grounded product evidence. Checkout is **not** a model tool. Malformed argument batches execute no tools and may receive at most two bounded repair responses inside the same six-turn limit. Unsupported tools and duplicate/invalid envelopes remain fatal. A failed model run does not silently become an “AI” rules result.

The user reported configuring Gateway access and receiving AI results. Independent successful end-to-end model/tool verification remains pending; local model tests use synthetic responses. Use the provider's supported secure setup; never paste credentials into chat, browser code, Git or screenshots. Public-scale deployment also needs distributed rate/cost controls; current process-local gates are only a demo safeguard.

Official references: [Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok), [OIDC](https://vercel.com/docs/oidc), [Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions), [Tool calling](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/tool-calling).

See `docs/BUILD-PROVENANCE.md` for the initial build and Shop pivot timestamps. Some code and original assets predate any unverified official event start. Event eligibility has not been established; disclose pre-existing material and follow organizer rules. Do not rewrite history to imply later creation.

No license has been assigned to code or artwork. Public visibility alone does not grant third-party reuse rights. No existing Expression Atelier source or Git history is imported.

## v0.5.1 diagnostic correction

Model proposals, accepted results and deterministic rejection counts are distinct. An empty shortlist never claims the upstream catalog was empty when products were found. Existing budget, variant, exclusion and relevance checks remain unchanged. The four flat artworks are unmodified, hash-verified pre-existing original source files; no new generation or licensing claim is made.

## v0.5.2 focused ready-made release

The public workflow now exposes only real Shop products and the gift set; custom/pattern controls are withdrawn. Recoverable model limit/timeout/upstream failures return actual rules-screened catalog snapshots, visibly not AI-selected. If no snapshots are available, the UI makes one bounded fresh catalog recovery, preserving the submitted interests, budget and exclusions. The model keeps its six-turn, sixteen-read and 45-second limits.

Results are grouped with a maximum of five per category, aiming for three to five when real eligible products exist. A concentrated first page or sizing/clothes exclusions can trigger at most two alternative same-theme category reads within the existing server budget. A post-search sizing/clothes chip can trigger one two-category rules-screened retrieval; selected set items stay intact. No missing products are fabricated and no constraints are relaxed.
