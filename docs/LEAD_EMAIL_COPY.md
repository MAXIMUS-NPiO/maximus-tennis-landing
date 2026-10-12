# Website request email copies

`POST /api/leads` handles all public request purposes, including `technical` and `config`. These are requests for review; this feature does not create orders, payments or customer emails.

Set `LEAD_NOTIFY_EMAIL_COPY=true` to retain the existing primary notification channel and also send each new website request to `LEAD_NOTIFY_TO` through the existing SMTP integration. Leave `LEAD_NOTIFY_CHANNEL` unchanged. The default remains disabled. SMTP as the primary channel sends once, not twice.

## Required configuration

For maximus.tennis, the existing Production configuration verified on 2026-10-12 is:

| Setting | Value / state |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (implicit TLS) |
| `SMTP_USER` | `gps@maximus.tennis` |
| `LEAD_NOTIFY_FROM` | `gps@maximus.tennis` |
| `LEAD_NOTIFY_TO` | `gps@maximus.tennis` |
| `SMTP_PASS` | **Absent. Owner configuration required before activation.** |
| `LEAD_NOTIFY_EMAIL_COPY` | Absent; copying is disabled until explicitly enabled. |

The mailbox owner must add the sending mailbox's authorized Google app password directly as a **Production Secret** named `SMTP_PASS` in Vercel. Do not paste it into chat, commit it, export production secrets, or weaken Google account protections. If that authentication method is unavailable under the account policy, a separately approved mail integration is required. Creating new OAuth access or credentials is outside this change. See [Google's app-password requirements](https://support.google.com/mail/answer/185833?hl=en).

After the owner configures the secret, enable the non-secret flag `LEAD_NOTIFY_EMAIL_COPY=true` and deploy the reviewed email-copy commit to the existing project. This document does not claim that activation or deployment has occurred.

## Delivery and retry contract

- The request is stored before notification. SMTP receives one fixed configured recipient; requester email is only `Reply-To`. No CC/BCC or requester receipt is added.
- Each selected channel is checkpointed separately in the existing Redis notification record. A retry skips successful channels. Missing SMTP configuration remains visible and does not prevent Telegram delivery.
- Already-sent legacy requests are not replayed or backfilled. The existing Baby Tennis relay remains Telegram-only.
- The status endpoint reports the primary `notification`, configured `notifications`, and `emailCopy` state without returning credentials. The private register includes per-channel states, attempts and message IDs.
- A channel's `sent` state records transport acceptance, **not Gmail inbox delivery**. A network interruption after acceptance but before the checkpoint can still cause a duplicate on retry; SMTP/Telegram do not provide transactional exactly-once delivery with Redis.

## Gmail rule

In the owner's Gmail account (`gps@maximus.tennis`), create a filter matching:

```text
from:(gps@maximus.tennis) to:(gps@maximus.tennis) subject:([MAXIMUS])
```

Apply the existing label **MAXIMUS — Заявки** (`Label_18`). Do not archive, delete, forward, mark read or change spam handling. The notification subject format is `[MAXIMUS] <server request ID> | <purpose> | <locale>`; every message also contains `X-Maximus-Request-Id`. Gmail search does not support arbitrary custom-header matching, so use sender, recipient and subject together. The rule has not been created by this code change.

Google documents the [filter creation and import workflow](https://support.google.com/mail/answer/6579?hl=en).

## Owner-only live verification after activation

1. Confirm `/api/leads/status` reports Telegram plus Google Workspace SMTP and `emailCopy: configured`.
2. Submit a single synthetic request with `TEST EMAIL COPY <UTC timestamp>` in its name and message, and `gps@maximus.tennis` as its contact email. Use no customer data. Record the generated `MX-…` request ID, exact subject and UTC submission time. The server generates request IDs; a client test marker does not override them.
3. Inspect that request's per-channel results and SMTP message ID. Do not invoke a broad retry or resend old customer requests. The normal intake hook can also process up to three overdue notifications from the existing queue.
4. Independently find the exact message in Gmail, check its recipient and automatic `Label_18` assignment, and confirm the synthetic Telegram notification. Finding a manually labelled older client email does not verify this feature.

Local loopback tests capture SMTP envelopes without sending any mail externally. They verify code and SMTP protocol handling only, not the owner's Gmail delivery or filter.
