"use client";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { variantsByWeight } from "../data/media";
import { Stage, Lightbox, useZoom } from "./PhotoStage";

/**
 * Product name pattern fixed by the Founder: "MAXIMUS Spin series — 222 g".
 * The same pattern carries every series and is identical in every locale.
 */
export const variantName = (seriesName, weight) => `MAXIMUS ${seriesName} series — ${weight} g`;

/** The composition shown first; where 290 g is not listed, the middle of the range is used. */
const PREFERRED_WEIGHT = 290;
const firstWeight = (variants) =>
  (variants.some((v) => v.weight === PREFERRED_WEIGHT) ? PREFERRED_WEIGHT : variants[Math.floor(variants.length / 2)].weight);

/** Only the strings this section needs are handed to the client — never the whole dictionary. */
export default function VariantCatalogue({ seriesId, seriesName, strings, variants, headSizeSqIn, construction, grips, precision, balanceNote }) {
  const { catalogue: C, units: L, alt: altTemplate } = strings;
  const images = variantsByWeight[seriesId] || {};
  const [weight, setWeight] = useState(() => firstWeight(variants));
  const { open: zoom, openZoom, close: closeZoom } = useZoom();
  const stageRef = useRef(null);
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

  return (
    <>
      <section className="section vc-catalogue" aria-labelledby={headingId}>
        <div className="shell">
          <p className="eyebrow">{fill(C.eyebrow)}</p>
          <h2 className="h-2" id={headingId}>{fill(C.title)}</h2>
          <p className="lead">{fill(C.lead)}</p>

          <div className="vc-selected" ref={stageRef}>
            <Stage
              img={images[current.weight]}
              alt={altFor(current)}
              glow={`/media/glow/${seriesId}-${current.weight}.webp`}
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
                    img={images[v.weight]}
                    alt={altFor(v)}
                    glow={`/media/glow/${seriesId}-${v.weight}.webp`}
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
        <Lightbox
          img={images[current.weight]}
          alt={altFor(current)}
          label={name(current.weight)}
          caption={`${name(current.weight)} · ${C.balanceLabel} ${current.balance} ${L.mm}`}
          closeLabel={C.close}
          onClose={closeZoom}
        />
      )}
    </>
  );
}
