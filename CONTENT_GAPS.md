# CONTENT GAPS — maximus.tennis v4.5

Version 2026-09-23. Only real gaps. Each entry states what it blocks today and what closes it. Nothing below is filled with invented material on the site.

## A. Visuals

Owner instructions 22–23 Sep 2026: the white-background photographs are withdrawn and generated renders are banned. The site shows the owner's own visual sets — Spin (1_1, 1_2; all 33 compositions published whole) and Sweet Spot Trainer (2_1, 2_2). What is still missing:

| # | Missing material | What it blocks | Closed by |
| --- | --- | --- | --- |
| A1 | **Owner visual set for GREAT** | GREAT card and series hero — typographic tile until it arrives | Owner supplies the set (same style as the SPIN and trainer sets) |
| A2 | **Owner visual set for POWER** | POWER card and series hero — typographic tile until it arrives | Owner supplies the set |
| A3 | **Confirmed Spin string pattern and tension range** (16 × 19 and 50–59 / 50–60 lb are printed on the owner's images, which are published whole, but they are not in `data/products.js` and are therefore not stated as site text) | Stating pattern and tension as site text, in the configurator and in feeds | Founder confirmation with source and revision (see B2) |
| ~~A4~~ | ~~Seven "Spin series" images outside the matrix~~ — **closed 23 Sep 2026**: the Founder supplied the complete Spin table of 33 weight/balance pairs, which includes 222, 229, 233, 236, 360, 366 and 377 g. All 33 images are published. | — | — |
| A9 | **Confirmation that 300, 305 and 310 g are withdrawn from Spin.** They were in the earlier 29-weight Spin architecture but are **not** in the Founder table of 23 Sep 2026, so they are no longer offered on the site and no visualisation exists for them | Offering those three weights as listed Spin variants | Owner confirms the removal, or supplies the pairs and images |
| A5 | **QC measurement material** (instrument photographs, sample measurement records, factory footage) | Any advertising of measured precision; the manufacturing section states "not yet published" | Owner supplies real, publishable QC material |
| A6 | **GREAT inspection video (08)** full-clip review | Publication of the video (component prepared; `inspectionVideo.released = false`) | Owner reviews the full 27 s clip and approves a cut |
| A7 | L0–L7 visual sequence | Not blocking (schematic in place); needed for grip-led creative | Visualisation or photographs of the eight factory handle sizes |
| A8 | Engraving template and placement zones per model | Interactive personalisation preview (the silver engraving is shown on the owner's visual; the configurator collects the text for artwork confirmation) | Approved template and zones per model |

## B. Product data (shown as "not provided" or collected as requests)

| # | Missing data | What it blocks | Closed by |
| --- | --- | --- | --- |
| B1 | Spin swingweight and stiffness (weights and balances are confirmed since 23 Sep 2026) | Publishing Spin swingweight and stiffness | Founder-confirmed values with source and revision |
| B2 | GREAT / POWER nominal swingweight and stiffness; length, beam, string pattern, tension range for all series | Publishing these parameters (configurator collects them as requested targets) | Confirmed values in `seriesParameters` |
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
| D1 | Durable store on Vercel (Upstash for Redis via Vercel Marketplace → `KV_REST_API_URL/TOKEN`) | **Automatic intake on every form**: without the store the page says "not submitted" and offers the request as a prepared e-mail to gps@maximus.tennis (no request ID, no stored record) | Owner connects the integration to the Vercel project |
| D2 | Notification channel: Google Workspace app password for the sending mailbox (`SMTP_*`, `LEAD_NOTIFY_*`) or a webhook | Notification of new requests (requests are saved and visible in the register, but no e-mail is sent) | Owner creates the app password and sets the variables in Vercel |
| D3 | `CRON_SECRET`, `LEADS_ADMIN_PASSWORD` | Scheduled retries; access to the private request register | Owner sets both in Vercel |
| D4 | GA4 measurement ID (optional) | Conversion measurement (`generate_lead`) for campaigns | Owner creates a GA4 property/stream and sets `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| D5 | Verified WeChat contact; testing from mainland China and inside WeChat | China-targeted campaigns (ZH content exists; mainland access is untested) | Verified contact + a test session from mainland China |
| D6 | ~~Release permission~~ — **closed 23 Sep 2026**: released on the owner's instruction; `release/ads-readiness-v4.2` squashed into `main` as `9cd6d81` and live on https://maximus.tennis | — | — |
