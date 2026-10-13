# Proposed forum — separate preview

This branch starts from published commit 0fd7bcf7d072a3aef0e9ac1b385313c0077565b1. It does not contain catalogue PR #6 or merge payments PR #2, mail PR #3 or contribution 16cdb4d. No production publication is authorised by this change.

## Product scope

The proposed MAXIMUS tennis and infrastructure forum starts by measuring interest. Dubai is the first city under consideration; other cities worldwide depend on expressed interest. No dates, venues or committed partners are represented. Owned courts on owned land describes a proposed development model, not an assertion that MAXIMUS already owns these assets.

The private participant dashboard uses the existing account registration, verified email, HttpOnly session, Origin checks and CSRF token. It collects residence city/country, preferred meeting city, other cities willing to travel to, total attendees, organisation/role, product/infrastructure/education-family/partnership interests, verified contact email, and optional hosting/co-organising interest. Attendee bounds are input sanity limits, not venue capacity or a confirmed allocation. Consent is for responding to the request; marketing is explicitly false.

Participants can view their own submitted application, status history and participant-visible correspondence; submit a message; view an actual saved invitation; and confirm the exact active invitation version. The deployed runtime never seeds applications, messages, invitations or attendance. Registration and authenticated runtime success require the existing real backend; unavailable services return errors and the UI never fabricates a successful save.

## Storage and security

- Every application has organizationId, projectId and ownerUserId. Ownership comes from the authenticated server session, never a client field or a matching email address. Foreign IDs return 404. Lists verify every indexed record again.
- Application/history/message changes, idempotency mapping, audit and notification outbox are committed atomically in the existing platform store. Failed commits create no accepted result. Concurrent mutation uses expectedVersion.
- The outbox preserves an immutable normalized contact and notification snapshot. Transfer to the existing intake store uses permanent forum-scoped idempotency, atomically with lead creation. It cannot reset sent notification state after the normal seven-day public intake key expires.
- Existing approved intake notification channels handle delivery/retry. Application saved, notification queued and notification delivered remain separate states. The new code sends no external invitations or booking confirmations.
- Participant messages are plain text. Projection omits internal notes/assignment data. History is bounded at 200 entries and correspondence at 100; further mutations fail explicitly rather than truncating records. Application lists paginate 20 at a time.
- Session expiration, revoked sessions, CSRF errors and foreign origin fail closed. The public /api/leads route refuses forum-purpose submissions. Contact data is not placed in browser storage.

## Runtime activation and limits

The forum API is disabled unless FORUM_ENABLED=true. No environment values, credentials, OAuth scopes, operational roles or financial flags are changed by this branch. Existing PORTAL_ENABLED=true, PORTAL_RUNTIME_VERIFIED=true, durable Redis and approved SMTP verification are required. PUBLIC_BASE_URL must exactly match the active preview origin for Origin/CSRF protection. The implementation never falls back to an in-memory runtime. Native Redis integration and hosted authenticated acceptance must be verified in the correct environment before activation/publication.

Existing /api/leads/retry cron, protected by CRON_SECRET, drains a bounded forum outbox independently of older lead retries. Its current schedule is daily; immediate successful authenticated mutations also schedule a bounded drain. An outage leaves the durable pending outbox for a later retry.

Staff authoring of replies, status decisions, invitation issuance/revocation and invitation/event policy are deliberately unavailable in this preview. They require a reviewed workflow using existing scoped request capabilities and MFA; no accounts or privileges are provisioned here. Display/confirmation of existing real invitation records is implemented and tested with synthetic fixtures only. Email replies are not automatically ingested into the private correspondence view. This is an explicit implementation dependency, not a claim of a completed coordinator workspace.

The future flight/hotel partner-offer and bonus-use modules are unavailable. No travel offers, partnerships, bonus balances, issuance/redemption, deposits, funds custody, ticket sales or financial terms are implemented. Owner financial scenarios are maintained only in the private task handoff and are not public website copy.
