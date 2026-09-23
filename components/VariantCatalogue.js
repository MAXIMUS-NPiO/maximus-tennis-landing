"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { variantsByWeight } from "../data/media";

/**
 * Product name pattern fixed by the Founder: "MAXIMUS Spin series — 222 g".
 * The same pattern carries every series and is identical in every locale.
 */
export const variantName = (seriesName, weight) => `MAXIMUS ${seriesName} series — ${weight} g`;

/** The composition shown first; falls back to the lightest listed weight when it is not listed. */
const PREFERRED_WEIGHT = 290;

/** Ambient backdrop: the image's own blur placeholder, enlarged and blurred behind the photograph.
 *  It only ever appears OUTSIDE the photograph, so nothing in the composition is masked or dimmed. */
function Stage({ images, weight, alt, priority = false, sizes, onZoom, zoomLabel }) {
  const img = images[weight];
  if (!img) return null;
  const inner = (
    <>
      {img.blurDataURL && <span className="vc-ambient" aria-hidden="true" style={{ backgroundImage: `url(${img.blurDataURL})` }} />}
      <Image src={img} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={86} />
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

/** Only the strings this section needs are handed to the client — never the whole dictionary. */
export default function VariantCatalogue({ seriesId, seriesName, strings, variants, headSizeSqIn, construction, grips, precision, balanceNote }) {
  const { catalogue: C, units: L, alt: altTemplate } = strings;
  const images = variantsByWeight[seriesId] || {};
  const [weight, setWeight] = useState(() => (variants.some((v) => v.weight === PREFERRED_WEIGHT) ? PREFERRED_WEIGHT : variants[0].weight));
  const [zoom, setZoom] = useState(false);
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const returnRef = useRef(null);
  const headingId = useId();

  const current = useMemo(() => variants.find((v) => v.weight === weight) || variants[0], [variants, weight]);
  const name = useCallback((w) => variantName(seriesName, w), [seriesName]);
  const altFor = useCallback(
    (v) => altTemplate.replace("{series}", seriesName).replace("{w}", v.weight).replace("{b}", v.balance),
    [altTemplate, seriesName],
  );
  const fill = useCallback((t) => t.replace("{series}", seriesName).replace("{n}", variants.length), [seriesName, variants.length]);

  const pick = useCallback((w, scroll) => {
    setWeight(w);
    if (scroll && stageRef.current) stageRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const openZoom = useCallback((el) => { returnRef.current = el || null; setZoom(true); }, []);
  const closeZoom = useCallback(() => {
    setZoom(false);
    if (returnRef.current && returnRef.current.focus) returnRef.current.focus();
  }, []);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeZoom(); } };
    document.addEventListener("keydown", onKey);
    if (closeRef.current) closeRef.current.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [zoom, closeZoom]);

  return (
    <>
      <section className="section vc-catalogue" aria-labelledby={headingId}>
        <div className="shell">
          <p className="eyebrow">{fill(C.eyebrow)}</p>
          <h2 className="h-2" id={headingId}>{fill(C.title)}</h2>
          <p className="lead">{fill(C.lead)}</p>

          <div className="vc-selected" ref={stageRef}>
            <Stage
              images={images}
              weight={current.weight}
              alt={altFor(current)}
              priority
              sizes="(min-width: 1080px) 620px, (min-width: 760px) 55vw, 94vw"
              onZoom={(e) => openZoom(e.currentTarget)}
              zoomLabel={C.zoom}
            />
            <div className="vc-selected-info">
              <p className="vc-variant-name">{name(current.weight)}</p>
              <p className="vc-weight"><span className="vc-weight-value">{current.weight}</span><span className="vc-weight-unit">{L.grams}</span></p>
              <dl className="vc-specs">
                <div><dt>{C.balanceLabel}</dt><dd>{current.balance} {L.mm}</dd></div>
                <div><dt>{C.headLabel}</dt><dd>{headSizeSqIn} {L.sqin}</dd></div>
                <div><dt>{C.constructionLabel}</dt><dd>{construction}</dd></div>
                <div><dt>{C.gripsLabel}</dt><dd>{grips}</dd></div>
                <div><dt>{C.precisionLabel}</dt><dd>{precision}</dd></div>
              </dl>
              <p className="vc-balance-note">{balanceNote}</p>
            </div>
          </div>

          <div className="vc-switch" role="group" aria-label={C.selectLabel}>
            {variants.map((v) => (
              <button
                key={v.weight}
                type="button"
                className={`vc-chip ${v.weight === current.weight ? "on" : ""}`}
                aria-pressed={v.weight === current.weight}
                onClick={() => pick(v.weight, false)}
              >
                {v.weight}<i>{L.grams}</i>
              </button>
            ))}
          </div>

          <h3 className="h-3 vc-grid-title">{fill(C.allTitle)}</h3>
          <ul className="vc-grid">
            {variants.map((v) => (
              <li key={v.weight}>
                <article className={`vc-card ${v.weight === current.weight ? "on" : ""}`}>
                  <Stage
                    images={images}
                    weight={v.weight}
                    alt={altFor(v)}
                    sizes="(min-width: 1080px) 300px, (min-width: 760px) 30vw, 88vw"
                    onZoom={(e) => { pick(v.weight, false); openZoom(e.currentTarget); }}
                    zoomLabel={C.zoom}
                  />
                  <p className="vc-card-name">{name(v.weight)}</p>
                  <p className="vc-card-weight"><span>{v.weight}</span><i>{L.grams}</i></p>
                  <p className="vc-card-balance">{C.balanceLabel}: <b>{v.balance} {L.mm}</b></p>
                  <button type="button" className="vc-card-select" onClick={() => pick(v.weight, true)} aria-pressed={v.weight === current.weight}>
                    {v.weight === current.weight ? C.selected : C.select}
                  </button>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {zoom && (
        <div className="vc-lightbox" role="dialog" aria-modal="true" aria-label={name(current.weight)} onClick={closeZoom}>
          <div className="vc-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <Image src={images[current.weight]} alt={altFor(current)} sizes="(min-width: 1200px) 1100px, 96vw" quality={90} placeholder="blur" />
            <p className="vc-lightbox-cap">{name(current.weight)} · {C.balanceLabel} {current.balance} {L.mm}</p>
            <button type="button" className="vc-lightbox-close" onClick={closeZoom} ref={closeRef}>{C.close}</button>
          </div>
        </div>
      )}
    </>
  );
}
