<!-- © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. -->
# Direct Tennis reconciliation contract (local, disabled)

`lib/commerce/tennis-reconciliation.js` is a server-only dependency-injected verification and staging boundary. It reuses `approvedGoodsContract`, `normalizeTennisCheckoutRoute`, the existing platform store atomic commits/unique constraints, and the `native-mpgs.js` read-only movement projection. It does not relax `commerce-ledger.js`, invent CS-Cart orders/storefronts/payment methods, post financial ledger entries, set commerce orders to paid, issue refunds, alter the 20% terms, or enable any financial programme. No route or runtime imports this service. `resolveTennisCheckoutRuntime()` still returns `service:null`.

Private API:

```js
const service = createTennisReconciliationService({
  store, commerceStore, route, retrievalEvidenceId,
  resolveTrustedBinding, reader, now, production,
});
await service.bind({ intentId, attestationReference });
await service.reconcile({ bindingId, transactionId, kind: 'capture' });
await service.reconcile({ bindingId, transactionId, kind: 'refund' });
await service.readState(bindingId);
```

`resolveTrustedBinding(reference)` must independently authenticate the intent/provider/MX-ORD/customer association. It returns the expressly defined private projection in `PROOF_FIELDS`: verified live goods approval; authentication basis `provider_server_direct_order_query`; exact route, intent, provider order, MX-ORD, customer, correlation, snapshot/approval/configuration digests, currency/total, accepted terms; stable evidence ID and verification time. These are dependency-contract fields, **not asserted MPGS wire-format fields**. There is no public approval/binding endpoint and no default resolver. Caller-supplied email, browser result, amount, owner or cancellation cannot establish this association.

Binding independently rereads the immutable approved non-TEST commercial goods contract, direct checkout identity, unique intent/order fence, verified portal ownership, active user and membership. It checks the existing five durable checkout route evidence records, plus a separately provisioned `tennisReconciliationEvidence` record for `mpgs_retrieve_order_schema`, selected API version, `mpgs_order_transactions_v1`, route digest, merchant, verification time and `operator_authenticated_provider_query` basis. These records are absent in normal runtime; tests use synthetic records only. Provider/order/intent associations have atomic unique claims that remain scoped across route version changes.

`reader.readMovement({ providerOrderId, transactionId, kind })` follows `createNativeMpgsReader` exactly. Its authenticated Retrieve Order projection must prove the exact bound full capture, AED total, merchant, timestamps, cumulative capture/refund values and evidence digest. This service rereads route, goods, owner and checkout fence after the reader awaits and before saving. Only selected projection fields survive; sessions, card/source data, raw errors and extra fields are discarded.

The atomic platform-store commit saves one immutable movement receipt, its transaction unique claim, reconciliation state and audit entry. Concurrent/repeated transactions cannot count twice. Lost commit acknowledgements recover by reading durable records. A changed transaction identity, extra capture or inconsistent total requires review. No funds or bank balance are inferred from a session descriptor.

Refunds received before a local capture receipt remain in `pendingRefundMinor` with `awaiting_capture`; `refundedMinor` remains zero until capture is staged. Authenticated cumulative refunds are separately recorded in `providerRefundedMinor`. Missing refund receipts leave `unreconciledRefundMinor` and `awaiting_refunds`, including when a repeated capture query first reveals a later refund. The latest accepted sanitized observation and digest are retained in state; audits include its digest, verification time and cumulative refund amount. Full refund requires the exact receipt sum. Successful monetary void, chargeback, funding, unknown supported-history failure and dispute indicators from the existing reader lead to sticky `review_required`, without inventing a refund or reversing a receipt. Browser cancellation is rejected as a monetary operation.

Conservative limits remain explicit:

- A decreasing provider refund aggregate requires sticky review. An older authentic response arriving after a newer concurrent response can trigger this hold; this contract does not claim ordering-aware resolution or automatic review clearing.
- Platform receipt/state/uniqueness writes are atomic. The separate commerce store and ownership reads are not a distributed transaction. Receipts describe the validated point-in-time association; a future consumer must revalidate the immutable association and current authorization before changing an order or ledger.
- Receipt staging is independent of session presentation. An uncertain/expired direct intent can be reconciled only with the same independently verified binding, accepted goods contract and unchanged commercial checkout fence; this never exposes a descriptor or creates a replacement session.
- Only one exact full goods capture and explicit refunds are supported. Partial/multiple captures, monetary voids, chargebacks, settlements, bank balances and financial allocations remain outside this contract.

Local evidence: `node --no-warnings --import ./tests/register.mjs --test tests/tennis-reconciliation.test.mjs` covers exact association, ownership/route revocation, invalid amounts/currencies, concurrency, duplicate events, lost ACK, out-of-order refunds, missing refund completeness, full/excess refunds, native-reader GET projections and unsupported history. Two distinct child Node processes reconstruct persisted binding/capture/ACK-loss/refund records using a clearly test-only file fixture. This proves no process-memory dependency; it is **not Redis or production-store durability verification**. No real bank connection, key, SDK retrieval or payment request is involved.

Remaining launch dependencies: real independently approved immutable goods revisions and customer acceptance; independently verified live direct route plus merchant/origin/session/SDK/3DS and retrieval-schema evidence; an authorized server-side direct association resolver; an authenticated bounded read-only MPGS reader with the inspected configuration; durable production stores and their own transactional/restart verification; protected reconciliation scheduling/dispatch and operator review procedure; separately reviewed owner-to-order/ledger delivery; verified embedded renderer and the original runtime release gates. None is provisioned or enabled by this module.
