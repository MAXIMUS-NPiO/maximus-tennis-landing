import Brand from "./Brand";
import { site } from "../data/site";

export default function Header() {
  return (
    <header className="siteHeader">
      <div className="shell headerInner">
        <a className="brandLink" href="#top" aria-label="MAXIMUS GPS home"><Brand /></a>
        <nav className="desktopNav" aria-label="Primary navigation">
          <a href="#methodology">Methodology</a>
          <a href="#partnership">Partnership</a>
          <a href="#distribution">Distribution</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="pillButton headerCta" href={`mailto:${site.email}?subject=MAXIMUS%20Partnership%20Enquiry`}>
          Discuss a partnership <span>→</span>
        </a>
      </div>
    </header>
  );
}
