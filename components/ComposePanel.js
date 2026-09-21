"use client";
import { useState } from "react";
import { site } from "../data/site";
import { buildMailto, copyText, formatSummary } from "../lib/requests";
import { track } from "../lib/analytics";

/**
 * Shared "compose" panel: shows the prepared request text, the reference, and the two honest
 * routes to send it (open the visitor's own email application, or copy the text).
 * It never displays a "sent" state — nothing is transmitted by this website.
 */
export default function ComposePanel({ reference, title, entries, dict, eventName }) {
  const [copied, setCopied] = useState(false);
  const L = dict.common.labels;
  const C = dict.common.compose;
  const body = formatSummary(reference, title, entries);
  const subject = `${dict.form.subject} — ${reference}`;

  return (
    <div className="summary" aria-live="polite">
      <p className="eyebrow" style={{ marginBottom: 6 }}>{L.reference}</p>
      <div className="ref">{reference}</div>
      <hr />
      <pre>{body}</pre>
      <div className="tools">
        <a className="btn" href={buildMailto(subject, body)} onClick={() => track(eventName || "request_email_opened", { reference })}>
          {L.openEmail} <span aria-hidden="true">→</span>
        </a>
        <button type="button" className="btn-outline" onClick={async () => { setCopied(await copyText(body)); setTimeout(() => setCopied(false), 2500); }}>
          {copied ? L.copied : L.copy}
        </button>
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        <strong>{C.title}.</strong> {C.text} <a href={`mailto:${site.email}`}>{site.email}</a>. {C.notSent}
      </p>
    </div>
  );
}
