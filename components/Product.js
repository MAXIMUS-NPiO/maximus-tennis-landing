import Link from "next/link";
import { seriesList, precisionClasses, grips } from "../data/products";
import { href } from "../lib/paths";

export function SeriesCards({ locale, dict }) {
  const r = dict.racquets, L = dict.common.labels;
  return (
    <div className="grid-3">
      {seriesList.map((s) => (
        <Link key={s.id} href={href(locale, s.id)} className="card card-link">
          <p className="eyebrow accent">{r.direction[s.direction]}</p>
          <h3>{s.name}</h3>
          <div className="stat" style={{ marginTop: 12 }}><b>{s.headSizeSqIn} {L.sqin}</b><span>{L.headSize} · {s.matrix.length} {L.points}</span></div>
          <span className="arrow">{r.ctaSeries} →</span>
        </Link>
      ))}
    </div>
  );
}

export function PrecisionTable({ dict, compact = false }) {
  const p = dict.precision, L = dict.common.labels, st = dict.common.statuses;
  return (
    <div className="spec-wrap" tabIndex={0}>
      <table className="spec">
        <thead>
          <tr>
            <th>{p.columns.cls}</th><th className="num">{p.columns.weight}</th><th className="num">{p.columns.balance}</th><th className="num">{p.columns.sw}</th><th>{p.columns.stiff}</th>{!compact && <th>{p.columns.qc}</th>}
          </tr>
        </thead>
        <tbody>
          {precisionClasses.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.id}</strong><br /><small className="muted">{p.classes[c.id].name}</small></td>
              <td className="num">±{c.weightG} {L.grams}</td>
              <td className="num">±{c.balanceMm} {L.mm}</td>
              <td className="num">±{c.swingweightKgCm2} {L.kgcm2}</td>
              <td>
                {c.stiffness.kind === "target-tolerance" ? <>±{c.stiffness.valueRA} {L.ra} <small className="muted">({p.stiffTarget})</small></> : <small>{p.stiffExact}</small>}
                <br /><span className="status target" style={{ marginTop: 6 }}>{st.target}</span>
              </td>
              {!compact && <td><small>{p.classes[c.id].qc}</small></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Full weight matrix. A series without balance data gets one explanation above the grid, not per-cell notes. */
export function WeightMatrix({ series, dict }) {
  const L = dict.common.labels;
  const hasBalance = series.matrix.some((p) => p.balance !== null);
  return (
    <div className={`matrix ${hasBalance ? "" : "weights-only"}`} role="list" aria-label={`${series.short} ${dict.seriesPage.matrixTitle}`}>
      {series.matrix.map((p) => (
        <div key={p.weight} role="listitem">
          <b>{p.weight} {L.grams}</b>
          {hasBalance && <span>{p.balance} {L.mm}</span>}
        </div>
      ))}
    </div>
  );
}

export function GripRow({ dict, emphasise = true }) {
  const g = dict.grip;
  return (
    <div className="grip-row">
      {grips.map((x) => (
        <div key={x.id} className={emphasise && (x.id === "L6" || x.id === "L7") ? "emph" : ""}>
          <b>{x.id}</b>
          <span>{x.inches}{x.fraction}″</span>
          {emphasise && (x.id === "L6" || x.id === "L7") && <em>{g.emph}</em>}
        </div>
      ))}
    </div>
  );
}
