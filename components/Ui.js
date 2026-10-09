import { href } from "../lib/paths";
import CtaLink from "./CtaLink";

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

/**
 * A section of a page. Sections carry no rule and no plate of their own: the page is one surface
 * and the sections follow one another on it (Founder, 8 October 2026: "no line between the parts,
 * one story"). `band` is kept as a hook for the few sections that set something of their own.
 * `center` sets the heading, lead and actions on the axis of the page.
 */
export function Section({ id, band = "", eyebrow, title, lead, children, first = false, narrow = false, center = false }) {
  const cls = ["section", band, first && "first", center && "is-center"].filter(Boolean).join(" ");
  return (
    <section id={id} className={cls}>
      <div className={`shell ${narrow ? "narrow" : ""}`}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h2 className={`h-2 section-title${lead ? " has-lead" : ""}`}>{title}</h2>}
        {lead && <p className="lead section-lead">{lead}</p>}
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

/** Call to action. `query` is appended verbatim (validated values only); `track` names the CTA for analytics. */
export function Cta({ locale, to, label, kind = "btn", purpose, query, track, series }) {
  const base = href(locale, to);
  const q = query || (purpose ? `purpose=${purpose}` : "");
  const url = q ? `${base}?${q}` : base;
  return (
    <CtaLink className={kind} href={url} cta={track} locale={locale} series={series}>
      {label} <span aria-hidden="true">→</span>
    </CtaLink>
  );
}

export function Note({ children, red = false }) {
  return <p className={`note ${red ? "red" : ""}`}>{children}</p>;
}

/** The four questions every audience page answers. */
export function Brief({ labels, brief }) {
  if (!brief) return null;
  return (
    <dl className="brief">
      {["who", "value", "now", "next"].map((k) => (
        <div key={k}><dt>{labels[k]}</dt><dd>{brief[k]}</dd></div>
      ))}
    </dl>
  );
}
