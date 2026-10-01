"use client";
import { useId, useState } from "react";
import { useLeadSubmit } from "./useLeadSubmit";

/**
 * Subscription to site updates. One field, one action.
 *
 * It posts to the same intake as every other form on the site (purpose "updates"), so it inherits
 * the anti-spam checks, the authoritative validation, the rate limit, the idempotent durable save
 * and the notification with retries. The address is the only thing asked for and the only thing
 * stored; pressing the button is the affirmative act, and the sentence under the field says
 * exactly what that act means.
 */
export default function Subscribe({ locale, dict }) {
  const t = dict;
  const id = useId();
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [error, setError] = useState(null);
  const { state, submit } = useLeadSubmit({ purpose: "updates", locale, context: { from: "direct" } });

  if (state === "accepted") {
    return (
      <div className="subscribe">
        <p className="subscribe-done" role="status">{t.done}</p>
      </div>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    const value = email.trim();
    if (!value || !value.includes("@") || value.length > 254) {
      setError(t.invalid);
      return;
    }
    setError(null);
    const r = await submit({ fields: { email: value }, consent: true, hp });
    if (!r.ok) setError(r.code === "invalid" ? t.invalid : t.failed);
  }

  const busy = state === "submitting";
  return (
    <form className="subscribe" onSubmit={onSubmit} noValidate>
      <p className="subscribe-line">{t.line}</p>
      <div className="subscribe-row">
        <label className="sr-only" htmlFor={`${id}-email`}>{t.label}</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck="false"
          placeholder={t.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-err` : `${id}-terms`}
          disabled={busy}
          required
        />
        <input
          className="hp-field"
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
        <button type="submit" disabled={busy}>{busy ? t.sending : t.button}</button>
      </div>
      {error && <p className="subscribe-error" id={`${id}-err`} role="alert">{error}</p>}
      <p className="subscribe-terms" id={`${id}-terms`}>{t.terms}</p>
    </form>
  );
}
