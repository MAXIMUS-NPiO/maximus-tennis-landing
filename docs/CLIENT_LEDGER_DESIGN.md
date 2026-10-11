# Customer ledger and configurable program foundation

Status: implemented locally, with synthetic regression evidence. No real customer is seeded, no
financial product is activated, and no provider/bank transfer is initiated by this module.
The seller of the intended commerce flow remains MAXIMUS SPORTS EQUIPMENT TRADING LLC through
its existing approved payment contour. A separate financial program is explicitly classified as
funding; this code does not describe a loan as a racket sale.

`lib/platform/ledger.js` contains a server service backed by the platform store's atomic commit.
The customer has one identity with two views: **My Deposit** and **My Bonus**. Principal,
goods consideration and product credit are different ledger classes. A program's duration and
rate are retained in its immutable approved snapshot. There is no 20% production default.

## Implemented operations

* Verified capture: merchant receivable against goods consideration and/or returnable principal.
* Verified refund/chargeback: reversal bounded by the original remaining payment and immutable
  order allocation. A partial mixed goods/funding reversal requires verified allocation evidence.
* Funding program: approved program/version, participant agreement reference, merchant eligibility
  and legal approval, explicit currency, source, rate, duration and reversal policy are required.
* Bonus accrual: the explicitly approved `actual_365_simple_half_up_minor_v1` convention. It uses
  integer minor units and basis points. Cumulative entitlement is rounded once per constant
  principal epoch; splitting a period cannot create extra cents. Periods cannot overlap or extend
  beyond maturity/current time. No convention is selected for an unconfigured program.
* Advance bonus: one approved advance per position, with explicit basis points and either
  `offset_future_accrual` or `independent_product_credit`. This is product credit, not principal.
* Release: accrued credit becomes available under `on_accrual` or `at_maturity`, explicitly chosen
  in the approved policy.
* Redemption: available credit pays a separately approved goods order for the same customer,
  project, merchant and currency. One goods order cannot consume its credit allocation twice.
* Expiry: only the approved `approved_operation_after_maturity` policy can expire available credit.
* Principal payout: requires independently verified provider/bank transfer evidence, explicit
  payout approval and sufficient principal. Nonzero-rate accrual must first close at the return
  instant. Unearned advances are frozen for review unless the approved terms explicitly retain
  them. This method records an already verified transfer; it never sends money.
* Operator correction note: immutable actor, reason, approval-case evidence and link to an original
  entry. It cannot create money. Financial corrections use verified reversals/payouts or approved
  policy operations instead of editing the original entry.

Principal reversals freeze associated accrued/available bonus in a separate review class. Already
redeemed credit remains visible for reconciliation. No automatic clawback, cash bonus conversion,
or hidden refund promise is inferred. Reversal review has to be resolved through an approved
operational policy; there is no public unfreeze endpoint.

## Trust boundary and adapters

Create the service only in server code:

```js
createLedgerService({
  store,
  resolveVerifiedEvent,
  loadOrder,
  authorizeRead,
  resolveApprovedRules,          // optional: absent => funding fails closed
  resolveAuthorizedOperation,    // optional: absent => program posting unavailable
  now
});
```

`postVerifiedEvent(reference)` and `postProgramOperation(reference)` accept opaque references
only. Passing `{verified: true}`, a return URL, a screenshot or client amount fails validation.
The injected resolver independently loads trusted evidence. This module does not verify a network
signature itself and must not be constructed with an adapter that echoes request JSON.

The verified payment event contains `source`, `eventId`, `transactionId`, `paymentId`, `kind`
(`capture`, `refund`, `chargeback`), `orderId`, `customerId`, `projectId`, `merchantId`, `currency`,
`amountMinor`, `occurredAt`, and `proof: {method, evidenceId, verifiedAt}`. Proof method is
`signed_webhook` or `provider_server_query`; the transport adapter must check the approved
live merchant/payment route, signature/authentication, event freshness and successful provider
result. The ledger then independently binds its economic fields to the server order.

`loadOrder(id)` returns an immutable commercial approval snapshot, not mutable fulfillment state:
`{id,revisionId,customerId,projectId,merchantId,currency,totalMinor,kind,status:'approved'}`.
`totalMinor` is the amount charged in cash. Funding additionally names `principalMinor`,
`programId`, `programVersion`, and `agreementId`; goods credit names an independently approved
`bonusMinor`. `kind` is `goods`, `funding` or `goods_and_funding` and must match its allocation.
The normal CS-Cart order adapter should map its exact approved cash total/currency and durable
customer identity into this shape. Anonymous checkout must be linked to a verified account before
displaying customer financial records; email alone is not a cross-account authorization key.

`resolveApprovedRules(scope)` loads a separately approved program registry record. The complete
required shape is defined in `approvedRules` in the source. It includes evidence references,
approved operator, participant-agreement version, currency/merchant/project scope, allowed
sources, explicit rate/duration/accrual/reversal policy and individually approved operation flags.
Changing an approved rule snapshot in place is rejected; issue a new version instead. Optional
customer eligibility lists are checked server-side. Draft/proposed/missing approvals cannot post.
No configuration record or approval is created automatically by this checkout.

`resolveAuthorizedOperation(reference)` loads an independent approved policy job, verified payout
or operator case. Common fields match the verified event plus `positionId`, `rulesHash` and
`policyOperationId`. Accrual adds `periodStart`/`periodEnd`; redemption adds `goodsOrderId`;
an operator note adds `actorUserId`, `relatedJournalId`, `reason`. Bonus jobs require
`proof.method='approved_policy_operation'`; notes require `authorized_operator`; payouts require
actual provider/bank verification. The resolver is responsible for checking job/actor authority
and the evidence record independently of browser input. The ledger checks rule version/hash,
amount constraints, scope, balances, period boundaries and persistent replay identity again.

## Atomicity, identity and audit

Each economic operation atomically writes its immutable journal, processed-event record, payment
state where relevant, customer projection, merchant/project/currency aggregate, program position,
unique claims and indexes. A failed store commit changes none of these records.

Provider `eventId` is persistently deduplicated. The provider's `transactionId` independently
deduplicates a repeated economic transaction under a new event ID. Conflicting reuse is rejected.
An approved policy case and goods-credit order are unique as well. Optimistic versions serialize
different concurrent operations against one balance; an overdraft cannot win a race.

Entries are balanced per currency and linked by sequence/hash to the preceding customer account
entry. The service exposes no update/delete journal operation. `verifyClientJournal` checks the
chain, balanced lines, scope, counts and materialized projections. This is application-level
immutability and corruption detection. The generic privileged store can still be modified by an
operator with database access; production retention/backup controls and independent audit anchors
must complement this service. A local hash chain is not a claim of externally certified audit.

All amounts are exact decimal strings of minor units. AED/EUR/USD have explicit exponent 2 here;
other currencies require an approved currency metadata extension. No FX or cross-currency total
is invented. No PAN, CVV, provider secret, bank credential or authentication token is retained.

## Portal query contract

Every read receives authenticated `ctx`; `authorizeRead({ctx,projectId,customerId?,action})` must
derive permission from the server identity/access service. Client reads require the matching
customer; administrator reads require an assigned `ledger:read` capability. A supplied UI role
does not grant access.

* `readClientSummary({ctx,projectId,customerId})`
* `readClientJournal({ctx,projectId,customerId,limit=50,offset=0})`
* `readAdminSummary({ctx,projectId})`
* `readAdminClients({ctx,projectId,limit=50,offset=0})`
* `verifyClientJournal({ctx,projectId,customerId})`
* `inspectFinancialReadiness({ctx,projectId,customerId})`

Summary returns `{currencies:[...],financePostingEnabled:false,bonusPostingEnabled:false}`. The
flags describe public product activation; trusted server posting is separately gated above.
Each row is scoped to one merchant/project/currency, with exact captured/refunded/chargeback/net
amounts, goods consideration and payment count. Customer/admin account rows retain `customerId`.

`myDeposit` contains status, returnable principal, principal returned/reversed and approved
program positions with duration/rate/start/maturity/status. `myBonus` contains actual posted
accrued/available/redeemed/expired/advance/frozen amounts. No entries means no customer balances
are fabricated: the summary has no currency rows. Goods-only account rows have zero principal
and bonus because no such journal lines exist, and their program status is `not_enabled`.

Journal/client list methods return `{items,nextOffset}`. Journal UI may display date, kind,
currency, exact amount, order reference and hash. Admin client pagination must not be treated as
the aggregate: use `readAdminSummary`, whose aggregate records are updated in the same commits.
Reports are live projections, not a single certified multi-currency bank statement snapshot.

`bankBalanceMinor` is always `null`, with status `requires_independent_statement_reconciliation`.
Captures represent provider receivables; fees, settlement delays, external payouts and bank
adjustments require independent statement reconciliation. A merchant receivable is never labelled
as a current bank account balance.

## Evidence and remaining connection work

`tests/platform-ledger.test.mjs` exercises real service methods against the memory adapter:
capture binding, raw-claim rejection, concurrency, durable replay across service reconstruction,
atomic failure, bounded reversals, currency/project isolation, customer/admin authorization,
rule gating, approved synthetic program positions, accrual/advance/redemption/expiry/payout,
chargeback bonus freeze, order/policy dedup and corruption detection. Test approvals and 12%/5%
values are synthetic fixtures, not production offers or owner approvals.

The production transport adapter, verified payment/customer linkage, approved program registry,
policy-job scheduler, bank reconciliation data source and persisted retention controls must be
connected and independently verified. This module alone does not establish live MPGS payment
readiness, merchant eligibility for funding, a public promise of returns, or a published app.
Ordinary approved goods checkout can be connected without activating a financial program.
