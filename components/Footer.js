import Link from "next/link";
import Logo from "./Logo";
import { site, entities } from "../data/site";
import { href } from "../lib/paths";
import { ConsentSettings } from "./Analytics";
import Subscribe from "./Subscribe";

/**
 * The footer is collapsed by default. Three link groups and the legal block open on demand
 * (native <details>, no script), so the page ends where the content ends instead of carrying a
 * full second navigation and four paragraphs of corporate text on every screen.
 */
function Group({ title, items, locale, nav }) {
  return (
    <details className="footer-acc">
      <summary>{title}</summary>
      <div className="footer-acc-links">
        {items.map((k) => <Link key={k} href={href(locale, k)}>{nav[k]}</Link>)}
      </div>
    </details>
  );
}

export default function Footer({ locale, dict }) {
  const { nav, footer } = dict;
  const product = ["choose", "racquets", "precision", "grip", "custom", "training", "gps", "build"];
  const eco = ["ecosystem", "engineering", "experience", "brands", "families", "owners", "network"];
  const org = ["partnerships", "contact", "legal", "privacy", "terms"];
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-logo"><Logo height={38} /></div>
        <p className="footer-line">{footer.line}</p>
        <div className="footer-contacts">
          <a href={`mailto:${site.email}`}>{site.email}</a>
          <a href={site.instagram} target="_blank" rel="noreferrer">{footer.instagram} {site.instagramHandle}</a>
        </div>
      </div>
      <div className="shell footer-subscribe">
        <h2 className="footer-sub-h">{footer.subscribe.title}</h2>
        <Subscribe locale={locale} dict={footer.subscribe} />
      </div>
      <div className="shell footer-acc-row">
        <Group title={footer.product} items={product} locale={locale} nav={nav} />
        <Group title={footer.ecosystem} items={eco} locale={locale} nav={nav} />
        <Group title={footer.company} items={org} locale={locale} nav={nav} />
      </div>
      <div className="shell footer-bottom">
        {/* The copyright notice names the author himself, not the brand: under the Berne Convention
            the name appearing on the work in the usual manner is the presumed author and rights
            holder. It also opens the corporate and boundary statements, which belong on the page
            but not in front of every visitor. */}
        <details className="footer-legal">
          <summary>© 2026 Maximus Kiriyakulov</summary>
          <div className="footer-legal-body">
            <p>{entities.institutional.name} · {entities.equipment.name} · {entities.ip.name}</p>
            <p>{footer.rights}</p>
            <p>{footer.boundary}</p>
          </div>
        </details>
        <ConsentSettings label={footer.analytics} />
      </div>
    </footer>
  );
}
