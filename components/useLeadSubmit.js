"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics";
import { getAttribution } from "../lib/client/attribution";

const TIMEOUT_MS = 20000;

function uuidv4() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Submission state machine: editing → submitting → accepted | failed (| editing with server errors).
 * The idempotency key is stable for an unchanged payload (a retry or a double click never creates a
 * second request) and is regenerated when the payload changes.
 */
export function useLeadSubmit({ purpose, locale, context = {}, series }) {
  const [state, setState] = useState("editing");
  const [result, setResult] = useState(null);
  const keyRef = useRef({ sig: null, key: null });
  const startRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    startRef.current = now();
  }, []);

  const submit = useCallback(
    async ({ fields, config, profile, consent, hp }) => {
      if (busyRef.current) return { ok: false, code: "busy" };
      busyRef.current = true;
      const body = { purpose, locale, fields, ...(config ? { config } : {}), ...(profile ? { profile } : {}), consent: consent === true };
      const sig = JSON.stringify(body);
      if (keyRef.current.sig !== sig) keyRef.current = { sig, key: uuidv4() };
      const payload = {
        ...body,
        idempotencyKey: keyRef.current.key,
        elapsedMs: Math.max(0, Math.round(now() - startRef.current)),
        hp: hp || "",
        attribution: getAttribution(),
        context: { page: window.location.pathname, ...context },
      };
      const a = { purpose, locale, series };
      setState("submitting");
      setResult(null);
      track("lead_submit_attempt", a);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res;
      let data = null;
      try {
        res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        data = await res.json().catch(() => null);
      } catch (e) {
        clearTimeout(timer);
        busyRef.current = false;
        const code = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : e && e.name === "AbortError" ? "timeout" : "network";
        setState("failed");
        setResult({ code });
        track("lead_submit_error", { ...a, error_code: code });
        return { ok: false, code };
      }
      clearTimeout(timer);
      busyRef.current = false;

      if (res.ok && data && data.status === "accepted" && typeof data.request_id === "string") {
        setState("accepted");
        setResult({ requestId: data.request_id, duplicate: !!data.duplicate });
        track("lead_submit_success", { ...a, request_id: data.request_id });
        return { ok: true, requestId: data.request_id };
      }
      if (res.status === 400 && data && data.status === "invalid" && data.errors) {
        setState("editing");
        setResult({ code: "invalid", errors: data.errors });
        track("lead_submit_error", { ...a, error_code: "invalid" });
        return { ok: false, code: "invalid", errors: data.errors };
      }
      let code = (data && (data.code || data.status)) || `http_${res.status}`;
      if (res.status === 503) code = "unavailable";
      setState("failed");
      setResult({ code });
      track("lead_submit_error", { ...a, error_code: String(code).slice(0, 40) });
      return { ok: false, code };
    },
    [purpose, locale, series, context]
  );

  const reset = useCallback(() => {
    keyRef.current = { sig: null, key: null };
    startRef.current = now();
    setState("editing");
    setResult(null);
  }, []);

  return { state, result, submit, reset };
}
