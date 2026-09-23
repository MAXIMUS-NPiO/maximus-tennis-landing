import { ctx, meta } from "../../../../lib/page";
import { sweetSpotTrainer as sst } from "../../../../data/products";
import { PageHero, Section, Cta, Kickers, Note } from "../../../../components/Ui";
import { GripRow } from "../../../../components/Product";
import { Photo } from "../../../../components/Media";
import { sstGallery, sstDetails } from "../../../../data/media";

export const generateMetadata = meta("sst", (d) => [d.sst.title, d.sst.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.sst, L = dict.common.labels, ST = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={S.title} lead={S.lead}>
        <div className="hero-meta">
          <div><b>{sst.headSizeSqIn} {L.sqin}</b>{S.columns.head}</div>
          <div><b>{sst.lengthIn} {L.inches}</b>{S.columns.length}</div>
          <div><b>{sst.stringPattern}</b>{S.columns.pattern}</div>
          <div><b>{sst.grips}</b>{S.columns.grips}</div>
        </div>
      </PageHero>
      <Section first>
        <Photo id="sstSystem" alt={dict.media.sstSystem} caption={`${sst.headSizeSqIn} ${L.sqin} · ${sst.lengthIn}″ · ${sst.stringPattern}`} priority sizes="(min-width: 1024px) 900px, 94vw" className="hero-photo" />
      </Section>
      <Section title={S.systemTitle} lead={S.systemLead}>
        <span className="status confirmed" style={{ marginBottom: 14 }}>{S.baseline}</span>
        <div className="grid-4">
          {sst.system.map((x) => <div key={x.weight} className="stat"><b>{x.weight} {L.grams}</b><span>{L.balance}: {x.balance} {L.mm}</span></div>)}
        </div>
        <div className="detail-grid" style={{ marginTop: 20 }}>
          {sstGallery.map((k) => <Photo key={k} id={k} alt={dict.media[k]} caption={dict.media[k]} sizes="(min-width: 760px) 24vw, 46vw" />)}
        </div>
        <Note red>{S.heavy}</Note>
      </Section>
      <Section title={S.detailsTitle}>
        <div className="detail-grid three">
          {sstDetails.map((k) => <Photo key={k} id={k} alt={dict.media[k]} caption={dict.media[k]} sizes="(min-width: 760px) 30vw, 92vw" />)}
        </div>
      </Section>
      <Section band="band-2" title={S.purposeTitle}><Kickers items={S.purpose} /></Section>
      <Section band="band-1">
        <GripRow dict={dict} emphasise={false} />
        <div className="stack" style={{ marginTop: 24 }}><Note>{S.precisionNote}</Note><Note>{S.health}</Note></div>
        <div className="btn-row"><Cta locale={locale} to="experience" label={S.cta} /></div>
      </Section>
    </>
  );
}
