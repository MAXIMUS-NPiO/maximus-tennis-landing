import Link from "next/link";
import { href } from "../lib/paths";

export function PageHero({ eyebrow, title, lead, statement, children }) {
  return (
    <section className="page-hero">
      <div className="shell">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h-1">{title}</h1>
        {statement && <p className="statement" style={{ marginTop: 18 }}>{statement}</p>}
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

export function Section({ id, band = "", eyebrow, title, lead, children, first = false, narrow = false }) {
  return (
    <section id={id} className={`section ${band} ${first ? "first" : ""}`}>
      <div className={`shell ${narrow ? "narrow" : ""}`}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h2 className="h-2" style={{ marginBottom: lead ? 14 : 24 }}>{title}</h2>}
        {lead && <p className="lead" style={{ marginBottom: 28 }}>{lead}</p>}
        {children}
      </div>
    </section>
  );
}

export function Status({ kind, labels }) {
  return <span className={`status ${kind}`}>{labels[kind] || kind}</span>;
}

export function Steps({ items }) {
  return (
    <ol className="steps">
      {items.map(([t, s], i) => <li key={i}><div><strong>{t}</strong><span>{s}</span></div></li>)}
    </ol>
  );
}

export function Kickers({ items }) {
  return <ul className="kicker-list">{items.map((t, i) => <li key={i}><span>{t}</span></li>)}</ul>;
}

export function Chain({ items, big = false }) {
  return (
    <div className={`chain ${big ? "big" : ""}`}>
      {items.map((t, i) => (
        <span key={i}>{t}{i < items.length - 1 && <i aria-hidden="true"> →</i>}</span>
      ))}
    </div>
  );
}

export function Cta({ locale, to, label, kind = "btn", purpose }) {
  const base = href(locale, to);
  const url = purpose ? `${base}?purpose=${purpose}` : base;
  return <Link className={kind} href={url}>{label} <span aria-hidden="true">→</span></Link>;
}

export function Note({ children, red = false }) {
  return <p className={`note ${red ? "red" : ""}`}>{children}</p>;
}
