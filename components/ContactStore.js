import { site } from "../data/site";

export default function ContactStore() {
  return (
    <section id="contact" className="sectionPad darkBand">
      <div className="shell">
        <p className="eyebrow lightEyebrow">Contact</p>
        <h2 className="sectionTitle lightTitle">Contact us directly.</h2>
        <p className="sectionLead lightLead">Choose the most convenient way to reach the MAXIMUS tennis team or explore the current racquet range.</p>
        <div className="contactStoreGrid">
          <div className="darkCard contactCard">
            <div className="contactItems">
              <a href={`mailto:${site.email}`}><span className="iconCircle">@</span><strong>Email</strong><small>{site.email}</small></a>
              <a href={site.instagram} target="_blank" rel="noreferrer"><span className="iconCircle">◎</span><strong>Instagram</strong><small>@maximus_gps</small></a>
              <a href={site.website} target="_blank" rel="noreferrer"><span className="iconCircle">↗</span><strong>Website</strong><small>maximus.tennis</small></a>
            </div>
          </div>
          <div className="darkCard storeCard">
            <div><h3>Visit our store</h3><p>Explore the current MAXIMUS racquet range and tennis equipment.</p></div>
            <a className="whiteButton" href={site.store} target="_blank" rel="noreferrer">Open Online Store <span>→</span></a>
          </div>
        </div>
      </div>
    </section>
  );
}
