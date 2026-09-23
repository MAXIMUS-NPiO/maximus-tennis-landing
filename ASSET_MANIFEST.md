# ASSET MANIFEST — maximus.tennis v4.5

Version 2026-09-23. **Owner instruction of 22 September 2026:** the source photographs of unstrung frames on a white background are withdrawn from the site — they do not show the product. The site shows product **visualisations** instead. **Owner instruction of 23 September 2026 (Spin series):** every Spin composition is published **whole** — the specification strip, the personalisation engraving zone and the MIPA marking stay visible and readable. No crop, no retouch, no substitution, no `object-fit: cover`, no height cap.

Code counterpart: `data/media.js`. Images are delivered through `next/image` (AVIF/WebP, responsive `srcset`; `priority` only for a page hero). Product data always comes from `data/products.js`, never from an image.

Status vocabulary: **OWNER SET** — supplied by the owner, used as delivered · **EXCLUDED** — not used.

## 1. Owner visual set — Spin series (1_1.zip + 1_2.zip)

33 square compositions, 1254 × 1254 px, one per listed weight. **All 33 are published, uncropped**, in `public/media/spin/spin-<weight>.jpg` (JPEG q88, 4:4:4, ≈ 221 KB each, 7.1 MB in total). The composition shows the frame from several angles, the string bed, the gloss MAXIMUS lettering, the grip, the lion butt cap, the silver personalisation engraving zone, the specification strip and the MIPA marking.

**Weight and balance verified file by file, 33 of 33**: the values printed inside each image (for example `290 G · 33.5 CM`) match `data/products.js` (`290 → 335 mm`). Nothing is published for a weight that is not in the matrix, and no image shows a weight other than its own.

| Published file | Source | Where used |
| --- | --- | --- |
| `public/media/spin/spin-222.jpg` … `spin-377.jpg` (33 files) | 222 / 229 / 233 / 236 / 239 / 243 / 247 / 250 / 253 / 257 / 260 / 263 / 267 / 270 / 273 / 277 / 280 / 283 / 287 / 290 / 294 / 297 / 315 / 320 / 325 / 330 / 333 / 339 / 347 / 355 / 360 / 366 / 377.png | Spin series page: selected-variant panel, weight switcher, catalogue of 33 cards, zoom view |
| `public/media/spin-visual.jpg` (1254 × 1254) | 290.png, complete | Home hero; Spin card on the home page; Spin series hero |
| `public/media/spin-head.jpg` (345 × 248) | detail crop of 290.png | Manufacturing section (home, engineering); Spin construction details — labelled as a detail view |
| `public/media/handle-lion.jpg` (345 × 583) | detail crop | Manufacturing section; Spin construction details — labelled as a detail view |
| `public/media/lettering.jpg` (345 × 161) | detail crop | Manufacturing section — labelled as a detail view |
| `public/media/engraving.jpg` (324 × 184) | detail crop | Custom engineering (personalisation) — labelled as a detail view |

The four detail files are deliberate close-ups of named parts, each captioned as such; they never stand in for the complete composition. Every container that shows a complete Spin composition uses `object-fit: contain` with no height cap, so nothing is cut.

## 2. Sweet Spot Trainer — owner visual set (2_1, 2_2)

Source: the owner's trainer set, 20 compositions. The internal "MIPA RECORD" line is cropped off; the specification text on the images (50 in², 27 inch, 12×14, 270/330 · 285/325 · 300/325 · 400/320) matches `data/products.js`.

| Published file | Source | Where used |
| --- | --- | --- |
| `public/media/sst-system.jpg` | SS4 | SST page hero; home training block |
| `public/media/sst-270.jpg`, `sst-285.jpg`, `sst-300.jpg`, `sst-400.jpg` | SS270S / SS285S / SS300S / SS400S | SST page: the four configurations |
| `public/media/sst-shafts.jpg`, `sst-grips.jpg`, `sst-buttcaps.jpg` | SS4_3 / SS4_4 / SS4_5 | SST page: construction details |

**Generated renders are banned** (owner instruction, 23 Sep 2026). None is in the repository and none is to be produced.

## 3. Brand assets (unchanged)

| File | Source | Status | Use |
| --- | --- | --- | --- |
| `public/brand/maximus-gps-lockup.png` (1034×248) | 01_MAXIMUS_GPS_Identity.jpeg — crop only | APPROVED | Header, footer, Open Graph |
| `public/brand/maximus-lion-emblem.png`, `app/icon.png`, `app/apple-icon.png` | crop of the official lockup | APPROVED | Favicon, Organization logo |
| `public/brand/og-maximus.png` (1200×630) | lockup + typography on black | APPROVED | Share previews |

## 4. Schematics (not images of the product)
Generated in code and labelled "Schematic — not a measurement": stiffness tolerance bands per precision class and the nominal grip scale L0–L7. Files: `components/Schematics.js`.

## 5. Excluded
- The September source photographs of unstrung frames on a white background (02–07) — withdrawn by the owner on 22 Sep 2026 and removed from the repository.
- Renders generated in this repository — created 22 Sep 2026, banned and deleted by the owner on 23 Sep 2026.
- Rejected covers, composites, quotation extracts, foam-handle imagery, substitute racquets and invented logos — never in the repository.
- Video 08: prepared, not released (`data/media.js → inspectionVideo.released = false`).
