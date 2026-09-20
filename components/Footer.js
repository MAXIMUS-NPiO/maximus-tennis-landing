import Brand from "./Brand";
import { site } from "../data/site";

export default function Footer() {
  return (
    <footer className="siteFooter"><div className="shell footerGrid"><div><Brand inverse /><p className="footerText">Fully Carbon Racquets · Training Methodology · Personalised Branding</p></div><div><strong>Quick links</strong><a href="#methodology">Methodology</a><a href="#partnership">Partnership</a><a href="#distribution">Distribution</a><a href="#contact">Contact</a></div><div><strong>Contact</strong><a href={`mailto:${site.email}`}>{site.email}</a><a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a><a href={site.store} target="_blank" rel="noreferrer">MAXIMUS SPORTS</a></div></div><div className="shell footerBottom">© 2026 MAXIMUS. MIPA internal control. Commercial and contractual terms are subject to separate written agreement.</div></footer>
  );
}
