# ASSET MANIFEST — maximus.tennis v4.4

Version 2026-09-23, published to production (commit `9cd6d81`). **Owner instruction of 22 September 2026:** the source photographs of unstrung frames on a white background are withdrawn from the site — they do not show the product. The site shows product **visualisations from several angles** instead. Every visual on the page is labelled as a visualisation; product data always comes from `data/products.js`, never from an image.

Code counterpart: `data/media.js`. Images are delivered through `next/image` (AVIF/WebP, responsive `srcset`; `priority` only for a page hero).

Status vocabulary: **OWNER SET** — supplied by the owner (1_1.zip, 22 Sep 2026), used as delivered apart from the crop noted · **RENDER** — built in this repository from the geometry of the photographed frames · **EXCLUDED** — not used.

## 1. Owner visual set (SPIN series)

Source: `1_1.zip` and `1_2.zip`, 33 square compositions labelled "Spin series", one per weight. **Only the weights that are in the confirmed SPIN matrix are published.** Seven files are labelled SPIN with weights that are **not** in the SPIN matrix — 222, 229, 233, 236, 360, 366, 377 g — and are held back (236, 360, 366 and 377 g exist in the POWER matrix, so the label or the matrix needs the owner's decision; CONTENT_GAPS A4).

**Crop applied to all of them:** the lower specification strip (balance, string tension, string pattern) and the line "MIPA REGISTRATION · INTERNAL RECORD" are cut off. Reason: SPIN balance, tension range and string pattern are **not** confirmed data (CONTENT_GAPS B1–B2), and an internal MIPA record is not public information. Nothing else is retouched.

| Published file | Source | Crop | Where used | Localized alt (EN / RU / ZH) |
| --- | --- | --- | --- | --- |
| `public/media/spin-visual.jpg` (1254×845) | 290.png | top 845 px | Home hero; SPIN card; SPIN series hero | MAXIMUS SPIN visualisation… / Визуализация MAXIMUS SPIN… / MAXIMUS SPIN效果图… |
| `public/media/spin-head.jpg` (640×460) | 290.png | head and string bed | Manufacturing section (home, engineering); SPIN details | Head and string bed / Голова и струнная поверхность / 拍头与线床 |
| `public/media/handle-lion.jpg` (418×705) | 290.png | throat, grip, butt cap | Manufacturing section; SPIN details | Throat, grip and butt cap with the lion mark / Шейка, ручка и нижняя крышка со львом / 拍喉、握柄与狮子底盖 |
| `public/media/lettering.jpg` (890×415) | 290.png | gloss lettering | Manufacturing section | Gloss MAXIMUS lettering / Глянцевая надпись MAXIMUS / 亮面MAXIMUS字样 |
| `public/media/engraving.jpg` (360×205) | 290.png | silver engraving | Custom engineering (personalisation) | Silver personalisation engraving / Серебристая гравировка персонализации / 银色个性化刻字 |
| `public/media/spin-239…spin-355.jpg` (10 files, 900×606) | 239 / 250 / 260 / 270 / 283 / 294 / 315 / 325 / 339 / 355.png | top 845 px | SPIN page: "the weight architecture, seen" | MAXIMUS SPIN, <weight> g |

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
- The specification strip and MIPA record line of the owner's SPIN set (cropped off, see §1).
- Renders generated in this repository — created 22 Sep 2026, banned and deleted by the owner on 23 Sep 2026.
- Rejected covers, composites, quotation extracts, foam-handle imagery, substitute racquets and invented logos — never in the repository.
- Video 08: prepared, not released (`data/media.js → inspectionVideo.released = false`).
