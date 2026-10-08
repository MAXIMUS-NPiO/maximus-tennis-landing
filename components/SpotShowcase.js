"use client";
import { useState } from "react";
import { Stage, Lightbox, useZoom } from "./PhotoStage";

/** Fixed in every language, like the series names: the product is called the same thing everywhere. */
const NAME = "MAXIMUS Spot Trainer";

/**
 * Spot Trainer, presented the way the performance series are presented: the owner's studio
 * compositions emerging from the dark band out of their own continued surroundings, each opening
 * to full size, with the confirmed figures beside the lead photograph.
 *
 * The photographs are the product record, so every one of them is shown whole — no crop, no
 * overlay, no text burned over them by this site.
 */
export default function SpotShowcase({ eyebrow, title, lead, views, weights, weightsLabel, specs, note, strings }) {
  const { open, openZoom, close } = useZoom();
  const [i, setI] = useState(0);
  const current = views[i] || views[0];
  const hero = views[0];

  return (
    <>
      <section className="section vc-catalogue spot-showcase">
        <div className="shell">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="h-2">{title}</h2>
          <p className="lead">{lead}</p>

          <div className="vc-selected">
            <Stage
              img={hero.img}
              alt={hero.alt}
              glow={`/media/glow/${hero.id}.webp`}
              priority
              sizes="(min-width: 1080px) 620px, (min-width: 760px) 55vw, 94vw"
              onZoom={(e) => { setI(0); openZoom(e.currentTarget); }}
              zoomLabel={strings.zoom}
            />
            <div className="vc-selected-info">
              <p className="vc-variant-name">{NAME}</p>
              <p className="spot-weights-label">{weightsLabel}</p>
              <p className="spot-weights">
                {weights.map((w) => <span key={w}>{w}</span>)}
                <i>{strings.grams}</i>
              </p>
              <dl className="vc-specs">
                {specs.map(([dt, dd, pending]) => (
                  <div key={dt}>
                    <dt>{dt}</dt>
                    {/* A value that is not published says so in the table itself, with the same
                        status mark the rest of the site uses. Nothing is inferred to fill it. */}
                    <dd>{pending && <span className="status notprovided">{pending}</span>}{dd}</dd>
                  </div>
                ))}
              </dl>
              <p className="vc-balance-note">{note}</p>
            </div>
          </div>

          <ul className="spot-views">
            {views.slice(1).map((v, n) => (
              <li key={v.id}>
                <Stage
                  img={v.img}
                  alt={v.alt}
                  glow={`/media/glow/${v.id}.webp`}
                  sizes="(min-width: 1080px) 520px, (min-width: 760px) 46vw, 94vw"
                  onZoom={(e) => { setI(n + 1); openZoom(e.currentTarget); }}
                  zoomLabel={strings.zoom}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open && (
        <Lightbox
          img={current.img}
          alt={current.alt}
          label={NAME}
          caption={NAME}
          closeLabel={strings.close}
          onClose={close}
        />
      )}
    </>
  );
}
