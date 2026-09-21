"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { seriesList, productDataVersion } from "../data/products";
import { href } from "../lib/paths";
import { loadState, saveState, makeReference, formatSummary } from "../lib/requests";
import { track } from "../lib/analytics";

/**
 * MAXIMUS GPS — guided equipment profile.
 * RULES VERSION gps-direction-v1: the only rule is a transparent mapping from a stated
 * objective (control / power / spin) to the series whose DECLARED playing direction matches.
 * No fitting thresholds, match percentages or product matches are produced: every profile is
 * routed for expert review. Non-sensitive progress is kept in sessionStorage only.
 */
export const GPS_RULES_VERSION = "gps-direction-v1";
const KEY = "mx.gps";
const MAX_OBJECTIVES = 3;

export default function GpsWizard({ locale, dict }) {
  const G = dict.gps, L = dict.common.labels;
  const [a, setA] = useState({ objectives: [] });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [ref, setRef] = useState(null);

  useEffect(() => {
    const s = loadState(KEY);
    if (s && s.answers) { setA(s.answers); setStep(s.step || 0); }
  }, []);
  useEffect(() => { saveState(KEY, { answers: a, step }); }, [a, step]);

  const steps = useMemo(() => {
    const base = ["role", "sport", "experience", "objectives", "style", "equipment", "preference", "coach"];
    if (a.role === "parent") base.push("ageBand");
    base.push("review");
    return base;
  }, [a.role]);
  const cur = steps[step];
  const set = (k, val) => setA((x) => ({ ...x, [k]: val }));
  const toggleObj = (o) => setA((x) => {
    const has = x.objectives.includes(o);
    if (!has && x.objectives.length >= MAX_OBJECTIVES) return x;
    return { ...x, objectives: has ? x.objectives.filter((y) => y !== o) : [...x.objectives, o] };
  });
  const canNext = () => {
    if (cur === "role") return !!a.role;
    if (cur === "sport") return !!a.sport;
    if (cur === "experience") return !!a.experience;
    if (cur === "objectives") return a.objectives.length > 0;
    if (cur === "coach") return !!a.coach;
    if (cur === "ageBand") return !!a.ageBand;
    return true;
  };
  const next = () => { if (step === 0) track("gps_started"); setStep((s) => Math.min(s + 1, steps.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const finish = () => { setRef(makeReference("gps")); setDone(true); track("gps_completed", { rules: GPS_RULES_VERSION }); };
  const restart = () => { setA({ objectives: [] }); setStep(0); setDone(false); setRef(null); };

  const directions = seriesList.filter((s) => a.objectives.includes(s.direction));
  const entries = [
    [G.steps.role, a.role ? G.roles[a.role] : ""],
    [G.steps.sport, a.sport ? G.sports[a.sport] : ""],
    [G.steps.experience, a.experience ? G.experience[a.experience] : ""],
    [G.steps.objectives, a.objectives.map((o) => G.objectives[o])],
    [G.steps.style, a.style ? G.styles[a.style] : ""],
    [G.steps.equipment, a.equipment],
    [G.q.grip, a.grip],
    [G.steps.preference, a.preference],
    [G.steps.coach, a.coach ? L[a.coach] : ""],
    [G.q.ageBand, a.ageBand ? G.ageBands[a.ageBand] : ""],
    [G.output.directionsTitle, directions.map((s) => s.name)],
    [G.output.status, G.output.status],
    [G.rulesVersion, GPS_RULES_VERSION],
    [G.dataVersion, productDataVersion],
  ];
  const handoff = () => {
    saveState("mx.gps.handoff", { text: formatSummary(ref, G.output.title, entries) });
    saveState("mx.cfg.seed", { series: directions[0] ? directions[0].id : "", grip: a.grip || "" });
  };

  const Choice = ({ name, options, value, onChange, multi = false, three = false }) => (
    <div className={`choice ${three ? "three" : ""}`} role={multi ? "group" : "radiogroup"}>
      {Object.keys(options).map((o) => (
        <label key={o}>
          <input type={multi ? "checkbox" : "radio"} name={name} value={o} checked={multi ? value.includes(o) : value === o} onChange={() => onChange(o)} />
          {options[o]}
        </label>
      ))}
    </div>
  );

  if (done) {
    return (
      <div className="stack-lg">
        <div className="panel">
          <p className="eyebrow">{G.output.title}</p>
          <span className="status planned">{G.output.status}</span>
          <p style={{ marginTop: 14 }}>{G.output.statusP}</p>
          <hr />
          <p className="eyebrow">{G.output.directionsTitle}</p>
          <p className="muted" style={{ fontSize: 15 }}>{G.output.directionsP}</p>
          {directions.length > 0 ? (
            <div className="grid-3" style={{ marginTop: 12 }}>
              {directions.map((s) => (
                <Link key={s.id} href={href(locale, s.id)} className="card card-link"><h3>{s.name}</h3><p>{s.headSizeSqIn} {L.sqin} · {dict.racquets.direction[s.direction]}</p><span className="arrow">{dict.racquets.ctaSeries} →</span></Link>
              ))}
            </div>
          ) : <p className="note">{dict.racquets.lead}</p>}
          {a.objectives.includes("training") && <p className="note" style={{ marginTop: 12 }}>{G.output.trainingHint}</p>}
          {a.objectives.includes("team") && <p className="note" style={{ marginTop: 12 }}>{G.output.teamHint}</p>}
          <hr />
          <div className="summary"><pre>{formatSummary(ref, G.output.title, entries)}</pre></div>
          <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>{G.output.audit}</p>
          <div className="btn-row">
            <Link className="btn" href={`${href(locale, "contact")}?purpose=fitting`} onClick={handoff}>{G.output.next1} <span aria-hidden="true">→</span></Link>
            <Link className="btn-outline" href={href(locale, "build")} onClick={handoff}>{G.output.next2}</Link>
            <button type="button" className="btn-ghost" onClick={restart}>{L.restart}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="stepper" aria-label={G.title}>
        {steps.map((s, i) => <span key={s} className={i === step ? "on" : i < step ? "done" : ""}>{String(i + 1).padStart(2, "0")} {G.steps[s]}</span>)}
      </div>
      {cur === "role" && <><h2 className="h-3">{G.q.role}</h2><Choice name="role" options={G.roles} value={a.role} onChange={(o) => set("role", o)} /></>}
      {cur === "sport" && <><h2 className="h-3">{G.q.sport}</h2><Choice name="sport" options={G.sports} value={a.sport} onChange={(o) => set("sport", o)} three /><p className="note" style={{ marginTop: 14 }}>{G.sportNote}</p></>}
      {cur === "experience" && <><h2 className="h-3">{G.q.experience}</h2><Choice name="experience" options={G.experience} value={a.experience} onChange={(o) => set("experience", o)} three /></>}
      {cur === "objectives" && <><h2 className="h-3">{G.q.objectives}</h2><Choice name="objectives" options={G.objectives} value={a.objectives} onChange={toggleObj} multi three /></>}
      {cur === "style" && <><h2 className="h-3">{G.q.style}</h2><Choice name="style" options={G.styles} value={a.style} onChange={(o) => set("style", o)} three /></>}
      {cur === "equipment" && (
        <div className="field"><label htmlFor="g-eq">{G.q.equipment} <span className="muted">({L.optional})</span></label><input id="g-eq" type="text" value={a.equipment || ""} onChange={(e) => set("equipment", e.target.value)} /><span className="hint">{G.q.equipmentHint}</span></div>
      )}
      {cur === "preference" && (
        <div className="grid-2">
          <div className="field"><label htmlFor="g-grip">{G.q.grip} <span className="muted">({L.optional})</span></label>
            <select id="g-grip" value={a.grip || ""} onChange={(e) => set("grip", e.target.value)}><option value="">{L.unknown}</option>{["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"].map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
          <div className="field"><label htmlFor="g-pref">{G.q.preference} <span className="muted">({L.optional})</span></label><input id="g-pref" type="text" value={a.preference || ""} onChange={(e) => set("preference", e.target.value)} /></div>
        </div>
      )}
      {cur === "coach" && <><h2 className="h-3">{G.q.coach}</h2><Choice name="coach" options={{ yes: L.yes, no: L.no, unknown: L.unknown }} value={a.coach} onChange={(o) => set("coach", o)} three /></>}
      {cur === "ageBand" && <><h2 className="h-3">{G.q.ageBand}</h2><Choice name="ageBand" options={G.ageBands} value={a.ageBand} onChange={(o) => set("ageBand", o)} three /></>}
      {cur === "review" && (
        <>
          <h2 className="h-3">{L.review}</h2>
          <div className="summary" style={{ marginTop: 14 }}><pre>{formatSummary("—", G.output.title, entries.slice(0, 10))}</pre></div>
          <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>{G.honesty}</p>
        </>
      )}
      <div className="btn-row">
        {step > 0 && <button type="button" className="btn-outline" onClick={back}>{L.back}</button>}
        {cur !== "review" ? <button type="button" className="btn" disabled={!canNext()} onClick={next}>{L.next} <span aria-hidden="true">→</span></button> : <button type="button" className="btn" onClick={finish}>{G.output.title} <span aria-hidden="true">→</span></button>}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>{G.privacy}</p>
    </div>
  );
}
