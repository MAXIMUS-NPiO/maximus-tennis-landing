# CONTENT GAPS — maximus.tennis v5.0

Version 2026-09-29 (v4.9). Only real gaps. Each entry states what it blocks today and what closes it. Nothing below is filled with invented material on the site.

## A. Visuals

Owner brief of 29 Sep 2026: the homepage now opens on the training system, GREAT leads the performance series, and GREAT carries 33 listed weights (363 g added). Spot Trainer photographs supplied and published.

Owner instructions 22–23 Sep 2026: the white-background photographs are withdrawn and generated renders are banned. The site shows the owner's own visual sets — Spin (33), Power (33), Great (32) and Sweet Spot Trainer, all published whole. **Every playing series now has a complete visual set and a weight catalogue.** What is still missing:

| # | Missing material | What it blocks | Closed by |
| --- | --- | --- | --- |
| ~~A1~~ | ~~Owner visual set for GREAT~~ — **closed 28 Sep 2026**: 32 compositions supplied and published unchanged; the Great page carries a 32-variant catalogue | — | — |
| ~~A2~~ | ~~Owner visual set for POWER~~ — **closed 23 Sep 2026**: 33 compositions supplied, all published whole; the Power page carries the same 33-variant catalogue as Spin | — | — |
| A3 | **Confirmed Spin string pattern and tension range** (16 × 19 and 50–59 / 50–60 lb are printed on the owner's images, which are published whole, but they are not in `data/products.js` and are therefore not stated as site text) | Stating pattern and tension as site text, in the configurator and in feeds | Founder confirmation with source and revision (see B2) |
| ~~A4~~ | ~~Seven "Spin series" images outside the matrix~~ — **closed 23 Sep 2026**: the Founder supplied the complete Spin table of 33 weight/balance pairs, which includes 222, 229, 233, 236, 360, 366 and 377 g. All 33 images are published. | — | — |
| A9 | **Confirmation that 300, 305 and 310 g are withdrawn from Spin.** They were in the earlier 29-weight Spin architecture but are **not** in the Founder table of 23 Sep 2026, so they are no longer offered on the site and no visualisation exists for them | Offering those three weights as listed Spin variants | Owner confirms the removal, or supplies the pairs and images |
| A5 | **QC measurement material** (instrument photographs, sample measurement records, factory footage) | Any advertising of measured precision; the manufacturing section states "not yet published" | Owner supplies real, publishable QC material |
| A10 | **Methodology demonstration footage.** The clip supplied 29 Sep 2026 shows the Spot Trainer, not the methodology, and is 480 px wide with blurred filler bars — not published. The seven methodology steps are explained in text | Showing the methodology rather than describing it | Owner supplies footage of the method being practised, at a usable resolution |
| A6 | **GREAT inspection video (08)** full-clip review | Publication of the video (component prepared; `inspectionVideo.released = false`) | Owner reviews the full 27 s clip and approves a cut |
| A7 | L0–L7 visual sequence | Not blocking (schematic in place); needed for grip-led creative | Visualisation or photographs of the eight factory handle sizes |
| A8 | Engraving template and placement zones per model | Interactive personalisation preview (the silver engraving is shown on the owner's visual; the configurator collects the text for artwork confirmation) | Approved template and zones per model |

## B. Product data (shown as "not provided" or collected as requests)

| # | Missing data | What it blocks | Closed by |
| --- | --- | --- | --- |
| B1 | Spin swingweight and stiffness (weights and balances are confirmed since 23 Sep 2026) | Publishing Spin swingweight and stiffness | Founder-confirmed values with source and revision |
| B2 | GREAT / POWER nominal swingweight and stiffness; length, beam, string pattern, tension range for all series (16 × 19 and 50–60 lb are printed on the Power and Spin visualisations but are not confirmed data; the Great visualisations print no specification strip at all) | Publishing these parameters (configurator collects them as requested targets) | Confirmed values in `seriesParameters` |
| B3 | Measurement basis of listed weights / balances (strung or unstrung, grip state) | Stating the basis on series pages (currently "confirmed in the written specification") | Written basis per series |
| B4 | Prices, availability, lead times, warranty (deliberately not published) | Price- or stock-based advertising (shopping feeds, "in stock" copy) | Not planned for the site; commercial terms stay in written offers |

## C. Legal and privacy

| # | Missing decision | What it blocks | Closed by |
| --- | --- | --- | --- |
| C1 | **Controller of request data** (which confirmed entity is responsible for website requests) | A complete privacy notice; **advertising that collects personal data** (lead forms) | Owner names the entity from the confirmed identities on the legal page |
| C2 | **Retention period** for stored requests | Privacy notice currently states "no automatic deletion period is configured" | Owner decision; then set a retention rule (store TTL or scheduled deletion) |

## D. Access and configuration (not content, but blocking the launch)

| # | Missing | What it blocks | Closed by |
| --- | --- | --- | --- |
| ~~D1~~ | ~~Durable store on Vercel~~ — **closed 29 Sep 2026**: Upstash for Redis connected through the Vercel Marketplace to `maximus-tennis-landing` (Production + Preview). Verified on the live site: one control request returned **201** with a request ID, and the repeat with the same idempotency key returned **200 duplicate** — the record is stored. The store now accepts the injected variables under any Marketplace prefix. | — | — |
| ~~D2~~ | ~~Notification channel~~ — **closed 29 Sep 2026**: notification of new requests is delivered to the owner's own device through Telegram (`TELEGRAM_BOT_TOKEN`; the destination chat is resolved by the server). Verified on the live site: a control request returned 201 and the message arrived, together with the earlier request that had been queued while no channel existed — which also proves the retry queue. | — | — |
| D2b | **Outbound e-mail from gps@maximus.tennis** (`SMTP_*`, `LEAD_NOTIFY_*`): answering requesters from the institutional mailbox, and a second notification channel | Written replies sent from the MAXIMUS mailbox rather than from a personal client; e-mail notification as a fallback to Telegram | Owner enables 2-Step Verification and creates a Google app password, then sets the variables in Vercel. Note: an administrator of the Workspace domain can block app passwords — unverified |
| D3 | `CRON_SECRET`, `LEADS_ADMIN_PASSWORD` | Scheduled retries; access to the private request register. Less urgent since 29 Sep 2026: with Telegram live the owner sees every request as it arrives, so the register is now for history and manual retries rather than the only way to read a request | Owner sets both in Vercel (both are values he invents; no third party involved) |
| D4 | GA4 measurement ID (optional) | Conversion measurement (`generate_lead`) for campaigns | Owner creates a GA4 property/stream and sets `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| D5 | Verified WeChat contact; testing from mainland China and inside WeChat | China-targeted campaigns (ZH content exists; mainland access is untested) | Verified contact + a test session from mainland China |
| D6 | ~~Release permission~~ — **closed 23 Sep 2026**: released on the owner's instruction; `release/ads-readiness-v4.2` squashed into `main` as `9cd6d81` and live on https://maximus.tennis | — | — |

## E. Languages

| # | Missing | What it blocks | Closed by |
| --- | --- | --- | --- |
| E1 | **Native-speaker reading of the twenty-eight translated languages** (de, nl, fr, es, it, pt, pl, hu, sk, hr, sr, ro, bg, el, sv, no, tr, az, uz, kk, uk, ru, ar, hi, id, ja, ko, zh). Every file is complete and machine-verified — same 1206 keys as English, no English left outside the agreed trade terms — but no native speaker has read any of them. Wording, register and the trade vocabulary are therefore unconfirmed, not wrong-by-evidence | Paid advertising in a language whose wording has not been read by someone who speaks it; printed reuse of the site wording | One reader per language, or the Founder's decision to publish as is |
| E2 | **Right-to-left reading of the Arabic pages by an Arabic reader.** The layout is mirrored and verified mechanically (`dir="rtl"`, logical properties throughout, no horizontal overflow at 1440/1280/768/390/360), but mirrored layout is not the same as natural Arabic reading order in every block | Arabic-language campaigns | An Arabic reader walks the live pages |
| E4 | **Confirmation of the copyright statement's scope.** The site now states, in every language, that the copyright in its texts, photographs, design and code belongs to Maximus Kiriyakulov alone and has not been assigned. That is the Founder's own statement of 1 October 2026, recorded as given. Whether the same statement should cover the racquet visualisations, the methodology texts and the marks is NOT PROVIDED | Extending the notice beyond the website | Founder lists the further works, or confirms the website wording is the whole of it |
| E3 | **Language of the request notifications.** A request submitted in any of the thirteen languages is stored with its locale and notified in the same structure; the notification text itself is not translated | Nothing on the site; relevant only if requests are to be handled by language | Decision on whether notifications should carry a translated summary |
