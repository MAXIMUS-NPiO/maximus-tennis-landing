"use client";
import { useEffect, useMemo, useState } from "react";
import { seriesList, precisionClasses, grips, balanceFor, productDataVersion } from "../data/products";
import { loadState, saveState, makeReference } from "../lib/requests";
import { track } from "../lib/analytics";
import ComposePanel from "./ComposePanel";

const KEY = "mx.cfg";
const STEPS = ["series", "cls", "weight", "grip", "targets", "personal", "set", "use", "review"];
const LATIN = /^[A-Za-z0-9 .'\-]{1,24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Configurator — produces a configuration REQUEST with a unique reference. It never invents an
 * SKU, price, delivery date, stock position or measured certificate. Listed weights come from the
 * series matrix; anything else is a requested custom target. Engraving text and identity fields
 * are never written to browser storage.
 */
export default function Configurator({ dict }) {
  const B = dict.build, L = dict.common.labels, F = dict.form, ST = dict.common.statuses;
  const [c, setC] = useState({ mode: "listed", set: "individual", quantity: 1, ptype: "none" });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [ref, setRef] = useState(null);

  useEffect(() => {
    const seed = loadState("mx.cfg.seed");
    const saved = loadState(KEY);
    setC((cur) => ({ ...cur, ...(saved || {}), ...(seed && seed.series ? { series: seed.series } : {}), ...(seed && seed.grip ? { grip: seed.grip } : {}) }));
  }, []);
  useEffect(() => {
    const { engraving, name, email, ...safe } = c; // never persist identity or engraving text
    saveState(KEY, safe);
  }, [c]);

  const series = seriesList.find((s) => s.id === c.series);
  const cur = STEPS[step];
  const set = (k, val) => { setC((x) => ({ ...x, [k]: val })); setRef(null); };
  const modelledBalance = series && c.mode === "listed" && c.weight ? balanceFor(series.id, c.weight) : null;
  const engravingOk = !c.engraving || LATIN.test(c.engraving);
  const engravingNonLatin = c.engraving && !LATIN.test(c.engraving);

  const canNext = () => {
    if (cur === "series") return !!series;
    if (cur === "cls") return !!c.cls;
    if (cur === "weight") return c.mode === "listed" ? !!c.weight : !!c.customWeight && !Number.isNaN(Number(c.customWeight));
    if (cur === "grip") return !!c.grip;
    if (cur === "personal") return c.ptype === "none" || !!c.engraving;
    if (cur === "set") return Number(c.quantity) >= 1;
    if (cur === "use") return !!c.use;
    return true;
  };
  const next = () => { if (step === 0) track("config_started"); setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const finish = () => {
    const e = {};
    if (!c.name) e.name = F.errors.required;
    if (!c.email || !EMAIL.test(c.email)) e.email = F.errors.email;
    if (!c.role) e.role = F.errors.required;
    if (!c.country) e.country = F.errors.required;
    if (!c.consent) e.consent = F.errors.consent;
    setErrors(e);
    if (Object.keys(e).length) return;
    setRef(makeReference("config"));
    track("config_completed");
  };

  const entries = useMemo(() => [
    [L.series, series ? series.name : ""],
    [L.headSize, series ? `${series.headSizeSqIn} ${L.sqin}` : ""],
    [L.precisionClass, c.cls ? B.classes[c.cls] : ""],
    [c.mode === "listed" ? L.listed : L.custom, c.mode === "listed" ? (c.weight ? `${c.weight} ${L.grams}` : "") : (c.customWeight ? `${c.customWeight} ${L.grams} (${L.requestTarget})` : "")],
    [L.balance, modelledBalance ? `${modelledBalance} ${L.mm} (${ST.modelled})` : c.balanceReq ? `${c.balanceReq} ${L.mm} (${L.requestTarget})` : ""],
    [L.grip, c.grip],
    [L.swingweight, c.sw ? `${c.sw} ${L.kgcm2} (${L.requestTarget})` : ""],
    [L.stiffness, c.ra ? `${c.ra} ${L.ra} (${L.requestTarget})` : ""],
    [B.q.engravingType, c.ptype && c.ptype !== "none" ? B.q.types[c.ptype] : ""],
    [B.q.engraving, c.engraving ? `${c.engraving}${engravingNonLatin ? " (artwork confirmation required)" : ""}` : ""],
    [B.q.set, c.set ? L[c.set] : ""],
    [L.quantity, c.quantity],
    [B.q.use, c.use ? B.q.uses[c.use] : ""],
    [B.q.notes, c.notes],
    [F.fields.name, c.name],
    [F.fields.email, c.email],
    [F.fields.role, c.role ? F.roles[c.role] : ""],
    [F.fields.country, c.country],
    [B.outcome, B.outcome],
    [dict.gps.dataVersion, productDataVersion],
  ], [c, series, modelledBalance, engravingNonLatin, B, L, F, ST, dict]);

  const Radio = ({ name, options, value, onChange, three = false }) => (
    <div className={`choice ${three ? "three" : ""}`} role="radiogroup">
      {options.map(([val, label, sub]) => (
        <label key={val}><input type="radio" name={name} value={val} checked={value === val} onChange={() => onChange(val)} /><span>{label}{sub && <><br /><small className="muted">{sub}</small></>}</span></label>
      ))}
    </div>
  );

  return (
    <div className="panel">
      <div className="stepper">
        {STEPS.map((s, i) => <span key={s} className={i === step ? "on" : i < step ? "done" : ""}>{String(i + 1).padStart(2, "0")} {B.steps[s]}</span>)}
      </div>

      {cur === "series" && <><h2 className="h-3">{B.q.series}</h2><Radio name="series" three value={c.series} onChange={(v) => set("series", v)} options={seriesList.map((s) => [s.id, s.name, `${s.headSizeSqIn} ${L.sqin} · ${dict.racquets.direction[s.direction]}`])} /></>}

      {cur === "cls" && <><h2 className="h-3">{B.q.cls}</h2><Radio name="cls" three value={c.cls} onChange={(v) => set("cls", v)} options={precisionClasses.map((p) => [p.id, B.classes[p.id], `±${p.weightG} ${L.grams} · ±${p.balanceMm} ${L.mm} · ±${p.swingweightKgCm2} ${L.kgcm2}`])} /></>}

      {cur === "weight" && series && (
        <div className="stack">
          <h2 className="h-3">{B.q.weightMode}</h2>
          <Radio name="mode" value={c.mode} onChange={(v) => set("mode", v)} options={[["listed", L.listed, B.listedNote], ["custom", L.custom, B.customNote]]} />
          {c.mode === "listed" ? (
            <div className="field"><label htmlFor="c-w">{B.q.listed}</label>
              <select id="c-w" value={c.weight || ""} onChange={(e) => set("weight", e.target.value)}><option value="">{L.select}</option>{series.matrix.map((p) => <option key={p.weight} value={p.weight}>{p.weight} {L.grams}</option>)}</select>
              {c.weight && (modelledBalance !== null ? <span className="hint">{B.q.balanceShown}: <strong className="mono">{modelledBalance} {L.mm}</strong> — {ST.modelled}</span> : <span className="hint">{B.balanceNA}</span>)}
            </div>
          ) : (
            <div className="field"><label htmlFor="c-cw">{B.q.customWeight}</label><input id="c-cw" type="number" inputMode="decimal" min="150" max="450" value={c.customWeight || ""} onChange={(e) => set("customWeight", e.target.value)} /><span className="hint">{B.customNote}</span></div>
          )}
          {(c.mode === "custom" || series.balanceStatus === "NOT_PROVIDED") && (
            <div className="field"><label htmlFor="c-b">{B.q.balanceRequest}</label><input id="c-b" type="number" inputMode="decimal" min="280" max="380" value={c.balanceReq || ""} onChange={(e) => set("balanceReq", e.target.value)} /></div>
          )}
        </div>
      )}

      {cur === "grip" && (
        <><h2 className="h-3">{B.q.grip}</h2>
          <div className="choice three" role="radiogroup">{grips.map((g) => <label key={g.id}><input type="radio" name="grip" value={g.id} checked={c.grip === g.id} onChange={() => set("grip", g.id)} /><span><strong>{g.id}</strong> · {g.inches}{g.fraction}″</span></label>)}</div></>
      )}

      {cur === "targets" && (
        <div className="grid-2">
          <div className="field"><label htmlFor="c-sw">{B.q.swingweight}</label><input id="c-sw" type="number" inputMode="decimal" min="250" max="400" value={c.sw || ""} onChange={(e) => set("sw", e.target.value)} /></div>
          <div className="field"><label htmlFor="c-ra">{B.q.stiffness}</label><input id="c-ra" type="number" inputMode="decimal" min="50" max="80" value={c.ra || ""} onChange={(e) => set("ra", e.target.value)} /></div>
          <p className="note" style={{ gridColumn: "1 / -1" }}>{dict.racquets.compareLead}</p>
        </div>
      )}

      {cur === "personal" && (
        <div className="stack">
          <h2 className="h-3">{B.q.engravingType}</h2>
          <Radio name="ptype" three value={c.ptype} onChange={(v) => set("ptype", v)} options={Object.keys(B.q.types).map((k) => [k, B.q.types[k]])} />
          {c.ptype !== "none" && (
            <div className="field"><label htmlFor="c-e">{B.q.engraving}</label><input id="c-e" type="text" maxLength={40} value={c.engraving || ""} onChange={(e) => set("engraving", e.target.value)} aria-invalid={engravingOk ? undefined : "true"} />
              <span className="hint">{B.q.engravingHint}</span></div>
          )}
          <p className="note">{B.previewNote}</p>
        </div>
      )}

      {cur === "set" && (
        <div className="stack">
          <h2 className="h-3">{B.q.set}</h2>
          <Radio name="set" value={c.set} onChange={(v) => set("set", v)} options={[["individual", L.individual], ["pair", L.pair], ["triple", L.triple], ["team", L.team]]} />
          <div className="field" style={{ maxWidth: 220 }}><label htmlFor="c-q">{B.q.quantity}</label><input id="c-q" type="number" min="1" max="999" inputMode="numeric" value={c.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
          <p className="note">{dict.precision.matchedP}</p>
        </div>
      )}

      {cur === "use" && (
        <div className="stack">
          <h2 className="h-3">{B.q.use}</h2>
          <Radio name="use" three value={c.use} onChange={(v) => set("use", v)} options={Object.keys(B.q.uses).map((k) => [k, B.q.uses[k]])} />
          <div className="field"><label htmlFor="c-n">{B.q.notes} <span className="muted">({L.optional})</span></label><textarea id="c-n" value={c.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
      )}

      {cur === "review" && (
        <div className="stack">
          <h2 className="h-3">{B.reviewTitle}</h2>
          <p className="muted">{B.reviewP}</p>
          <div className="summary"><pre>{entries.slice(0, 14).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre></div>
          <div className="grid-2">
            {[["name", "text"], ["email", "email"], ["country", "text"]].map(([k, t]) => (
              <div className="field" key={k}><label htmlFor={`c-${k}`}>{F.fields[k]}</label><input id={`c-${k}`} type={t} value={c[k] || ""} onChange={(e) => set(k, e.target.value)} aria-invalid={errors[k] ? "true" : undefined} />{errors[k] && <span className="err" role="alert">{errors[k]}</span>}</div>
            ))}
            <div className="field"><label htmlFor="c-role">{F.fields.role}</label>
              <select id="c-role" value={c.role || ""} onChange={(e) => set("role", e.target.value)} aria-invalid={errors.role ? "true" : undefined}><option value="">{L.select}</option>{Object.keys(F.roles).map((r) => <option key={r} value={r}>{F.roles[r]}</option>)}</select>
              {errors.role && <span className="err" role="alert">{errors.role}</span>}</div>
          </div>
          <label className="check"><input type="checkbox" checked={!!c.consent} onChange={(e) => set("consent", e.target.checked)} /><span>{F.fields.consent}{errors.consent && <><br /><span className="err" role="alert">{errors.consent}</span></>}</span></label>
          <p className="muted" style={{ fontSize: 14 }}>{dict.common.truth.noPrices} {dict.common.truth.requestNotOrder}</p>
        </div>
      )}

      <div className="btn-row">
        {step > 0 && <button type="button" className="btn-outline" onClick={back}>{L.back}</button>}
        {cur !== "review" ? <button type="button" className="btn" disabled={!canNext()} onClick={next}>{L.next} <span aria-hidden="true">→</span></button> : <button type="button" className="btn" onClick={finish}>{B.reviewTitle} <span aria-hidden="true">→</span></button>}
      </div>
      {ref && <div style={{ marginTop: 24 }}><ComposePanel reference={ref} title={B.reviewTitle} entries={entries} dict={dict} eventName="technical_request_composed" /></div>}
    </div>
  );
}
