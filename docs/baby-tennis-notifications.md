# MAXIMUS BABY TENNIS owner notifications

Owner request, 2026-10-10: connect registration and inquiry notifications from MAXIMUS BABY TENNIS to the existing MAXIMUS TENNIS Telegram bot. Establish the same requirement for every new site. This change connects only the named Baby site; it does not imply that other sites are configured.

## Delivery contract

- Baby saves each new adult profile/inquiry and its notification atomically in D1. Updating a profile does not create another registration notification.
- Baby sends bounded events to `POST https://maximus.tennis/api/site-events` using `OWNER_NOTIFY_SECRET`. The receiver uses the same value in production `BABY_TENNIS_NOTIFY_SECRET`.
- The signature is HMAC-SHA256 over `timestamp + '.' + exact request body`, sent in `X-Maximus-Signature: sha256=<hex>`; `X-Maximus-Timestamp` is seconds within five minutes.
- Only the `maximus-baby-tennis` source and `registration.created`, `inquiry.created`, `connection.test` events are accepted. Event IDs and payload hashes provide durable idempotency. No caller can select a destination.
- The existing bot and established numeric owner chat are used. Missing owner settings fail closed. Baby retries never discover a recipient from arbitrary bot updates.
- Existing Redis intake storage persists the event before sending. Existing retry processing remains responsible after acceptance. The existing authenticated daily cron also drains up to five due Baby D1 events through its separately scoped HMAC action. It does not create a new schedule.
- Journals, private peer messages, child data, passwords and tokens are excluded.

## Required configuration and verification

The same random server-only secret (at least 32 characters) is required in both environments. Never commit its value or put it in client code. Missing configuration leaves the integration disabled and saved Baby events pending.

Run `node --no-warnings --import ./tests/register.mjs --test tests/site-events.test.mjs` and the existing Telegram tests. Baby has its own `qa/notification-checks.mjs`. Publish both services with their matching environment revisions. Send one signed `connection.test` event without invented contact data; require the persisted Telegram message ID before claiming delivery. Verify that repeating the same event returns the same result without an additional message.

Source implementation, configured environment, deployed revision and delivered control event are separate states. As of initial preparation, Vercel rejected the production secret write with HTTP 403; no live delivery is claimed until owner access resolves that configuration step.
