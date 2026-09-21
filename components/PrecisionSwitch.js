"use client";
import { useId, useRef, useState } from "react";
import { precisionClasses } from "../data/products";

/**
 * Interactive precision-class switch (P2.5 / P1.5 / P0.5). A proper tablist: arrow keys move
 * between classes, Home/End jump, the panel always shows the four controlled parameters.
 * Stiffness is rendered as a manufacturing target; P0.5 is never presented as zero error.
 */
export default function PrecisionSwitch({ dict, initial = "P2.5" }) {
  const P = dict.precision, L = dict.common.labels, S = dict.common.statuses;
  const [cur, setCur] = useState(initial);
  const id = useId();
  const tabsRef = useRef(null);
  const ids = precisionClasses.map((c) => c.id);
  const c = precisionClasses.find((x) => x.id === cur) || precisionClasses[0];

  const onKey = (e) => {
    const i = ids.indexOf(cur);
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = ids[(i + 1) % ids.length];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = ids[(i - 1 + ids.length) % ids.length];
    if (e.key === "Home") next = ids[0];
    if (e.key === "End") next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    setCur(next);
    const btn = tabsRef.current && tabsRef.current.querySelector(`[data-cls="${next}"]`);
    if (btn) btn.focus();
  };

  const stiff = c.stiffness.kind === "target-tolerance" ? `±${c.stiffness.valueRA} ${L.ra}` : null;

  return (
    <div className="pswitch">
      <div className="pswitch-tabs" role="tablist" aria-label={P.switch.label} ref={tabsRef} onKeyDown={onKey}>
        {precisionClasses.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            data-cls={x.id}
            id={`${id}-tab-${x.id}`}
            aria-selected={x.id === cur}
            aria-controls={`${id}-panel`}
            tabIndex={x.id === cur ? 0 : -1}
            onClick={() => setCur(x.id)}
          >
            <b>{x.id}</b>
            <small>{P.classes[x.id].name}</small>
          </button>
        ))}
      </div>
      <div className="pswitch-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${cur}`}>
        <p className="eyebrow" style={{ marginBottom: 14 }}>{P.switch.panelLabel} {c.id} — {P.classes[c.id].name}</p>
        <div className="pparams">
          <div><span>{L.weight}</span><b>±{c.weightG} {L.grams}</b></div>
          <div><span>{L.balance}</span><b>±{c.balanceMm} {L.mm}</b></div>
          <div><span>{L.swingweight}</span><b>±{c.swingweightKgCm2} {L.kgcm2}</b></div>
          <div>
            <span>{L.stiffness}</span>
            {stiff ? <b>{stiff}</b> : <b className="text">{P.stiffExact}</b>}
            <small>{stiff ? P.stiffTarget : P.switch.protocolNote} · <span className="status target" style={{ marginTop: 4 }}>{S.target}</span></small>
          </div>
        </div>
        <p className="pswitch-qc"><strong>{P.switch.qcLabel}:</strong> {P.classes[c.id].qc}</p>
      </div>
    </div>
  );
}
