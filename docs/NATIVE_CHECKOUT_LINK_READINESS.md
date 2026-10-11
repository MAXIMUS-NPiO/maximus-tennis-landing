# Native checkout link: server model, inactive integration

© 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted.

`lib/platform/native-checkout-link.js` supplies a durable server intent and recovery model. It does not supply a native publisher, a merchant payment session, an approved quotation producer, credentials, activation flags or a schedule. The customer HTTP wrapper's production factory remains unconfigured. Enabling portal or ledger flags alone cannot make this integration operational.

## Server API

```js
createNativeCheckoutLinkService({
  store, mapping, authorizeOrder, loadCommerceOrder, readNativeOrder,
  publishNativeIntent, resolvePublishedIntent, now, production,
})
// => { readiness, prepare, readStatus, publish, recover }

prepare({ ctx, orderId, accessToken, idempotencyKey })
readStatus({ ctx, intentId })
publish({ intentId }) // internal server/operator execution only
recover({ intentId }) // internal authenticated resolver only
// Public projection: { intentId, status, expiresAt, bindingReady }
```

The `ctx` argument is produced by the existing active, verified portal session authentication, including same-origin and CSRF checks. It is never reconstructed from customer JSON. `authorizeOrder({ctx,orderId,accessToken})` must cryptographically validate the existing order capability and return the **original full commercial document**. A public order projection is insufficient. The service separately loads the original current order and validates durable `portalOrder`, the unique `portal_order_owner`, active user and tenant membership. An authenticated customer identifier in the immutable snapshot must match this owner. Previously accepted guest orders require their existing durable capability-proven unique owner; an email or native order number cannot establish ownership.

Customer input consists only of the route MX-ORD identifier, an existing capability and an idempotency key matching `[A-Za-z0-9_-]{8,128}`. No customer/provider/native IDs, money, approval, accepted terms or proof can be supplied in a customer payload. The capability is not persisted. HTTP `POST /api/accounts/orders/{MX-ORD}/native-checkout-link` only calls `prepare`; it cannot dispatch `publish`, `recover`, status actions or native creation. The separately owned implementation is `lib/platform/native-checkout-link-http.js`; its tests are `tests/native-checkout-link-http.test.mjs`.

## Preconditions and immutable association

Every operation verifies the stored `nativeCommerceMapping` and four exact scoped `nativeCommerceEvidence` rows: live route, native order mapping, verified customer binding schema and MPGS Retrieve Order schema. They must match mapping ID/version/hash/kind, a supported operator verification basis and a canonical nonfuture verification time. Supplying plausible mapping metadata or setting flags is insufficient. The constructor defaults `production` from `NODE_ENV` and rejects the memory store in production. Explicit `production:false` is reserved for synthetic dependency-injected tests; a future deployed factory must never provide that override.

For a new intent and first publication, the commercial order must be an approved plan-A goods contract: final technical specification, verified fulfillment, correct seller/currency/configuration/quantity, non-TEST quotation with no TEST invoice, exact price components, and existing server-recorded accepted terms. The invoice may still be absent before payment. Its payment status must be `ready`, without a prior payment session, and the offer must still be valid at the first external call. Existing immutable TEST or `awaiting_quote` snapshots are rejected. `snapshot.terms.accepted` is not acceptance evidence; the authoritative fields are `payment.termsVersion` and server `payment.termsAcceptedAt`.

Preparation commits one intent, server-random opaque correlation, approved snapshot hashes, unique correlation, scoped idempotency claim and audit atomically. A project/organization/MX-ORD unique claim pins the order to its first intent across mapping-version changes. New keys for the same order reuse that intent; the same scoped key cannot switch orders. A previously bound native order cannot reserve another intent. Native/provider identifiers remain private and are established only by the independent authenticated resolver.

## Publisher and resolver contracts

`publishNativeIntent({intent})` receives a private server projection containing intent ID, correlation, mapping/project/organization, immutable MX-ORD/customer binding, snapshot/approval/configuration hashes, exact minor-unit total/currency/quantity and expiry. The adapter must independently load the immutable approved commercial configuration to create the exact goods order, preserve the same native idempotency/correlation permanently, and provide bounded transport/cancellation. It must not create an order from a caller email, native number, guessed option mapping or unapproved/TEST configuration. No implementation is configured here.

Publisher outcome may be `{status:'accepted',attestationReference}` with a bounded opaque reference, `{status:'rejected'}` or an uncertain outcome. An accepted response, checkout URL or CS-Cart status cannot establish a binding. Unknown output and thrown transport errors are treated as uncertain; raw responses/errors are not persisted or returned.

`resolvePublishedIntent({intentId,correlation,attestationReference?})` must independently authenticate the installed native/provider association. A pending or not-found result is not permission to create again. A verified result contains the existing registry attestation fields plus the **exact** intent ID and server correlation: supported authenticated basis, live/approved goods scope, mapping hash, MX-ORD, verified customer, native/provider IDs, company/payment/merchant/currency/total, authenticated item/configuration mapping, evidence ID and verification time. Verification time must be no earlier than this intent's first reserved attempt and no later than current server time.

For the same association, `evidenceId` and `authenticationBasis` must be stable canonical identities across resolver queries; `verifiedAt` may refresh. The existing immutable binding fingerprint includes the evidence identity and basis. Random per-query evidence IDs cannot safely recover an acknowledged-lost binding.

The service reuses `createNativeBindingRegistry`, including independent native order amount/items verification, immutable commercial/owner checks, native/MX uniqueness and full `readBinding`. It does not manufacture a provider field or interpret arbitrary `payment_info`. Before creating a new binding and its pollable index, a scoped store adapter includes the exact active intent version in the **same atomic platform commit**. If concurrent recovery marks review while native GET is pending, the binding and index cannot be created. Bound customer status also verifies binding fingerprint and both native/commercial unique claims; customer status reads additionally recheck current owner/commercial/native snapshots.

## Attempt and recovery rules

States are `prepared`, `publishing`, `uncertain`, `bound`, `expired` and `review_required`. Prepared records have zero attempts; attempted records have exactly one, valid reserved timestamp and lease state. Invalid persisted state fails closed.

Publication requires an acknowledged CAS transition from `prepared` to `publishing` before invoking the optional server publisher. Loss of the reservation acknowledgement never calls the publisher. After all awaited owner/evidence rechecks, the service rereads the exact lease/state and checks the clock immediately before the external invocation. Expired/stale claims cannot invoke it. Once any attempt is reserved, `publish` never repeats creation, including after reconstruction, expiry, a not-found query or a rejected/unknown result.

Uncertain/expired-lease recovery only queries the trusted resolver for the same stored correlation. It may finish an existing attempt after offer expiry, because it does not create again. Rejected or inconsistent scope/proof enters terminal review. Terminal review/expiry/bound cannot be revived by stale concurrent success or failure. A binding commit or final intent write that loses acknowledgement is recovered through existing immutable registry identity, never through another native create. No public route, automatic job or schedule dispatches recovery in this patch.

Commerce storage and platform storage are separate. This model provides durable correlation, platform CAS/uniqueness and rechecks; it does not promise an atomic cross-store transaction or an exactly-once network transport. A crash after reservation but before a native call conservatively needs authenticated resolution/review. The future publisher must implement the installed system's real native idempotency/correlation semantics before any live activation.

## Remaining actual integration blockers

The current public commercial producer has empty approved offers and creates TEST quotations; it does not issue the authoritative accepted non-TEST contract required here. Editing a previous immutable snapshot or renaming TEST documents is not a remedy. An independently approved order/revision producer is separate work.

The installed native correlation-to-provider field, current live mapping/version/company/schema facts, and authenticated native publisher/resolver are not connected. Existing merchant credentials alone do not prove these facts or permit activation. Current stock-link handoff does not establish this MX-ORD/verified customer association. This patch creates no live evidence records, secret values, native orders, charges, program balances or new scheduled automation.

## Local verification

`tests/native-checkout-link.test.mjs` uses explicitly synthetic approved contracts and injected in-process adapters. It covers ownership/capability/full snapshot, TEST/draft/freshness gates, durable evidence, cross-mapping uniqueness, concurrent reservation/publication, uncertain/terminal outcomes, stale leases, native amount/SKU/options, corruption, acknowledged-lost commits and atomic terminal-review binding guards. The native Redis case uses existing Redis on loopback port 6398 and reconstructs the service after a lost binding acknowledgement. No real native or PSP API is called.

2026-10-11 targeted verification: 94 passed, zero failures/skips (29 link-service, 21 HTTP, 44 existing native-reader/runtime tests). Actual loopback Redis 6398 exercises reservation uniqueness, acknowledged-lost binding recovery and the concurrent terminal-review binding/index guard; existing native-runtime Redis 6397 also passed. Full-suite/build verification is a separate parent release gate.
