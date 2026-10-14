/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, meta } from "../../../../lib/page";
import { sweetSpotTrainer as sst, standardLengths } from "../../../../data/products";
import { PageHero, Section, Cta, Kickers, Note } from "../../../../components/Ui";
import { GripRow } from "../../../../components/Product";
import { Photo } from "../../../../components/Media";
import { sstGallery, sstDetails } from "../../../../data/media";
import LengthOptions from "../../../../components/LengthOptions";

export const generateMetadata = meta("sst", (d) => [d.sst.title, d.sst.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.sst, L = dict.common.labels;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={S.title} lead={S.lead}>
        <div className="hero-meta">
          <div><b>{sst.headSizeSqIn} {L.sqin}</b>{S.columns.head}</div>
          <div><b>{standardLengths[0].inches}–{standardLengths.at(-1).inches} {L.inches}</b>{dict.catalogue.standard} · {standardLengths.length}</div>
          <div><b>{sst.stringPattern}</b>{S.columns.pattern}</div>
          <div><b>{sst.grips}</b>{S.columns.grips}</div>
        </div>
      </PageHero>
      <Section first>
        <Photo id="sstSystem" alt={dict.media.sstSystem} caption={`${S.baseline} · ${sst.headSizeSqIn} ${L.sqin} · ${sst.lengthIn}″ · ${sst.stringPattern}`} priority sizes="(min-width: 1024px) 900px, 100vw" className="hero-photo" />
      </Section>
      <Section title={S.systemTitle}>
        <LengthOptions dict={dict} productId="sst" />
        <div className="matrix weights-only" role="list" aria-label={S.systemTitle}>
          {sst.system.map((x) => <div key={x.weight} role="listitem"><b>{x.weight} {L.grams}</b></div>)}
        </div>
        <div className="btn-row"><Cta locale={locale} to="build" query="series=sst" label={dict.build.cta} /></div>
        <h3 className="h-3" style={{ marginTop: 32 }}>{S.baseline} · {sst.lengthIn} {L.inches}</h3>
        <p>{S.systemLead}</p>
        <div className="matrix" role="list" aria-label={`${S.baseline} · ${sst.lengthIn} ${L.inches}`} data-historical-sst-length={sst.lengthIn}>
          {sst.system.filter((x) => x.balance !== null).map((x) => <div key={x.weight} role="listitem"><b>{x.weight} {L.grams}</b><span>{L.balance}: {x.balance} {L.mm}</span></div>)}
        </div>
        <div className="detail-grid" style={{ marginTop: 20 }}>
          {sstGallery.map((k) => <Photo key={k} id={k} alt={dict.media[k]} caption={`${S.baseline} · ${dict.media[k]}`} sizes="(min-width: 760px) 38vw, 48vw" />)}
        </div>
        <Note red>{S.heavy}</Note>
      </Section>
      <Section title={S.detailsTitle}>
        <div className="detail-grid three">
          {sstDetails.map((k) => <Photo key={k} id={k} alt={dict.media[k]} caption={`${S.baseline} · ${dict.media[k]}`} sizes="(min-width: 760px) 30vw, 92vw" />)}
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
