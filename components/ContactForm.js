"use client";
import { useSearchParams } from "next/navigation";
import LeadForm from "./LeadForm";
import { requestPurposes } from "../data/site";
import { SERIES_IDS } from "../lib/intake/schema";

export default function ContactForm({ dict, locale }) {
  const sp = useSearchParams();
  const p = sp.get("purpose");
  const s = sp.get("series");
  const initial = requestPurposes.includes(p) ? p : "general";
  const prefill = SERIES_IDS.includes(s) ? { seriesInterest: s } : undefined;
  return <LeadForm key={`${initial}-${s || ""}`} dict={dict} locale={locale} purposes={requestPurposes} initialPurpose={initial} prefill={prefill} series={prefill ? s : undefined} context={{ from: "contact" }} />;
}
