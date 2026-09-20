import Image from "next/image";
import { partnershipItems, site } from "../data/site";

export default function Partnership() {
  return (
    <section id="partnership" className="sectionPad partnershipSection">
      <div className="shell">
        <div className="partnershipHero">
          <div className="partnershipCopy">
            <p className="eyebrow lightEyebrow">Partnership</p>
            <h2>Stronger<br />Together</h2>
            <p>People. Technology. Tennis.</p>
            <p className="partnershipBody">We work with clubs, academies, coaches, athletes, retailers and strategic distributors to create structured commercial relationships around equipment, methodology and market development.</p>
            <a className="whiteButton" href={`mailto:${site.email}?subject=MAXIMUS%20Partnership%20Enquiry`}>Become a partner <span>→</span></a>
          </div>
          <div className="partnershipImage">
            <Image src="/images/partnership-reference.jpg" alt="Temporary MAXIMUS partnership visual" fill sizes="(max-width: 900px) 100vw, 50vw" style={{objectFit:"cover"}} priority={false}/>
          </div>
        </div>
        <div className="partnershipBelow">
          <div>
            <p className="eyebrow">What we can build together</p>
            <h3>Partnerships for a stronger tennis ecosystem.</h3>
          </div>
          <div className="opportunityGrid">
            {partnershipItems.map((item) => <div className="opportunity" key={item}>{item}<span>+</span></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}
