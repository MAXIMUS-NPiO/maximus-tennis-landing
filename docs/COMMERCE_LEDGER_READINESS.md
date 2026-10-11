# Commerce to customer ledger bridge

Status: the server-only delivery foundation is implemented and tested locally. The actual
CS-Cart/MPGS adapters and inspected live native mapping remain unconfigured. This is not evidence
of a successful real payment or a production connection.

The intended seller is **MAXIMUS SPORTS EQUIPMENT TRADING LLC**, using its existing
**https://maximussports.ae** store and approved MPGS route. No new payment provider, merchant
account, customer, payment request or financial program is created by this module. A historical
payment-method identifier, a CS-Cart status `P`, a return URL or a TEST invoice does not establish
that the current route is live or that money moved.

## Delivered files and boundary

* `lib/platform/commerce-ledger.js`: trusted adapter contract, immutable native order/customer
  binding, durable inbox/work queue, worker leases, and replay-safe ledger completion.
* `tests/commerce-ledger.test.mjs`: synthetic regressions and an actual local Redis integration.
* `docs/CLIENT_LEDGER_DESIGN.md`: the downstream journal and customer/admin read contract.

There is no public endpoint, automatic adapter, payment execution or production activation.
`resolveCommerceLedgerRuntime(env, deps)` requires `COMMERCE_LEDGER_ENABLED=true`, a verified
mapping, a durable store and all three server adapters. The flag alone cannot configure the
missing dependencies. Production rejects the memory store. `commerceLedgerReadiness(...)`
reports missing dependencies and always reports `financialProductEnabled: false`.

The bridge accepts ordinary goods receipts and their verified refunds/chargebacks only. It
requires zero principal and bonus allocations and creates no bonus, rate or deposit balance.
Existing TEST reconciliation is not wired into this bridge. The customer/admin portal can read
the same journal when a real writer is connected; derived accounting totals are not a bank
balance, and bank reconciliation remains a separate operator process.

## Adapter contract

Construct the service in server code with trusted dependencies:

```js
createCommerceLedgerBridge({
  store,
  mapping,
  resolveLivePayment,
  loadNativeOrder,
  loadCustomerBinding,
  resolveAuthorizedRetry, // optional server operator-case adapter; absent => retry unavailable
  now,
  production
});
```

All names and enums below are internal canonical fields, not claimed CS-Cart/MPGS endpoint or
payload names. An adapter must map independently inspected native fields into this contract.
It must never echo browser JSON or treat a browser-provided `verified: true` as evidence.

The immutable `mapping` requires `id`, `version`, `enabled: true`,
`status: 'verified_live_native_mapping'`, `projectId`, `organizationId`, `source`, `merchantId`,
`storefrontId`, `paymentMethodId`, `storeOrigin`, `processor`, `sellerLegalName`, `currency`,
`verifiedAt`, `liveModeEvidenceId`, `nativeMappingEvidenceId`, and `customerBindingEvidenceId`.
The origin must be the existing store, processor `MPGS`, and seller the named LLC. Supported
currency codes are AED, EUR and USD without conversion. Project `tennis` requires organization
`maximus-tennis`; a foreign organization cannot record a Tennis customer's receipt.

`resolveLivePayment(opaqueReference)` independently queries the authenticated provider or
resolves an already verified signed webhook. It returns the mapping's source/project/merchant/
storefront/payment-method/processor/currency/origin/seller scope and these fields:

```js
{
  mode: 'live', outcome: 'confirmed',
  kind: 'capture', // or 'refund' / 'chargeback'
  eventId, transactionId, paymentId, providerOrderId,
  amountMinor, occurredAt,
  proof: {
    method: 'provider_server_query', // or 'signed_webhook'
    transportAuthenticated: true,
    liveModeVerified: true,
    moneyMovementConfirmed: true,
    movement: 'capture', // must match kind
    evidenceId, verifiedAt
  }
}
```

The adapter is responsible for authenticating the source, verifying signatures where applicable,
using the approved live merchant/payment route, checking freshness and distinguishing an actual
capture/refund/chargeback from authorization, invoice creation and order status alone. The bridge
checks exact scope, timestamps and amounts again. TEST/mock/test-invoice evidence is rejected.
Minor-unit amounts use decimal integer strings; no float rounding or FX is introduced. Raw
provider bodies, card data and authorization secrets are not retained by the bridge.

`loadNativeOrder(scope)` receives `providerOrderId`, `projectId`, `merchantId`, `mappingId` and
`mappingVersion`. It independently loads the actual native order and its durable commerce link.
The returned record requires the same mapping scope, `mode: 'live'`, `providerOrderId`,
`commerceOrderId` in the existing `MX-ORD-...` format, `immutableOrderRevisionId`,
`approval: 'approved'`, `kind: 'goods'`, `cashTotalMinor`, `principalMinor: '0'`,
`bonusMinor: '0'`, `customerBindingRef` and `boundCustomerUserId` (or null for a guest order).
Capture must equal the entire approved cash total. A reversal is bounded by that total and the
ledger's remaining captured amount. Mutable fulfillment state must not replace the immutable
financial approval revision.

`loadCustomerBinding(scope)` independently loads the verified account/order ownership record.
Scope includes the native order, native/commerce order identifiers, binding reference, project
and merchant. The returned binding requires matching `id`, `commerceOrderId`, `providerOrderId`,
`projectId`, `organizationId`, `merchantId`, a valid `customerUserId`, `evidenceId`,
`status: 'verified'` and `source: 'server_account_binding'`. An existing bound customer must
match exactly. A guest order additionally requires `basis: 'durable_unique_portal_order_owner'`
from the server's durable ownership link; matching email or a client claim is insufficient.
Binding IDs, evidence references and immutable financial revisions must remain stable across
retries. Changed economic/order/ownership snapshots fail closed rather than overwrite history.

## Durable delivery and recovery

1. `enqueueReference(reference)` accepts only an opaque string. It verifies the live payment,
   native order and customer binding before atomically persisting the immutable inbox receipt,
   economic work item, immutable normalized order, unique binding claims, indexes and audit.
2. Work IDs derive from source, merchant and provider transaction ID. Inbox IDs also include the
   provider event ID. Multiple event aliases for one economic transaction create multiple
   inbox receipts but one work item. Conflicting reuse of either identifier is rejected.
3. `processWork(workId)` acquires a compare-and-set lease, calls the atomic persistent ledger
   writer, then commits work completion and removes its pending index entry. Claiming the lease
   atomically rescores the pending index to its expiry. Concurrent workers cannot own the same
   active lease. Expired leases permit recovery after process failure.
4. If the journal commits before completion fails, a reconstructed worker replays the same
   economic transaction. Ledger dedup returns the original journal entry; completion retries
   cannot add another receipt. Lost acknowledgements after completion are also replay-safe.
5. Failed processing atomically persists `nextAttemptAt` and rescores the pending index using
   exponential backoff. Default delays start at 1 second and cap at 5 minutes; both are configurable
   within bounded constructor limits. The default attempt budget is five claims per retry cycle.
   After exhausting it, work moves to `review_required` and a separate review index with an audit
   entry. Evidence remains intact, and work is never silently completed or deleted. Malformed
   mutable work state or a changed economic payload is also quarantined for review.
6. `consumeReference(reference)` composes enqueue and processing. `retryPending({limit})` reads
   only due scores, oldest first, with a bounded batch of at most 100. Future retries and active
   leases are excluded by the store's score bound, so they cannot occupy the first-N due slots.
   Failed due records move into the future or review queue; subsequent batches can reach later
   records without scanning every future item. `processWork` independently rejects premature
   calls, so repeated deliveries cannot bypass backoff. `readWorkStatus(workId)` exposes only
   sanitized server status, lifetime/cycle attempt counts, next due time, review/completion time,
   journal ID and error metadata.

The internal ledger writer has no read authorization and no financial policy adapters. It loads
verified evidence and immutable orders only from the trusted persisted work/order records.
Posting dedup, journal entries, account state and aggregates use the existing generic store's
atomic commit. A refund arriving before its capture remains pending and can succeed after the
capture arrives; it is not silently dropped or reported completed.

`requeueReviewedWork(opaqueReference)` is an optional server operator helper, with no public
route. `resolveAuthorizedRetry` must independently load an approved operator case and verify
the actor's authority. Its canonical result requires `id`, `status: 'approved'`,
`capability: 'ledger:retry'`, the exact `workId`, `mappingHash` and immutable `fingerprint`,
`actorUserId`, `caseId`, `expiresAt`, and
`proof: {method: 'authorized_operator', evidenceId, verifiedAt}`. Raw objects are rejected;
absent, expired, foreign or mismatched approvals fail closed. Expiry is rechecked immediately
before the atomic requeue commit after asynchronous reads or CAS retries.

The commit consumes a persistent unique approval, appends the actor/case audit entry, moves work
from review to pending and resets only its cycle budget. Lifetime attempts and verified evidence
remain intact. Concurrent or later replay of the same approval cannot reset another cycle.
Corrupted economic payloads cannot be requeued by this helper. An operator must investigate the
original evidence rather than edit financial history.

No autonomous worker is installed. Before operational activation, connect scheduling, monitoring
and operator review to these durable states and test the actual native adapter failure modes.
Unresolved financial events remain retained and auditable.

Mapping snapshots are immutable and bind queued work to their hash. Changing a mapping version
does not migrate old work automatically. Keep its verified adapter available while draining the
old queue or design an audited migration; do not edit persisted records in place.

## Verification and remaining connection work

The targeted bridge suite passed **24/24 tests, zero skips**, with
`INTAKE_REQUIRE_REDIS=1`. It covers live/test separation, raw claims and status-only rejection,
exact amounts/currency/seller/merchant/project, approved goods classification, customer and
organization binding, atomic enqueue failures, concurrent aliases, conflicting IDs, immutable
links, secret/card omission, payload tampering, out-of-order reversals and crash recovery. Queue
tests additionally cover more than a batch of failing events or actual active leases before a
new valid capture, persisted exponential delays, bounded review escalation, malformed-state
quarantine, atomic single-use exact operator approval and expiry during asynchronous reads.

The Redis integration used an already available local Redis process owned by the test on
loopback port 6395, the existing REST bridge and the production store's Lua commit path. Eight
concurrent synthetic event aliases produced eight inbox receipts and one economic work item.
The test held the worker after the journal actually committed, confirmed a second worker was
blocked by the lease, failed work completion, reconstructed the bridge, confirmed no immediate
retry was due, advanced the fixture clock to the durable due time and retried. Redis then
contained exactly one journal entry and one captured payment, with completed work and an empty
pending queue. Test fixtures are synthetic; these assertions do not verify the live merchant.

To connect real receipts, the owner must make the existing store/provider session available for
read-only inspection so the current order, payment-method, live/test, transaction and account
binding fields can be verified. Implement and review the three native adapters using that
evidence, configure the immutable mapping and durable runtime, and connect a server-only verified
event delivery/retry path. No native transport or endpoint has been invented here. Successful
real capture/refund evidence and separate settlement/bank reconciliation remain unverified.
