# ASSET MANIFEST — maximus.tennis v4.2

Version 2026-09-21 · Source set: owner's visual package "MAXIMUS_Claude_Visuals_FINAL" with `00_READ_FIRST_CLAUDE.md` (the owner's manifest of intended uses and restrictions).
Code counterpart: `data/media.js`. Every image is delivered through `next/image` (AVIF/WebP, responsive `srcset`; `priority` only for the page hero, lazy loading elsewhere).

Status vocabulary: **APPROVED** — approved for production in an earlier release · **PREVIEW — APPROVAL PENDING** — used in the preview strictly within the purpose stated in the owner's manifest; production use requires the owner's release approval · **PREPARED — NOT RELEASED** · **EXCLUDED**.

## 1. Photographs and video

| Published file | Source (owner set) | Model | Status | Allowed purpose (owner's manifest) | Where used | Derivative | Localized alt (EN / RU / ZH) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public/media/power-full-frame.jpg` | 02_Power_Full_Frame.jpeg (IMG_9629), 1152×1536 | POWER | PREVIEW — APPROVAL PENDING | Full unstrung POWER frame. Restriction: "not a finished hero"; no invented strings, handle or SKU | Home hero; POWER series hero; home POWER card | crop x 190–962, full height → 772×1536, JPEG q82; geometry unchanged | MAXIMUS POWER racquet, unstrung frame, matte black / Ракетка MAXIMUS POWER, рама без струн, матовый чёрный цвет / MAXIMUS POWER球拍，未穿线拍框，哑光黑色 |
| `public/media/power-throat-handle.jpg` | 03_Power_Handle.jpeg (IMG_9634(1)), 1152×1536 | POWER | PREVIEW — APPROVAL PENDING | Throat-to-handle transition. Not a carbon cutaway; not proof of eight grip sizes | POWER series detail; manufacturing section (home, engineering) | crop → 555×900 | MAXIMUS POWER throat-to-handle transition / Переход от шейки к ручке ракетки MAXIMUS POWER / MAXIMUS POWER拍喉至拍柄的过渡段 |
| `public/media/lion-buttcap.jpg` | 04_Lion_Buttcap.jpeg (IMG_9633(2)), 1152×1536 | not identified | PREVIEW — APPROVAL PENDING | Butt cap with lion. Not a replacement logo | Manufacturing section (home, engineering) | crop → 691×691 | Lion emblem on the MAXIMUS butt cap / Эмблема льва на нижней крышке ручки MAXIMUS / MAXIMUS拍柄底盖上的狮子徽标 |
| `public/media/maximus-lettering.jpg` | 05_MAXIMUS_Lettering.jpeg (IMG_9630(2)), 1152×1536 | not identified | PREVIEW — APPROVAL PENDING | Gloss / matte lettering. No synthetic chrome | Manufacturing section (home, engineering) | crop → 675×900 | Gloss black MAXIMUS lettering on a matte black frame / Глянцевая чёрная надпись MAXIMUS на матовой чёрной раме / 哑光黑色拍框上的亮面黑色MAXIMUS字样 |
| `public/media/great-head-geometry.jpg` | 06_Great_Actual_Geometry.jpeg (3780(2)), 1280×1707 | GREAT | PREVIEW — APPROVAL PENDING | GREAT head, beam, V-throat. Handle cropped; **not a hero**; no extension, no strings | Home GREAT card (labelled "head and V-throat geometry"); GREAT series detail. Never used as a hero | resize → 960×1280 | MAXIMUS GREAT head and V-throat geometry / Геометрия головы и V-образной шейки MAXIMUS GREAT / MAXIMUS GREAT拍头与V形拍喉几何结构 |
| `public/media/frames-finish-reference.jpg` | 07_Frames_Finish_Reference.jpeg (IMG_2971(1)), 1536×1152 | not identified | PREVIEW — APPROVAL PENDING | Finish reference. Not labelled GREAT/POWER/SPIN, not a certified matched set, not current products | Manufacturing section, captioned "frames not identified by series" | resize → 1200×900 | MAXIMUS frames, finish reference / Рамы MAXIMUS, образец отделки / MAXIMUS拍框，表面处理参考 |
| — (not in repository) | 08_Great_Source_Video.mp4 (3781(3)), 512×910, 27 s, 16.5 MB | GREAT | PREPARED — NOT RELEASED | GREAT inspection footage. The owner must review the full clip before publication | Nowhere. `data/media.js → videoReleased = false`. Every sampled frame crops the handle | — | — |

## 2. Brand assets (unchanged from v4.1)

| File | Source | Status | Use |
| --- | --- | --- | --- |
| `public/brand/maximus-gps-lockup.png` (1034×248) | 01_MAXIMUS_GPS_Identity.jpeg — crop only, background floored to black | APPROVED | Header, footer, Open Graph composition |
| `public/brand/maximus-lion-emblem.png` (512×512), `app/icon.png` (256), `app/apple-icon.png` (180) | Crop of the official lockup (01) | APPROVED | Favicon, Organization logo |
| `public/brand/og-maximus.png` (1200×630) | Lockup + typography on black; no product geometry | APPROVED | Share previews |

## 3. Schematics (not photographs)
Generated in code and labelled on the page as **"Schematic — not a measurement"**: stiffness tolerance bands per precision class (no RA value implied) and the nominal grip scale L0–L7 (4″–4⅞″, not measured handle dimensions). Files: `components/Schematics.js`.

## 4. Typographic tiles instead of photographs
Where no approved photograph exists the page shows a typographic tile with the text "Photograph not yet published" (localized): SPIN (series card and hero), GREAT hero (the geometry photo is not a hero), Sweet Spot Trainer. Listed in `CONTENT_GAPS.md`.

## 5. Excluded
Rejected GREAT covers, SPIN STORIES graphics, the SST composite, quotation extracts, unapproved renders, foam-handle imagery, substitute racquets, invented logos, the v1 temporary references and the artificial circular "M" mark. None of them or their crops is in the repository. Generated images are never used as evidence that a model exists or is available.
