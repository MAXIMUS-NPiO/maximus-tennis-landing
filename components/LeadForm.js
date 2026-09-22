"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldsFor, validateRequest, GRIP_IDS } from "../lib/intake/schema";
import { seriesList } from "../data/products";
import { site } from "../data/site";
import { href } from "../lib/paths";
import { track } from "../lib/analytics";
import { useLeadSubmit } from "./useLeadSubmit";

/**
 * Production request form. One component for every purpose; fields, limits and allowed values come
 * from the shared schema (lib/intake/schema.js), which the server applies again authoritatively.
 * Contact details and free text live in component state only — never in browser storage.
 */

function optionsFor(key, dict) {
  const F = dict.form;
  const L = dict.common.labels;
  const G = dict.gps;
  switch (key) {
    case "role": return Object.entries(F.roles);
    case "level": return Object.entries(G.experience);
    case "objectives": return Object.entries(G.objectives);
    case "grip": return [...GRIP_IDS.map((g) => [g, g]), ["unknown", L.unknown]];
    case "coachInvolved": return [["yes", L.yes], ["no", L.no], ["unknown", L.unknown]];
    case "basis": return Object.entries(dict.lead.basis);
    case "seriesInterest": return seriesList.map((s) => [s.id, `${s.name} · ${s.headSizeSqIn} ${L.sqin}`]);
    case "interests": return Object.entries(F.interestOptions);
    case "ageBand": return Object.entries(G.ageBands);
    case "interestArea": return Object.entries(F.strategicAreas);
    case "requestType": return Object.entries(F.ownerTypes);
    default: return [];
  }
}

export function errorText(dict, code) {
  return (dict.form.errors && dict.form.errors[code]) || dict.form.errors.invalid;
}

export default function LeadForm({
  dict,
  locale,
  purpose: fixedPurpose,
  purposes,
  initialPurpose,
  config,
  profile,
  beforeSubmit,
  onServerErrors,
  context,
  series,
  prefill,
  submitLabel,
  hideMessage = false,
  optionalExtras = true,
  onAccepted,
}) {
  const F = dict.form;
  const L = dict.common.labels;
  const LD = dict.lead;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const choices = fixedPurpose ? [fixedPurpose] : purposes || [];
  const [purpose, setPurpose] = useState(fixedPurpose || (choices.includes(initialPurpose) ? initialPurpose : choices[0] || "general"));
  const [v, setV] = useState(() => ({ ...(prefill || {}) }));
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState({});
  const [focusReq, setFocusReq] = useState(0);
  const started = useRef(false);
  const formRef = useRef(null);
  const successRef = useRef(null);
  const alertRef = useRef(null);
  const ctx = useMemo(() => context || {}, [context]);
  const { state, result, submit, reset } = useLeadSubmit({ purpose, locale, context: ctx, series });

  useEffect(() => {
    if (fixedPurpose) setPurpose(fixedPurpose);
  }, [fixedPurpose]);
  useEffect(() => {
    if (!fixedPurpose && initialPurpose && choices.includes(initialPurpose)) setPurpose(initialPurpose);
  }, [initialPurpose]); // eslint-disable-line react-hooks/exhaustive-deps

  const { common, extra } = fieldsFor(purpose);
  const extraEntries = Object.entries(extra).filter(([, spec]) => optionalExtras || spec.required);
  const order = [...extraEntries.map(([k]) => k), "name", "email", "role", "country", "organisation", ...(hideMessage ? [] : ["message"]), "consent"];
  const id = (k) => `${uid}-${k}`;

  const markStarted = () => {
    if (!started.current) {
      started.current = true;
      track("lead_form_started", { purpose, locale, series });
    }
  };
  const set = (k, val) => {
    markStarted();
    setV((cur) => ({ ...cur, [k]: val }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };
  const toggle = (k, val, max) => {
    markStarted();
    setV((cur) => {
      const arr = Array.isArray(cur[k]) ? cur[k] : [];
      if (arr.includes(val)) return { ...cur, [k]: arr.filter((x) => x !== val) };
      if (max && arr.length >= max) return cur;
      return { ...cur, [k]: [...arr, val] };
    });
  };

  const focusFirst = (errs) => {
    const first = order.find((k) => errs[k]);
    if (first) {
      const el = document.getElementById(id(first)) || document.querySelector(`[data-field="${id(first)}"] input`);
      if (el) el.focus();
    }
  };

  // Focus the first invalid field after the error summary has rendered (so the field stays in view).
  useEffect(() => {
    if (focusReq) focusFirst(errors);
  }, [focusReq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server errors → fields of this form; other keys (config.*, profile.*) go to the parent.
  useEffect(() => {
    if (result && result.code === "invalid" && result.errors) {
      const own = {};
      const other = {};
      for (const [k, code] of Object.entries(result.errors)) (order.includes(k) ? own : other)[k] = code;
      setErrors(own);
      if (Object.keys(other).length && onServerErrors) onServerErrors(other);
      if (Object.keys(own).length) setFocusReq((n) => n + 1);
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state === "accepted" && onAccepted && result) onAccepted(result.requestId);
    if (state === "accepted" && successRef.current) successRef.current.focus();
    if (state === "failed" && alertRef.current) alertRef.current.focus();
  }, [state]);

  const fieldsPayload = () => {
    const out = {};
    for (const k of Object.keys(common)) if (!(hideMessage && k === "message")) out[k] = v[k];
    for (const [k] of extraEntries) out[k] = v[k];
    return out;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (state === "submitting") return;
    markStarted();
    const parent = beforeSubmit ? beforeSubmit() : { ok: true };
    const payload = { purpose, locale, fields: fieldsPayload(), config, profile, consent };
    const r = validateRequest(payload);
    const own = {};
    for (const [k, code] of Object.entries(r.errors)) if (order.includes(k)) own[k] = code;
    setErrors(own);
    if (!parent.ok || Object.keys(own).length) {
      if (Object.keys(own).length) setFocusReq((n) => n + 1);
      return;
    }
    if (!r.ok) {
      if (onServerErrors) onServerErrors(r.errors);
      return;
    }
    await submit({ fields: payload.fields, config, profile, consent, hp });
  };

  if (state === "accepted" && result) {
    return (
      <div className="lead-result ok" ref={successRef} tabIndex={-1} aria-live="polite" data-state="accepted">
        <p className="eyebrow accent">{LD.acceptedEyebrow}</p>
        <h2 className="h-3">{LD.acceptedTitle}</h2>
        <p className="lead-id">{LD.requestId}: <strong className="mono" data-request-id={result.requestId}>{result.requestId}</strong></p>
        {result.duplicate && <p className="muted">{LD.duplicate}</p>}
        <p>{LD.acceptedNext}</p>
        <p className="muted small">{dict.common.truth.requestNotOrder}</p>
        <div className="btn-row">
          <button type="button" className="btn-outline" onClick={() => { reset(); setV({ ...(prefill || {}) }); setConsent(false); setErrors({}); started.current = false; }}>{LD.another}</button>
        </div>
      </div>
    );
  }

  const describedBy = (k, hint) => [hint ? `${id(k)}-hint` : null, errors[k] ? `${id(k)}-err` : null].filter(Boolean).join(" ") || undefined;
  const labelFor = (k) => (k === "consent" ? LD.consentShort : F.fields[k] || k);
  const err = (k) => (errors[k] ? <span className="err" id={`${id(k)}-err`}>{errorText(dict, errors[k])}</span> : null);

  const renderField = (k, spec) => {
    const req = !!spec.required;
    const hint = LD.hints && LD.hints[k];
    const common = {
      id: id(k),
      name: k,
      required: req,
      "aria-required": req ? "true" : undefined,
      "aria-invalid": errors[k] ? "true" : undefined,
      "aria-describedby": describedBy(k, hint),
    };
    const label = (
      <label htmlFor={id(k)}>
        {labelFor(k)} {!req && <span className="opt">({L.optional})</span>}
      </label>
    );
    if (spec.type === "multi") {
      const opts = optionsFor(k, dict);
      const cur = Array.isArray(v[k]) ? v[k] : [];
      return (
        <fieldset className="field" key={k} data-field={id(k)} aria-describedby={describedBy(k, hint)}>
          <legend>{labelFor(k)} {!req && <span className="opt">({L.optional})</span>}</legend>
          {hint && <span className="hint" id={`${id(k)}-hint`}>{hint}</span>}
          <div className="choice three">
            {opts.map(([val, text], i) => (
              <label key={val}>
                <input id={i === 0 ? id(k) : undefined} type="checkbox" name={k} value={val} checked={cur.includes(val)} onChange={() => toggle(k, val, spec.max)} disabled={!cur.includes(val) && spec.max && cur.length >= spec.max} />
                <span>{text}</span>
              </label>
            ))}
          </div>
          {err(k)}
        </fieldset>
      );
    }
    let control;
    if (spec.type === "enum") {
      control = (
        <select {...common} value={v[k] || ""} onChange={(e) => set(k, e.target.value)}>
          <option value="">{L.select}</option>
          {optionsFor(k, dict).map(([val, text]) => <option key={val} value={val}>{text}</option>)}
        </select>
      );
    } else if (spec.type === "textarea") {
      control = <textarea {...common} maxLength={spec.max} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    } else if (spec.type === "int") {
      control = <input {...common} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    } else if (spec.type === "email") {
      control = <input {...common} type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none" maxLength={spec.max} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    } else {
      control = <input {...common} type="text" autoComplete={spec.autocomplete || "off"} maxLength={spec.max} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />;
    }
    return (
      <div className="field" key={k}>
        {label}
        {hint && <span className="hint" id={`${id(k)}-hint`}>{hint}</span>}
        {control}
        {err(k)}
      </div>
    );
  };

  const errorKeys = order.filter((k) => errors[k]);
  const failed = state === "failed" && result;
  const failMsg = failed ? LD.fail[result.code] || (String(result.code).startsWith("store_") ? LD.fail.unavailable : LD.fail.default) : "";

  return (
    <form ref={formRef} className="form lead-form" onSubmit={onSubmit} noValidate data-state={state} data-purpose={purpose} aria-busy={state === "submitting" ? "true" : undefined}>
      {failed && (
        <div className="lead-result fail" role="alert" tabIndex={-1} ref={alertRef} data-state="failed" data-code={result.code}>
          <p><strong>{LD.failTitle}</strong> {failMsg}</p>
          <p className="small">{LD.keepNote} {LD.fallback.split("{email}")[0]}<a href={`mailto:${site.email}`}>{site.email}</a>{LD.fallback.split("{email}")[1]}</p>
        </div>
      )}
      {errorKeys.length > 0 && (
        <div className="err-summary" role="alert">
          <p><strong>{LD.errorsTitle}</strong></p>
          <ul>
            {errorKeys.map((k) => (
              <li key={k}><a href={`#${id(k)}`} onClick={(e) => { e.preventDefault(); const el = document.getElementById(id(k)); if (el) el.focus(); }}>{labelFor(k)}: {errorText(dict, errors[k])}</a></li>
            ))}
          </ul>
        </div>
      )}
      {!fixedPurpose && choices.length > 1 && (
        <div className="field">
          <label htmlFor={id("purpose")}>{F.purposeLabel}</label>
          <select id={id("purpose")} value={purpose} onChange={(e) => { setPurpose(e.target.value); setErrors({}); }}>
            {choices.map((p) => <option key={p} value={p}>{F.purposes[p]}</option>)}
          </select>
        </div>
      )}
      {extraEntries.length > 0 && <div className="grid-2 form-grid">{extraEntries.map(([k, spec]) => renderField(k, spec))}</div>}
      <div className="grid-2 form-grid">
        {renderField("name", common.name)}
        {renderField("email", common.email)}
        {renderField("role", common.role)}
        {renderField("country", common.country)}
        {renderField("organisation", common.organisation)}
      </div>
      {!hideMessage && renderField("message", common.message)}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor={id("hp")}>{LD.hpLabel}</label>
        <input id={id("hp")} name="mx_website" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      </div>
      <div className="field">
        <label className="check" htmlFor={id("consent")}>
          <input id={id("consent")} type="checkbox" checked={consent} required aria-required="true" aria-invalid={errors.consent ? "true" : undefined} aria-describedby={errors.consent ? `${id("consent")}-err` : undefined} onChange={(e) => { markStarted(); setConsent(e.target.checked); if (errors.consent) setErrors((x) => { const n = { ...x }; delete n.consent; return n; }); }} />
          <span>{F.fields.consent} <a href={href(locale, "privacy")}>{LD.privacyLink}</a></span>
        </label>
        {err("consent")}
      </div>
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button type="submit" className="btn" disabled={state === "submitting"}>
          {state === "submitting" ? LD.submitting : failed ? LD.retry : submitLabel || LD.submit} <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="muted small">{LD.after}</p>
    </form>
  );
}
