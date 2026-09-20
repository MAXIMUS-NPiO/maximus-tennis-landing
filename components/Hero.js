import { site } from "../data/site";

export default function Hero() {
  return (
    <section id="top" className="hero sectionPad">
      <div className="shell heroGrid">
        <div className="heroCopy">
          <p className="eyebrow">MAXIMUS GPS / TENNIS</p>
          <h1>Let’s build<br />what’s next.</h1>
          <p className="heroLead">
            Fully carbon racquets, structured training methodology, personalised equipment and strategic partnerships for players, coaches, clubs and distributors.
          </p>
          <div className="buttonRow">
            <a className="pillButton" href={`mailto:${site.email}`}>Send a message <span>→</span></a>
            <a className="outlineButton" href="#methodology">Explore methodology</a>
          </div>
        </div>
        <div className="heroVisual" role="img" aria-label="MAXIMUS tennis visual placeholder">
          <div className="heroWords">Same Passion.<br />Different Places.</div>
          <div className="heroSub">TENNIS HAS NO BORDERS.</div>
          <div className="racquetLine" aria-hidden="true"><span /></div>
        </div>
      </div>
    </section>
  );
}
