import Image from "next/image";
import { media } from "../data/media";

/** Responsive photograph: priority for the hero, lazy elsewhere; always with localized alt text. */
export function Photo({ id, alt, caption, priority = false, sizes = "(min-width: 1024px) 33vw, 100vw", className = "" }) {
  const m = media[id];
  if (!m) return null;
  // The photograph's own aspect ratio, taken from the file itself, is published to CSS as --ar.
  // Layouts size the frame from it instead of imposing a ratio, which is what produced the black
  // letterbox bands: a 2.15:1 crop forced into a 4:5 box can only be padded or cut.
  const w = m.src?.width;
  const h = m.src?.height;
  const ar = w && h ? Math.round((w / h) * 1000) / 1000 : null;
  // Beneath the picture lies its own backdrop, continued a short way past its edges and dissolved into
  // the page (public/media/glow, written by scripts/photo-glow.mjs), so the picture emerges from the
  // page instead of sitting on it as a rectangle. The picture's content is untouched; only its
  // outermost pixels are feathered (CSS).
  return (
    <figure className={`photo ${className}`} style={ar ? { "--ar": ar } : undefined}>
      {/* The light is anchored to the picture alone, not to the caption beneath it. */}
      <span className="photo-frame">
        <span className="photo-ambient" aria-hidden="true" style={{ "--glow": `url(/media/glow/${id}.webp)` }} />
        <Image src={m.src} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={80} />
      </span>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * Typographic tile used where no approved photograph exists (listed in CONTENT_GAPS.md): the name
 * and the figures only. The site does not announce what it has not published (Founder,
 * 8 October 2026), so the tile carries no "not yet published" line; `note` is accepted and ignored.
 */
export function PhotoPending({ name, sub, className = "" }) {
  return (
    <div className={`photo-pending ${className}`}>
      <span className="pp-name">{name}</span>
      {sub && <span className="pp-sub">{sub}</span>}
    </div>
  );
}
