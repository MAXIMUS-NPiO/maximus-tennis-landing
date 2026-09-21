import Link from "next/link";
import { ecosystemNodes } from "../data/site";
import { href } from "../lib/paths";

export function EcosystemStrip({ locale, dict }) {
  const nodes = dict.ecosystem.nodes;
  return (
    <div className="eco-strip" aria-label={dict.common.ecosystemStrip}>
      <div className="shell">
        <b>{dict.common.ecosystemStrip}</b>
        {ecosystemNodes.map((n) => <Link key={n.id} href={href(locale, n.href)}>{nodes[n.id].h}</Link>)}
        <Link href={href(locale, "ecosystem")} className="more">{dict.home.map.cta} →</Link>
      </div>
    </div>
  );
}

export function EcosystemMap({ locale, dict, compact = false }) {
  const nodes = dict.ecosystem.nodes;
  const st = dict.common.statuses;
  return (
    <div className="eco-map">
      {ecosystemNodes.map((n, i) => (
        <Link key={n.id} href={href(locale, n.href)} className="eco-node">
          <span className="num">{String(i + 1).padStart(2, "0")}</span>
          <h3>{nodes[n.id].h}</h3>
          {!compact && <p>{nodes[n.id].p}</p>}
          <span className={`status ${n.status}`}>{st[n.status]}</span>
          <span className="next">{nodes[n.id].a} →</span>
        </Link>
      ))}
    </div>
  );
}
