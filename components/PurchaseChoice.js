/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useId } from 'react';
import { tennisCheckoutLabels } from '../content/tennis-checkout';

/** A purchase intention and optional request for terms; never a funding agreement or charge. */
export default function PurchaseChoice({ dict, locale, intent, onIntentChange, programRequest, onProgramChange, errors = {}, locked = false }) {
  const T = tennisCheckoutLabels[locale];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const interested = intent === 'goods_with_program_interest';
  const amountError = errors['programRequest.principal'] || errors.programRequest;
  return <fieldset className="stack" disabled={locked} aria-describedby={`purchase-${id}-steps`}>
    <legend>{T.customPurchase}</legend>
    <p className="mono muted" id={`purchase-${id}-steps`}>{T.steps}</p>
    <div className="choice">
      <label><input type="radio" name={`purchase-intent-${id}`} checked={intent === 'goods_only'} onChange={() => onIntentChange('goods_only')} /> <span>{T.goodsOnly}</span></label>
      <label><input type="radio" name={`purchase-intent-${id}`} checked={interested} onChange={() => onIntentChange('goods_with_program_interest')} /> <span>{T.goodsAndProgram}</span></label>
    </div>
    {interested && <div className="stack">
      <p className="note">{T.programPending}</p>
      <div className="field">
        <label htmlFor={`purchase-${id}-principal`}>{T.programPrincipal} <span className="opt">({dict.common.labels.optional})</span></label>
        <input id={`purchase-${id}-principal`} type="text" inputMode="decimal" autoComplete="off" value={programRequest.principal} onChange={e => onProgramChange({ ...programRequest, principal: e.target.value })} aria-invalid={amountError ? 'true' : undefined} aria-describedby={amountError ? `purchase-${id}-error` : undefined} />
      </div>
      <div className="field"><label htmlFor={`purchase-${id}-currency`}>{T.programCurrency}</label>
        <select id={`purchase-${id}-currency`} value={programRequest.currency} onChange={e => onProgramChange({ ...programRequest, currency: e.target.value })}>
          {['EUR', 'AED', 'USD'].map(currency => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </div>
      {amountError && <p className="err" role="alert" id={`purchase-${id}-error`}>{dict.form.errors[amountError] || dict.form.errors.invalid}</p>}
    </div>}
  </fieldset>;
}
