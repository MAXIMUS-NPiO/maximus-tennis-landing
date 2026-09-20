import { site } from "../data/site";

export default function Distribution() {
  return (
    <section id="distribution" className="sectionPad distributionBand">
      <div className="shell distributionGrid">
        <div>
          <p className="eyebrow lightEyebrow">Strategic distribution</p>
          <div className="distributionAmount">€1M+</div>
          <h2>Entry to partnership<br />for distributors.</h2>
        </div>
        <div className="distributionText">
          <p>For strategic distributor discussions, the indicated partnership entry level is from EUR 1,000,000.</p>
          <p>Territory, assortment, exclusivity, delivery schedule, commercial rights, performance obligations and final economics are not assumed by this page and are agreed separately in writing.</p>
          <a className="whiteButton" href={`mailto:${site.email}?subject=MAXIMUS%20Strategic%20Distribution%20Enquiry`}>Discuss distribution <span>→</span></a>
        </div>
      </div>
    </section>
  );
}
