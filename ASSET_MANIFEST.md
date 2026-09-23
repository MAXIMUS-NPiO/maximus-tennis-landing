# ASSET MANIFEST — maximus.tennis v4.3

Version 2026-09-23. **Owner instruction of 22 September 2026:** the source photographs of unstrung frames on a white background are withdrawn from the site — they do not show the product. The site shows product **visualisations from several angles** instead. Every visual on the page is labelled as a visualisation; product data always comes from `data/products.js`, never from an image.

Code counterpart: `data/media.js`. Images are delivered through `next/image` (AVIF/WebP, responsive `srcset`; `priority` only for a page hero).

Status vocabulary: **OWNER SET** — supplied by the owner (1_1.zip, 22 Sep 2026), used as delivered apart from the crop noted · **RENDER** — built in this repository from the geometry of the photographed frames · **EXCLUDED** — not used.

## 1. Owner visual set (SPIN series)

Source: `1_1.zip`, 16 square compositions, one per listed SPIN weight (270, 273, 277, 280, 283, 287, 290, 294, 297, 315, 320, 325, 330, 333, 339, 347 g). Every weight shown is in the confirmed SPIN matrix (`data/products.js`).

**Crop applied to all of them:** the lower specification strip (balance, string tension, string pattern) and the line "MIPA REGISTRATION · INTERNAL RECORD" are cut off. Reason: SPIN balance, tension range and string pattern are **not** confirmed data (CONTENT_GAPS B1–B2), and an internal MIPA record is not public information. Nothing else is retouched.

| Published file | Source | Crop | Where used | Localized alt (EN / RU / ZH) |
| --- | --- | --- | --- | --- |
| `public/media/spin-visual.jpg` (1254×845) | 290.png | top 845 px | Home hero; SPIN card; SPIN series hero | MAXIMUS SPIN visualisation… / Визуализация MAXIMUS SPIN… / MAXIMUS SPIN效果图… |
| `public/media/spin-head.jpg` (640×460) | 290.png | head and string bed | Manufacturing section (home, engineering); SPIN details | Head and string bed / Голова и струнная поверхность / 拍头与线床 |
| `public/media/handle-lion.jpg` (418×705) | 290.png | throat, grip, butt cap | Manufacturing section; SPIN details | Throat, grip and butt cap with the lion mark / Шейка, ручка и нижняя крышка со львом / 拍喉、握柄与狮子底盖 |
| `public/media/lettering.jpg` (890×415) | 290.png | gloss lettering | Manufacturing section | Gloss MAXIMUS lettering / Глянцевая надпись MAXIMUS / 亮面MAXIMUS字样 |
| `public/media/engraving.jpg` (360×205) | 290.png | silver engraving | Custom engineering (personalisation) | Silver personalisation engraving / Серебристая гравировка персонализации / 银色个性化刻字 |
| `public/media/spin-270.jpg`, `spin-320.jpg`, `spin-347.jpg` (900×606) | 270 / 320 / 347.png | top 845 px | SPIN page: "the weight architecture, seen" | MAXIMUS SPIN, 270 / 320 / 347 g |

## 2. Renders (GREAT, POWER, Sweet Spot Trainer)

Built with Blender (Cycles) in `scratchpad/render/` from geometry derived from the owner's own photographs: head outline and throat taken from the POWER frame photograph, head area set per series (GREAT 97 in², POWER 98 in², SPIN 100 in², SST 50 in²), 686 mm length, factory octagonal handle, official wordmark and lion mark used as supplied. Matte black frame, gloss black lettering, silver-grey strings, dark studio lighting.

| Published file | Series | View | Where used |
| --- | --- | --- | --- |
| `public/media/power-hero.jpg` (900×1200) | POWER | three-quarter | POWER series hero |
| `public/media/power-front.jpg` (800×1067) | POWER | front | POWER card on the home page |
| `public/media/power-throat.jpg` (925×661) | POWER | throat and shaft | POWER details; manufacturing section |
| `public/media/great-hero.jpg` (900×1200) | GREAT | three-quarter | GREAT series hero |
| `public/media/great-front.jpg` (800×1067) | GREAT | front | GREAT card on the home page |
| `public/media/spin-front.jpg` (800×1067) | SPIN | front | reserve (SPIN uses the owner's set) |
| `public/media/sst-front.jpg` (800×1067) | Sweet Spot Trainer | front | SST page and home training block |

A render is not a photograph and not evidence: it shows the declared geometry of the series, not a measured or available unit. The pages label these images as visualisations.

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
- Rejected covers, STORIES graphics, composites, quotation extracts, foam-handle imagery, substitute racquets and invented logos — never in the repository.
- Video 08: prepared, not released (`data/media.js → inspectionVideo.released = false`).
