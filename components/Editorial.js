/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Founder's update of 14 October 2026, part I — editorial sections shared by several pages:
 * the product philosophy, the selection route and kits, valuation feedback, exchange of value,
 * identity collections and the MAXIMUS Pro Shop concept diagram. Copy: content/editorial-copy.js.
 */
import Link from "next/link";
import { href } from "../lib/paths";
import { Section, Cta, Note, Steps } from "./Ui";

/** Section 2 of the update: a permanent base, individual development. */
export function Philosophy({ dict, band = "" }) {
  const P = dict.editorial.platform;
  return (
    <Section id="philosophy" band={band} eyebrow={P.eyebrow} title={P.title} lead={P.lead}>
      <div className="grid-3 philosophy">
        {P.points.map(([h, p]) => (
          <div key={h} className="card"><h3>{h}</h3><p>{p}</p></div>
        ))}
      </div>
    </Section>
  );
}

/** Section 5: the linked route racquet → length and grip → Spot Trainer → Sweet Spot Trainer → kit → request. */
export function Kits({ locale, dict, band = "" }) {
  const K = dict.editorial.kits;
  const steps = [
    href(locale, "racquets"),
    href(locale, "build"),
    href(locale, "spot"),
    href(locale, "sst"),
    "#kit-types",
    `${href(locale, "contact")}?purpose=selection`,
  ];
  return (
    <Section id="kits" band={band} eyebrow={K.eyebrow} title={K.title} lead={K.lead}>
      <h3 className="eyebrow">{K.routeTitle}</h3>
      <ol className="route" aria-label={K.routeTitle}>
        {K.route.map((t, i) => (
          <li key={t}><Link href={steps[i]}><b>{String(i + 1).padStart(2, "0")}</b><span>{t}</span></Link></li>
        ))}
      </ol>
      <Note>{K.note}</Note>
      <h3 className="h-3" id="kit-types" style={{ marginTop: 34, marginBottom: 14 }}>{K.typesTitle}</h3>
      <div className="grid-3 kit-types">
        {K.types.map(([h, p]) => <div key={h} className="card"><h3>{h}</h3><p>{p}</p></div>)}
      </div>
      <div className="kit-example">
        <p className="eyebrow accent">{K.exampleTitle}</p>
        <div className="kit-formula" role="img" aria-label={`6 ${K.playing} + 5 Spot Trainer + 5 Sweet Spot Trainer = 16`}>
          <div><b>6</b><span>{K.playing}</span></div><i aria-hidden="true">+</i>
          <div><b>5</b><span>Spot Trainer</span></div><i aria-hidden="true">+</i>
          <div><b>5</b><span>Sweet Spot Trainer</span></div><i aria-hidden="true">=</i>
          <div className="total"><b>16</b></div>
        </div>
        <p>{K.exampleCount}</p>
        <p className="muted small">{K.exampleNote}</p>
      </div>
      <div className="btn-row">
        <Cta locale={locale} to="choose" label={K.ctaChoose} track="kits_choose" />
        <Cta locale={locale} to="contact" query="purpose=selection" label={K.ctaRequest} kind="btn-outline" track="kits_request" />
      </div>
    </Section>
  );
}

/** Section 8: "How do you value this racquet?" — research and a request for discussion, not a purchase. */
export function Valuation({ locale, dict, series, band = "" }) {
  const V = dict.editorial.valuation;
  return (
    <Section id="valuation" band={band} title={V.title} lead={V.lead}>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <Cta locale={locale} to="contact" query={`purpose=valuation${series ? `&series=${series}` : ""}`} label={V.cta} kind="btn-outline" track={series ? `valuation_${series}` : "valuation"} series={series} />
      </div>
    </Section>
  );
}

/** Section 8: cooperation and exchange of value (barter) — the Founder's text, unchanged. */
export function Exchange({ dict, band = "" }) {
  const X = dict.editorial.exchange;
  return (
    <Section id="exchange" band={band} title={X.title}>
      <p className="lead" style={{ maxWidth: 820 }}>{X.text}</p>
      <Note>{X.note}</Note>
    </Section>
  );
}

/** Section 7: "Your identity. Built on MAXIMUS." */
export function Identity({ locale, dict, band = "", first = false }) {
  const I = dict.editorial.identity;
  return (
    <Section id="identity" first={first} band={band} title={I.title} lead={I.lead}>
      <h3 className="eyebrow">{I.audiencesTitle}</h3>
      <ul className="tags" style={{ marginBottom: 30 }}>{I.audiences.map((a) => <li key={a}>{a}</li>)}</ul>
      <div className="split">
        <div>
          <h3 className="h-3" style={{ marginBottom: 12 }}>{I.pathTitle}</h3>
          <Steps items={I.path} />
        </div>
        <div>
          <h3 className="h-3" style={{ marginBottom: 12 }}>{I.personalisationTitle}</h3>
          <ul className="kicker-list">{I.personalisation.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
          <p className="muted small" style={{ marginTop: 18 }}>{dict.nationalPackage.customBatches}</p>
        </div>
      </div>
      <Note>{I.boundary}</Note>
      <div className="btn-row"><Cta locale={locale} to="contact" purpose="brand" label={I.cta} track="identity_request" /></div>
    </Section>
  );
}

/**
 * Concept elevation of the MAXIMUS Pro Shop: closed cassettes behind glass, the retrieval carriage,
 * the protected delivery hatch and the separate return bay. Numbers refer to the legend below it,
 * so the drawing holds in every language. A concept diagram, not an engineered design.
 */
export function ProShopDiagram({ labels, caption }) {
  const cols = 10, rows = 8, gx = 8, gy = 30, cw = 17, ch = 20, gap = 3, w = 420, h = 252;
  const sel = [6, 3];
  const wallW = cols * (cw + gap) - gap;
  const glassX = gx + wallW + 8;
  const railX = glassX + 18;
  const sx = gx + sel[0] * (cw + gap) + cw / 2;
  const sy = gy + sel[1] * (ch + gap) + ch / 2;
  const carY = sy - 9;
  const hatchX = railX + 30, hatchY = 150, bayY = 192;
  const base = gy + rows * (ch + gap) + 4;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + c * (cw + gap), y = gy + r * (ch + gap), on = c === sel[0] && r === sel[1];
      cells.push(<g key={`${r}-${c}`}><rect x={x} y={y} width={cw} height={ch} rx="2.5" fill={on ? "#b3bd6f" : "#141513"} stroke={on ? "#b3bd6f" : "#30332e"} strokeWidth=".6" /><rect x={x + 3} y={y + ch - 5} width={cw - 6} height="1.4" rx=".7" fill={on ? "#0b0c0b" : "#30332e"} /></g>);
    }
  }
  const num = (x, y, n) => (
    <g key={n}><circle cx={x} cy={y} r="8" fill="#000" stroke="#b3bd6f" strokeWidth=".9" /><text x={x} y={y + 3.6} textAnchor="middle" fontSize="10.5" fontWeight="650" fill="#b3bd6f">{n}</text></g>
  );
  return (
    <figure className="proshop-figure">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption} className="proshop-svg">
        <rect x="0" y="0" width={w} height={h} fill="#000" />
        {cells}
        <line x1={glassX} y1="14" x2={glassX} y2={base + 34} stroke="#86acd4" strokeWidth="1.2" />
        <line x1={railX} y1="14" x2={railX} y2={base + 34} stroke="#5b6156" strokeWidth="2" />
        <rect x={railX - 7} y={carY} width="14" height="18" rx="2" fill="#1d1f1c" stroke="#b3bd6f" strokeWidth=".8" />
        <path d={`M${sx + cw / 2 + 1} ${sy} H${railX - 8}`} stroke="#b3bd6f" strokeWidth=".9" strokeDasharray="2.4 2" />
        <path d={`M${railX + 7} ${carY + 9} C ${railX + 26} ${carY + 30}, ${hatchX - 10} ${hatchY - 30}, ${hatchX + 8} ${hatchY - 2}`} fill="none" stroke="#b3bd6f" strokeWidth=".9" />
        <rect x={hatchX} y={hatchY} width={w - hatchX - 6} height="30" rx="4" fill="#141513" stroke="#b3bd6f" strokeWidth=".9" />
        <rect x={hatchX} y={bayY} width={w - hatchX - 6} height="30" rx="4" fill="#141513" stroke="#5b6156" strokeWidth=".9" />
        <line x1="0" y1={base + 34} x2={w} y2={base + 34} stroke="#2a2d29" strokeWidth=".8" />
        {num(gx + wallW / 2, base + 20, 1)}
        {num(glassX, 9, 2)}
        {num(railX + 16, carY - 4, 3)}
        {num(hatchX + 16, hatchY + 15, 4)}
        {num(hatchX + 16, bayY + 15, 5)}
      </svg>
      <ol className="proshop-legend">{labels.map((t) => <li key={t}>{t}</li>)}</ol>
      <figcaption className="muted small">{caption}</figcaption>
    </figure>
  );
}
