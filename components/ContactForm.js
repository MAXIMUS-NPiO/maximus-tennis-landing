/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useSearchParams } from "next/navigation";
import LeadForm from "./LeadForm";
import { requestPurposes } from "../data/site";
import { SERIES_IDS } from "../lib/intake/schema";
import { getSeries } from "../data/products";

export default function ContactForm({ dict, locale }) {
  const sp = useSearchParams();
  const p = sp.get("purpose");
  const s = sp.get("series");
  const initial = requestPurposes.includes(p) ? p : "general";
  const known = SERIES_IDS.includes(s) ? getSeries(s) : null;
  // A valuation names the configuration being valued; from a series page it starts with that series.
  const prefill = known ? (initial === "valuation" ? { configuration: `${known.name} · ${known.headSizeSqIn} in²` } : { seriesInterest: s }) : undefined;
  return <LeadForm key={`${initial}-${s || ""}`} dict={dict} locale={locale} purposes={requestPurposes} initialPurpose={initial} prefill={prefill} series={prefill ? s : undefined} context={{ from: "contact" }} />;
}
