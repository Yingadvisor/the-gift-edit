# Remaining verification and integrations

## Implemented Shop MCP path

Anonymous `search_catalog` → `get_product` exact selection refresh → explicit buyer-click `create_checkout` → unchanged merchant `continue_url`. The app never calls `complete_checkout`, authenticates a Shop user or handles a payment instrument. Live generic search and product refresh were verified; real checkout creation was NOT executed. Synthetic mock tests cover checkout schemas, stock/price/currency/selection changes, warnings, idempotency and uncertainty.

## Before a public event demo

1. Deploy only after explicit authorization; this repository import is not a deployment.
2. Run the provided browser smoke suite in a supported browser environment. Interactive desktop/mobile QA remains unverified here.
3. Review live product results, image loading, disclosures and exact option labels. Catalog data changes; do not cache responses or rehost merchant images.
4. A real checkout verification requires an explicit buyer action for a specific item/merchant. Do not generate merchant checkouts automatically during tests. Payment remains with the buyer.
5. In-memory rate/duplicate guards are suitable for a small demo but not a distributed production guarantee. Add platform-wide rate protection and a durable idempotency design before public-scale use. No catalog, checkout access key or personal profile should go into logs or analytics.

## Required to become an AI agent

The product still ranks using explicit rules. No LLM provider or credential is configured. Obtain the user's secure provider/credential choice, add a server-only adapter, preserve deterministic hard constraints, show model identity and run a bounded authorized live test before claiming AI reasoning/tool use. Never put a key in public assets, source control or chat.

## Expression Atelier and Arcade

Expression Atelier is untouched and linked only as a separate original-art exploration. No automatic brief ingestion, Shop-product recreation, cart integration or customer payment linkage exists. Arcade manufacturing billing is separate from a customer's merchant checkout. No Arcade payment test or order was authorized or performed.

## Event and asset eligibility

Confirm official event start, public-repository requirements and allowed pre-existing material. Keep BUILD-PROVENANCE.md and original render hashes. No eligibility claim is made.

## Rules limits

English keywords and bounded synonyms are not general language understanding. Ambiguous statements may produce no match. Explicit avoidances are checked against returned title/description/metadata/option text, but missing merchant detail is not proof of suitability. Relationship and occasion are preserved locally but do not infer taste.
