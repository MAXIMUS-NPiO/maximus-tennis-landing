# CONTENT GAPS — maximus.tennis v4.3

Version 2026-09-23. Only real gaps. Each entry states what it blocks today and what closes it. Nothing below is filled with invented material on the site.

## A. Visuals

Owner instruction 22 Sep 2026: the white-background photographs of unstrung frames are withdrawn; the site shows visualisations (owner's SPIN set + renders for GREAT / POWER / SST). What is still missing:

| # | Missing material | What it blocks | Closed by |
| --- | --- | --- | --- |
| A1 | **Owner visual sets for GREAT and POWER** in the quality of the SPIN set | Nothing is blocked — the pages use renders built here; owner sets would replace them | Owner supplies the sets (same style as 1_1.zip) |
| A2 | **Sweet Spot Trainer visual set** from the owner | Nothing is blocked — SST uses a render | Owner supplies an approved trainer visual |
| A3 | **Confirmed SPIN balance, string pattern and tension range** (shown on the owner's images, cropped off here) | Publishing those values anywhere, including on an image | Founder confirmation with source and revision (see B1) |
| A5 | **QC measurement material** (instrument photographs, sample measurement records, factory footage) | Any advertising of measured precision; the manufacturing section states "not yet published" | Owner supplies real, publishable QC material |
| A6 | **GREAT inspection video (08)** full-clip review | Publication of the video (component prepared; `inspectionVideo.released = false`) | Owner reviews the full 27 s clip and approves a cut |
| A7 | L0–L7 visual sequence | Not blocking (schematic in place); needed for grip-led creative | Visualisation or photographs of the eight factory handle sizes |
| A8 | Engraving template and placement zones per model | Interactive personalisation preview (the silver engraving is shown on the owner's visual; the configurator collects the text for artwork confirmation) | Approved template and zones per model |

## B. Product data (shown as "not provided" or collected as requests)

| # | Missing data | What it blocks | Closed by |
| --- | --- | --- | --- |
| B1 | SPIN balance, swingweight, stiffness (SPIN keeps "requested weight architecture") | Publishing SPIN beyond weights; SPIN specification completeness | Founder-confirmed values with source and revision |
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
| D6 | Release permission (merge `release/ads-readiness-v4.2` → `main`) | Production publication of all of the above | Owner's written release approval |
