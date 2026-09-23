"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { seriesList, series as SERIES, productDataVersion } from "../data/products";
import { GPS_RULES_VERSION, GPS_ROLES, SPORTS, LEVELS, OBJECTIVES, STYLES, GRIP_IDS, YES_NO, gpsDirections, validateGpsProfile } from "../lib/intake/schema";
import { STORAGE_KEYS, readJson, writeJson, remove, pick } from "../lib/client/storage";
import { href } from "../lib/paths";
import { track } from "../lib/analytics";
import LeadForm from "./LeadForm";

/**
 * MAXIMUS GPS — guided equipment profile. Rules version gps-direction-v2: the only rule is a
 * transparent mapping from a stated objective (control / power / spin) to the series whose DECLARED
 * playing direction matches — for tennis only. No fitting thresholds, match percentages or
 * accuracy claims. The profile is submitted directly for expert review.
 * Browser storage keeps enum answers only; free text and the age band stay in memory.
 */
export { GPS_RULES_VERSION };

const MAX_OBJECTIVES = 3;
const PERSIST = {
  role: (x) => GPS_ROLES.includes(x),
  sport: (x) => SPORTS.includes(x),
  experience: (x) => LEVELS.includes(x),
  objectives: (x) => Array.isArray(x) && x.length <= MAX_OBJECTIVES && x.every((o) => OBJECTIVES.includes(o)),
  style: (x) => STYLES.includes(x),
  grip: (x) => GRIP_IDS.includes(x),
  coach: (x) => YES_NO.includes(x),
};
const CONTACT_ROLE = { player: "player", parent: "parent", coach: "coach", club: "club", other: "other" };

function Choice({ name, options, value, onChange, multi = false, three = false, labelledBy, max }) {
  return (
    <div className={`choice ${three ? "three" : ""}`} role={multi ? "group" : "radiogroup"} aria-labelledby={labelledBy}>
      {Object.keys(options).map((o) => {
        const checked = multi ? value.includes(o) : value === o;
        return (
          <label key={o}>
            <input type={multi ? "checkbox" : "radio"} name={name} value={o} checked={checked} disabled={multi && !checked && max && value.length >= max} onChange={() => onChange(o)} />
            <span>{options[o]}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function GpsWizard({ locale, dict }) {
  const G = dict.gps;
  const L = dict.common.labels;
  const [a, setA] = useState({ objectives: [] });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const headingRef = useRef(null);
  const navRef = useRef(false);

  useEffect(() => {
    const s = readJson(STORAGE_KEYS.gps);
    if (s && s.v === 2 && s.a) {
      const restored = { objectives: [], ...pick(s.a, PERSIST) };
      setA(restored);
      if (Number.isInteger(s.step) && s.step >= 0) setStep(s.step);
      if (s.done === true && restored.role && restored.sport && restored.experience && restored.objectives.length && restored.coach) setDone(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeJson(STORAGE_KEYS.gps, { v: 2, step, done, a: pick(a, PERSIST) });
  }, [a, step, done, ready]);

  const steps = useMemo(() => {
    const base = ["role", "sport", "experience", "objectives", "style", "equipment", "preference", "coach"];
    if (a.role === "parent") base.push("ageBand");
    base.push("review");
    return base;
  }, [a.role]);
  const safeStep = Math.min(step, steps.length - 1);
  const cur = steps[safeStep];

  useEffect(() => {
    if (navRef.current && headingRef.current) headingRef.current.focus();
    navRef.current = false;
  }, [safeStep, done]);

  const begin = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("gps_started", { locale, step: "role" });
    }
  };
  const set = (k, val) => {
    begin();
    setA((x) => ({ ...x, [k]: val }));
  };
  const toggleObj = (o) => {
    begin();
    setA((x) => {
      const has = x.objectives.includes(o);
      if (!has && x.objectives.length >= MAX_OBJECTIVES) return x;
      return { ...x, objectives: has ? x.objectives.filter((y) => y !== o) : [...x.objectives, o] };
    });
  };
  const canNext = () => {
    if (cur === "role") return !!a.role;
    if (cur === "sport") return !!a.sport;
    if (cur === "experience") return !!a.experience;
    if (cur === "objectives") return a.objectives.length > 0;
    if (cur === "coach") return !!a.coach;
    return true;
  };
  const go = (i) => {
    navRef.current = true;
    setStep(i);
  };
  const next = () => go(Math.min(safeStep + 1, steps.length - 1));
  const back = () => go(Math.max(safeStep - 1, 0));
  const finish = () => {
    navRef.current = true;
    setDone(true);
    track("gps_completed", { locale, step: "review" });
  };
  const restart = () => {
    remove(STORAGE_KEYS.gps);
    setA({ objectives: [] });
    setDone(false);
    go(0);
  };

  const profile = {
    role: a.role,
    sport: a.sport,
    experience: a.experience,
    objectives: a.objectives,
    style: a.style,
    equipment: a.equipment,
    grip: a.grip,
    preference: a.preference,
    coach: a.coach,
    ...(a.role === "parent" && a.ageBand ? { ageBand: a.ageBand } : {}),
  };
  const directions = gpsDirections(profile).map((id) => SERIES[id]);
  const answers = [
    [G.steps.role, a.role ? G.roles[a.role] : ""],
    [G.steps.sport, a.sport ? G.sports[a.sport] : ""],
    [G.steps.experience, a.experience ? G.experience[a.experience] : ""],
    [G.steps.objectives, a.objectives.map((o) => G.objectives[o]).join(", ")],
    [G.steps.style, a.style ? G.styles[a.style] : ""],
    [G.steps.equipment, a.equipment || ""],
    [G.q.grip, a.grip || ""],
    [G.steps.preference, a.preference || ""],
    [G.steps.coach, a.coach ? L[a.coach] : ""],
    [G.q.ageBand, a.role === "parent" && a.ageBand ? G.ageBands[a.ageBand] : ""],
  ].filter(([, v]) => v);

  const title = (text) => (
    <h2 className="h-3 step-title" id="gps-step-title" tabIndex={-1} ref={headingRef}>{text}</h2>
  );

  if (done) {
    const valid = validateGpsProfile(profile).ok;
    return (
      <div className="stack-lg">
        <div className="panel" data-gps="result">
          <p className="eyebrow">{G.output.title}</p>
          {title(G.output.status)}
          <p style={{ marginTop: 10 }}>{G.output.statusP}</p>
          <dl className="cfg-summary" style={{ marginTop: 16 }}>
            {answers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div><dt>{G.rulesVersion}</dt><dd className="mono">{GPS_RULES_VERSION} · {G.dataVersion} {productDataVersion}</dd></div>
          </dl>
          <hr />
          <p className="eyebrow">{G.output.directionsTitle}</p>
          {a.sport !== "tennis" ? (
            <p className="note" data-gps-other-sport="true">{G.output.otherSport}</p>
          ) : directions.length > 0 ? (
            <>
              <p className="muted small">{G.output.directionsP}</p>
              <div className="grid-3" style={{ marginTop: 12 }}>
                {directions.map((s) => (
                  <div key={s.id} className="card">
                    <h3>{s.name}</h3>
                    <p>{s.headSizeSqIn} {L.sqin} · {dict.racquets.direction[s.direction]}</p>
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      <Link className="btn-outline" href={`${href(locale, "build")}?series=${s.id}${a.grip ? `&grip=${a.grip}` : ""}&from=gps`} onClick={() => track("primary_cta_click", { cta: "gps_configure", series: s.id, locale })}>{G.output.configure} {s.short}</Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="note">{G.output.noDirection}</p>
          )}
          {a.objectives.includes("training") && <p className="note" style={{ marginTop: 12 }}>{G.output.trainingHint}</p>}
          {a.objectives.includes("team") && <p className="note" style={{ marginTop: 12 }}>{G.output.teamHint}</p>}
          <div className="btn-row">
            <button type="button" className="btn-outline" onClick={() => { setDone(false); go(steps.length - 1); }}>{L.edit}</button>
            <button type="button" className="btn-ghost" onClick={restart}>{L.restart}</button>
          </div>
        </div>
        <div className="panel">
          <h2 className="h-3">{G.output.next1}</h2>
          <p className="muted" style={{ marginTop: 8 }}>{G.output.sendP}</p>
          {!valid && <p className="note red">{G.output.incomplete}</p>}
          <div style={{ marginTop: 16 }}>
            <LeadForm dict={dict} locale={locale} purpose="gps" profile={profile} context={{ from: "gps" }} prefill={{ role: CONTACT_ROLE[a.role] }} submitLabel={G.output.next1} series={directions.length === 1 ? directions[0].id : undefined} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" data-gps="wizard">
      <ol className="stepper" aria-label={G.title}>
        {steps.map((k, i) => (
          <li key={k}>
            {i < safeStep ? (
              <button type="button" className="done" onClick={() => go(i)}>{String(i + 1).padStart(2, "0")} {G.steps[k]}</button>
            ) : (
              <span className={i === safeStep ? "on" : ""} aria-current={i === safeStep ? "step" : undefined}>{String(i + 1).padStart(2, "0")} {G.steps[k]}</span>
            )}
          </li>
        ))}
      </ol>
      {cur === "role" && <>{title(G.q.role)}<Choice name="role" labelledBy="gps-step-title" options={G.roles} value={a.role} onChange={(o) => set("role", o)} /></>}
      {cur === "sport" && <>{title(G.q.sport)}<Choice name="sport" labelledBy="gps-step-title" options={G.sports} value={a.sport} onChange={(o) => set("sport", o)} three /><p className="note" style={{ marginTop: 14 }}>{G.sportNote}</p></>}
      {cur === "experience" && <>{title(G.q.experience)}<Choice name="experience" labelledBy="gps-step-title" options={G.experience} value={a.experience} onChange={(o) => set("experience", o)} three /></>}
      {cur === "objectives" && <>{title(G.q.objectives)}<Choice name="objectives" labelledBy="gps-step-title" options={G.objectives} value={a.objectives} onChange={toggleObj} multi three max={MAX_OBJECTIVES} /></>}
      {cur === "style" && <>{title(G.q.style)}<Choice name="style" labelledBy="gps-step-title" options={G.styles} value={a.style} onChange={(o) => set("style", o)} three /></>}
      {cur === "equipment" && (
        <>
          {title(G.q.equipment)}
          <div className="field">
            <label htmlFor="g-eq">{G.steps.equipment} <span className="opt">({L.optional})</span></label>
            <span className="hint" id="g-eq-hint">{G.q.equipmentHint} {G.notStored}</span>
            <input id="g-eq" type="text" maxLength={200} autoComplete="off" value={a.equipment || ""} onChange={(e) => set("equipment", e.target.value)} aria-describedby="g-eq-hint" />
          </div>
        </>
      )}
      {cur === "preference" && (
        <>
          {title(G.q.preference)}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="g-grip">{G.q.grip} <span className="opt">({L.optional})</span></label>
              <select id="g-grip" value={a.grip || ""} onChange={(e) => set("grip", e.target.value || undefined)}>
                <option value="">{L.unknown}</option>
                {GRIP_IDS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="g-pref">{G.steps.preference} <span className="opt">({L.optional})</span></label>
              <input id="g-pref" type="text" maxLength={200} autoComplete="off" value={a.preference || ""} onChange={(e) => set("preference", e.target.value)} aria-describedby="g-pref-hint" />
              <span className="hint" id="g-pref-hint">{G.notStored}</span>
            </div>
          </div>
        </>
      )}
      {cur === "coach" && <>{title(G.q.coach)}<Choice name="coach" labelledBy="gps-step-title" options={{ yes: L.yes, no: L.no, unknown: L.unknown }} value={a.coach} onChange={(o) => set("coach", o)} three /></>}
      {cur === "ageBand" && <>{title(G.q.ageBand)}<Choice name="ageBand" labelledBy="gps-step-title" options={G.ageBands} value={a.ageBand} onChange={(o) => set("ageBand", o)} three /><p className="muted small" style={{ marginTop: 10 }}>{G.ageNote}</p></>}
      {cur === "review" && (
        <>
          {title(L.review)}
          <dl className="cfg-summary" style={{ marginTop: 14 }}>
            {answers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="muted small" style={{ marginTop: 10 }}>{G.honesty}</p>
        </>
      )}
      <div className="btn-row">
        {safeStep > 0 && <button type="button" className="btn-outline" onClick={back}>{L.back}</button>}
        {cur !== "review" ? (
          <button type="button" className="btn" disabled={!canNext()} onClick={next}>{L.next} <span aria-hidden="true">→</span></button>
        ) : (
          <button type="button" className="btn" onClick={finish}>{G.output.show} <span aria-hidden="true">→</span></button>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>{G.privacy}</p>
    </div>
  );
}
