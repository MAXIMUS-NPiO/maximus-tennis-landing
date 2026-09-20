import { methodologyCards } from "../data/site";

export default function Methodology() {
  return (
    <section id="methodology" className="sectionPad">
      <div className="shell">
        <p className="eyebrow">Methodology</p>
        <div className="sectionHeadingGrid">
          <h2 className="sectionTitle">Equipment is part<br />of a system.</h2>
          <p className="sectionLead">MAXIMUS combines equipment architecture, training logic, technical feedback and personalisation rather than treating the racquet as an isolated product.</p>
        </div>
        <div className="methodGrid">
          {methodologyCards.map((card, index) => (
            <article className="methodCard" key={card.kicker}>
              <span className="methodNumber">0{index + 1}</span>
              <p className="eyebrow">{card.kicker}</p>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
        <div className="specStrip">
          <div><strong>97 / 98 / 100 in²</strong><span>Playing racquet head sizes</span></div>
          <div><strong>245–315 g</strong><span>Playing racquet weights, unstrung</span></div>
          <div><strong>50 in²</strong><span>Sweet Spot Trainer head</span></div>
          <div><strong>270 / 285 / 300 / 400 g</strong><span>Current SST training weights</span></div>
        </div>
      </div>
    </section>
  );
}
