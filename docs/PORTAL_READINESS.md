# Customer and administrator portal

Local implementation in `payment-release`. This document records source readiness, not a published service or actual client accounts.

## Implemented

- Account registration, explicit terms/privacy consent, separate unchecked marketing opt-in, single-use expiring email verification, resend, password login, session lookup and logout reuse `lib/platform/identity.js`.
- HTTP registration responses are identical for new/existing addresses and omit user IDs and tokens. Password hashes and session documents remain server-side. Cookies are HttpOnly, SameSite=Lax and host-only; production uses Secure `__Host-mx_session`. Successful login rotates the current browser session.
- Every mutation requires the configured same origin. Logout and order linking additionally require the current session CSRF token. JSON inputs are bounded to 16 KiB; errors contain codes rather than submitted credentials or provider details.
- Verification email recipients come from the address entered by the client, not `LEAD_NOTIFY_TO`. SMTP settings are resolved server-side. Verification links carry their token in a fragment; the page removes it and requires an explicit POST. Tests use an injected mailer and never send email.
- Customer journal reads derive `customerId` only from an active, email-verified session. Client roles such as coach do not grant access to another financial journal. Operational roles must match the subject, `maximus-tennis` organization and unrevoked state on each request.
- MyDeposit and MyBonus display the actual returnable principal and available bonus from journal projections. An empty journal has no fabricated currency balance. Goods-only journal rows can truthfully show zero principal/bonus. The portal never calls financial posting adapters, activates a rate or reports a bank balance.
- Administrator reads use the same append-only journal, retain currency separation, and require `ledger:read`. Aggregate and per-client views expose actual receipts, refunds, used bonuses and returnable principal. Selected-client details additionally show posted accrued, advanced, expired and frozen bonus amounts, returned/reversed principal, and actual approved program duration, annual simple rate, start/maturity dates, frozen state and outstanding principal. Values come from server projections; missing values are unavailable rather than zero. Per-client identity display also requires portal membership established by password login. Reads and membership/order links are audited. Journal evidence is available in the administrator view; customer history uses localized operation names.
- `getPortalOrderContext(request)` returns null for a guest, otherwise a verified server subject after origin/CSRF checks. Accepted orders can use that subject in their immutable snapshot. `linkAcceptedOrderToCustomer(request,{orderId,accessToken})` validates the existing order capability and project, then atomically claims one customer owner with an audit event. There is no email matching or client-supplied customer authority. A failed cross-store link can be retried with the retained order capability.

## Routes

- `GET /api/accounts/session`, `GET /api/accounts/orders`
- `POST /api/accounts/register`, `/login`, `/logout`, `/verify`, `/resend`
- `POST /api/accounts/orders/link`
- `GET /api/accounts/orders/{orderId}` exposes the linked owner's read-only `publicOrder`, with no capability token and no payment mutation. The recorded verified capability claim remains valid ownership evidence after the old seven-day capability expires; a server-bound snapshot customer must also match.
- `POST /api/accounts/reauth`, `/api/accounts/mfa/enroll`, `/api/accounts/mfa/confirm`, `/api/accounts/mfa/verify`, `/api/accounts/mfa/disable`
- `GET /api/ledger/account?limit=50&offset=0`
- `GET /api/ledger/admin?limit=50&offset=0`; add `customerId` only for an authorised administrator's per-client read
- `/{locale}/account`, `/{locale}/account/verify`, `/{locale}/admin/accounts`

`content/account.js` covers the existing 48 locale codes separately from the old content registry. Translation status remains `draft_requires_review` until an independent language review is recorded.

## Runtime gates

Default is disabled. `PORTAL_ENABLED=true` and `PORTAL_RUNTIME_VERIFIED=true` are necessary operator settings; neither is set by this implementation. They do not substitute for health checks: the runtime must verify its durable HTTPS Redis REST store and SMTP transport before serving. Missing configuration, memory storage, failed health checks or unavailable dependencies return 503. There is no production test bypass, seeded user or automatic owner bootstrap.

Production administrative reads always require the server-only TOTP gate. Password-verified enrollment, one-time enrollment confirmation, code replay protection, session/CSRF rotation, an active matching enrollment generation and a fresh 15-minute step-up are implemented by `lib/platform/mfa.js`. HTTP responses set the new Secure HttpOnly cookie and omit its bearer. `ADMIN_REQUIRE_MFA=false` cannot disable the production boundary. The operator must configure `ADMIN_MFA_PROVIDER=totp` and a valid `ADMIN_MFA_ENCRYPTION_KEY`, then enroll the actual authorised account. Missing settings return `mfa_not_configured`/503. No real operator enrollment or secret was created or read during this task.

Customer financial program actions remain disabled at this HTTP boundary. The approved-rule journal kernel is a separate server service; development and local fixture tests do not approve a program, merchant eligibility, price or actual payment. Displaying recorded program maturity dates does not create a computed future cash-flow calendar: that forecast is neither implemented nor approved by this work.

## Verification and remaining work

Run with the existing Node runtime:

```sh
node --no-warnings --import ./tests/register.mjs --test tests/portal.test.mjs
```

The current 21 portal tests cover registration/consent, no credential leakage, token replay/expiry, cookies, session rotation/logout, origin/CSRF/body limits, pending verification, tenant and role revocation, own-client isolation, actual posted journal currency aggregates, approved synthetic program terms/posted bonuses across the admin HTTP boundary, capability-based order ownership, saved-order reads after capability expiry, and MFA HTTP enrollment/rotation/expiry/step-up. No real network, SMTP delivery or payment is exercised.

Before enabling the portal, record actual durable-store and SMTP verification, independently review the 48 locale labels, enroll the actual authorised operator through the MFA flow, and check the final production build. Existing-store native checkout and PSP reconciliation are separate prerequisites for receiving and posting real money; the portal does not prove them ready.

## Requirement preservation

The implementation preserves APP-014–017 account/verification/session controls, APP-034 approved pricing scope (public price books contain no individual quotation history), APP-052 transactional storage, APP-055 separate consents and APP-057 audit. MyDeposit/MyBonus represent actual posted classes and never transform the historical illustrative funding examples into balances or approved live programs. Unknown runtime, order linkage, approval or translation state is shown explicitly.
