# Administrator TOTP MFA readiness

The server service in `lib/platform/mfa.js` implements password-confirmed enrollment, TOTP verification and disabling, and a current-record administrator gate. This change adds only this service, its regression suite and this document. Portal routes/UI, identity, flags and production configuration are owned by the integration task. No operator key, real account or role was created, and no deployment or financial activation was performed.

## Runtime contract

`createMfa({store, env, now})` uses the existing transactional platform store and an injectable millisecond clock. Its `auth` input must come exclusively from the server's authenticated identity context: `{user, userVersion, session, sessionVersion}`. Never accept those objects, role claims, token hashes, tenant IDs or MFA levels from an HTTP request body.

Methods:

| Method | Input | Result |
| --- | --- | --- |
| `beginEnrollment` | `{auth, password}` | `{enrollmentId, secret, otpauthUri, expiresAt}` |
| `confirmEnrollment` | `{auth, enrollmentId, code}` | `{sessionToken, csrfToken, expiresAt, mfaLevel:'totp'}` |
| `stepUp` | `{auth, code}` | Same rotating session result |
| `disable` | `{auth, password, code}` | Same rotating result, with `mfaLevel:'none'` |
| `requireVerifiedAdmin` | `auth` | `true`, or a closed access error |

Every operation reloads a live web session, the active user and actual non-revoked `ledger:read` assignments for the same user and `maximus-tennis` organization. Enrollment and disabling verify the current password. Confirmation additionally requires the stored password reauthentication to remain recent and newer than any password change. Pending enrollment expires after five minutes and binds to its original user, session and token hash.

Portal integration must await `requireVerifiedAdmin` on every administrator action, including read-only ledger/readiness actions. The production caller must invoke it even if `ADMIN_REQUIRE_MFA=false`. The service never treats arbitrary `mfaLevel` values as verified and never bypasses MFA. The gate requires the current active TOTP generation and a session verification less than fifteen minutes old. Disabling or reenrolling immediately invalidates every other session's old MFA authority through this generation check.

Enrollment, confirmation, verification and disabling need an authenticated same-origin POST with the current CSRF token. Generated enrollment secrets/URIs belong only in that authenticated response; use `Cache-Control: no-store`, never URLs, logs, analytics or audit metadata. This generated per-user secret is distinct from the operator encryption key. Confirmation/verification/disabling rotate both the web session token and CSRF token. Set the returned session token in the existing HttpOnly/Secure cookie and return only the CSRF token and level to client code. Existing old unique token claims may remain stored, but the session's changed token hash makes old tokens invalid.

## Operator configuration

The server runtime must receive `ADMIN_MFA_PROVIDER=totp` and `ADMIN_MFA_ENCRYPTION_KEY`, a canonical padded base64 encoding of 32 cryptographically random bytes. The format checks reject missing, malformed and common low-entropy placeholders; they cannot prove how a key was generated. Provision the key through the authorized server secret-management process. Do not use a sample/test key, expose it in a `NEXT_PUBLIC_*` variable, or allow the assistant or an HTTP client to retrieve it.

`readMfaReadiness(env)` returns only boolean fields: `providerSupported`, `encryptionKeyConfigured`, `configured`, `required`. Missing or unsupported configuration yields `mfa_not_configured` on privileged operations. Creating the service does not require credentials, so customer routes can remain available while administrator access stays closed.

Per-user secrets use AES-256-GCM with independent random IVs and authenticated organization/user/enrollment binding. The shared record stores ciphertext and the highest consumed TOTP counter. The service uses six digits, SHA1 and a thirty-second step with at most one adjacent step of clock drift. A code cannot be reused across sessions. The counter, session rotation, current user/role version fences and a sanitized audit event commit atomically. Stale commits fail instead of restoring revoked/rotated sessions or roles. Code attempts are limited to five per five-minute window, password attempts to five per five-minute window, and enrollment starts to three per ten-minute window through shared atomic counters.

No recovery bypass is implemented. Lost-device recovery, key rotation/re-encryption and operator enrollment procedures need a separate reviewed workflow; changing the encryption key without migrating existing ciphertext fails closed. Accurate server time and a durable shared transactional store are required. Never substitute an in-process memory store in production.

## Verification evidence

On 2026-10-10, `tests/platform-mfa.test.mjs` passed **14 tests, 0 failures, 0 skips**, with `INTAKE_REQUIRE_REDIS=1` and the already available Redis 8.10.2 on an isolated owned local port 6394. Synthetic fixture credentials exist only in the test source. No installation or external service was used.

Coverage includes all eighteen [RFC 6238 Appendix B](https://www.rfc-editor.org/rfc/rfc6238#appendix-B) SHA1/SHA256/SHA512 vectors; expired and cross-user/session enrollment challenges; password changes; invalid account/tenant/role boundaries; token and CSRF rotation; code replay and drift; bounded rate limiting; AES-GCM cross-user/generation tampering; disabling and step-up expiry; and logout, token rotation, suspension and role revocation racing a privileged commit. The native Redis case verifies that two concurrent sessions consuming the same code produce exactly one successful committed step-up and its audit event. Other boundary/race tests use the platform memory adapter.

The portal's actual HTTP integration and full build remain the integration task's checks. These service tests do not establish live finance readiness, live administrator enrollment, merchant payment connectivity or deployment readiness.
