/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Distinct proposal, customer request and final engineering/customer agreement.
 * Published matrix balance is a proposal, never automatic customer confirmation.
 */
import { balanceFor, series, productDataVersion } from '../../data/products';
import { parseStrictInt, TARGET_BOUNDS } from '../intake/schema';
function target(raw, bounds) { const p=parseStrictInt(raw); return !p.error && p.value>=bounds[0] && p.value<=bounds[1] ? p.value : null; }
export function technicalSnapshot(configuration, input, offer) {
  const p=input && typeof input==='object'?input:{};
  const proposedBalance=configuration.mode==='listed'?balanceFor(configuration.series,configuration.weight,configuration.lengthMode === "custom" ? "custom" : configuration.lengthIn):null;
  const approval=offer?.technicalApproval;
  const proposedRA=target(approval?.frameRA,TARGET_BOUNDS.ra);
  const errors={};
  const custom=configuration.mode==='custom';
  const basis=custom?'unstrung':p.measurement_basis;
  if(custom && p.measurement_basis!==undefined && p.measurement_basis!=='unstrung')errors['technical.basis']='invalid';
  if(!['unstrung','strung'].includes(basis))errors['technical.basis']='required';
  function selection(raw, proposed, bounds, key) {
    if(!raw || !['accept_proposed','request'].includes(raw.choice) || raw.customer_confirmed!==true) {errors[key]='required';return {choice:null,requested:null,selected:null};}
    const requested=raw.choice==='request'?target(raw.requested,bounds):null;
    const accepted=raw.choice==='accept_proposed'?target(raw.accepted_proposed,bounds):null;
    const selected=raw.choice==='accept_proposed' && accepted===proposed?proposed:requested;
    if(selected===null)errors[key]='required';
    return {choice:raw.choice,requested,selected};
  }
  const balance=selection(p.balance,proposedBalance,TARGET_BOUNDS.balanceReq,'technical.balance');
  const ra=selection(p.frame_stiffness,proposedRA,TARGET_BOUNDS.ra,'technical.frame_stiffness');
  const final=Object.keys(errors).length===0 && approval?.approved===true && !!approval.evidence &&
    approval.measurementBasis===basis && approval.balanceMm===balance.selected && approval.frameRA===ra.selected;
  return { ok:Object.keys(errors).length===0, errors, value:{
    measurement_basis:basis || null,...(custom?{delivery_condition:'unstrung'}:{}),
    balance:{proposed_balance:proposedBalance,proposed_source:proposedBalance===null?null:{kind:series[configuration.series]?.balanceStatus,productDataVersion,series:configuration.series,weight:configuration.weight},
      requested_balance:balance.requested,requested_source:balance.requested===null?null:'customer',
      confirmed_balance:final?balance.selected:null,confirmed_source:final?approval.evidence:null,
      customer_selection:balance.choice,customer_confirmation:p.balance?.customer_confirmed===true},
    frame_stiffness:{proposed_ra:proposedRA,proposed_source:proposedRA===null?null:approval.evidence,
      requested_ra:ra.requested,requested_source:ra.requested===null?null:'customer',
      confirmed_ra:final?ra.selected:null,confirmed_source:final?approval.evidence:null,
      customer_selection:ra.choice,customer_confirmation:p.frame_stiffness?.customer_confirmed===true},
    final,approval_evidence:final?approval.evidence:null,
  }};
}
