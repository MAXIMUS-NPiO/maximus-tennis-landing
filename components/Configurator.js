/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { seriesList, configurationProducts as SERIES, isTrainer, standardLengths, precisionClasses, grips, gripShapes, balanceFor, productDataVersion } from "../data/products";
import { validateConfig, TARGET_BOUNDS, CONFIG_PRODUCT_IDS, GRIP_IDS, GRIP_SHAPE_IDS, CLASS_IDS, BASIS, SET_TYPES, USES, PTYPES, SET_SIZE } from "../lib/intake/schema";
import { STORAGE_KEYS, readJson, writeJson, pick } from "../lib/client/storage";
import { href } from "../lib/paths";
import { track } from "../lib/analytics";
import OrderFlow from "./OrderFlow";
import { PERSIST, DEFAULTS, withSeries, toPayload } from "../lib/client/configuration";
import LeadForm, { errorText } from "./LeadForm";
import PurchaseChoice from "./PurchaseChoice";
import { GripSectionIcon } from "./GripShape";

/**
 * Configurator — builds a configuration REQUEST. It never invents an SKU, price, delivery date,
 * stock position or measured certificate. Listed weights come from the exact series matrix; any
 * other weight is a requested target for technical review (whole grams, no rounding).
 *
 * Browser storage keeps structural choices only (series, class, weight, grip size and shape, targets,
 * set type…). Engraving text, the racquet named for a replica handle, notes and contact details stay
 * in memory and are never written to storage.
 * URL context (?series=&grip=&shape=&from=) is validated, applied once and removed from the address bar.
 */

const STEPS = ["series", "cls", "weight", "grip", "targets", "personal", "set", "use", "review"];
const FIELD_STEP = { series: 0, cls: 1, mode: 2, weight: 2, customWeight: 2, lengthMode: 2, lengthIn: 2, customLengthIn: 2, grip: 3, gripShape: 3, gripReference: 3, basis: 4, balanceReq: 4, sw: 4, ra: 4, ptype: 5, engraving: 5, setType: 6, sets: 6, teamSize: 6, use: 7, notes: 7 };
const STEP_FIELDS = STEPS.map((_, i) => Object.keys(FIELD_STEP).filter((k) => FIELD_STEP[k] === i));
const FROM = ["gps", "series", "home", "choose", "precision", "grip", "custom"];
/** The configurator asks for a grip shape; the server accepts a request without one (see schema). */
const check = (payload) => validateConfig(payload, { requireGripShape: true });

function Radio({ name, options, value, onChange, three = false, labelledBy }) {
  return (
    <div className={`choice ${three ? "three" : ""}`} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(([val, label, sub]) => (
        <label key={val}>
          <input type="radio" name={name} value={val} checked={value === val} onChange={() => onChange(val)} />
          <span>{label}{sub && <><br /><small className="muted">{sub}</small></>}</span>
        </label>
      ))}
    </div>
  );
}

export default function Configurator({ dict, locale, orderFlowEnabled = false }) {
  const B = dict.build;
  const L = dict.common.labels;
  const C = dict.catalogue;
  const ST = dict.common.statuses;
  const P = dict.precision;
  const GS = dict.gripShape;
  const [c, setC] = useState(DEFAULTS);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [purchaseIntent, setPurchaseIntent] = useState('goods_only');
  const [programRequest, setProgramRequest] = useState({ principal: '', currency: 'EUR' });
  const [purchaseErrors, setPurchaseErrors] = useState({});
  const [leadState, setLeadState] = useState('editing');
  const handleLeadState = useCallback(value => { setLeadState(value); if (value === 'editing') setAccepted(false); }, []);
  // Intention and proposed principal stay in memory; structural browser storage is unchanged.
  const submittedProgramRequest = purchaseIntent === 'goods_with_program_interest' && programRequest.principal.trim() ? programRequest : undefined;
  const fromRef = useRef("direct");
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const headingRef = useRef(null);
  const userNavRef = useRef(false);

  const clsText = (p) => `±${p.weightG} ${L.grams} · ±${p.balanceMm} ${L.mm} · ±${p.swingweightKgCm2} ${L.kgcm2} · ${p.stiffness.kind === "target-tolerance" ? `±${p.stiffness.valueRA} ${L.ra} ${P.stiffTarget}` : B.stiffExactShort}`;

  // Restore structural state, then apply URL context once.
  useEffect(() => {
    let next = { ...DEFAULTS };
    let start = 0;
    const saved = readJson(STORAGE_KEYS.config);
    if (saved && saved.v === 2 && saved.c && typeof saved.c === "object") {
      next = { ...next, ...pick(saved.c, PERSIST) };
      if (Number.isInteger(saved.step) && saved.step >= 0 && saved.step < STEPS.length - 1) start = saved.step;
    }
    if (next.weight && (!next.series || !SERIES[next.series]?.matrix.some((p) => p.weight === next.weight))) delete next.weight;
    const sp = new URLSearchParams(window.location.search);
    const us = sp.get("series");
    const ug = sp.get("grip");
    const ush = sp.get("shape");
    const uf = sp.get("from");
    let msg = "";
    if (CONFIG_PRODUCT_IDS.includes(us)) {
      const r = withSeries(next, us);
      next = r.c;
      if (r.cleared) msg = B.notices.weightCleared.replace("{w}", r.cleared).replace("{series}", SERIES[us].short);
      start = Math.max(start, 1);
    }
    if (GRIP_IDS.includes(ug)) next.grip = ug;
    if (GRIP_SHAPE_IDS.includes(ush)) next.gripShape = ush;
    if (FROM.includes(uf)) fromRef.current = uf;
    // Never resume past a step whose answers are missing or invalid (stale or damaged state).
    const stale = check(toPayload(next)).errors;
    for (let i = 0; i < start; i++) {
      if (Object.keys(stale).some((key) => STEP_FIELDS[i].includes(key.replace(/^config\./, "")))) {
        start = i;
        break;
      }
    }
    if (sp.has("series") || sp.has("grip") || sp.has("shape") || sp.has("from")) {
      ["series", "grip", "shape", "from"].forEach((k) => sp.delete(k));
      const q = sp.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    }
    setC(next);
    setStep(start);
    setNotice(msg);
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    writeJson(STORAGE_KEYS.config, { v: 2, step: Math.min(step, STEPS.length - 2), c: pick(c, PERSIST) });
  }, [c, step, ready]);

  useEffect(() => {
    if (userNavRef.current && headingRef.current) headingRef.current.focus();
    userNavRef.current = false;
  }, [step]);

  const s = c.series ? SERIES[c.series] : null;
  const trainer = isTrainer(c.series);
  const cur = STEPS[step];
  const payload = useMemo(() => toPayload(c), [c]);
  const full = useMemo(() => check(payload), [payload]);

  const begin = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("config_started", { locale, series: c.series, step: "series" });
    }
  };
  const set = (k, val) => {
    begin();
    setC((x) => ({ ...x, [k]: val }));
    setErrors((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };
  const chooseSeries = (id) => {
    begin();
    const r = withSeries(c, id);
    setC(r.c);
    setNotice(r.cleared ? B.notices.weightCleared.replace("{w}", r.cleared).replace("{series}", SERIES[id].short) : "");
  };

  const stepErrors = (i) => {
    const out = {};
    for (const [key, code] of Object.entries(full.errors)) {
      const f = key.replace(/^config\./, "");
      if (STEP_FIELDS[i].includes(f)) out[f] = code;
    }
    return out;
  };
  const go = (i) => {
    userNavRef.current = true;
    setStep(i);
  };
  const next = () => {
    const e = stepErrors(step);
    if (Object.keys(e).length) {
      setErrors(e);
      setTimeout(() => {
        const first = document.querySelector(".cfg [aria-invalid='true']");
        if (first) first.focus();
      }, 0);
      return;
    }
    setErrors({});
    begin();
    const n = Math.min(step + 1, STEPS.length - 1);
    if (STEPS[n] === "review" && full.ok && !completedRef.current) {
      completedRef.current = true;
      track("config_completed", { locale, series: c.series, step: "review" });
    }
    go(n);
  };
  const back = () => {
    setErrors({});
    go(Math.max(step - 1, 0));
  };

  const beforeSubmit = () => {
    const r = check(payload);
    if (!r.ok) {
      const e = {};
      for (const [key, code] of Object.entries(r.errors)) e[key.replace(/^config\./, "")] = code;
      setErrors(e);
      return { ok: false };
    }
    return { ok: true };
  };
  const onServerErrors = (errs) => {
    const e = {};
    for (const [key, code] of Object.entries(errs)) if (key.startsWith("config.")) e[key.slice(7)] = code;
    setErrors(e);
    setPurchaseErrors(Object.fromEntries(Object.entries(errs).filter(([key]) => key === 'purchaseIntent' || key.startsWith('programRequest'))));
  };

  const fieldErr = (k) => (errors[k] ? <span className="err" id={`c-${k}-err`}>{errorText(dict, errors[k])}</span> : null);
  const inv = (k) => (errors[k] ? { "aria-invalid": "true", "aria-describedby": `c-${k}-err` } : {});
  const numInput = (k, label, hint, bounds) => (
    <div className="field">
      <label htmlFor={`c-${k}`}>{label} <span className="opt">({L.optional})</span></label>
      {hint && <span className="hint" id={`c-${k}-hint`}>{hint}</span>}
      <input id={`c-${k}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={c[k] || ""} onChange={(e) => set(k, e.target.value)} {...inv(k)} aria-describedby={[hint ? `c-${k}-hint` : null, errors[k] ? `c-${k}-err` : null].filter(Boolean).join(" ") || undefined} />
      {bounds && <span className="hint">{B.inputRange.replace("{min}", bounds[0]).replace("{max}", bounds[1])}</span>}
      {fieldErr(k)}
    </div>
  );

  const balance = s && c.mode === "listed" && c.weight ? balanceFor(s.id, c.weight, c.lengthMode === "custom" ? "custom" : (c.lengthIn ?? "unselected")) : null;
  // A series whose balance table the Founder confirmed (SPIN) is labelled confirmed, not calculated.
  const balanceConfirmed = !!s && s.balanceStatus === "FOUNDER_CONFIRMED";
  const balanceWord = balanceConfirmed ? ST.confirmed : ST.modelled;
  const total = full.value.racquetsTotal;
  const cls = precisionClasses.find((p) => p.id === c.cls);

  const summary = [
    [L.series, s ? `${s.name}${s.headSizeSqIn ? ` · ${s.headSizeSqIn} ${L.sqin}` : ""}${s.direction ? ` · ${dict.racquets.direction[s.direction]}` : ""}` : "—", 0],
    !trainer && [L.precisionClass, cls ? `${B.classes[cls.id]} — ${clsText(cls)}` : "—", 1],
    [c.lengthMode === "custom" ? C.custom : C.length, `${c.lengthMode === "custom" ? (c.customLengthIn || "—") : (c.lengthIn || "—")} ${L.inches} — ${B.status.technicalReview}`, 2],
    c.mode === "listed"
      ? [L.weight, c.weight ? `${c.weight} ${L.grams} — ${s && s.matrixStatus === "REQUESTED_ARCHITECTURE" ? B.status.requestedArchitecture : B.status.listed}` : "—", 2]
      : [B.q.customWeight, c.customWeight ? `${c.customWeight} ${L.grams} — ${B.status.technicalReview}` : "—", 2],
    // Only a balance on record is shown; an unknown balance is left out, never printed as missing.
    c.mode === "listed" && s && balance !== null ? [L.balance, `${balance} ${L.mm} — ${balanceWord}`, 2] : null,
    [dict.form.fields.basis, c.mode === "custom" ? dict.lead.basis.unstrung : c.basis ? `${dict.lead.basis[c.basis]} — ${B.status.requestedCondition}` : B.listedBasis, 4],
    [L.grip, c.grip ? `\u2066${c.grip} · ${grips.find((g) => g.id === c.grip).inches}${grips.find((g) => g.id === c.grip).fraction}″\u2069 — ${B.gripNote}` : "—", 3],
    [GS.title, c.gripShape ? `${GS.shapes[c.gripShape][0]}${c.gripShape === "replica" ? ` — ${c.gripReference || "—"}` : ""}` : "—", 3],
    c.balanceReq ? [B.q.balanceRequest, `${c.balanceReq} ${L.mm} — ${L.requestTarget}`, 4] : null,
    c.sw ? [B.q.swingweight, `${c.sw} ${L.kgcm2} — ${L.requestTarget}`, 4] : null,
    c.ra ? [B.q.stiffness, `${c.ra} ${L.ra} — ${L.requestTarget}`, 4] : null,
    [B.q.engravingType, B.q.types[c.ptype || "none"], 5],
    c.ptype && c.ptype !== "none" ? [B.q.engraving, c.engraving ? `${c.engraving}${full.value.engravingArtworkReview ? ` — ${B.artworkReview}` : ""}` : "—", 5] : null,
    [B.q.set, `${L[c.setType] || "—"} × ${c.sets || "—"}${c.setType === "team" ? ` × ${c.teamSize || "—"}` : ""}${total ? ` = ${total} ${B.racquetsUnit}` : ""}`, 6],
    [B.q.use, c.use ? B.q.uses[c.use] : "—", 7],
    c.notes ? [B.q.notes, c.notes, 7] : null,
    [dict.gps.dataVersion, productDataVersion, null],
  ].filter(Boolean);

  const allErrors = Object.entries(full.errors).map(([k, code]) => [k.replace(/^config\./, ""), code]);

  return (
    <div className="panel cfg" data-ready={ready ? "true" : "false"}>
      <ol className="stepper" aria-label={B.title}>
        {STEPS.map((k, i) => (
          <li key={k}>
            {i < step ? (
              <button type="button" className="done" disabled={leadState === 'submitting' || leadState === 'accepted'} onClick={() => { setErrors({}); go(i); }}>{String(i + 1).padStart(2, "0")} {B.steps[k]}</button>
            ) : (
              <span className={i === step ? "on" : ""} aria-current={i === step ? "step" : undefined}>{String(i + 1).padStart(2, "0")} {B.steps[k]}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="visually-hidden" aria-live="polite">{notice}</p>
      {notice && <p className="note red" role="status" data-notice="weight-cleared">{notice}</p>}

      <h2 className="h-3 step-title" tabIndex={-1} ref={headingRef} id="cfg-step-title">
        {cur === "series" && B.q.series}
        {cur === "cls" && B.q.cls}
        {cur === "weight" && B.q.weightMode}
        {cur === "grip" && GS.step}
        {cur === "targets" && B.q.targetsTitle}
        {cur === "personal" && B.q.engravingType}
        {cur === "set" && B.q.set}
        {cur === "use" && B.q.use}
        {cur === "review" && B.reviewTitle}
      </h2>

      {cur === "series" && (
        <div className="stack">
          <Radio name="series" three labelledBy="cfg-step-title" value={c.series} onChange={chooseSeries} options={Object.values(SERIES).map((x) => [x.id, x.name, x.direction ? `${x.headSizeSqIn} ${L.sqin} · ${dict.racquets.direction[x.direction]}` : `${x.matrix.length} ${L.points}`])} />
          {fieldErr("series")}
          <p className="muted small"><Link href={href(locale, "choose")}>{B.chooseLink} →</Link></p>
        </div>
      )}

      {cur === "cls" && !trainer && (
        <div className="stack">
          <Radio name="cls" labelledBy="cfg-step-title" value={c.cls} onChange={(v) => set("cls", v)} options={precisionClasses.map((p) => [p.id, B.classes[p.id], clsText(p)])} />
          {fieldErr("cls")}
          <p className="note">{B.clsNote}</p>
        </div>
      )}

      {cur === "cls" && trainer && <p className="note">{dict.sst.precisionNote}</p>}

      {cur === "weight" && s && (
        <div className="stack">
          {!trainer && <Radio name="mode" labelledBy="cfg-step-title" value={c.mode} onChange={(v) => set("mode", v)} options={[["listed", L.listed, B.listedNote], ["custom", L.custom, B.customNote]]} />}
          {c.mode === "listed" ? (
            <div className="field">
              <label htmlFor="c-weight">{B.q.listed} — {s.short}</label>
              <span className="hint" id="c-weight-hint">{C.balanceNote}</span>
              <select id="c-weight" value={c.weight || ""} onChange={(e) => set("weight", e.target.value ? Number(e.target.value) : undefined)} {...inv("weight")} aria-describedby={[balanceConfirmed ? null : "c-weight-hint", errors.weight ? "c-weight-err" : null].filter(Boolean).join(" ") || undefined}>
                <option value="">{L.select}</option>
                {s.matrix.map((p) => <option key={p.weight} value={p.weight}>{p.weight} {L.grams}</option>)}
              </select>
              {fieldErr("weight")}
              {c.weight && balance !== null && <span className="hint">{balanceConfirmed ? L.balance : B.q.balanceShown}: <strong className="mono">{balance} {L.mm}</strong> — {balanceWord}</span>}
            </div>
          ) : (
            <div className="field">
              <label htmlFor="c-customWeight">{B.q.customWeight}</label>
              <span className="hint" id="c-customWeight-hint">{B.customHint}</span>
              <input id="c-customWeight" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={c.customWeight || ""} onChange={(e) => set("customWeight", e.target.value)} {...inv("customWeight")} aria-describedby={["c-customWeight-hint", errors.customWeight ? "c-customWeight-err" : null].filter(Boolean).join(" ")} />
              {fieldErr("customWeight")}
            </div>
          )}
          <fieldset className="stack">
            <legend>{C.length} · {L.inches}</legend>
            <Radio name="lengthMode" value={c.lengthMode} onChange={(v) => set("lengthMode", v)} options={[["standard", C.standard], ["custom", C.custom]]} />
            {fieldErr("lengthMode")}
            {c.lengthMode === "custom" ? <div className="field">
              <label htmlFor="c-customLengthIn">{C.custom} ({L.inches})</label>
              <input id="c-customLengthIn" type="text" inputMode="decimal" autoComplete="off" value={c.customLengthIn || ""} onChange={(e) => set("customLengthIn", e.target.value)} {...inv("customLengthIn")} />
              {fieldErr("customLengthIn")}
            </div> : <div className="field">
              <label htmlFor="c-lengthIn">{C.standard} ({L.inches})</label>
              <select id="c-lengthIn" value={c.lengthIn || ""} onChange={(e) => set("lengthIn", e.target.value ? Number(e.target.value) : undefined)} {...inv("lengthIn")}>
                <option value="">{L.select}</option>
                {standardLengths.map((x) => <option key={x.inches} value={x.inches}>{x.inches} {L.inches}{x.category === "standard" ? "" : ` · ${C[x.category]}`}</option>)}
              </select>
              {fieldErr("lengthIn")}
            </div>}
            <p className="note">{C.note}</p>
          </fieldset>
        </div>
      )}

      {cur === "grip" && (
        <div className="stack-lg">
          <div className="stack">
            <h3 className="eyebrow" id="c-grip-legend">{B.q.grip}</h3>
            <div className="choice four" role="radiogroup" aria-labelledby="c-grip-legend">
              {grips.map((g) => (
                <label key={g.id}><input type="radio" name="grip" value={g.id} checked={c.grip === g.id} onChange={() => set("grip", g.id)} /><span><bdi><strong>{g.id}</strong> · {g.inches}{g.fraction}″</bdi></span></label>
              ))}
            </div>
            {fieldErr("grip")}
            <p className="note">{B.gripNote}. {dict.update20261016?.halfNote}</p>
          </div>
          <div className="stack">
            <h3 className="eyebrow" id="c-gripShape-legend">{GS.title}</h3>
            <p className="muted small" id="c-gripShape-lead">{GS.lead}</p>
            <div className="choice shapes" role="radiogroup" aria-labelledby="c-gripShape-legend" aria-describedby="c-gripShape-lead">
              {gripShapes.map(({ id }) => (
                <label key={id}>
                  <input type="radio" name="gripShape" value={id} checked={c.gripShape === id} onChange={() => set("gripShape", id)} {...inv("gripShape")} />
                  <GripSectionIcon shape={id} />
                  <span><strong>{GS.shapes[id][0]}</strong><small className="muted">{GS.shapes[id][1]}</small></span>
                </label>
              ))}
            </div>
            {fieldErr("gripShape")}
            {c.gripShape === "replica" && (
              <div className="field">
                <label htmlFor="c-gripReference">{GS.referenceLabel}</label>
                <span className="hint" id="c-gripReference-hint">{GS.referenceHint} {B.notStored}</span>
                <input id="c-gripReference" type="text" maxLength={160} autoComplete="off" value={c.gripReference || ""} onChange={(e) => set("gripReference", e.target.value)} {...inv("gripReference")} aria-describedby={["c-gripReference-hint", errors.gripReference ? "c-gripReference-err" : null].filter(Boolean).join(" ")} />
                {fieldErr("gripReference")}
              </div>
            )}
            <p className="note">{GS.note}</p>
          </div>
        </div>
      )}

      {cur === "targets" && (
        <div className="stack">
          <p className="muted">{B.targetsLead}</p>
          <div className="grid-3">
            {numInput("balanceReq", B.q.balanceRequest, null, TARGET_BOUNDS.balanceReq)}
            {numInput("sw", B.q.swingweight, null, TARGET_BOUNDS.sw)}
            {numInput("ra", B.q.stiffness, dict.update20261016?.raHint, TARGET_BOUNDS.ra)}
          </div>
          {c.mode === "custom" ? <p>{dict.lead.basis.unstrung}</p> : <div className="field">
            <label htmlFor="c-basis">{B.q.basis} {c.balanceReq || c.sw || c.ra ? "" : <span className="opt">({L.optional})</span>}</label>
            <span className="hint" id="c-basis-hint">{B.basisHint}</span>
            <select id="c-basis" value={c.basis || ""} onChange={(e) => set("basis", e.target.value || undefined)} {...inv("basis")} aria-describedby={["c-basis-hint", errors.basis ? "c-basis-err" : null].filter(Boolean).join(" ")}>
              <option value="">{L.select}</option>
              {BASIS.map((b) => <option key={b} value={b}>{dict.lead.basis[b]}</option>)}
            </select>
            {fieldErr("basis")}
          </div>}
          <p className="note">{B.inputRangeNote}</p>
        </div>
      )}

      {cur === "personal" && (
        <div className="stack">
          <Radio name="ptype" three labelledBy="cfg-step-title" value={c.ptype} onChange={(v) => set("ptype", v)} options={PTYPES.map((k) => [k, B.q.types[k]])} />
          {c.ptype && c.ptype !== "none" && (
            <div className="field">
              <label htmlFor="c-engraving">{B.q.engraving}</label>
              <span className="hint" id="c-engraving-hint">{B.q.engravingHint} {B.notStored}</span>
              <input id="c-engraving" type="text" maxLength={24} autoComplete="off" value={c.engraving || ""} onChange={(e) => set("engraving", e.target.value)} {...inv("engraving")} aria-describedby={["c-engraving-hint", errors.engraving ? "c-engraving-err" : null].filter(Boolean).join(" ")} />
              {fieldErr("engraving")}
            </div>
          )}
          <p className="note">{B.previewNote}</p>
        </div>
      )}

      {cur === "set" && (
        <div className="stack">
          <Radio name="setType" labelledBy="cfg-step-title" value={c.setType} onChange={(v) => set("setType", v)} options={SET_TYPES.map((k) => [k, L[k], k === "team" ? B.teamSub : `${SET_SIZE[k]} ${B.racquetsUnit}`])} />
          <div className="grid-3">
            <div className="field">
              <label htmlFor="c-sets">{B.setsLabel[c.setType || "individual"]}</label>
              <input id="c-sets" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={c.sets || ""} onChange={(e) => set("sets", e.target.value)} {...inv("sets")} />
              {fieldErr("sets")}
            </div>
            {c.setType === "team" && (
              <div className="field">
                <label htmlFor="c-teamSize">{B.teamSizeLabel}</label>
                <input id="c-teamSize" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={c.teamSize || ""} onChange={(e) => set("teamSize", e.target.value)} {...inv("teamSize")} />
                {fieldErr("teamSize")}
              </div>
            )}
            <div className="field">
              <label htmlFor="c-total">{B.totalLabel}</label>
              <output id="c-total" className="total mono" data-total={total || ""} aria-live="polite">{total ? `${total} ${B.racquetsUnit}` : "—"}</output>
            </div>
          </div>
          <p className="note">{B.setRule} {P.matchedP}</p>
        </div>
      )}

      {cur === "use" && (
        <div className="stack">
          <Radio name="use" three labelledBy="cfg-step-title" value={c.use} onChange={(v) => set("use", v)} options={USES.map((k) => [k, B.q.uses[k]])} />
          {fieldErr("use")}
          <div className="field">
            <label htmlFor="c-notes">{B.q.notes} <span className="opt">({L.optional})</span></label>
            <span className="hint" id="c-notes-hint">{B.notStored}</span>
            <textarea id="c-notes" maxLength={2000} value={c.notes || ""} onChange={(e) => set("notes", e.target.value)} aria-describedby="c-notes-hint" />
          </div>
        </div>
      )}

      {cur === "review" && (
        <div className="stack-lg">
          <p className="muted">{B.reviewP}</p>
          {allErrors.length > 0 && (
            <div className="err-summary" role="alert" data-config-errors={allErrors.length}>
              <p><strong>{B.reviewErrors}</strong></p>
              <ul>
                {allErrors.map(([k, code]) => (
                  <li key={k}>{B.fieldNames[k] || k}: {errorText(dict, code)} <button type="button" className="linkbtn" disabled={leadState === 'submitting' || leadState === 'accepted'} onClick={() => { setErrors({ [k]: code }); go(FIELD_STEP[k] ?? 0); }}>{B.edit}</button></li>
                ))}
              </ul>
            </div>
          )}
          <dl className="cfg-summary">
            {summary.map(([k, v, st], i) => (
              <div key={i}>
                <dt>{k}</dt>
                <dd>{v}{st !== null && st !== undefined && <> <button type="button" className="linkbtn" disabled={leadState === 'submitting' || leadState === 'accepted'} onClick={() => go(st)} aria-label={`${B.edit}: ${k}`}>{B.edit}</button></>}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">{dict.common.truth.noPrices}</p>
          <PurchaseChoice dict={dict} locale={locale} intent={purchaseIntent} onIntentChange={value => { setPurchaseIntent(value); setPurchaseErrors({}); }} programRequest={programRequest} onProgramChange={value => { setProgramRequest(value); setPurchaseErrors({}); }} errors={purchaseErrors} locked={leadState === 'submitting' || leadState === 'accepted'} />
          {orderFlowEnabled && !payload.catalogueVersion ? <OrderFlow dict={dict} locale={locale} config={payload} purchaseIntent={purchaseIntent} programRequest={submittedProgramRequest} beforeSubmit={beforeSubmit} onServerErrors={onServerErrors} onAccepted={() => setAccepted(true)} onStateChange={handleLeadState} locked={leadState === 'submitting' || leadState === 'accepted'} /> : <LeadForm
            dict={dict}
            locale={locale}
            purpose="config"
            config={payload}
            purchaseIntent={purchaseIntent}
            programRequest={submittedProgramRequest}
            beforeSubmit={beforeSubmit}
            onServerErrors={onServerErrors}
            context={{ from: fromRef.current }}
            series={c.series}
            submitLabel={B.cta}
            onAccepted={() => setAccepted(true)}
            onStateChange={handleLeadState}
          />}
        </div>
      )}

      {cur !== "review" && (
        <div className="btn-row">
          {step > 0 && <button type="button" className="btn-outline" onClick={back}>{L.back}</button>}
          <button type="button" className="btn" onClick={next} data-next={cur}>{L.next} <span aria-hidden="true">→</span></button>
        </div>
      )}
      {cur === "review" && !accepted && (
        <div className="btn-row"><button type="button" className="btn-outline" disabled={leadState === 'submitting'} onClick={back}>{L.back}</button></div>
      )}
      {cur === "review" && accepted && (
        <div className="btn-row">
          <button type="button" className="btn-outline" onClick={() => { writeJson(STORAGE_KEYS.config, { v: 2, step: 0, c: DEFAULTS }); setC(DEFAULTS); setAccepted(false); setLeadState('editing'); setPurchaseIntent('goods_only'); setProgramRequest({ principal: '', currency: 'EUR' }); setPurchaseErrors({}); setNotice(""); setErrors({}); completedRef.current = false; startedRef.current = false; go(0); }}>{B.restart}</button>
        </div>
      )}
    </div>
  );
}
