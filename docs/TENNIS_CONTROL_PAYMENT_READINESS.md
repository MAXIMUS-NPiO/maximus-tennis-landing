<!-- © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. -->
# Tennis owner control payment: readiness and UI boundary

The requested outcome is a genuine **USD 1.00** control payment with the MPGS payment form inside `https://maximus.tennis`. The owner alone enters card details and completes any bank/3DS challenge. This document does not authorize an agent to enter card details, initiate a charge, change merchant settings or publish an unverified payment form.

The browser renderer remains unavailable. No control-payment page, public API route, guessed SDK integration or replacement redirect flow is introduced by this document. The existing goods checkout remains unchanged, including its disabled runtime.

## What the inspected source establishes

The locally available archive handler is `web/app/addons/mpgs_payment/payments/mpgs.php`, SHA-256 `ada388d5b8be8d604cdf131a43dd6a1c073b85d12a32b825c9e3b6b6079642b7`. The archive inspection reports:

| Source | Observed behavior | What it does not establish |
| --- | --- | --- |
| Line 20 | `MPGS_API_VERSION = '100'` | A pinned browser SDK version or merchant support for an embedded form |
| Line 389 | `${gateway_url}/static/checkout/checkout.min.js` | A versioned SDK URL or an audited embedded API contract |
| Lines 445–448 | `Checkout.configure({ session: { id: ... } })`, then `Checkout.showPaymentPage()` | An embedded mount operation; this is a hosted-page redirect |
| Lines 454–457 | `data-complete`, `data-error`, `data-cancel` callback attributes and `data-cfasync="false"` | Embedded callback signatures, mount/unmount behavior or payment proof |

The handler has no occurrence of `showEmbeddedPage` and provides no embedded mount/lifecycle evidence. Its server-side `INITIATE_CHECKOUT`/`PURCHASE` flow cannot establish the missing browser integration. API version 100 must not be relabelled as SDK version 100. The complete source findings belong in [MPGS_ARCHIVE_SOURCE_CONTRACT.md](MPGS_ARCHIVE_SOURCE_CONTRACT.md).

The archived session-response handling also supplies no provider expiry/TTL. The current browser descriptor requires a verified, unexpired receipt; a guessed future `expiresAt` cannot satisfy that requirement. Do not copy the archive's logging of provider responses or its permissive paid predicate into the control flow.

The source also does not establish current permission for USD, approval of the `maximus.tennis` origin, current live merchant feature settings or successful 3DS behavior on this site. These are separate evidence requirements. The earlier denied SDK-documentation network access must not be bypassed to fill them.

## Separate control position and owner-only journey

The server-owned purpose is `payment_control`, with currency exactly `USD` and total exactly `100` minor units: **USD 1.00, not USD 100**. Its identity, owner, amount, currency and accepted terms are immutable and must not come from browser-supplied financial fields.

This position is separate from goods and investment:

- It is not a racket purchase, approved goods quotation or CS-Cart order. It carries no shipping or fulfillment claim.
- It does not enroll the owner in an investment program, accept investment principal, earn investment returns or alter the existing 20% terms.
- It must not produce a goods invoice, program balance or investment ledger entry through an existing goods workflow. No automatic refund or accounting classification is promised by this UI document.
- Any permission is restricted to the independently verified owner and this one explicit control position. A query parameter, email match, bearer fragment, environment flag or arbitrary amount does not grant permission.

The intended journey, after the missing evidence and backend contract are verified, is: verified owner signs in; the server returns the authorized control position; the owner sees its exact purpose and USD 1.00 total and accepts the applicable terms; one idempotent server attempt prepares a verified session; a verified renderer mounts the bank form; the owner supplies card details and handles 3DS; an authenticated server read establishes the payment result. Browser completion, cancellation and return parameters are observations, never settlement evidence.

No URL for this future journey is registered here. A control route must not be added merely to display an unavailable or simulated bank form.

## Existing code boundaries to preserve

- `lib/commerce/tennis-checkout-http.js` returns `service:null` from `resolveTennisCheckoutRuntime()` regardless of portal flags. An unavailable deployment account or uninspected environment does not prove that production settings are missing; this source-level null factory is an independently observable code constraint.
- `lib/commerce/tennis-checkout.js` accepts the existing AED goods route and requires the approved goods contract, durable owner mapping and five verified route evidence records. Do not weaken it or fabricate a goods approval to accommodate this control charge.
- `lib/platform/native-mpgs.js` preserves `createNativeMpgsReader` as AED-only at the order, transaction and nested-order levels. A separately named `createTennisControlMpgsReader` reuses its private parser with fixed API 100, USD 100 minor, full capture and control provider-order IDs. Neither wrapper establishes current merchant currency permission.
- `components/TennisCheckout.js` maps a validated `ready` response to `renderer_unavailable`. The current descriptor validator's selected SDK `100` is not positive evidence about the archived unversioned script.
- Keep all 48 existing locales. Control-payment labels and navigation must not replace goods or investment wording with misleading approval or payment claims.

## Renderer and production browser requirements

A narrow shared renderer can be implemented only after an authorized source establishes its exact SDK URL/version contract, configuration, embedded mount call and arguments, callback registration and lifecycle behavior. The archived redirect call is insufficient. Do not substitute a lightbox, hosted redirect, native card inputs or another provider integration for the requested embedded experience.

Once that contract is established, the renderer must load once, handle missing or incompatible SDK methods, bound load time, reject expired descriptors, ignore late callbacks after unmount and avoid duplicate mounts or sessions. Pass the verified session only in memory to the documented SDK API. The application must not put descriptors or session IDs in its HTML, data attributes, URLs, persistent storage, analytics or logs. The bank frame and its transport require their own verified behavior; the application must not invent or inspect card fields to imitate that behavior.

The page must preserve distinct `creating`, `uncertain`, `review_required` and `expired` states. A lost acknowledgement cannot enable a blind second attempt. A completion or cancellation callback triggers an authenticated status check; it cannot set the order to paid. There is no readiness claim until both the server adapter and renderer have been verified.

The current checkout page declares `no-referrer` metadata, and its API replies are private/no-store/no-referrer. The repository's `next.config.mjs` does not currently provide a production Content Security Policy. The restrictive CSP in the synthetic browser test and the legacy TEST hosted HTML does not protect a deployed control page.

Before publication, verify actual response headers on the intended production origin and introduce a route-scoped CSP compatible with Next's scripts. Its script, frame and connection permissions must follow verified MPGS and 3DS requirements, with no guessed domains or broad wildcard relaxation. Verify the nonce policy, `no-store`, `no-referrer`, `base-uri`, form behavior and frame restrictions with the real integration. The existing `X-Frame-Options: SAMEORIGIN` controls who can frame the merchant page; it is not permission to embed MPGS. Preserve the verified account cookie, exact-origin checks and CSRF protection. Merchant credentials stay server-only, never in `NEXT_PUBLIC_*` configuration.

Production merchant configuration, deployed headers and account access must be reported separately as **verified**, **unverified**, or **not inspected**. A missing tool connection or lack of Vercel access is not evidence that an environment variable, merchant permission or deployment setting is absent.

## Verification still required

The current component suite has 22 actual mounted React DOM scenarios covering safe checkout states, explicit consent, foreign owner/TEST rejection, duplicate clicks, lost acknowledgements, changed terms, timeout, unmount, StrictMode replay, expired authentication, late responses across remount and descriptor privacy. These use intercepted synthetic responses with external connections blocked. They prove neither bank availability nor live USD/3DS support.

Extend that suite only against the subsequently verified renderer contract: one SDK load; incompatible/missing API; load failure/timeout; React StrictMode and remount; descriptor expiry during load; stale callbacks; exact mount cleanup; no descriptor leakage; callbacks never marking paid; fixed USD 1.00 and owner binding; and no control-to-goods/program crossover. Verify the actual production CSP and the authenticated return/status route separately. The owner performs the final real card/3DS step; confirm the result through the independently authenticated provider read and retain only safe reconciliation evidence.

Backend/session transport, credential custody, persistence and deployment readiness are tracked separately by the coordinating task. None of the UI/source observations above enables runtime or establishes those dependencies as configured.

## Prepared server implementation

- `lib/commerce/tennis-control-order.js` creates immutable `MX-CTL-…` orders in the existing platform store, outside goods/portal-order/CS-Cart records. A trusted resolver must independently bind the owner's verified account to a one-use authorization for exactly USD 1, the control purpose, terms and an expiry. Current active user and membership are reread. Revoked or changed authorization cannot grant a new initiation permit. Historical inspection of an already reserved attempt remains possible after expiry/revocation.
- One atomic reservation stores the server-generated `MC…` provider order ID, correlation, immutable snapshot binding, one-attempt claim and audit. Lost reservation ACK never grants another initiation permit. Repeated requests, new idempotency keys and service reconstruction reuse the original authorization/order. A lost provider response remains uncertain; no automatic second session POST is made. `localSessionDeadline` is an application limit, at most 15 minutes and never beyond the authorization expiry. It is explicitly not the bank's session TTL.
- `lib/platform/tennis-control-mpgs.js` sends the source-derived API 100 `INITIATE_CHECKOUT`/`PURCHASE` payload with exactly `order.amount: "1.00"` and `order.currency: "USD"`. The constructor requires an explicit authenticated transport, private password, merchant display name and clean return/cancel URLs on `https://maximus.tennis`. There is no default runtime/fetch, credential discovery or retry. Responses are bounded, redirects refused and errors sanitized. Session data stays private and is not a paid result.
- `lib/commerce/tennis-control-proof.js` queries only the server-bound provider order through the injected read-only USD reader. It rechecks owner/binding after the query, requires one exact successful full capture and complete refund history, and atomically stores sanitized proof and audit. Wrong owner/order/merchant/currency/amount, incomplete or regressing history and unsupported monetary reversals cannot establish payment. Duplicate queries and lost commit ACK are idempotent. There is no payment, refund, invoice or ledger-posting operation.

These services remain server-only dependency-injected code. They do not construct evidence records, create a live authorization, register a public route or expose a session to the browser. Synthetic tests explicitly use fabricated fixtures and intercepted transports; their success is not a live payment claim.

## Prepared runtime and HTTP boundary

`lib/commerce/tennis-control-runtime.js` now assembles the existing order and proof services from explicit trusted dependencies. It obtains the authorization reference server-side from the verified account. `prepare` issues the fixed control order after acceptance of its exact terms; `status` observes only that owner's already reserved provider order. An unreserved order does not call the provider reader. The assembly has no initiation operation, bank transport, credential discovery or renderer. Its default resolver returns `service:null` regardless of environment flags.

`lib/commerce/tennis-control-http.js` supplies **unregistered** POST handlers for these two operations. They use the existing verified portal session and CSRF, exact `https://maximus.tennis` origin, bounded JSON bodies, an allowlist of fields and sanitized private/no-store replies. Both operations reauthenticate the same account after reading the body and after asynchronous service work. No browser-supplied owner, amount, currency, authorization reference, provider order, session or return callback is accepted. A second output projection omits all private session/provider/authorization data. This is a tested preparation/status boundary, not a payable endpoint or a published checkout.

The existing React checkout clears its order, session and checked consent after 401/403. Its helper stops the session-to-order chain if cancellation happens before transport, after the response or during body decoding. Mounted tests exercise the actual React development StrictMode effect replay and late response/remount paths. They do not load a bank SDK or claim an embedded form works.

Control reconciliation now records the durable proof version before querying the provider. If another verifier commits while that query is in flight, it performs a bounded new read against the updated version. A late capture-only response cannot permanently invalidate a newer full-refund proof. A genuine later history regression, malformed observation or unsupported monetary operation still requires review. The regression suite includes concurrent observations, CAS conflict, a lost refund acknowledgement and service reconstruction.

Actual merchant permission and deployed configuration remain unverified. The accessible browser inventory is empty and no merchant administration connector is available. Only local environment-variable presence was checked, without values; that says nothing about deployed credentials. The earlier Vercel refusal was not retried or bypassed.

## Redis verification boundary

The legacy intake integration now uses the existing isolated Redis helper: a new disposable directory, loopback binding, bounded startup and awaited cleanup. Only an absent or disallowed executable/socket can cause an optional skip; a Redis startup/readiness failure is no longer silently treated as an absent installation.

No existing `redis-server` executable was found in the available local installation or checked caches. Running the Redis cases with `INTAKE_REQUIRE_REDIS=1` fails on `spawn redis-server ENOENT` with zero skips. This verifies that the mandatory gate refuses an unavailable environment; it does not verify Redis transactions. The existing bridge/readiness unit fixtures pass without a real server.

The current Redis helper deliberately uses `--save '' --appendonly no`. Service/client recreation over that server and the separate Node-process file fixture are not Redis-server persistence or failover evidence. Closing that dependency requires an available authorized local/CI Redis, the full mandatory command `INTAKE_REQUIRE_REDIS=1 REQUIRE_LOCAL_SMTP=true npm test`, and a separately executed persistence/restart scenario on the same isolated data directory. No installed service, dependency, cloud configuration or credential was added for these checks.

## Exact next actions for an existing owner/operator

1. In the existing merchant administration/account records, verify that the actual merchant is permitted to accept **USD 1.00**, and verify the approved `maximus.tennis` origin and embedded/3DS capability. The source's configurable currency with AED default does not establish an AED-only restriction. No AED equivalent, exchange rate, minimum charge or fee is known from the permitted evidence. Do not silently convert the owner's USD request, use AED 1575 or claim issuer fees are zero.
2. In the existing deployment's protected server configuration, check whether the already used server-only `NATIVE_MPGS_API_PASSWORD` is available and authorized for the selected merchant and operation. The new adapter accepts the password as a private constructor argument; runtime wiring must use protected configuration, never a browser field or `NEXT_PUBLIC_*`. Do not send the value in chat, put it in Git, export it from the shop archive, or create a new permanent credential. Current deployment configuration has **not been inspected** because the existing Vercel connection denied access; this is not proof that the credential is absent.
3. Identify the owner's existing verified `usr_…` account and bind one independently verified authorization to the exact control terms/amount in the existing durable platform store. Implement the trusted authorizer against that evidence and connect the tested preparation/status assembly to the existing protected deployment configuration. Reuse existing durable storage; do not create a replacement service or promote TEST goods. Verify the actual persistent store and the remaining Redis tests.
4. Supply an authorized, current embedded SDK contract/source showing the precise mount/lifecycle/3DS behavior and allowed browser origins. The archive's redirect is insufficient and the previously denied SDK access must not be bypassed. Then implement the narrow renderer, verified session handoff and guarded initiation integration, and register the prepared authenticated handlers only with the complete verified journey. The intended journey is `/[locale]/checkout/control`; this path is **not registered or published** by this change.
5. Verify the exact production response headers/CSP and runtime on that control route before exposing it to the owner. Publish only the working owner-only control checkout within the specifically authorized scope. The owner, not an agent, enters the card and completes 3DS. Read the resulting capture server-side; any actual refund is also an owner operation.

Suggested control disclosure for the future owner-only page: **“Control payment — USD 1.00. This checks the payment connection. No physical product or delivery is included, and this payment does not join or fund an investment program. Any refund is a separate owner action.”** This wording is a prepared UI disclosure, not an automatically published legal or accounting classification. The owner must see and accept the exact immutable version before the attempt is reserved.

## Prior-stage local verification, 2026-10-11

`REQUIRE_LOCAL_SMTP=true npm test`: **623 tests, 602 passed, 21 skipped, zero failed/cancelled/todo**. All skips require unavailable Redis; the new control-order suite adds one Redis case to the previous twenty. The successful run includes local loopback SMTP/HTTP and all 15 mounted React scenarios. An earlier restricted-sandbox run failed at its loopback listeners; it is not counted as passing.

The new control suites cover 54 cases: 53 passed, one Redis case skipped. They include an integrated synthetic owner-order/session/capture/refund flow and a separate three-Node-process restart test over persisted test-only file snapshots. Reconstructing that fixture preserves the uncertain attempt, capture/refund proof and one session-call count. It is not proof of Redis durability, power-loss behavior or live banking.

`NEXT_TELEMETRY_DISABLED=1 npm run build` passed with **1832/1832** pages. Built authorship verification passed: 304 source files, 241 images, 48 languages and 89 bundles. Independent Codex review found no remaining material defects. Application routes/components, the existing null checkout runtime, manifests/lockfile, financial program and production settings are unchanged. No live bank request, card interaction, real capture/refund, SDK download or new access occurred during verification.

## Continuation verification, 2026-10-11, 23:42 UTC

`REQUIRE_LOCAL_SMTP=true npm test`: **652 tests, 631 passed, 21 Redis skipped, zero failed/cancelled/todo**. All 22 mounted React DOM scenarios passed, including real development StrictMode effect replay. The final separate client/component run also passed 23 top-level tests (21 client tests, locale coverage and one mounted harness containing those 22 scenarios). Source authorship passed with 308 source files, 241 images and 48 languages. Package manifests and lockfile are byte-for-byte unchanged.

Independent Codex review reproduced and then verified both the session-revocation and concurrent-refund fixes: 38/38 proof/runtime/HTTP tests and 42/42 runtime/HTTP/client tests passed. Five new proof regressions are included in the 17/17 proof suite. No unresolved material findings remained in that scoped review.

The mandatory real-Redis run failed with `ENOENT` and zero skips, as documented above; it is not counted as passed. An early component attempt timed out in local setup, but the final frozen harness and the full suite completed successfully without widening the original 60-second timeout or changing production configuration.

Claude review is not complete. The designated orchestration task tested the existing route and stopped after its one authorized retry was rejected by `MAXIMUS_COST_LOCK`; the actual task `MX-20261011-e2dd4bc542` is `NEEDS_INPUT`. Its policy still lacks verified extra-usage-off evidence and a task grant. No second worker, direct Claude call, new credential or paid API fallback was used. This is separate from the completed independent Codex review.
