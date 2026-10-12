<!-- © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. -->
# Direct tennis payment: isolated local stage

This stage starts from draft PR2 commit `b6b5e5ece80e0f8da1ab00359e2e1f7bb8ac7f1a`, independently confirmed against GitHub on 2026-10-11. It is prepared on the MacBook in a separate clone and local branch. The iMac checkout, production, PR head and deployed settings are outside this stage. No push or deployment is authorized here.

The PR snapshot contains no `AGENTS.md` or `.agents/skills`. Existing repository payment contracts, stores, tests and readiness documents are the implementation sources. The initial checks reused installed dependencies. A subsequently authorized `npm ci --ignore-scripts --no-audit --no-fund` restored the already-declared dependencies from `registry.npmjs.org` into this isolated clone. Package versions and both manifest checksums are unchanged; no new dependency, bank SDK, new access or real payment was introduced.

## Boundaries

- Approved goods revisions require an injected independent approval verifier. They do not turn existing TEST quotations into valid quotations, invent prices, populate `approvedOffers`, or mutate immutable commercial snapshots. Acceptance belongs to the exact revision and customer.
- Direct reconciliation requires a verified direct intent, its MX-ORD order, durable owner association and authenticated MPGS movement projection. It does not manufacture CS-Cart IDs or weaken the separate native storefront mapping.
- Reconciliation stores verification evidence and totals only. Marking the commercial order paid, posting a financial journal, issuing a receipt and delivering goods require a separately reviewed integration.
- Checkout renders distinct pending/review/expiry states. A ready server descriptor cannot enable a bank renderer. Descriptors are not navigation, storage, logging or markup data.
- `resolveTennisCheckoutRuntime()` remains `service:null`. The embedded renderer remains unavailable. Existing financial-program terms, including 20%, are unchanged.

## Private contracts

`createApprovedGoodsRevisionProducer` accepts the existing platform store, private scope, commerce-order loader and independent approval/acceptance resolvers. `issue(approvalReference)` resolves a reference to a complete authoritative snapshot; the caller cannot submit an approval object. It preserves the source request/customer/configuration, requires finalized technical specifications and a fresh quotation identity, and claims the authorization and quotation number atomically. `read(revisionId)` returns a detached immutable revision. `recordAcceptance(revisionId, acceptanceReference)` requires independently verified acceptance of that exact revision/customer/snapshot/terms; `readAcceptance` cannot inherit acceptance from another revision. None of these methods mutates a commercial order or enables checkout. The shared `approvedGoodsContract` retains its original acceptance gate; `approvedGoodsSnapshotContract` exposes only its pre-acceptance commercial checks.

`createTennisReconciliationService` accepts both existing stores, the private route, inspected retrieval-schema evidence, a trusted direct association resolver and the `createNativeMpgsReader` movement-reader interface. `bind({intentId,attestationReference})` verifies the direct association and claims unique intent/order/provider identities. `reconcile({bindingId,transactionId,kind})` retrieves authenticated movement evidence independently, validates its monetary and ownership scope, and atomically stores the deduplicated receipt, reconciliation state and audit. `readState(bindingId)` exposes only the verification summary. These are server-only functions, with no new HTTP endpoint, scheduled job or provider factory.

The separate reconciliation record is not payment authority for an account or fulfilment system. Every future consumer must recheck the current owner, commercial fence, route and complete movement history. A browser cancellation cannot reverse money; unsupported authenticated reversals and disputes require operator review.

## Remaining launch dependencies

1. An authorized commercial approval source and reviewed server-only verifier, with authentic complete prices, seller, fulfilment, technical specification, customer, quotation/revision identity, scope and validity. Local synthetic fixtures establish none of these real approvals.
2. A reviewed transition from the separate approved revision into a fresh immutable commercial order with durable verified ownership and revision-specific customer acceptance. Existing TEST documents must remain TEST.
3. Current merchant evidence for MPGS merchant `300281`, the applicable API/schema/SDK versions, supported embedded feature, approved `https://maximus.tennis` origin and 3DS/return behavior. Do not obtain these by bypassing the denied SDK network policy.
4. Authenticated session creation and independent resolution adapters; an authenticated direct intent-to-provider-order association verifier; a read-only MPGS reader configured from authorized merchant evidence. This stage supplies no credentials or transport factory.
5. Durable production store composition for both platform and commerce records, including atomic uniqueness/CAS, uncertain-outcome recovery, operational retry ownership and independent production evidence. Local process-restart tests do not establish production Redis durability or failover.
6. A verified embedded renderer and browser/3DS acceptance tests. No descriptor or `ready` flag alone establishes renderer readiness or payment success.
7. Reviewed direct reconciliation-to-ledger/order integration with exact owner mapping, refund/reversal handling and operational review for cancellations, voids, disputes or unsupported histories. The CS-Cart bridge cannot serve as this mapping implicitly.
8. Explicit release coordination and activation by the original iMac task after combined validation and owner authorization. No activation occurs in this local stage.

## Verification record

Local checks on Node 24.15.0, with the existing Next 15.5.24 and React 19.1.1:

- `REQUIRE_LOCAL_SMTP=true npm test`: 569 tests, 549 passed, 20 skipped, zero failed/cancelled/todo. Product data, 48-locale key parity, translation and source authorship checks passed. All 20 skips depend on unavailable `redis-server`; the independent loopback customer SMTP test passed.
- Reconciliation: 21/21 passed, including two distinct Node processes using persisted synthetic fixture records after lost ACK. This is process reconstruction evidence, not a Redis power-loss/failover test.
- Approved revisions: 16 passed, one Redis skip. Explicit TEST/mock authorization and acceptance proofs are rejected even if they also assert verified status.
- Checkout component plus existing client suite: 20/20 passed, including 15 real mounted React DOM cases in the existing local Chrome. The component test uses the installed Next compiler/webpack; CSP blocks external requests. All 48 locales retain separate status text.
- Independent Codex source review: identified refund-completeness and asynchronous owner/expiry-check gaps were fixed; no remaining blocking findings were reported. Claude subscription authentication was unavailable, so independent Claude review is not claimed.
- `git diff --check`: passed.
- `NEXT_TELEMETRY_DISABLED=1 npm run build`: passed after restoring the existing lockfile dependencies; 1,832/1,832 pages generated. Both font packages are exactly version 5.3.0. The earlier missing-font failure is retained as historical evidence, not a current build blocker. No fallback font or application source change was needed.
- `node --no-warnings scripts/check-authorship.mjs --built`: passed for 298 sources, 241 images, 48 languages and 89 built bundles. The complete `REQUIRE_LOCAL_SMTP=true npm test` was rerun after restoration with the same 549 passes, 20 skips and zero failures. Both manifest SHA-256 checksums still match the pre-restoration values.

Redis environment discovery checked PATH, existing applications, standard system/user binary and cache locations, runtime sockets and container stores. No existing Redis executable or Docker/Podman/Colima/OrbStack/Lima/container runtime was found. No Redis installation, image download, system setting change or production Redis connection was attempted. The 20 Redis-dependent skips therefore remain an environment limitation. Built output is local verification only, not a deployed or bank-enabled release.

The accompanying local handoff records the final commit, patch checksum and full logs. A decreasing authenticated refund aggregate, including an older concurrent response, deliberately remains a sticky manual-review case; see the [reconciliation contract](TENNIS_RECONCILIATION_CONTRACT.md). No check establishes bank availability or production readiness.
