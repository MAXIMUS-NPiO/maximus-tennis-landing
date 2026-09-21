import { Suspense } from "react";
import { ctx, meta } from "../../../lib/page";
import { site } from "../../../data/site";
import { href } from "../../../lib/paths";
import { PageHero, Section } from "../../../components/Ui";
import ContactForm from "../../../components/ContactForm";

export const generateMetadata = meta("contact", (d) => [d.contact.title, d.contact.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const C = dict.contact;
  return (
    <>
      <PageHero eyebrow={dict.nav.contact} title={C.title} lead={C.lead}>
        <div className="hero-meta">
          <div><b><a href={`mailto:${site.email}`}>{site.email}</a></b>{C.email}</div>
          <div><b><a href={site.instagram} target="_blank" rel="noreferrer">{site.instagramHandle}</a></b>{C.instagram}</div>
          <div><b><a href={site.store} target="_blank" rel="noreferrer">maximussports.ae</a></b>{C.store}</div>
          <div><b><a href={href(locale, "legal")}>{dict.nav.legal}</a></b>{C.legalLink}</div>
        </div>
      </PageHero>
      <Section first><Suspense fallback={null}><ContactForm dict={dict} /></Suspense></Section>
    </>
  );
}
