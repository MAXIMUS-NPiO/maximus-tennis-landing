import Link from "next/link";
import Logo from "./Logo";
import { site, entities } from "../data/site";
import { href } from "../lib/paths";
import { ConsentSettings } from "./Analytics";

export default function Footer({ locale, dict }) {
  const { nav, footer } = dict;
  const product = ["choose", "racquets", "precision", "grip", "custom", "training", "gps", "build"];
  const eco = ["ecosystem", "engineering", "experience", "brands", "families", "owners", "network"];
  const org = ["partnerships", "contact", "legal", "privacy", "terms"];
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="footer-logo"><Logo height={44} /></div>
          <p style={{ marginTop: 18, maxWidth: 380 }}>{footer.line}</p>
          <a href={`mailto:${site.email}`}>{site.email}</a>
          <a href={site.instagram} target="_blank" rel="noreferrer">{footer.instagram} {site.instagramHandle}</a>
          <ConsentSettings label={footer.analytics} />
        </div>
        <div><h2 className="footer-h">{footer.product}</h2>{product.map((k) => <Link key={k} href={href(locale, k)}>{nav[k]}</Link>)}</div>
        <div><h2 className="footer-h">{footer.ecosystem}</h2>{eco.map((k) => <Link key={k} href={href(locale, k)}>{nav[k]}</Link>)}</div>
        <div><h2 className="footer-h">{footer.company}</h2>{org.map((k) => <Link key={k} href={href(locale, k)}>{nav[k]}</Link>)}</div>
      </div>
      <div className="shell footer-bottom">
        <div>{entities.institutional.name} · {entities.equipment.name} · {entities.ip.name}</div>
        <div>{footer.rights}</div>
        <div>{footer.boundary}</div>
        <div>© 2026 MAXIMUS</div>
      </div>
    </footer>
  );
}
