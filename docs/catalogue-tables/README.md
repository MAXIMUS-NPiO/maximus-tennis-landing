# MAXIMUS request catalogue and National Package — preview source handoff

© 2026 Maximus Kiriyakulov. All rights reserved. No licence is granted.

This is a preview specification for the existing maximus.tennis site. Production remains at `0fd7bcf7d072a3aef0e9ac1b385313c0077565b1` (published 815-variant catalogue, PR #5). The owner’s subsequent 13 October 2026 instruction adds seven lengths to both trainer families, the per-country National Package and an optional budget request. It does not authorize production publication of this continuation.

## Confirmed request matrix

| Family | Weight points | Requested lengths | Variants before grips | L0–L7 combinations | Two per combination, per country |
| --- | ---: | ---: | ---: | ---: | ---: |
| G — GREAT | 33 | 7 | 231 | 1,848 | 3,696 |
| P — POWER | 33 | 7 | 231 | 1,848 | 3,696 |
| S — SPIN | 33 | 7 | 231 | 1,848 | 3,696 |
| Sweet Spot Trainer | 61 | 7 | 427 | 3,416 | 6,832 |
| Spot Trainer | 61 | 7 | 427 | 3,416 | 6,832 |
| Total | 221 | 7 | **1,547** | **12,376** | **24,752** |

Both trainer ranges are **200–500 g inclusive, step 5 g**. Playing models remain the original 99 weights, expanded to 693 lengths/weights (+594). Trainers now total 854 weights/lengths. Eight factory grips are L0–L7: nominal 4, 4⅛, 4¼, 4⅜, 4½, 4⅝, 4¾ and 4⅞ inches. Nominal labels do not establish raw-handle dimensions or measured circumference.

National Package is a proposed reference/fitting collection for one country. No number of countries is assumed. It includes uncommon large factory grips without medical claims. Precision classes do not multiply the package. Individual custom lengths remain outside its finite matrix.

| Length, in | Length, mm | Category |
| ---: | ---: | --- |
| 26.3 | 668.02 | Short |
| 26.6 | 675.64 | Short |
| 26.8 | 680.72 | Short |
| 27 | 685.80 | Standard |
| 27.3 | 693.42 | Plus |
| 27.6 | 701.04 | Plus |
| 27.9 | 708.66 | Superlong |

S/P/G resolve to SPIN/POWER/GREAT from the existing source. Spoken “Grade” does not authorize renaming or removing GREAT. All 99 original weight/balance pairs and heads (GREAT 97, POWER 98, SPIN 100 in²) are retained.

## Evidence and unknown values

Baseline: published commit `0fd7bcf7d072a3aef0e9ac1b385313c0077565b1`; owner’s trainer-length/National Package instructions dated 13 October 2026; `data/products.js` supplies all weights, lengths, grips and retained historical measurements. Original October 12 catalogue/TZ files remain historical sources and must not be mislabelled as this updated matrix.

`null` in JSON and empty CSV cells mean NOT_PROVIDED, never zero. Historical balances remain separate from request variants. A newly selected length, including explicit 27 inches, inherits no balance, swingweight, stiffness, price, stock, lead time or factory SKU.

SST keeps the original 50 in² head, 12 × 14 string pattern and branding. Its historical baseline length is 27 inches, with only four supplied balances: 270 g / 330 mm, 285 g / 325 mm, 300 g / 325 mm and 400 g / 320 mm. Those are not measurements of the new length matrix. Spot retains its real small round target and approved photos; head area, target dimensions, string pattern and historical length remain unknown. Neither trainer receives a P class.

Seven standard lengths are selectable requests. Custom-made length accepts decimal point/comma and requires technical feasibility review; neither input acceptance nor this collection establishes competition eligibility, manufacturing capacity, stock or delivery.

## Permanent reference library and Pro Shop concept

The owner intends a permanent reference and fitting library, kept separate from sales stock, supporting repeat requests and custom designs or subbrands on stable matte-black base configurations. This describes the collection purpose; it does not establish present stock or approved repeat-order availability.

An illustrative personal package may contain six playing racquets, four or five Spot Trainers and four or five Sweet Spot Trainers, all at the selected length. These counts are not universal requirements. Custom batches of 100–200 are examples, not a universal minimum; `universalBatchMinimum` remains null.

MAXIMUS Pro Shop is an architectural concept inside a tennis concept club: automated tray storage, selection, retrieval and returns. No engineered mechanism, operating envelope, safety certification or certified capacity is supplied or claimed. These concept details do not multiply the finite National Package matrix.

## Files and stable identity

- `base-models-99.csv`: original weight/balance source table.
- `trainer-weight-history-122.csv`: trainer weight points and historical evidence only.
- `playing-variants-693.csv`, `trainer-variants-854.csv`, `all-request-variants-1547.csv`: requested weight/length variants before grip selection.
- `national-package-lines-12376.csv`: full family × weight × length × grip identifiers, quantity two per country.
- `catalogue-snapshot.json`: source metadata, counts and all variant tables.
- `national-package-specification.json`: collection model and all 12,376 lines.

`catalogue_variant_id` identifies a weight/length variant, e.g. `spot-500-L27.9`. `configuration_id` includes factory grip, e.g. `spot-500-L27.9-L7`. The API derives `configurationKey` from validated dimensions; client-supplied keys are never authoritative. These keys are request identities, not factory SKUs. Class, quantity and wishes remain separate fields. Custom configurations have no finite-matrix key and retain their requested dimensions in the configuration record.

Regenerate with `node --no-warnings scripts/export-catalogue.mjs`. CSV uses UTF-8 BOM. No contact/customer records are exported.

## Preview behavior and boundaries

All 48 languages expose trainer weights and seven lengths, National Package and the optional budget prompt. Version 3 requests require an explicit length; drafts preserve version 3. Legacy trainer records remain readable (historical SST 27 inches; Spot length unknown) and cannot pass manufacturing review without an explicit requested length. Manufacturing approval must match the exact requested length.

The optional budget collects decimal amount, USD/EUR/AED currency and separate delivery/personalisation wishes. It records only `quote_requested`, bound to the selected configuration. Blank budget stays absent. It never approves a price, creates a payment or promises acceptance of an amount. Personal wishes and contact details are not placed in browser draft storage. Expanded catalogue configurations and budget requests are blocked from historical financial acceptance.

Original product/logo binaries and existing financial terms remain unchanged. No payments PR #2, mail PR #3 or separate local contribution `16cdb4d` is merged by this patch. Existing changes already present in baseline main are preserved. Claude independent review is not claimed under the owner cost lock; local tests and independent Codex review are recorded separately.

## Rollback baseline

Local tag `safety/catalogue-815-20261013` points to published `0fd7bcf`. The separate task deliverable `national-package-rollback/source-0fd7bcf.tar.gz` contains its complete source archive, with checksum and restore instructions in `rollback.json`. Restore into a separate checkout; do not reset shared work or production. This preview does not change the published deployment.
