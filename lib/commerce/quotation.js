/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Formal quotation only with server-approved price/bank and final technical agreement.
 * Not payment proof; never creates a payment link or paid invoice.
 */
import { series } from '../../data/products';
export function formalQuotation(snapshot, orderId) {
  const q=snapshot.offer, bank=q?.bankDetails, quantity=snapshot.configuration.racquetsTotal;
  if(!q || !snapshot.technical?.final || !bank?.approved || !bank.evidence || bank.currency!==q.currency ||
      !bank.bankName || !bank.accountName || !bank.accountNumber || !bank.swift ||
      !Number.isSafeInteger(quantity) || quantity<1 || !Number.isSafeInteger(q.totalMinor/quantity)) return null;
  return {number:`TEST-QUOTE-${orderId.slice(7)}`,status:'quotation',test:true,orderId,projectId:snapshot.projectId,
    issuedAt:snapshot.createdAt,expiresAt:q.expiresAt,seller:q.seller,buyer:snapshot.contact,currency:q.currency,
    items:[{description:series[snapshot.configuration.series].name,configuration:snapshot.configuration,
      ...(snapshot.configuration.mode==='custom'?{deliveryCondition:'unstrung'}:{}),
      technical:snapshot.technical,quantity,unitPriceMinor:q.totalMinor/quantity,lineTotalMinor:q.totalMinor}],
    totalMinor:q.totalMinor,pricingPolicy:q.pricingPolicy,deliveryTerms:q.deliveryTerms,termsVersion:q.termsVersion,termsText:q.termsText,
    paymentPreference:snapshot.paymentPreference,bankDetails:{bankName:bank.bankName,accountName:bank.accountName,accountNumber:bank.accountNumber,swift:bank.swift,...(bank.iban?{iban:bank.iban}:{})},
  };
}
