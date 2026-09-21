import { grips } from "../data/products";

/**
 * Schematic visuals. They illustrate definitions (tolerance bands, nominal grip designations);
 * they are labelled as schematics and never represent measurements or RA values.
 */
export function StiffnessSchematic({ labels, caption, schematicLabel }) {
  const rows = [
    { key: "p25", id: "P2.5", half: 110 },
    { key: "p15", id: "P1.5", half: 55 },
    { key: "p05", id: "P0.5", half: 0 },
  ];
  const cx = 300;
  return (
    <figure className="schematic">
      <svg viewBox="0 0 520 220" role="img" aria-labelledby="stiff-title stiff-desc" preserveAspectRatio="xMidYMid meet">
        <title id="stiff-title">{schematicLabel}</title>
        <desc id="stiff-desc">{caption}</desc>
        <line x1={cx} y1="22" x2={cx} y2="212" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 4" />
        <text x={cx} y="15" textAnchor="middle" fontSize="13" fill="var(--ink-2)">RA</text>
        {rows.map((r, i) => {
          const y = 34 + i * 62;
          return (
            <g key={r.key}>
              <text x="12" y={y + 21} fontSize="16" fontWeight="700" fill="var(--ink)">{r.id}</text>
              <line x1="80" y1={y + 15} x2="500" y2={y + 15} stroke="var(--line-strong)" strokeWidth="1" />
              {r.half > 0 ? (
                <rect x={cx - r.half} y={y} width={r.half * 2} height="30" rx="3" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="1.5" />
              ) : (
                <rect x={cx - 3} y={y} width="6" height="30" rx="2" fill="var(--accent)" />
              )}
            </g>
          );
        })}
      </svg>
      <dl className="schematic-legend">
        {rows.map((r) => (
          <div key={r.key}><dt>{r.id}</dt><dd>{labels[r.key]}</dd></div>
        ))}
        <div><dt>- - -</dt><dd>{labels.target}</dd></div>
      </dl>
      <figcaption><span className="schematic-tag">{schematicLabel}</span> {caption}</figcaption>
    </figure>
  );
}

export function GripScale({ caption, schematicLabel }) {
  // Nominal designations are handle perimeters: 4″ … 4⅞″ in ⅛″ steps (+3.125 % per step).
  return (
    <figure className="schematic grip-scale">
      <ol className="grip-dots" aria-label={schematicLabel}>
        {grips.map((g, i) => (
          <li key={g.id} className={i >= 6 ? "ext" : ""}>
            <span className="dot" style={{ "--k": 1 + i * 0.03125 }} aria-hidden="true" />
            <b>{g.id}</b>
            <span className="mono">{g.inches}{g.fraction}″</span>
          </li>
        ))}
      </ol>
      <figcaption><span className="schematic-tag">{schematicLabel}</span> {caption}</figcaption>
    </figure>
  );
}
