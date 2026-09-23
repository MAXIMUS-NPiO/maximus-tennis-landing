# DESIGN.md — MAXIMUS website design system

Direction: **Engineering Gallery**. Reference for the direction (not a template, not a source of assets or code): the teenage engineering style entry on Refero — https://styles.refero.design/style/aecf9dda-5cba-4dc7-9e73-59b65d895cdf. Principles borrowed: objecthood, engineering precision, light space, thin dividers, a strict grid, expressive typography. Nothing from the reference is copied — no logos, images, paid material or code.

## Principles
1. One screen carries one dominant message and one relevant visual or interaction.
2. Real parameters are the visual material: series index (97 / 98 / 100 in²), precision classes, L0–L7, weight matrices.
3. Light space and thin rules instead of decoration. No gradients, textures, visual noise, endless identical cards or SaaS styling.
4. Premium perception comes from proportion, typography, alignment and restraint.
5. Every status is honest in ordinary language. Ecosystem: Current · Available by agreement · In development · Concept. Product values: Confirmed · Calculated · Requested architecture · Not provided.

## Colour tokens (`app/globals.css` → `:root`)
| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f7f8f5` | page background |
| `--surface` | `#eef0eb` | secondary surface (`.band-1`, page heroes, tab rail) |
| `--surface-2` | `#e9ede2` | secondary surface (`.band-2`) |
| `--ink` | `#171b18` | primary text, primary buttons |
| `--ink-2` | `#555e55` | secondary text |
| `--accent` | `#506529` | interface accent: focus ring, selected tab, bullets, counters, emphasised grip sizes |
| `--accent-light` | `#e7ecd9` | light accent surface: selected choices, emphasised cells, hover on outline buttons |
| `--line` | `#d8ddd3` | thin dividers and borders |
| `--line-strong` | `#b9c0b4` | input borders, chips |
| black `#000` / white `#fff` | — | header and footer are black to carry the official white MAXIMUS GPS lockup unchanged |

Status dots: current/confirmed = accent; development/requested/target = `#b8862b`; agreement/modelled = `#3f6e9e`; not provided = `#a33a3a`; concept = `#9aa197`.

## Typography
- Family: system sans stack (no third-party fonts, so the core experience never depends on an external host). CJK falls back to PingFang SC / Microsoft YaHei / Noto Sans.
- Body: 17 px on phones, 18 px from 760 px; line-height 1.55. Lead paragraphs 18–21 px. Never below 15 px for running text; captions 12.5–14 px only for labels.
- Headings: `.h-display` clamp(38–88 px) uppercase for the primary thesis; `.h-1` 34–64 px; `.h-2` 28–46 px; `.h-3` 21–27 px. Weight 600, letter-spacing −0.02 to −0.035 em.
- Numerals: monospace with tabular figures for every measurement (`.mono`, `.index-head`, `.pparams b`, matrices, spec tables).
- Uppercase eyebrows with 0.14 em tracking mark section families.

## Layout
- Content width up to 1320 px (`--shell`), 16 px side gutter on phones, 32 px from 760 px.
- Sections: 56 px vertical padding on phones, 84 px from 760 px; a 1 px `--line` rule between sections; surfaces alternate `bg → surface → surface-2` only where it separates meaning.
- Grids: `.grid-2/3/4` collapse to one column below 760 px; `.grip-row` 2 → 4 → 8 columns; `.index` rows become a four-column line from 760 px.
- Sticky black header 68 px; desktop navigation from 1180 px, mobile menu below.

## Components
- **Header navigation**: group buttons with `aria-haspopup`, `aria-expanded`, `aria-controls`; open on click / Enter / Space; close on Escape, Tab-out and outside click. Never hover-only. Mobile: toggle button (`aria-expanded`, `aria-controls`) and native `<details>` groups. Visible focus ring (`#cfe08a` on black, `--accent` on light).
- **Series index** (`.index`): name — head size — declared direction — link. Real parameters from `data/products.js`.
- **Precision switch** (`.pswitch`): WAI-ARIA tablist for P2.5 / P1.5 / P0.5 with arrow-key navigation; the panel always shows WEIGHT / BALANCE / SWINGWEIGHT / STIFFNESS. Stiffness is labelled as a manufacturing target; P0.5 states conformity to the declared RA reading under the defined factory QC measurement protocol — never "zero error". The full comparison table stays available (expander on the home page, inline on the precision page).
- **Stiffness section**: dedicated statement + three columns (response, feel, consistency) + the four separate record fields. No invented laboratory charts or measurement results.
- **Grip sequence** (`.grip-row`): all eight sizes L0–L7 with inch equivalents; L6 and L7 emphasised; factory carbon handle geometry, not overgrip build-up; no worldwide-exclusivity claim.
- **Cards, steps, chains, kicker lists, stat tiles, spec tables, weight matrices, status pills, expanders** as defined in `globals.css`.
- **Product hero (home)**: thesis without article, one product line, the real POWER frame photograph (priority image), CTA "Find your racquet" + "View the series" (RU «Подобрать ракетку» + «Посмотреть серии» — the owner's labels; the short route /choose is named "Help me choose" / «Помогите подобрать» / 帮我挑选). On phones the text and actions come first and the racquet head is visible in the first screen at 390×844.
- **Series pages**: photo → direction → specification with statuses → precision/grip → CTA → full matrix (SPIN: one explanation, no per-cell notes) → what happens after a request + FAQ. A detail photograph is never promoted to a hero; missing photographs are typographic tiles labelled "Photograph not yet published".
- **Schematics**: stiffness tolerance bands and the L0–L7 nominal grip scale, always labelled "Schematic — not a measurement".
- **Forms** (`LeadForm`): one component for every purpose; labels, `autocomplete`, `inputmode`, `type=email`, `aria-required`, `aria-describedby` (hint + error), localized errors, an error summary with links, focus moves to the first invalid field after the summary renders. States: editing → submitting → accepted (request ID, focused) | failed (not submitted, input kept, retry). A sticky element never covers a field (`scroll-margin`).

## Responsiveness and accessibility
- Verified widths: 320, 390, 768, 1024, 1440 px in EN/RU/ZH — no horizontal overflow; 200 % zoom (640 px CSS viewport); choice grids use `minmax(0, 1fr)` so long localized labels wrap.
- `prefers-reduced-motion`: the only animation (a 0.6 s reveal) and all transitions are disabled.
- Colour contrast AA on all text; automated WCAG 2.1 AA scan (axe) on key pages before release.

## Images and assets
- Only the official MAXIMUS marks: the MAXIMUS GPS lockup, the lion emblem and the GPS mark, raster sources cropped only, never redrawn, recoloured or approximated.
- Product photography is used only within the purpose stated in the owner's manifest and registered in `ASSET_MANIFEST.md`; production use requires release approval. No deformed frames, altered string beds, invented logos, generative reconstruction or third-party racquets; previously rejected visuals and their derivatives are excluded.
- Where approved imagery is missing, the section shows a typographic tile and exact data; the gap is recorded in `CONTENT_GAPS.md`, never filled with a substitute. The GREAT inspection video is prepared but not released until the owner reviews the full clip.
- Discontinued foam-handle products and SHALENI content never appear on this site.

## Control
- MIPA is the internal IP, provenance and document-control layer of the MAXIMUS ecosystem. No MIPA registration number is claimed for this design system or the website version; a record reference is assigned only through the controlled MIPA process.
- Content and product-data governance: `CONTENT_GOVERNANCE.md`.
