import Image from "next/image";
import { media } from "../data/media";
import { edges } from "../data/mediaEdges";

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
  // The photograph's own blur placeholder, enlarged and blurred behind it, so the picture emerges
  // from the dark page in its own light instead of sitting on it as a rectangle. The halo only ever
  // lies outside and beneath the photograph: nothing in the composition is masked, faded or dimmed,
  // which keeps every specification strip, engraving zone and MIPA marking whole and readable.
  const blur = m.src?.blurDataURL;
  const edge = edges[id];
  const frame = {};
  if (blur) frame["--halo"] = `url(${blur})`;
  if (edge) frame["--edge"] = edge;
  return (
    <figure className={`photo ${className}`} style={ar ? { "--ar": ar } : undefined}>
      {/* The light is anchored to the picture alone, not to the caption beneath it. */}
      <span className={`photo-frame${edge ? " edge" : ""}`} style={Object.keys(frame).length ? frame : undefined}>
        {blur && <span className="photo-ambient" aria-hidden="true" />}
        <Image src={m.src} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={80} />
      </span>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Typographic tile used where no approved photograph exists yet (listed in CONTENT_GAPS.md). */
export function PhotoPending({ name, sub, note, className = "" }) {
  return (
    <div className={`photo-pending ${className}`}>
      <span className="pp-name">{name}</span>
      {sub && <span className="pp-sub">{sub}</span>}
      <span className="pp-note">{note}</span>
    </div>
  );
}
