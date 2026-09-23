/**
 * Inspection video — prepared, NOT released (ASSET_MANIFEST.md, 08_Great_Source_Video.mp4).
 * Poster + native controls, preload="none", no autoplay, no loop: nothing moves or downloads
 * until the visitor presses play (respects reduced-motion preferences and mobile data).
 */
export function InspectionVideo({ src, poster, caption, label }) {
  if (!src) return null;
  return (
    <figure className="video">
      <video controls preload="none" playsInline poster={poster || undefined} aria-label={label}>
        <source src={src} type="video/mp4" />
      </video>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
