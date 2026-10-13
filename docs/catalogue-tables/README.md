# MAXIMUS catalogue expansion — source handoff

© 2026 Maximus Kiriyakulov. All rights reserved. No licence is granted.

Prepared for the existing maximus.tennis repository. This is a request catalogue, not stock, a price list, manufacturing approval or competition certification. The initial 12 October delivery was an unpublished patch. The owner subsequently authorized production publication on 13 October; release verification and deployment status are recorded in PR #5 and the release handoff.

## Confirmed model

| Family | Existing name | Original weight points | Standard lengths | Request variants |
| --- | --- | ---: | ---: | ---: |
| G | GREAT | 33 | 7 | 231 |
| P | POWER | 33 | 7 | 231 |
| S | SPIN | 33 | 7 | 231 |
| SST | Sweet Spot Trainer | 61 (200–500 g, step 5 g) | Existing 27 in only | 61 |
| Spot | Spot Trainer | 61 (200–500 g, step 5 g) | Unknown; no length multiplication | 61 |

Playing range: 99 × 7 = **693**, an increase of **594** over the 99 base weight points. Trainer range: **122**. Combined request matrix: **815**. Grip sizes and P classes do not enter these counts. Custom lengths are individual requests outside the finite matrix.

| Requested length, in | Length, mm | Group |
| ---: | ---: | --- |
| 26.3 | 668.02 | Short |
| 26.6 | 675.64 | Short |
| 26.8 | 680.72 | Short |
| 27 | 685.80 | Standard |
| 27.3 | 693.42 | Plus |
| 27.6 | 701.04 | Plus |
| 27.9 | 708.66 | Superlong |

S/P/G resolve against the existing repository to SPIN/POWER/GREAT. “Grade Series Plus” has no verified separate series definition and does not rename or remove GREAT. Plus is a length category. All original 99 weight/balance pairs and head sizes (GREAT 97, POWER 98, SPIN 100 in²) remain unchanged.

## Source authority and unknowns

- Owner expansion instruction/delegation, 12 October 2026: both trainer families have 200–500 g inclusive, step 5 g. The supplied RU TZ describes the Spot step as a working assumption; the explicit implementation delegation supplies the requested step.
- Existing product source at `9ec225b22415e813d38eb047094e6bb0a48d6938`: original weight/balance tables, trainer geometry and approved brand/image assets.
- MAXIMUS Catalogue Expansion TZ RU, revision 1.0, 12 October 2026: Library `libfile_daff29c482208191b66ac8a18bd31bfe` (PDF), `libfile_dc397ce41e848191a66a6e9620476a95` (DOCX).
- Companion EN catalogue: Library `libfile_c7cef428f8a48191949e7c444eb26947`. It is a separate author's deliverable; this patch does not claim a new PDF review or modify it.

JSON `null` and empty CSV cells mean NOT_PROVIDED, never zero. Original balance pairs are retained in the historical base table. No balance is inferred for a newly selected length, including an explicit 27-inch request. The old source does not provide an individual length-specific measurement certificate. GREAT/POWER historical balances remain MODELLED, SPIN remains FOUNDER_CONFIRMED.

SST keeps its original 50 in² head, 27 in length, 12 × 14 string pattern, grip options and branding. Only four supplied historical balances remain: 270 g / 330 mm; 285 g / 325 mm; 300 g / 325 mm; 400 g / 320 mm. The other 57 balances are unknown. Spot retains the original small round contact target and images; unverified target dimensions, head area, length, balance and string pattern stay unknown. Neither trainer inherits racquet P classes.

Prices, stock, lead times, stiffness, swingweight and factory SKUs have not been invented for the expanded matrix. `configuration_id` is a deterministic request identifier, not a factory SKU. Existing unrelated commerce records are not a source of new prices or availability.

## Files and reproduction

- `base-models-99.csv`: exact original weights and historical balances.
- `playing-variants-693.csv`: seven request lengths per original weight, millimetre conversions and explicit unknown values.
- `trainer-variants-122.csv`: both 61-weight trainer families.
- `catalogue-snapshot.json`: same rows, counts, provenance and caveats in machine-readable form.

Regenerate from the repository root:

```sh
node --no-warnings scripts/export-catalogue.mjs
```

CSV uses UTF-8 with BOM. No user/contact data are included.

## Implementation boundaries

All 48 existing locales expose the same seven lengths and 61-weight trainer choices. The seven lengths are selectable request options. Custom length is entered explicitly in inches (decimal point or comma, up to three decimal places), preserved through JSON, drafts and review. Its input format limit is not a claim of manufacturability. Technical feasibility and competition eligibility require separate checks.

Version 2 playing requests require a length choice; legacy records with no length are not silently assigned 27 inches. Product changes clear incompatible weight/class/length choices. Contact details and engraving are not added to local draft storage. New lengths use request intake, with the historical financial acceptance path blocked for this expanded payload.

Manufacturing review retains the requested length. Approval must confirm the exact known requested length; any supplied Spot protocol length is parsed as a positive numeric value even when the original target is unknown. This does not substitute for physical engineering or measurement.

Original photo and logo binaries are unchanged. The catalogue release is based on current main `6c35541f1e3729574b517c3c5994a485979e814a` and preserves work already released there, including the owner email-copy release, checkout/control functionality and CNY Family Plan change. It does not merge payments PR #2 or add the separate local contribution `16cdb4d`. New catalogue configurations remain request-only. No client messages or paid provider fallback are part of catalogue verification. PR #5 tracks the owner-authorized publication; a ready preview alone is not proof of production release.
