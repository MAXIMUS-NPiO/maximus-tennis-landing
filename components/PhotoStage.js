"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The frame every product photograph on this site is shown in.
 *
 * Beneath the picture lies its own surroundings, continued outwards (`glow`: a file in
 * public/media/glow written by scripts/photo-glow.mjs), so the picture emerges from the dark band
 * instead of sitting on it as a rectangle. The composition itself is untouched; only its outermost
 * edge is feathered (CSS). The enlarged view shows every file whole and unfeathered.
 *
 * One implementation, used by the weight catalogue of the performance series and by the Spot
 * Trainer: the two must not drift apart.
 */
export function Stage({ img, alt, glow, priority = false, sizes, quality = 86, onZoom, zoomLabel }) {
  if (!img) return null;
  const inner = (
    <>
      {glow && <span className="vc-ambient" aria-hidden="true" style={{ "--glow": `url(${glow})` }} />}
      <Image src={img} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={quality} />
    </>
  );
  if (!onZoom) return <div className="vc-frame">{inner}</div>;
  return (
    <button type="button" className="vc-frame vc-frame-zoom" onClick={onZoom} aria-label={zoomLabel}>
      {inner}
      <span className="vc-zoom-hint" aria-hidden="true">{zoomLabel}</span>
    </button>
  );
}

/** Open/close state for the enlarged view, with focus returned to the frame that opened it. */
export function useZoom() {
  const [open, setOpen] = useState(false);
  const returnRef = useRef(null);
  const openZoom = useCallback((el) => {
    returnRef.current = el || null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    const el = returnRef.current;
    if (el && el.focus) el.focus();
  }, []);
  return { open, openZoom, close };
}

/** The enlarged view: Escape closes it, the page behind it does not scroll, focus starts on Close. */
export function Lightbox({ img, alt, caption, label, closeLabel, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    if (closeRef.current) closeRef.current.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (!img) return null;
  return (
    <div className="vc-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="vc-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <Image src={img} alt={alt} sizes="(min-width: 1200px) 1100px, 96vw" quality={90} placeholder="blur" />
        {caption && <p className="vc-lightbox-cap">{caption}</p>}
        <button type="button" className="vc-lightbox-close" onClick={onClose} ref={closeRef}>{closeLabel}</button>
      </div>
    </div>
  );
}
