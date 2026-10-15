/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Grip shape (Founder, 15 October 2026): the geometry of the handle section, chosen separately from
 * its size. Cross-sections are illustrative proportions, never a specification: every octagon is
 * drawn with the same perimeter, so the three geometries read as one grip size with differently
 * proportioned bevels. No dimension is shown; the exact geometry is set in the written specification.
 * Copy: content/grip-shape-copy.js (dict.gripShape).
 */
import Link from "next/link";
import { gripShapes } from "../data/products";
import { href } from "../lib/paths";
import { sectionPoints } from "../lib/grip-sections";

/** The cross-section of one option; a replica is a handle copied, "not sure yet" an open question. */
export function GripSectionIcon({ shape, className = "" }) {
  return (
    <svg viewBox="0 0 100 100" className={`gs-ico ${className}`} aria-hidden="true" focusable="false" data-shape={shape}>
      {shape === "replica" ? (
        <>
          <polygon className="gs-ghost" points={sectionPoints("classic", { dx: 7, dy: 6, fill: 0.74 })} />
          <polygon className="gs-face" points={sectionPoints("classic", { dx: -5, dy: -5, fill: 0.74 })} />
        </>
      ) : shape === "advise" ? (
        <>
          <polygon className="gs-ghost" points={sectionPoints("even")} />
          <text className="gs-q" x="50" y="62" textAnchor="middle">?</text>
        </>
      ) : (
        <polygon className="gs-face" points={sectionPoints(shape)} />
      )}
    </svg>
  );
}

/** Grip-architecture page: the three geometries and the replica, each opening the configurator with it. */
export function GripShapes({ locale, dict }) {
  const GS = dict.gripShape;
  const shown = gripShapes.filter((s) => s.kind !== "open");
  return (
    <figure className="schematic grip-shapes-figure">
      <ul className="grip-shapes">
        {shown.map(({ id }) => (
          <li key={id}>
            <Link href={`${href(locale, "build")}?from=grip&shape=${id}`} data-shape={id}>
              <GripSectionIcon shape={id} />
              <b>{GS.shapes[id][0]}</b>
              <span>{GS.shapes[id][1]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <figcaption><span className="schematic-tag">{dict.common.labels.schematic}</span> {GS.caption}</figcaption>
    </figure>
  );
}
