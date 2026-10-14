# v0.4 acceptance test · no purchase required

Use the deployed site only after this release is uploaded and the Vercel deployment is Ready. This source ZIP alone does not update the public app.

1. Confirm the page shows **Ready-made gifts**, **Custom-made**, **Your gift set**, and **Must arrive by a date**.
2. First try **Myself** under Your relationship: no recipient name is needed, labels say you, and `I love coffee` is valid. Switch back to Friend and confirm normal recipient fields/labels return. Then use a synthetic example: recipient `Demo Friend`, birthday, budget `100`, likes `They enjoy specialty coffee, gardening, and hosting dinner with friends.` Turn on AI-guided search only if you consent to sharing those non-identifying fields. Leave the search direction blank or use `useful gifts for coffee and gardening`.
3. Expect up to 10 distinct primary gifts, aiming for at least 5 if suitable current products exist. Check real USD prices and merchants. Greeting-card/wrapping products should not dominate unless explicitly requested. Fewer valid results must remain honest, not padded.
4. Refresh a listing, choose the exact variant and click **Add this variant to gift set**. Add a second different variant if the combined item prices fit $100. Adding must not create a checkout.
5. Check subtotal and remaining budget. Duplicate variants and additions over $100 must be blocked. Lower the budget below the subtotal: selected gifts remain, over-budget status appears and new checkout is disabled. Restore the budget.
6. Select a quick exclusion that conflicts with a chosen product, or change recipient preferences. The set must not remain checkout-ready; review/update the search and refresh again. Missing factor evidence must say **Can’t verify**, not promise safety.
7. With mixed merchants, see separate merchant groups and separate checkout buttons. No claim of one package, one shipping fee or a tax-inclusive total. For this acceptance test, do not click the checkout buttons. Actual checkout tests in the code use mocks only.
8. Enable **Must arrive by a date**, select a date, and search. Current Shop data lacks verified destination-specific arrival estimates, so unverified gifts must not qualify and the page must explain why. The date remains local. Turn it off and search again to see otherwise eligible gifts. This does not claim merchant dispatch/shipping policies were retrieved.
9. Open **Custom-made**. Copy a local custom brief and follow the general Atelier link if desired. No automatic transfer, order, quote or delivery promise should appear.
10. Report the visible safe error code/stage if an AI run fails. Do not share keys, checkout access URLs, delivery addresses or payment information in screenshots.

Shipping and tax are extra. Only the buyer reviews final merchant terms and decides whether to pay. No payment or order is required for this test.
