/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useMemo, useState } from 'react';
import LeadForm from './LeadForm';
import OrderAccount from './OrderAccount';
import { commerceLabels } from '../content/commerce';
import { balanceFor } from '../data/products';
import { technicalSnapshot } from '../lib/commerce/technical';
export default function OrderFlow({ dict, locale, config, beforeSubmit, onServerErrors, onAccepted }) {
  const [result,setResult]=useState(null),[balanceChoice,setBalanceChoice]=useState(''),[requestedBalance,setRequestedBalance]=useState(config.balanceReq || ''),[requestedRA,setRequestedRA]=useState(config.ra || ''),[balanceConfirmed,setBalanceConfirmed]=useState(false),[raConfirmed,setRaConfirmed]=useState(false),[basis,setBasis]=useState(['strung','unstrung'].includes(config.basis)?config.basis:''),[paymentPreference,setPaymentPreference]=useState(''),[errors,setErrors]=useState({});
  const T=commerceLabels[locale],L=dict.common.labels;
  const proposedBalance=config.mode==='listed'?balanceFor(config.series,config.weight):null;
  const technical=useMemo(()=>({measurement_basis:config.mode==='custom'?'unstrung':basis,
    balance:{choice:balanceChoice,...(balanceChoice==='request'?{requested:requestedBalance}:{accepted_proposed:proposedBalance}),customer_confirmed:balanceConfirmed},
    frame_stiffness:{choice:'request',requested:requestedRA,customer_confirmed:raConfirmed},
  }),[config.mode,basis,balanceChoice,requestedBalance,proposedBalance,balanceConfirmed,requestedRA,raConfirmed]);
  const confirmBeforeSubmit=()=>{
    const r=technicalSnapshot(config,technical,null),nextErrors={...r.errors};
    if(!paymentPreference)nextErrors.paymentPreference='required';
    setErrors(nextErrors);
    if(Object.keys(nextErrors).length)return {ok:false};
    return beforeSubmit?beforeSubmit():{ok:true};
  };
  return <div className="stack-lg">
    <fieldset><legend>{L.review}</legend><div className="choice three">
      <label><input type="radio" checked readOnly name="order-plan" value="A"/><span>A · {T.purchase}</span></label>
      <label><input type="radio" disabled name="order-plan" value="B"/><span>B · {T.financingBlocked}</span></label>
      <label><input type="radio" disabled name="order-plan" value="C"/><span>C · {T.financingBlocked}</span></label>
    </div></fieldset>
    <fieldset className="stack"><legend>{L.balance} · {L.mm}</legend>
      {proposedBalance!==null && <label><input type="radio" name="technical-balance" checked={balanceChoice==='accept_proposed'} onChange={()=>{setBalanceChoice('accept_proposed');setBalanceConfirmed(false);}}/> {proposedBalance} {L.mm} · {dict.common.statuses.modelled}</label>}
      <label><input type="radio" name="technical-balance" checked={balanceChoice==='request'} onChange={()=>{setBalanceChoice('request');setBalanceConfirmed(false);}}/> {L.requestTarget}</label>
      {balanceChoice==='request' && <div className="field"><label htmlFor="order-requested-balance">{L.balance} ({L.mm})</label><input id="order-requested-balance" inputMode="numeric" value={requestedBalance} onChange={e=>{setRequestedBalance(e.target.value);setBalanceConfirmed(false);}}/></div>}
      <label><input type="checkbox" checked={balanceConfirmed} onChange={e=>setBalanceConfirmed(e.target.checked)}/> {L.balance} · {T.confirmChoice}</label>
      {errors['technical.balance'] && <p className="err" role="alert">{dict.form.errors.required}</p>}
    </fieldset>
    <fieldset className="stack"><legend>{L.stiffness} (RA)</legend>
      <div className="field"><label htmlFor="order-requested-ra">{L.stiffness} (RA) · {L.requestTarget}</label><input id="order-requested-ra" inputMode="numeric" value={requestedRA} onChange={e=>{setRequestedRA(e.target.value);setRaConfirmed(false);}}/></div>
      <label><input type="checkbox" checked={raConfirmed} onChange={e=>setRaConfirmed(e.target.checked)}/> RA · {T.confirmChoice}</label>
      {errors['technical.frame_stiffness'] && <p className="err" role="alert">{dict.form.errors.required}</p>}
    </fieldset>
    {config.mode==='custom'?<p>{dict.lead.basis.unstrung}</p>:<div className="field"><label htmlFor="order-technical-basis">{dict.form.fields.basis}</label><select id="order-technical-basis" value={basis} onChange={e=>{setBasis(e.target.value);setBalanceConfirmed(false);setRaConfirmed(false);}}><option value="">{L.select}</option>{['unstrung','strung'].map(x=><option key={x} value={x}>{dict.lead.basis[x]}</option>)}</select></div>}
    <fieldset><legend>{T.payment}</legend><div className="choice">
      <label><input type="radio" name="payment-preference" checked={paymentPreference==='bank_wire'} onChange={()=>setPaymentPreference('bank_wire')}/> {T.bankWire}</label>
      <label><input type="radio" name="payment-preference" checked={paymentPreference==='payment_link'} onChange={()=>setPaymentPreference('payment_link')}/> {T.paymentLink}</label>
    </div></fieldset>
    <p className="note">{dict.common.truth.requestNotOrder}</p><p className="note">{T.disabled}</p>
    <LeadForm dict={dict} locale={locale} purpose="config" config={config} beforeSubmit={confirmBeforeSubmit}
      onServerErrors={e=>{setErrors(e);onServerErrors?.(e);}} endpoint="/api/orders" orderPlan="A" orderTechnical={technical} paymentPreference={paymentPreference}
      submitLabel={dict.build.cta} onAccepted={(id,r)=>{setResult(r);onAccepted?.(id);}}/>
    {result && <OrderAccount dict={dict} locale={locale} initial={result}/>}
  </div>;
}
