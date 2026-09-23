"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { spinByWeight } from "../data/media";

/** Product name pattern fixed by the Founder: "MAXIMUS Spin series — 222 g". Identical in every locale. */
export const variantName = (weight) => `MAXIMUS Spin series — ${weight} g`;

const DEFAULT_WEIGHT = 290;

/** Ambient backdrop: the image's own blur placeholder, enlarged and blurred behind the photograph.
 *  It only ever appears OUTSIDE the photograph, so nothing in the composition is masked or dimmed. */
function Stage({ weight, alt, priority = false, sizes, onZoom, zoomLabel }) {
  const img = spinByWeight[weight];
  if (!img) return null;
  const inner = (
    <>
      {img.blurDataURL && <span className="spin-ambient" aria-hidden="true" style={{ backgroundImage: `url(${img.blurDataURL})` }} />}
      <Image src={img} alt={alt} sizes={sizes} priority={priority} placeholder="blur" quality={86} />
    </>
  );
  if (!onZoom) return <div className="spin-frame">{inner}</div>;
  return (
    <button type="button" className="spin-frame spin-frame-zoom" onClick={onZoom} aria-label={zoomLabel}>
      {inner}
      <span className="spin-zoom-hint" aria-hidden="true">{zoomLabel}</span>
    </button>
  );
}

/** Only the strings this section needs are handed to the client — never the whole dictionary. */
export default function SpinVariants({ strings, variants, headSizeSqIn, construction, grips, precision }) {
  const { catalogue: C, units: L, alt: altTemplate } = strings;
  const [weight, setWeight] = useState(() => (variants.some((v) => v.weight === DEFAULT_WEIGHT) ? DEFAULT_WEIGHT : variants[0].weight));
  const [zoom, setZoom] = useState(false);
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const returnRef = useRef(null);
  const headingId = useId();

  const current = useMemo(() => variants.find((v) => v.weight === weight) || variants[0], [variants, weight]);
  const altFor = useCallback((v) => altTemplate.replace("{w}", v.weight).replace("{b}", v.balance), [altTemplate]);

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
    <section className="section spin-catalogue" aria-labelledby={headingId}>
      <div className="shell">
        <p className="eyebrow">{C.eyebrow}</p>
        <h2 className="h-2" id={headingId}>{C.title}</h2>
        <p className="lead">{C.lead}</p>

        <div className="spin-selected" ref={stageRef}>
          <Stage
            weight={current.weight}
            alt={altFor(current)}
            priority
            sizes="(min-width: 1080px) 620px, (min-width: 760px) 55vw, 94vw"
            onZoom={(e) => openZoom(e.currentTarget)}
            zoomLabel={C.zoom}
          />
          <div className="spin-selected-info">
            <p className="spin-variant-name">{variantName(current.weight)}</p>
            <p className="spin-weight"><span className="spin-weight-value">{current.weight}</span><span className="spin-weight-unit">{L.grams}</span></p>
            <dl className="spin-specs">
              <div><dt>{C.balanceLabel}</dt><dd>{current.balance} {L.mm}</dd></div>
              <div><dt>{C.headLabel}</dt><dd>{headSizeSqIn} {L.sqin}</dd></div>
              <div><dt>{C.constructionLabel}</dt><dd>{construction}</dd></div>
              <div><dt>{C.gripsLabel}</dt><dd>{grips}</dd></div>
              <div><dt>{C.precisionLabel}</dt><dd>{precision}</dd></div>
            </dl>
            <p className="spin-balance-note">{C.balanceOrigin}</p>
          </div>
        </div>

        <div className="spin-switch" role="group" aria-label={C.selectLabel}>
          {variants.map((v) => (
            <button
              key={v.weight}
              type="button"
              className={`spin-chip ${v.weight === current.weight ? "on" : ""}`}
              aria-pressed={v.weight === current.weight}
              onClick={() => pick(v.weight, false)}
            >
              {v.weight}<i>{L.grams}</i>
            </button>
          ))}
        </div>

        <h3 className="h-3 spin-grid-title">{C.allTitle.replace("{n}", variants.length)}</h3>
        <ul className="spin-grid">
          {variants.map((v) => (
            <li key={v.weight}>
              <article className={`spin-card ${v.weight === current.weight ? "on" : ""}`}>
                <Stage
                  weight={v.weight}
                  alt={altFor(v)}
                  sizes="(min-width: 1080px) 300px, (min-width: 760px) 30vw, 88vw"
                  onZoom={(e) => { pick(v.weight, false); openZoom(e.currentTarget); }}
                  zoomLabel={C.zoom}
                />
                <p className="spin-card-name">{variantName(v.weight)}</p>
                <p className="spin-card-weight"><span>{v.weight}</span><i>{L.grams}</i></p>
                <p className="spin-card-balance">{C.balanceLabel}: <b>{v.balance} {L.mm}</b></p>
                <button type="button" className="spin-card-select" onClick={() => pick(v.weight, true)} aria-pressed={v.weight === current.weight}>
                  {v.weight === current.weight ? C.selected : C.select}
                </button>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>

      {zoom && (
        <div className="spin-lightbox" role="dialog" aria-modal="true" aria-label={variantName(current.weight)} onClick={closeZoom}>
          <div className="spin-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <Image src={spinByWeight[current.weight]} alt={altFor(current)} sizes="(min-width: 1200px) 1100px, 96vw" quality={90} placeholder="blur" />
            <p className="spin-lightbox-cap">{variantName(current.weight)} · {C.balanceLabel} {current.balance} {L.mm}</p>
            <button type="button" className="spin-lightbox-close" onClick={closeZoom} ref={closeRef}>{C.close}</button>
          </div>
        </div>
      )}
    </>
  );
}
