# MAXIMUS Tennis — website and portal (maximus.tennis)

Production Next.js site for MAXIMUS / MAXIMUS GPS. Version 4.0 (21 September 2026).

## Stack
- Next.js 15 (App Router), React 19, plain CSS design tokens — no UI library, no CMS, no database, no third-party fonts or widgets.
- Three locales with language-aware URLs: `/en`, `/ru`, `/zh` (Simplified Chinese). `middleware.js` redirects `/` and un-prefixed paths to the visitor's language (Accept-Language), default English.
- Static generation for every page (`generateStaticParams`).

## Structure
- `app/[locale]/…` — all public pages (31 destinations × 3 locales). `app/(root)` — root redirect.
- `content/en.js` (master), `content/ru.js`, `content/zh.js` — every visitor-facing string. Same key structure, enforced by `scripts/check-i18n.mjs`.
- `data/products.js` — the single numerical product source for all locales (series matrices, precision classes, grips, training families) with evidence-status fields. Internal engineering formulas are deliberately not stored in this repository.
- `data/site.js` — routes, navigation groups, legal identities, ecosystem nodes, request purposes.
- `components/` — layout, product tables, ecosystem map, GPS wizard, configurator, request forms, compose panel.
- `lib/` — i18n, paths/hreflang, metadata, request workflow boundary, analytics boundary.
- `public/brand/` — official identity raster (cropped only), lion emblem, Open Graph image.
- `scripts/` — data integrity, locale parity and crawl checks.

## Commands
```bash
npm install
npm run dev          # local development
npm test             # product-data integrity + locale parity
npm run build        # production build (must pass before any push to main)
npm start            # serve the build locally
npm run crawl -- http://localhost:3000   # every route 200, no forbidden strings, lang/canonical/hreflang present
```

## Request workflow (current mode)
No server-side delivery provider, database or CRM is configured. Forms validate, generate a request reference and open the visitor's own email application with the request text prepared (or copy it). The interface never claims a request was sent. See `lib/requests.js` for the integration boundary.

## Design
See `DESIGN.md` (Engineering Gallery direction, tokens, components, accessibility rules).

## Content governance
See `CONTENT_GOVERNANCE.md`.

## Deployment
Vercel, framework auto-detected. No environment variables are required. Push to `main` deploys production; a failed build is not promoted. Rollback: redeploy the previous production deployment in Vercel, or `git revert` the commit and push.
