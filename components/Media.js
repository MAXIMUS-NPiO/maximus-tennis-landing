import Image from "next/image";
import { media } from "../data/media";

/** Responsive photograph: priority for the hero, lazy elsewhere; always with localized alt text. */
export function Photo({ id, alt, caption, priority = false, sizes = "(min-width: 1024px) 33vw, 100vw", className = "" }) {
  const m = media[id];
  if (!m) return null;
  return (
    <figure className={`photo ${className}`}>
      <Image src={m.src} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={80} />
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
