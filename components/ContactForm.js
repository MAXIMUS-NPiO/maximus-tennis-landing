"use client";
import { useSearchParams } from "next/navigation";
import RequestForm from "./RequestForm";

export default function ContactForm({ dict }) {
  const sp = useSearchParams();
  return <RequestForm dict={dict} initialPurpose={sp.get("purpose") || "general"} prefillKey="mx.gps.handoff" />;
}
