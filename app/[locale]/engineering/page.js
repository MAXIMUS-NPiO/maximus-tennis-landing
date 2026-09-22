import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Steps, Note, Kickers } from "../../../components/Ui";
import { Photo } from "../../../components/Media";
import { InspectionVideo } from "../../../components/Video";
import { inspectionVideo } from "../../../data/media";

export const generateMetadata = meta("engineering", (d) => [d.engineering.title, d.engineering.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const E = dict.engineering;
  return (
    <>
      <PageHero eyebrow={dict.nav.engineering} title={E.title} statement={E.statement} lead={E.lead} />
      <Section first band="band-2">
        <div className="grid-2">{E.manifesto.map((m) => <p key={m} className="statement" style={{ textTransform: "none", fontSize: "clamp(22px,3vw,34px)" }}>{m}</p>)}</div>
      </Section>
      <Section title={E.capabilityTitle} lead={E.capabilityLead}>
        <Steps items={E.sequence} />
        <Note>{E.capacityNote}</Note>
        <Note red>{E.truth}</Note>
        <div className="btn-row"><Cta locale={locale} to="distribution" label={E.cta} /><Cta locale={locale} to="custom" label={E.cta2} kind="btn-outline" /></div>
      </Section>
      <Section id="qc" band="band-1" eyebrow={dict.home.manufacturing.eyebrow} title={dict.home.manufacturing.title}>
        <p className="lead" style={{ marginBottom: 24 }}>{dict.home.manufacturing.p}</p>
        <div className="detail-grid">
          <Photo id="lettering" alt={dict.media.lettering} caption={dict.home.manufacturing.captions.lettering} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="buttcap" alt={dict.media.buttcap} caption={dict.home.manufacturing.captions.buttcap} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="powerHandle" alt={dict.media.powerHandle} caption={dict.home.manufacturing.captions.handle} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="finish" alt={dict.media.finish} caption={dict.home.manufacturing.captions.finish} sizes="(min-width: 760px) 24vw, 46vw" />
        </div>
        {inspectionVideo.released && <InspectionVideo src={inspectionVideo.src} poster={inspectionVideo.poster} label={dict.media.greatHead} caption={dict.media.greatHead} />}
        <div className="grid-2" style={{ marginTop: 24 }}>
          <div className="card"><span className="status confirmed">{dict.common.statuses.confirmed}</span><h3 style={{ marginTop: 12 }}>{dict.home.manufacturing.confirmedTitle}</h3><Kickers items={dict.home.manufacturing.confirmed} /></div>
          <div className="card"><span className="status notprovided">{dict.common.statuses.notprovided}</span><h3 style={{ marginTop: 12 }}>{dict.home.manufacturing.pendingTitle}</h3><p>{dict.home.manufacturing.pending}</p></div>
        </div>
      </Section>
    </>
  );
}
