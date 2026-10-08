"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  SCENARIOS, CURRENCIES, DURATION_PRESETS, SCENARIO_FIELDS, EXTRA_FIELDS, ONE_OFF_EXTRAS, MONTHLY_EXTRAS,
  defaultPlan, computePlan, money, moneyFinal, unitPrice, count, hours, sessionHours,
  serialise, restore, restoreDraft, STORAGE_KEY, DRAFT_KEY,
} from "../lib/familyPlan";

/**
 * Family Plan — the four-step calculator. All arithmetic is in lib/familyPlan.js; this component
 * holds the family's raw input, shows field errors where they are, and formats what the module
 * returns. When any field is invalid, no figure is shown: an old total must never stand under
 * new input as if it were its result.
 */

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const fid = (path) => `fp-${path.replace(/\./g, "-")}`;
const STEP_OF = (path) => (path === "months" || path === "selected" ? 3 : 0);

function setIn(obj, path, value) {
  const keys = path.split(".");
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

function Field({ path, label, hint, value, onChange, error, decimal = false, unit, wide = false }) {
  const id = fid(path);
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={`fp-field ${wide ? "wide" : ""} ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}{unit && <span className="fp-unit"> · {unit}</span>}</label>
      <input
        id={id}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        spellCheck="false"
        value={value}
        onChange={(e) => onChange(path, e.target.value)}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={[errId, hintId].filter(Boolean).join(" ") || undefined}
      />
      {error && <p className="fp-error" id={errId}>{error}</p>}
      {hint && <p className="fp-hint" id={hintId}>{hint}</p>}
    </div>
  );
}

export default function FamilyPlan({ t, numLocale }) {
  const [plan, setPlan] = useState(defaultPlan);
  const [status, setStatus] = useState(null);
  const [ready, setReady] = useState(false);
  const uid = useId();
  const tabRefs = useRef([]);
  const result = useMemo(() => computePlan(plan), [plan]);
  const errors = result.ok ? [] : result.errors;
  const errOf = useCallback((path) => {
    const e = errors.find((x) => x.path === path);
    return e ? t.errors[e.code] || t.errors.number : null;
  }, [errors, t]);

  // On arrival: the working copy of this tab first (a language switch), then a plan saved on the
  // device. A record that fails its checks is reported and left unapplied.
  useEffect(() => {
    let applied = false;
    try {
      const d = restoreDraft(window.sessionStorage.getItem(DRAFT_KEY));
      if (d.status === "ok") { setPlan(d.plan); applied = true; }
    } catch { /* storage unavailable: start from the defaults */ }
    if (!applied) {
      try {
        const r = restore(window.localStorage.getItem(STORAGE_KEY));
        if (r.status === "ok") { setPlan(r.plan); setStatus({ kind: "ok", text: t.storage.restored }); }
        else if (r.status === "invalid") setStatus({ kind: "warn", text: t.storage.invalid });
      } catch { /* storage unavailable */ }
    }
    setReady(true);
  }, [t]);

  // Keep the tab's working copy current, so that changing language keeps the family's input.
  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(DRAFT_KEY, serialise(plan)); } catch { /* not available */ }
  }, [plan, ready]);

  const onChange = useCallback((path, value) => setPlan((p) => setIn(p, path, value)), []);
  const setStep = useCallback((step) => setPlan((p) => ({ ...p, step })), []);

  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serialise(plan));
      setStatus({ kind: "ok", text: t.storage.saved });
    } catch {
      setStatus({ kind: "warn", text: t.storage.unavailable });
    }
  };
  const clear = () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* not available */ }
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* not available */ }
    setPlan(defaultPlan());
    setStatus({ kind: "ok", text: t.storage.cleared });
  };

  const goTo = (path) => {
    setStep(STEP_OF(path));
    setTimeout(() => {
      const el = document.getElementById(fid(path));
      if (el) {
        if (el.closest("details") && !el.closest("details").open) el.closest("details").open = true;
        el.focus();
      }
    }, 30);
  };

  const fieldName = (path) => {
    const parts = path.split(".");
    if (parts[0] === "scenarios") return fill(t.errors.in, { scenario: t.scenarios[parts[1]], field: t.fields[parts[2]].label });
    if (parts[0] === "extras") return t.extras[parts[1]];
    if (path === "start" || path === "end") return t.ages[path];
    if (path === "months") return t.final.months;
    if (path === "quoteSource" || path === "quoteDate") return t.extras[path];
    if (path === "currency") return t.currency.label;
    if (path === "selected") return t.final.scenario;
    return "";
  };

  const cur = plan.currency;
  const step = plan.step;
  // Amounts of money are written by the browser only. The prerendering server carries the whole of
  // the Unicode locale data and a browser may carry less: measured in Chromium, an amount in
  // Macedonian, Icelandic, Basque and eight more of the site's languages comes out differently from
  // the server's, and React then throws the page's markup away. Until the calculator is live in the
  // browser an amount shows as a dash. Counts and hours need no such care: before that moment they
  // are the zeros of the empty plan, which every runtime writes alike.
  const PENDING = "\u2014";
  const fMoney = (v) => (ready ? money(numLocale, cur, v) : PENDING);
  const fMoneyFinal = (v) => (ready ? moneyFinal(numLocale, cur, v) : PENDING);
  const onTabKey = (e, i) => {
    const n = t.steps.length;
    let k = null;
    if (e.key === "ArrowRight") k = (i + 1) % n;
    if (e.key === "ArrowLeft") k = (i - 1 + n) % n;
    if (e.key === "Home") k = 0;
    if (e.key === "End") k = n - 1;
    if (k === null) return;
    e.preventDefault();
    setStep(k);
    tabRefs.current[k]?.focus();
  };

  // ---- result helpers -------------------------------------------------------------------------
  const ErrorSummary = () => (
    <div className="fp-errors" role="alert">
      <p className="fp-errors-title">{t.errors.title}</p>
      <ul>
        {errors.map((e) => (
          <li key={`${e.path}-${e.code}`}>
            {e.path === "result" ? (
              t.errors.result
            ) : (
              <button type="button" onClick={() => goTo(e.path)}>
                <b>{fieldName(e.path)}</b> — {t.errors[e.code] || t.errors.number}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const unitCell = (value, undefinedText) => {
    if (value === null) return <span className="fp-undefined">{undefinedText}</span>;
    if (!ready) return PENDING;
    const u = unitPrice(numLocale, cur, value);
    return u.below ? fill(t.economics.below, { value: u.text }) : u.text;
  };

  const lengthCell = (s) => {
    const m = Number(String(s.minutes).replace(",", "."));
    const sh = sessionHours(numLocale, m);
    return `${hours(numLocale, m, 2)} ${t.units.min} = ${sh.approx ? t.units.approx : ""}${sh.text} ${t.units.h}`;
  };

  // ---- render ---------------------------------------------------------------------------------
  return (
    <div className="fp">
      <div className="fp-tabs" role="tablist" aria-label={t.stepsLabel}>
        {t.steps.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${uid}-tab-${i}`}
            aria-selected={step === i}
            aria-controls={`${uid}-panel-${i}`}
            tabIndex={step === i ? 0 : -1}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => setStep(i)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={step === i ? "on" : ""}
          >
            <span className="fp-tab-n">{String(i + 1).padStart(2, "0")}</span>
            <span className="fp-tab-l">{label}</span>
          </button>
        ))}
      </div>

      {/* ---------------- Step 1 — family inputs ---------------- */}
      <div role="tabpanel" id={`${uid}-panel-0`} aria-labelledby={`${uid}-tab-0`} hidden={step !== 0} className="fp-panel">
        <div className="fp-currency">
          <label htmlFor={fid("currency")}>{t.currency.label}</label>
          <select id={fid("currency")} value={cur} onChange={(e) => onChange("currency", e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="fp-hint">{t.currency.note}</p>
        </div>

        <div className="fp-scenarios">
          {SCENARIOS.map((id) => (
            <fieldset key={id} className={`fp-scenario ${plan.selected === id ? "selected" : ""}`}>
              <legend>{t.scenarios[id]}</legend>
              <p className="fp-hint">{t.scenarioHints[id]}</p>
              {SCENARIO_FIELDS.map((f) => (
                <div key={f}>
                  <Field
                    path={`scenarios.${id}.${f}`}
                    label={t.fields[f].label}
                    unit={f === "cost" ? cur : undefined}
                    hint={t.fields[f].hint}
                    value={plan.scenarios[id][f]}
                    onChange={onChange}
                    error={errOf(`scenarios.${id}.${f}`)}
                    decimal={f === "minutes"}
                  />
                  {f === "minutes" && (
                    <div className="fp-presets" role="group" aria-label={`${t.scenarios[id]} — ${t.presetsLabel}`}>
                      {DURATION_PRESETS.map((m) => (
                        <button key={m} type="button" aria-pressed={plan.scenarios[id].minutes === String(m)} onClick={() => onChange(`scenarios.${id}.minutes`, String(m))}>
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </fieldset>
          ))}
        </div>

        <fieldset className="fp-ages">
          <legend>{t.ages.title}</legend>
          <div className="fp-row">
            <Field path="start" label={t.ages.start} value={plan.start} onChange={onChange} error={errOf("start")} />
            <Field path="end" label={t.ages.end} value={plan.end} onChange={onChange} error={errOf("end")} />
          </div>
          <p className="fp-hint">{t.ages.hint}</p>
        </fieldset>

        <details className="fp-extras">
          <summary>{t.extras.title}</summary>
          <p className="fp-hint">{t.extras.note}</p>
          <div className="fp-grid-extras">
            {EXTRA_FIELDS.map((k) => (
              <Field key={k} path={`extras.${k}`} label={t.extras[k]} unit={cur} value={plan.extras[k]} onChange={onChange} error={errOf(`extras.${k}`)} />
            ))}
          </div>
          <div className="fp-row">
            <div className={`fp-field wide ${errOf("quoteSource") ? "has-error" : ""}`}>
              <label htmlFor={fid("quoteSource")}>{t.extras.quoteSource}</label>
              <input id={fid("quoteSource")} type="text" maxLength={200} value={plan.quoteSource} onChange={(e) => onChange("quoteSource", e.target.value)} aria-invalid={errOf("quoteSource") ? "true" : undefined} />
              {errOf("quoteSource") && <p className="fp-error">{errOf("quoteSource")}</p>}
            </div>
            <div className={`fp-field ${errOf("quoteDate") ? "has-error" : ""}`}>
              <label htmlFor={fid("quoteDate")}>{t.extras.quoteDate}</label>
              <input id={fid("quoteDate")} type="date" value={plan.quoteDate} onChange={(e) => onChange("quoteDate", e.target.value)} aria-invalid={errOf("quoteDate") ? "true" : undefined} />
              {errOf("quoteDate") && <p className="fp-error">{errOf("quoteDate")}</p>}
            </div>
          </div>
          <p className="fp-hint">{t.extras.quoteNote}</p>
        </details>

        <div className="fp-storage">
          <button type="button" className="btn" onClick={save} disabled={!result.ok}>{t.storage.save}</button>
          <button type="button" className="btn-outline" onClick={clear}>{t.storage.clear}</button>
          <p className={`fp-status ${status?.kind || ""}`} role="status" aria-live="polite">{status?.text || ""}</p>
        </div>

        <section className="fp-results" aria-labelledby={`${uid}-annual`}>
          <h3 id={`${uid}-annual`} className="h-3">{t.annual.title}</h3>
          {!result.ok ? <ErrorSummary /> : (
            <div className="fp-table-wrap" tabIndex={0} aria-label={t.annual.title}>
              <table className="fp-table">
                <thead>
                  <tr><th scope="col"><span className="sr-only">{t.annual.title}</span></th>{SCENARIOS.map((id) => <th key={id} scope="col" className={plan.selected === id ? "sel" : ""}>{t.scenarios[id]}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><th scope="row">{t.annual.sessions}</th>{SCENARIOS.map((id) => <td key={id}>{count(numLocale, result.annual[id].playerSessions)}</td>)}</tr>
                  <tr><th scope="row">{t.annual.cost}</th>{SCENARIOS.map((id) => <td key={id}>{fMoney(result.annual[id].trainingCost)}</td>)}</tr>
                  <tr><th scope="row">{t.annual.hours}</th>{SCENARIOS.map((id) => <td key={id}>{hours(numLocale, result.annual[id].playerHours, 1)} {t.units.h}</td>)}</tr>
                  <tr><th scope="row">{t.annual.length}</th>{SCENARIOS.map((id) => <td key={id}>{lengthCell(plan.scenarios[id])}</td>)}</tr>
                  <tr><th scope="row">{t.annual.contacts}</th>{SCENARIOS.map((id) => <td key={id}>{count(numLocale, result.annual[id].contacts)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="fp-note">{t.annual.note}</p>
        </section>
      </div>

      {/* ---------------- Step 2 — session economics ---------------- */}
      <div role="tabpanel" id={`${uid}-panel-1`} aria-labelledby={`${uid}-tab-1`} hidden={step !== 1} className="fp-panel">
        <h3 className="h-3">{t.economics.title}</h3>
        {!result.ok ? <ErrorSummary /> : (
          <div className="fp-table-wrap" tabIndex={0} aria-label={t.economics.title}>
            <table className="fp-table">
              <thead>
                <tr><th scope="col"><span className="sr-only">{t.economics.title}</span></th>{SCENARIOS.map((id) => <th key={id} scope="col" className={plan.selected === id ? "sel" : ""}>{t.scenarios[id]}</th>)}</tr>
              </thead>
              <tbody>
                <tr><th scope="row">{t.economics.session}</th>{SCENARIOS.map((id) => <td key={id}>{fMoneyFinal(result.values.scenarios[id].cost)}</td>)}</tr>
                <tr><th scope="row">{t.economics.hour}</th>{SCENARIOS.map((id) => <td key={id}>{unitCell(result.annual[id].costPerHour, t.economics.undefinedMinutes)}</td>)}</tr>
                <tr><th scope="row">{t.economics.contact}</th>{SCENARIOS.map((id) => <td key={id}>{unitCell(result.annual[id].costPerContact, t.economics.undefinedContacts)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-note">{t.economics.note}</p>
        <p className="fp-note">{t.economics.caption}</p>
      </div>

      {/* ---------------- Step 3 — long-term plan ---------------- */}
      <div role="tabpanel" id={`${uid}-panel-2`} aria-labelledby={`${uid}-tab-2`} hidden={step !== 2} className="fp-panel">
        <h3 className="h-3">{t.longTerm.title}</h3>
        {!result.ok ? <ErrorSummary /> : (
          <div className="fp-table-wrap" tabIndex={0} aria-label={t.longTerm.title}>
            <table className="fp-table">
              <thead>
                <tr>
                  <th scope="col">{t.longTerm.horizon}</th>
                  <th scope="col">{t.longTerm.activeYears}</th>
                  {SCENARIOS.map((id) => <th key={id} scope="col" className={plan.selected === id ? "sel" : ""}>{t.scenarios[id]}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.longTerm.planned.map((row, i) => (
                  <tr key={row.horizon}>
                    <th scope="row">{fill(t.longTerm.years, { n: count(numLocale, row.horizon) })}</th>
                    <td>{count(numLocale, row.activeYears)}</td>
                    {SCENARIOS.map((id) => <td key={id}>{fMoney(result.longTerm[id][i].cost)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-note">{t.longTerm.note}</p>
      </div>

      {/* ---------------- Step 4 — final calculation ---------------- */}
      <div role="tabpanel" id={`${uid}-panel-3`} aria-labelledby={`${uid}-tab-3`} hidden={step !== 3} className="fp-panel">
        <h3 className="h-3">{t.final.title}</h3>
        <div className="fp-row fp-final-inputs">
          <div className="fp-field">
            <label htmlFor={fid("selected")}>{t.final.scenario}</label>
            <select id={fid("selected")} value={plan.selected} onChange={(e) => onChange("selected", e.target.value)}>
              {SCENARIOS.map((id) => <option key={id} value={id}>{t.scenarios[id]}</option>)}
            </select>
          </div>
          <Field path="months" label={t.final.months} value={plan.months} onChange={onChange} error={errOf("months")} />
        </div>
        {!result.ok ? <ErrorSummary /> : (() => {
          const f = result.final;
          return (
            <div className="fp-final" aria-live="polite">
              <p className="fp-final-heading">{fill(t.final.heading, { scenario: t.scenarios[plan.selected], months: count(numLocale, f.months) })}</p>
              <p className="fp-total"><span className="fp-total-label">{t.final.total}</span><span className="fp-total-value">{fMoneyFinal(f.total)}</span></p>
              <dl className="fp-breakdown">
                <div><dt>{t.final.training}</dt><dd>{fMoneyFinal(f.trainingCost)}</dd></div>
                <div><dt>{t.final.extras}</dt><dd>{fMoneyFinal(f.extraCosts)}</dd></div>
                <div className="sub"><dt>{t.final.oneOff}</dt><dd>{fMoneyFinal(f.oneOffCosts)}</dd></div>
                <div className="sub"><dt>{t.final.monthly}</dt><dd>{fMoneyFinal(f.monthlyExtraCosts)} × {count(numLocale, f.months)}</dd></div>
                <div><dt>{t.final.sessions}</dt><dd>{count(numLocale, f.playerSessions)}</dd></div>
                <div><dt>{t.final.hours}</dt><dd>{hours(numLocale, f.playerHours, 2)} {t.units.h}</dd></div>
                <div><dt>{t.final.contacts}</dt><dd>{count(numLocale, f.contacts)}</dd></div>
              </dl>
              <div className="fp-formula">
                <p className="fp-formula-title">{t.final.formulaTitle}</p>
                <p>{t.final.formula}</p>
                <p className="fp-note">{t.final.formulaNote}</p>
              </div>
              <details className="fp-inputs">
                <summary>{t.final.inputs}</summary>
                <dl className="fp-breakdown">
                  {SCENARIO_FIELDS.map((k) => (
                    <div key={k}><dt>{t.fields[k].label}</dt><dd>{k === "cost" ? fMoneyFinal(result.values.scenarios[plan.selected][k]) : hours(numLocale, result.values.scenarios[plan.selected][k], 2)}</dd></div>
                  ))}
                  {ONE_OFF_EXTRAS.concat(MONTHLY_EXTRAS).map((k) => (
                    <div key={k}><dt>{t.extras[k]}</dt><dd>{fMoneyFinal(result.values.extras[k])}</dd></div>
                  ))}
                  {result.values.quoteSource && <div><dt>{t.extras.quoteSource}</dt><dd>{result.values.quoteSource}</dd></div>}
                  {result.values.quoteDate && <div><dt>{t.extras.quoteDate}</dt><dd>{result.values.quoteDate}</dd></div>}
                </dl>
              </details>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
