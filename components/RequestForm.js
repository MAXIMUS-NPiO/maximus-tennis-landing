"use client";
import { useEffect, useMemo, useState } from "react";
import { requestPurposes } from "../data/site";
import { seriesList } from "../data/products";
import { makeReference, loadState, clearState } from "../lib/requests";
import ComposePanel from "./ComposePanel";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Purpose-specific fields: [key, type, options?, required?] */
const EXTRA = {
  product: [["seriesInterest", "series"], ["quantity", "number"]],
  fitting: [["city", "text"], ["coachInvolved", "yesno"], ["timing", "text"]],
  technical: [["targets", "textarea", null, true], ["limits", "textarea"], ["use", "text", null, true], ["tradeoffs", "textarea"]],
  coach: [["players", "number"], ["interests", "interests"]],
  club: [["players", "number"], ["interests", "interests"]],
  distribution: [["territory", "text", null, true], ["channels", "textarea"]],
  brand: [["audience", "text"], ["proposal", "textarea", null, true]],
  family: [["players", "number"], ["ageBand", "ageBand"], ["interests", "interests"]],
  institutional: [["scope", "textarea", null, true]],
  strategic: [["interestArea", "strategicAreas"]],
  owner: [["productRef", "text"], ["requestType", "ownerTypes"]],
  network: [["seeking", "textarea", null, true]],
  general: [],
};
const ORG_REQUIRED = new Set(["club", "distribution", "institutional", "strategic"]);
const AGE_BANDS = ["u10", "u14", "u18", "adult"];

export default function RequestForm({ dict, initialPurpose, fixedPurpose, prefillKey }) {
  const F = dict.form, L = dict.common.labels, G = dict.gps;
  const purposes = fixedPurpose ? [fixedPurpose] : requestPurposes;
  const start = fixedPurpose || (requestPurposes.includes(initialPurpose) ? initialPurpose : "general");
  const [purpose, setPurpose] = useState(start);
  const [v, setV] = useState({ interests: [] });
  const [errors, setErrors] = useState({});
  const [prepared, setPrepared] = useState(null);

  useEffect(() => {
    if (!prefillKey) return;
    const s = loadState(prefillKey);
    if (s && s.text) {
      setV((cur) => ({ ...cur, message: cur.message ? cur.message : s.text }));
      clearState(prefillKey);
    }
  }, [prefillKey]);

  const set = (k, val) => { setV((cur) => ({ ...cur, [k]: val })); setPrepared(null); };
  const toggle = (k, val) => setV((cur) => { const arr = cur[k] || []; return { ...cur, [k]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] }; });
  const extra = EXTRA[purpose] || [];

  const validate = () => {
    const e = {};
    if (!v.name) e.name = F.errors.required;
    if (!v.email || !EMAIL.test(v.email)) e.email = F.errors.email;
    if (!v.role) e.role = F.errors.required;
    if (!v.country) e.country = F.errors.required;
    if (ORG_REQUIRED.has(purpose) && !v.organisation) e.organisation = F.errors.required;
    if (purpose === "general" && !v.message) e.message = F.errors.required;
    for (const [k, type, , req] of extra) {
      if (req && !v[k]) e[k] = F.errors.required;
      if (type === "number" && v[k] && Number.isNaN(Number(v[k]))) e[k] = F.errors.number;
    }
    if (!v.consent) e.consent = F.errors.consent;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const entries = useMemo(() => {
    const label = (k) => F.fields[k] || k;
    const out = [[F.purposeLabel, F.purposes[purpose]], [label("name"), v.name], [label("email"), v.email], [label("role"), v.role ? F.roles[v.role] : ""], [label("country"), v.country], [label("organisation"), v.organisation]];
    for (const [k, type, opts] of extra) {
      let val = v[k];
      if (type === "yesno") val = val ? L[val] : "";
      if (type === "interests") val = (val || []).map((x) => F.interestOptions[x]);
      if (type === "ageBand") val = val ? G.ageBands[val] : "";
      if (type === "strategicAreas") val = val ? F.strategicAreas[val] : "";
      if (type === "ownerTypes") val = val ? F.ownerTypes[val] : "";
      if (type === "series") val = val ? val.toUpperCase() : "";
      out.push([label(k), val]);
    }
    out.push([label("message"), v.message]);
    return out;
  }, [v, purpose, extra, F, L, G]);

  const submit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setPrepared(makeReference(purpose));
  };

  const field = (k, type, opts, req) => {
    const id = `f-${k}`;
    const err = errors[k];
    const common = { id, name: k, "aria-invalid": err ? "true" : undefined, "aria-describedby": err ? `${id}-err` : undefined };
    let control;
    if (type === "textarea") control = <textarea {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    else if (type === "number") control = <input {...common} type="number" min="1" inputMode="numeric" value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    else if (type === "yesno") control = (
      <select {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{L.select}</option><option value="yes">{L.yes}</option><option value="no">{L.no}</option>
      </select>
    );
    else if (type === "series") control = (
      <select {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{L.select}</option>{seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    );
    else if (type === "ageBand") control = (
      <select {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{L.select}</option>{AGE_BANDS.map((b) => <option key={b} value={b}>{G.ageBands[b]}</option>)}
      </select>
    );
    else if (type === "strategicAreas" || type === "ownerTypes") {
      const map = F[type];
      control = (
        <select {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)}>
          <option value="">{L.select}</option>{Object.keys(map).map((o) => <option key={o} value={o}>{map[o]}</option>)}
        </select>
      );
    }
    else if (type === "interests") control = (
      <div className="choice three">
        {Object.keys(F.interestOptions).map((o) => (
          <label key={o}><input type="checkbox" checked={(v[k] || []).includes(o)} onChange={() => toggle(k, o)} /> {F.interestOptions[o]}</label>
        ))}
      </div>
    );
    else control = <input {...common} type="text" value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    return (
      <div className="field" key={k}>
        <label htmlFor={id}>{F.fields[k]} {req ? "" : <span className="muted">({L.optional})</span>}</label>
        {control}
        {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
      </div>
    );
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {!fixedPurpose && (
        <div className="field">
          <label htmlFor="f-purpose">{F.purposeLabel}</label>
          <select id="f-purpose" value={purpose} onChange={(e) => { setPurpose(e.target.value); setPrepared(null); setErrors({}); }}>
            {purposes.map((p) => <option key={p} value={p}>{F.purposes[p]}</option>)}
          </select>
        </div>
      )}
      <div className="grid-2">
        {field("name", "text", null, true)}
        {field("email", "email", null, true)}
        <div className="field">
          <label htmlFor="f-role">{F.fields.role}</label>
          <select id="f-role" value={v.role || ""} aria-invalid={errors.role ? "true" : undefined} onChange={(e) => set("role", e.target.value)}>
            <option value="">{L.select}</option>{Object.keys(F.roles).map((r) => <option key={r} value={r}>{F.roles[r]}</option>)}
          </select>
          {errors.role && <span className="err" role="alert">{errors.role}</span>}
        </div>
        {field("country", "text", null, true)}
        {field("organisation", "text", null, ORG_REQUIRED.has(purpose))}
      </div>
      {extra.map(([k, type, opts, req]) => field(k, type, opts, req))}
      {field("message", "textarea", null, purpose === "general")}
      <label className="check">
        <input type="checkbox" checked={!!v.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={errors.consent ? "true" : undefined} />
        <span>{F.fields.consent}{errors.consent && <><br /><span className="err" role="alert">{errors.consent}</span></>}</span>
      </label>
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button type="submit" className="btn">{F.review} <span aria-hidden="true">→</span></button>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>{F.routeNote} {dict.common.truth.requestNotOrder}</p>
      {prepared && <ComposePanel reference={prepared} title={`${F.subject}: ${F.purposes[purpose]}`} entries={entries} dict={dict} />}
    </form>
  );
}
