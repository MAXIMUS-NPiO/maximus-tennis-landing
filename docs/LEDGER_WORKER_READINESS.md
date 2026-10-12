# Protected native receipt delivery and scheduled recovery

© 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted.

Local source implementation only. The owner confirmed that existing server access is currently
unavailable. No actual add-on publisher, native live mapping, merchant credentials or production
connection has been configured by this work. No real payment, refund, financial program or
production setting was executed or activated. A passing synthetic test is not live merchant
evidence.

## Delivered interfaces

* `lib/platform/ledger-worker.js`: durable opaque-reference intake, verified handoff to the
  commerce ledger bridge, bounded retries/review, scoped index repair and request deadlines.
* `POST /api/ledger/event-reference`: authenticated server delivery with exactly one JSON field,
  `{ "eventReference": "opaque-server-registry-reference" }`.
* `GET /api/ledger/worker`: authenticated discovery of already bound native orders, due-reference
  verification and due-journal recovery.
* `vercel.json`: a source-only daily scheduler proposal, `/api/ledger/worker` at `0 7 * * *`.
  Existing `/api/leads/retry` at `0 6 * * *` and the framework setting are preserved.
* `tests/ledger-worker.test.mjs`: focused route, durability, concurrency and deadline evidence.

Both routes use the existing server `CRON_SECRET` through the exact
`Authorization: Bearer <existing secret>` header, compared in constant time. No new secret is
generated. Portal cookies, client admin/paid claims, query tokens and provider callbacks without
this server authentication do not grant access. These routes do not alter user roles or MFA.

`COMMERCE_LEDGER_ENABLED` remains OFF by default. An authenticated OFF scheduler returns
`200` with `{status:'disabled',skipped:true,correlationId}` before body reading, store creation,
native factory construction or source access. OFF event delivery returns `503` without accepting
the body. Missing server authentication/configuration fails closed. This successful scheduler
skip is not a claim that native payments are connected or healthy.

An enabled request requires a durable platform store and
`createNativeCommerceLedgerRuntime({env,store,now,signal})` returning `{bridge,readiness,poller}` with
`readiness.ready === true`, the verified `mappingHash`, `source` and `projectId`. The factory
owns the actual native verification and independently verified mapping/evidence gates. Production
rejects the memory store. Readiness details and credential values are never returned by these
routes. Factory and bridge instances are created per request using its guarded store/signal;
do not substitute a cached bridge with an unguarded store.

The GET handler supports a server-only `poller.pollOnce({limit:1,deadlineAt,signal,enqueueReference})`
hook. The same absolute HTTP deadline, cancellation signal and guarded store apply to discovery.
Discovery must start from an existing independently verified immutable order/customer binding;
it cannot search arbitrary public order IDs or infer an owner from an email. Its native registry
reference must be persisted before `enqueueReference(opaqueString)`. The handler accepts only
that string, persists the ordinary delivery claim, then runs independent bridge verification.
POST does not run discovery. Webhook-only injected runtimes may omit the poller. A malformed
provided interface fails closed. Existing durable work drains before discovery, so a repeatedly
stalled discovery source cannot prevent recovery of an already verified receipt. Source failure
reports coarse deferred counts; an additional small queue drain follows if time remains.

## Input and trust boundary

The event body has a 1 KiB streamed size limit, strict JSON media type, bounded read time and
one bounded string reference (1–200 characters). Additional fields are rejected, including
amount, currency, order/customer identity, status, `paid`, `verified`, program or bonus settings.
Arbitrary URLs and control characters cannot be submitted as references. GET has no payload or
query-parameter control of batch size, identity, amount or retry policy.

The reference is a lookup key for a server-authored native registry record. It is never parsed
as a provider URL, payment amount or ownership assertion. Successful authentication proves only
the delivery channel. A reference can still be unknown, unverified or false. The journal requires
the native factory's independent authenticated MPGS/CS-Cart reads, approved goods/order binding,
verified account ownership and exact merchant/project/currency/amount checks.

The intended seller remains **MAXIMUS SPORTS EQUIPMENT TRADING LLC** through its existing store
and MPGS route. This worker never creates an order, charges a card, initiates a refund, modifies
native payment settings or grants a financial-product entitlement. TEST invoices, historical
settings and status `P` alone cannot become receipts. Principal and bonus programs remain outside
this goods-only writer, with no 20% default or public activation.

## Durable processing and recovery

1. Authenticated intake atomically persists a `ledgerReferenceDelivery` claim, unique reference
   key, due index and audit **before** attempting native verification. Keys are scoped by the
   immutable full mapping hash, source and project. No payment or customer fact is created here.
2. A CAS lease claims the reference and atomically rescores the due index to lease expiry.
   Its default lease is 60 seconds, matching the route's maximum duration.
3. `bridge.enqueueReference` independently resolves the native registry reference, provider
   movement, approved order and customer binding. Only this verified result can create the
   existing durable economic inbox/work item.
4. The reference handoff is marked completed only after the economic work is durable. The bridge
   then posts to its atomic, immutable journal. Reference `completed` counts mean verified
   handoff; journal `completed` counts mean successful/replayed journal posting, not bank settlement.
5. Query failures retain the reference with exponential delayed eligibility, starting at 1 second
   and capped at 5 minutes. Five default claims per cycle lead to an audited `review_required`
   state. Lifetime attempts remain recorded. Immediate resend cannot bypass delays or reset the
   review budget. Active leases and future retries do not occupy the due-only first-N batch.
6. With polling present, the scheduler first handles one existing reference and two economic work
   attempts, then checks at most one due bound order through the poller hook. A second drain of
   one reference/two work attempts runs if time remains. Total limits remain two reference claims
   and four economic work attempts per invocation. Without a poller these limits form one drain.
   Existing bridge backoff, bounded review and dedup remain intact. A failure after verified
   handoff or after journal commit can be replayed without losing the work or adding another receipt.
   A reversal waiting for its verified capture uses the bridge's separate durable prerequisite
   budget (100 waits or 30 days by default); it does not consume the ordinary five-error budget.
   Exhaustion still requires operator review, and missing captures are never invented.

Missing/foreign/stale terminal members of a scoped due index are removed from that index and
retained as `ledgerReferenceIndexIssue` with an audit entry. Foreign records are not edited.
Own terminal-row cleanup includes a version guard so it cannot remove a concurrent operator
requeue. Missing-row cleanup uses an atomic absence guard (write/delete within one commit, with
no surviving placeholder), so it cannot remove a concurrent newly received reference. Both
races have regressions; the absence-guard path was also checked on actual Redis.

`requeueReviewedReference(opaqueOperatorCaseReference)` is server-only and has no HTTP endpoint.
Its optional `resolveAuthorizedReferenceRetry` must independently verify the current operator's
roles, required MFA and exact approved case. The canonical case requires `id`, `status:'approved'`,
`capability:'ledger:retry'`, exact `deliveryId`, `scopeHash`, immutable `fingerprint`, `actorUserId`,
`caseId`, `expiresAt` and `proof:{method:'authorized_operator',evidenceId,verifiedAt}`.
The helper rechecks expiry before commit, persistently consumes the approval once, appends the
actor/case audit, preserves lifetime attempts and resets only the retry-cycle budget. Wrong,
expired, raw, replayed or unconfigured approval cannot give an extra retry cycle. It cannot
repair changed economic evidence. Production operator-case lookup/UI is not configured here;
existing role/MFA policy must remain in force when it is connected.

Mapping replacement does not automatically migrate older queues. Keep the verified previous
mapping available while draining its scope or design an audited migration. Do not edit recorded
claims, native bindings or journal entries in place.

## Runtime time bounds and privacy

Both routes have `maxDuration=60`. A shared 45-second deadline starts at HTTP-handler entry and
covers body handling, factory setup, store calls, native verification and journal stages. Its
AbortSignal is passed to the native factory. Every async platform-store method is additionally
guarded against that deadline, including an underlying stalled response-body promise. After
expiry the pipeline cannot start another store/journal stage. Native readers independently bound
their GET transport and response-body operations and receive the same cancellation signal.

A database/Redis atomic commit already sent before cancellation may finish even if its
acknowledgement is lost. The request may therefore return `503` after a durable write. Retrying
the same reference is safe: persisted leases, CAS ownership, inbox/economic dedup and journal
idempotency recover the final state. A timeout is not proof that no movement or journal exists.
The worker stops starting new jobs when its remaining budget is exhausted. Scheduling recovery
uses durable due times, not work left running after an HTTP response.

HTTP results expose only fixed status, bounded counts, duplicate indication and a freshly generated
correlation ID. They expose no reference/work/customer/order identifiers, native proofs, card
fields, merchant response bodies, credentials or raw error text. Audit metadata uses internal
identifiers and coarse failure categories. Opaque references remain private server records.
GET includes a `discovery` object with only the integer counts `bindingsChecked`,
`movementsDiscovered`, `referencesQueued`, `deferred` and `reviewRequired`, each bounded to 0–100.
Other poller fields are discarded. Discovery/queue counts describe source work and durable handoff,
not bank settlement or proof that all merchant receipts have been collected.

## Scheduler proposal and operator handoff

The daily configuration is prepared in source and has **not** been published. It preserves the
existing daily cadence. Before release, the owner/release operator must review this source change
and confirm the project's current scheduling plan and deployment access. No Vercel settings,
environment values or persistent schedules were changed through an external API.

Daily fallback means an eligible retry can wait until the next daily invocation (approximately
one day), and a backlog can require multiple batches/days. The millisecond backoff is a minimum
eligibility time, not a delivery promise. Normal registered events can be attempted immediately
through the authenticated POST. The prepared polling path can discover later movements of an
already verified bound order without a PHP event publisher. Initial approved native bindings,
live mapping and credentials still need to be independently established. Daily polling does not
promise immediate discovery, and an absent initial binding cannot be replaced by arbitrary-order
scanning. No current autonomous production delivery is claimed. A more frequent production cadence requires verification of the
existing project's plan/capacity and review of the source configuration; no upgrade or new
subscription is assumed.

The existing hosting/add-on developer and merchant operator need to supply the following concrete
connection evidence, using current authorized server access:

1. Inspect the installed CS-Cart/MPGS add-on and establish the current live mode, approved merchant
   route, native API versions/schema, company/storefront/payment-method mapping, currency and
   approved goods cash total. Register the independently verified mapping and separate scoped
   evidence records expected by `native-ledger-runtime.js`.
2. Map an actual native order to its immutable approved commerce order and verified portal owner.
   A matching email, a TEST quote or a plan label is insufficient. Preserve the unique durable
   customer/order binding; do not seed a customer or fabricate a paid balance.
3. Register the initial trusted order/customer binding expected by `native-bindings.js`, together
   with independently verified merchant/order evidence. Existing verified bindings can then be
   checked through the prepared read-only polling path, which persists opaque registry references
   before delivering them to the worker. For immediate event delivery, an optional trusted add-on
   publisher must persist the same independently verified registry records before server POST.
   A generic browser callback or status-only notification is insufficient. The installed native
   publisher is currently **NOT CONNECTED / NOT INSPECTED**; it is an optional delivery source,
   rather than the only possible source.
4. Use the already authorized durable store and existing approved merchant credentials strictly
   on the server. Reuse the existing `CRON_SECRET`; never send its value to a model, browser,
   query string or log, and do not generate a replacement as part of this work.
5. Review the prepared polling route for the verified binding registry and daily capacity, or have
   a trusted server publisher POST an opaque reference with the existing secret and no
   money/owner/program fields. Redeliver the same reference after uncertain acknowledgement.
   Connect approved operator-case recovery to reviewed references through existing roles/MFA.
6. Complete release verification, review/publish the prepared source and scheduler only within
   the owner's authorization, and enable native processing only after all factory gates are backed
   by actual evidence. Separate settlement/bank reconciliation remains required outside this journal.

Current blocker: owner/server access is unavailable and the initial approved native binding/live
mapping evidence has not been established, so production delivery cannot be claimed complete.
No production credentials or native facts have been filled from guesses.

## Local verification evidence

The focused worker suite passed **26/26, zero skips** with `INTAKE_REQUIRE_REDIS=1` on Node 24.
It verifies authentication and OFF behavior, strict body constraints, privacy, query outage/backoff,
review/operator recovery, queue fairness, scope isolation, cleanup/requeue races, shared setup/store
deadlines and late-verifier interruption with lease recovery. Additional discovery-hook regressions
check durable reference intake before independent verification, replay dedup, privacy, source
failure with existing queue recovery, POST isolation, rejection of monetary/owner objects and
late discovery cancellation before enqueue. A stalled-source regression proves existing durable
journal work posts before discovery can exhaust the request; the two drains retain the original
two-reference total batch limit.
The ordering regression queues 20 same-time movements with the full capture last in the actual
hashed due index. Under the daily two-reference/four-journal limits, 19 valid partial refunds wait
through more than five prerequisite attempts and recover after capture: one captured payment,
20 immutable journal entries, captured 12,345 minor units, refunded 1,900 and remaining 10,445.
These are synthetic test values, not real merchant balances or throughput evidence.

The actual Redis test owned a fresh loopback process/directory on port 6396 and used the existing
REST test bridge plus production Lua commit path. Eight concurrent deliveries persisted one
reference claim. Native query failure, interrupted handoff and interrupted journal completion
were recovered by reconstructed workers at their due times. Redis retained exactly one reference,
economic work item, verified inbox receipt, journal and captured-payment record. Test merchant
evidence and provider responses were synthetic; no real native payment was exercised.
