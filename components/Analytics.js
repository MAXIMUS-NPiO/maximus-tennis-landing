"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "../lib/client/attribution";
import { ANALYTICS_CONFIGURED, GA_ID, getConsent, setConsent } from "../lib/client/consent";
import { UTM_KEYS, CLICK_ID_KEYS } from "../lib/intake/schema";

let gaLoaded = false;

function loadGa() {
  if (gaLoaded || !ANALYTICS_CONFIGURED) return;
  gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
  };
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** page_view with a controlled location: path + allowlisted campaign parameters; referrer origin only. */
function pageView(pathname) {
  if (typeof window.gtag !== "function") return;
  const params = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of [...UTM_KEYS, ...CLICK_ID_KEYS]) {
    const v = params.get(k);
    if (v && /^[\p{L}\p{N} ._~+\-:/|%()]{1,100}$/u.test(v)) keep.set(k, v);
  }
  let referrer = "";
  try {
    referrer = document.referrer ? `${new URL(document.referrer).origin}/` : "";
  } catch {
    referrer = "";
  }
  const q = keep.toString();
  window.gtag("event", "page_view", { page_location: `${window.location.origin}${pathname}${q ? `?${q}` : ""}`, page_referrer: referrer, page_title: document.title });
}

export default function Analytics({ locale, dict }) {
  const pathname = usePathname();
  const [consent, setConsentState] = useState(undefined);

  useEffect(() => {
    captureAttribution(locale);
  }, [pathname, locale]);

  useEffect(() => {
    setConsentState(getConsent());
    const onChange = (e) => setConsentState(e.detail === "granted" || e.detail === "denied" ? e.detail : null);
    window.addEventListener("mx:consent", onChange);
    return () => window.removeEventListener("mx:consent", onChange);
  }, []);

  useEffect(() => {
    if (ANALYTICS_CONFIGURED && consent === "granted") {
      loadGa();
      pageView(pathname);
    }
  }, [pathname, consent]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-consent-bar", ANALYTICS_CONFIGURED && consent === null);
  }, [consent]);

  if (!ANALYTICS_CONFIGURED || consent !== null) return null;
  const C = dict;
  return (
    <div className="consent-bar" role="region" aria-label={C.title}>
      <div className="shell consent-inner">
        <p><strong className="consent-title">{C.title}</strong> {C.text}</p>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button type="button" className="btn" onClick={() => setConsent("granted")}>{C.allow}</button>
          <button type="button" className="btn-outline" onClick={() => setConsent("denied")}>{C.decline}</button>
        </div>
      </div>
    </div>
  );
}

export function ConsentSettings({ label }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(ANALYTICS_CONFIGURED), []);
  if (!show) return null;
  return (
    <button
      type="button"
      className="footer-linkbtn"
      onClick={() => {
        try {
          window.localStorage.removeItem("mx.consent");
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent("mx:consent", { detail: null }));
      }}
    >
      {label}
    </button>
  );
}
