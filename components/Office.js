import { site } from "../data/site";

export default function Office() {
  return (
    <section id="office" className="sectionPad officeSection">
      <div className="shell">
        <p className="eyebrow">Office & correspondence</p>
        <h2 className="sectionTitle">Start the conversation.</h2>
        <div className="officeGrid">
          <article className="officeMain"><h3>Institutional operator</h3><p><strong>MAXIMUS INVESTMENT BUSINESS CLUB NPIO</strong><br />DIFC, Dubai, UAE</p><p>Commercial coordination for tennis equipment: MAXIMUS SPORTS EQUIPMENT TRADING LLC.</p><p>Brand and IP coordination: MAXIMUS VEGAS L.L.C-FZ. MIPA internal IP control.</p><a href={`mailto:${site.email}`}>{site.email}</a></article>
          <article className="officeVisual"><p>People.<br />Technology.<br />Tennis.</p><span>Your Navigation in the World of Tennis.</span></article>
        </div>
        <div className="actionGrid">
          <a href={`mailto:${site.email}?subject=MAXIMUS%20Meeting%20Request`}><b>Book a meeting</b><span>Request a discussion about partnership, equipment or market development.</span><em>Choose a time →</em></a>
          <a href={`mailto:${site.email}?subject=MAXIMUS%20Materials%20Request`}><b>Request materials</b><span>Ask for current product specifications and partnership information.</span><em>Send a request →</em></a>
          <a href={`mailto:${site.email}`}><b>General enquiries</b><span>Contact the team directly for other MAXIMUS tennis matters.</span><em>Contact us →</em></a>
        </div>
      </div>
    </section>
  );
}
