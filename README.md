# MAXIMUS Tennis — website and request intake (maximus.tennis)

Production Next.js site for MAXIMUS / MAXIMUS GPS. Version 4.2 (21 September 2026).

## Stack
- Next.js 15 (App Router), React 19, plain CSS design tokens — no UI library, no CMS, no third-party fonts or widgets.
- Twenty-nine locales with language-aware URLs: `/en`, `/de`, `/nl`, `/fr`, `/es`, `/it`, `/pt`, `/pl`, `/hu`, `/sk`, `/hr`, `/sr` (Latin script), `/ro`, `/bg`, `/el`, `/sv`, `/no` (Bokmål), `/tr`, `/az`, `/uz` (Latin script), `/kk` (Cyrillic), `/uk`, `/ru`, `/ar`, `/hi` (Devanagari), `/id`, `/ja`, `/ko`, `/zh` (Simplified Chinese). Arabic is served right to left (`dir="rtl"` on `<html>`; the stylesheet uses logical properties throughout). `middleware.js` redirects only un-prefixed paths to the visitor's language (Accept-Language, 307 + `Vary`); a path that already names a language is never redirected, and `components/LanguageSuggestion.js` offers the device language instead. The language registry is `site.locales` + `site.localeMeta` in `data/site.js`: a new language is one entry there, one entry in `content/index.js` and one content file — then `check:i18n`, `check:translation` and `check:header` must pass before it ships. When a new language takes over tags another locale was answering (Kazakh was answered by Russian), remove them from that locale's `match` list in the same change.
- Static generation for every public page (`generateStaticParams`); request intake runs in Node.js route handlers.

## Structure
- `app/[locale]/…` — public pages (33 destinations × 48 locales). `app/api/leads/*` — request intake, scheduled retry, private register.
- `content/en.js` (master) and one file per language, registered in `content/index.js` — every visitor-facing string, 1206 per language. Same key structure, enforced by `scripts/check-i18n.mjs`; `scripts/check-translation.mjs` additionally fails if a translated file still carries the English value of a key, outside a per-language allowlist of terms the trade keeps in English.
- `data/products.js` — single numerical product source (matrices, precision classes, grips, training families) with evidence statuses. Internal engineering formulas are deliberately not stored in this repository.
- `data/media.js` — registered photographs (see `ASSET_MANIFEST.md`); `data/site.js` — routes, navigation, identities, ecosystem statuses, request purposes.
- `lib/intake/` — shared request schema (client + server), durable store, notification with retries, service and configuration.
- `lib/client/` — browser storage allowlist, campaign attribution, analytics consent. `lib/analytics.js` — event allowlist.
- `components/LeadForm.js` + `useLeadSubmit.js` — the one production form; `Configurator.js`, `GpsWizard.js` submit through it.
- `tests/` — unit/integration tests (`intake.test.mjs`), acceptance scenarios (`e2e/acceptance.mjs`, `e2e/consent.mjs`), local stack (`local-stack.sh`).

## Commands
```bash
npm install
npm run dev            # local development
npm test               # product data + locale parity + intake unit/integration tests (needs redis-server; python3 aiosmtpd for the SMTP case)
npm run build          # production build
npm start              # serve the build
npm run crawl -- http://localhost:3000   # every route 200, forbidden strings, lang/canonical/hreflang
npm run check:header -- http://localhost:3000   # navigation must not collide with the lockup in any language (needs playwright)
WORK=/tmp/mx tests/local-stack.sh start  # production-mode stack: redis + REST bridge + TLS SMTP sink + next start on :3100
BASE_URL=http://127.0.0.1:3100 ADMIN_PASSWORD=local-admin-password-123 WORK=/tmp/mx NODE_PATH=$(npm root -g) node tests/e2e/acceptance.mjs
```

## Request intake
Every form posts JSON to `POST /api/leads`:

1. anti-spam (honeypot field, minimum fill time) → 2. authoritative validation with the shared schema (`lib/intake/schema.js`: types, lengths, enums, exact weight matrices, set counting) → 3. rate limit per salted IP hash → 4. **atomic, idempotent save** (Redis, Lua script: idempotency key + record + queue in one step) → 5. server-generated `request_id` (`MX-<PURPOSE>-YYYYMMDD-XXXXXX`) returned to the visitor → 6. after the response: notification of the responsible mailbox, with delivery status, retries (1 min … 24 h, 8 attempts) and a daily cron (`vercel.json`) plus manual retry in the register.

Responses: `201 accepted` · `200 accepted duplicate` (same key + payload) · `400 invalid|rejected` · `413` · `415` · `429 rate_limited` · `503 unavailable` (no store configured or store down). The browser shows success only for `accepted`; otherwise the input stays on the page and the visitor sees that nothing was submitted. For `503` and network failures the page also offers **"Send this request by e-mail"**: a `mailto:` link to gps@maximus.tennis prefilled with the visitor's own input (built in the browser, nothing stored). It is labelled as an e-mail, never as an accepted request, so the site can be published before the store is connected without losing the e-mail route.

Nothing from a request is written to logs. IP addresses are never stored with a request. Contact details, free text, engraving text and child information never enter browser storage or analytics.

### Environment variables (Vercel → Project → Settings → Environment Variables; never in the repository)
| Variable | Required | Purpose |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **yes** | Durable store. Created automatically by Vercel Marketplace → Upstash for Redis (or set `UPSTASH_REDIS_REST_URL/TOKEN`). A prefix chosen in the Marketplace dialog is accepted as well (`STORAGE_KV_REST_API_URL/TOKEN` and any other prefix), provided both members of the pair carry the same prefix. HTTPS only in production. Without them intake answers 503. |
| `TELEGRAM_BOT_TOKEN` | one channel **yes** | Push notification of a new request to the responsible person. Create a bot with @BotFather and set the token; the destination chat is resolved by the server from the bot's own updates the first time (the responsible person writes to the bot once) and kept as a durable setting. `TELEGRAM_CHAT_ID` may be set explicitly and then takes precedence. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | one channel **yes** | Notification e-mail. Google Workspace: `smtp.gmail.com`, `465`, the sending mailbox, a Google **app password** (requires 2-step verification). Port 465 = implicit TLS; 587 = STARTTLS required. |
| `LEAD_NOTIFY_TO`, `LEAD_NOTIFY_FROM` | with SMTP | Recipient (e.g. `gps@maximus.tennis`) and sender (must be the SMTP user or its verified alias). |
| `LEAD_WEBHOOK_URL`, `LEAD_WEBHOOK_SECRET` | alternative channel | HTTPS endpoint; body signed `X-Maximus-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`. `LEAD_NOTIFY_CHANNEL=telegram|smtp|webhook` chooses when several exist; without it the order is telegram → smtp → webhook. |
| `CRON_SECRET` | **yes** (≥ 16 chars) | Authorises the scheduled retry `GET /api/leads/retry` (Vercel Cron sends it automatically). |
| `LEADS_ADMIN_PASSWORD` | **yes** (≥ 12 chars) | Enables the private register `/api/leads/admin` (HTTP Basic; any user name). Without it the register answers 404. |
| `RATE_LIMIT_SALT` | recommended | Salt for IP hashing (default: derived from the store token). |
| `LEADS_RATE_LIMIT`, `LEADS_RATE_WINDOW_SECONDS` | optional | Default 10 requests per 600 s per network. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional | GA4 (`G-…`). Only then a consent bar appears; the tag loads only after “Allow”. In GA4 → Data streams → Enhanced measurement, **disable “Page changes based on browser history events”** (the site sends controlled page_view events itself). Mark `generate_lead` as a key event. |

Private register: `https://<host>/api/leads/admin` — list, full request, notification status, “Retry notification now”, “Process due notifications”; `?format=json` for export.

## Design
See `DESIGN.md`. Media: `ASSET_MANIFEST.md`. Missing material: `CONTENT_GAPS.md`. Release checks: `RELEASE_CHECKLIST.md`.

## Content governance
See `CONTENT_GOVERNANCE.md`.

## Deployment
Vercel, framework auto-detected. `main` = production; every pushed branch gets a preview deployment. Rollback: promote the previous production deployment in Vercel, or `git revert` and push.
