# Content governance — MAXIMUS website

There is no CMS. Content is a version-controlled content layer with a documented review workflow.

## Where things live
| What | File | Rule |
| --- | --- | --- |
| Visitor-facing text | `content/en.js` → `content/ru.js`, `content/zh.js` | English is the master. Every change is made in all three files in the same commit; `npm run check:i18n` must pass. |
| Product numbers | `data/products.js` | The only numerical source. Never duplicate numbers into content strings. Every value carries an evidence status. `npm run check:data` must pass. |
| Legal identities, routes, ecosystem nodes | `data/site.js` | Identifiers are entered once and rendered identically in all locales. |
| Brand assets | `public/brand/` | Only assets with recorded approval for their exact version. No redrawn or generated marks. |

## Evidence statuses (internal)
`FOUNDER_CONFIRMED` · `MODELLED` · `REQUESTED_ARCHITECTURE` (SPIN, founder instruction 21.09.2026) · `TARGET` · `NOT_PROVIDED`. Public pages translate these into ordinary language ("Confirmed", "Calculated", "Requested architecture", "Manufacturing target", "Not provided"). A missing value is omitted or explained — never invented. New technical parameters are added through `seriesParameters` in `data/products.js` with value, unit, status, source and revision.

## Publication rules
1. A concept or planned service is never promoted to an operational service by editing text alone. Status labels (`STATUS` in `data/site.js`) change only with an implementation or a written decision.
2. No prices, stock, lead times, minimum quantities, warranties, capacity figures, royalty rates, forecasts, valuations, partner names or testimonials without current written approval and a source.
3. No SHALENI content, no discontinued foam-handle products, no rejected visuals or their derivatives, no "zero tolerance" wording, no competitor comparisons, no superlatives (elite, exclusive, revolutionary, world-class, best, number one).
4. Product photography follows `ASSET_MANIFEST.md`; missing material is recorded in `CONTENT_GAPS.md` with what it blocks.
5. No dependency on other trading sites: primary product CTAs lead to this site's own request flows; no store links in primary routes.
6. Requests: the only production intake is `POST /api/leads` (see README). Mock handlers, `mailto:`, copy-to-clipboard or browser storage never count as accepted requests. Contact details, free text, engraving and child information never enter browser storage or analytics.

## Review and release
1. Change in a branch; merge to `main` only after `npm test` and `npm run build` pass and the release checklist (`RELEASE_CHECKLIST.md`) is complete.
2. Preview: the branch preview on Vercel, or locally `tests/local-stack.sh start` + `tests/e2e/acceptance.mjs` + `npm run crawl`.
3. Commit message names the affected pages and the source of any factual change.
4. Vercel builds production from `main`; a failed build is not promoted.
5. Rollback: redeploy the previous production deployment in Vercel or revert the commit.

## Registers
Source register, claims register, asset register, requirement coverage, change log and risk log are maintained in the controlled project workspace, not in this public repository.
