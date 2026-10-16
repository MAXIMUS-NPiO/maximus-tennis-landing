/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { catalogue } from "../data/catalogue";
import { localeMeta } from "../lib/i18n";
import { fill } from "../content/catalogue-download-copy.js";
import { Cta } from "./Ui";

/** Edition, date and data version, then the file facts — formatted for the reader's language. */
export function catalogueFacts(locale, K) {
  const lang = localeMeta[locale]?.htmlLang || "en";
  const date = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${catalogue.date}T00:00:00Z`));
  const size = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(catalogue.bytes / 1e6);
  return {
    // The data version is isolated (U+2066 … U+2069) so a right-to-left page keeps "2026-10-16.F" intact.
    edition: fill(K.edition, { edition: catalogue.edition, date, version: `\u2066${catalogue.productDataVersion}\u2069` }),
    file: fill(K.file, { pages: catalogue.pages, size }),
  };
}

/**
 * The catalogue download: the stable address of the current edition, with its edition, date, data
 * version, page count and size printed beside it. `configure` adds the configurator next to it.
 */
export default function CatalogueDownload({ locale, dict, configure = false, page = false }) {
  const K = dict.catalogueDownload;
  const f = catalogueFacts(locale, K);
  return (
    <div className="catalogue-download">
      <div className="btn-row">
        <a className="btn" href={catalogue.stablePath} download={catalogue.fileName} type="application/pdf" data-cta="catalogue_pdf">
          {K.download} <span aria-hidden="true">↓</span>
        </a>
        {page && <Cta locale={locale} to="catalogue" label={K.heroCatalogue} kind="btn-outline" track="catalogue_page" />}
        {configure && <Cta locale={locale} to="build" label={dict.racquets.ctaConfigure} kind="btn-outline" track="catalogue_configure" />}
      </div>
      <p className="note catalogue-facts">{f.edition} · {f.file}</p>
    </div>
  );
}
