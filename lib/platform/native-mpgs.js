/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Read-only Retrieve Order, explicit inspected schema; no checkout/payment execution. */
import { createNativeReadHttp, nativeFail, nativeId, nativeMinor, nativeRecord, nativeTime } from './native-read-http';
import { hashPayload } from './ids';

export const NATIVE_MPGS_ORIGIN = 'https://ap-gateway.mastercard.com';
export const NATIVE_MPGS_MERCHANT = '300281';
export const NATIVE_MPGS_SCHEMA = 'mpgs_order_transactions_v1';
const SUPPORTED_HISTORY_TYPES = new Set(['PAYMENT', 'CAPTURE', 'REFUND', 'AUTHENTICATION', 'AUTHORIZATION', 'AUTHORIZATION_UPDATE', 'VERIFICATION', 'VOID_AUTHORIZATION']);
function requireSupportedHistory(raw) {
  // Successful monetary voids/chargebacks/funding cannot be silently dropped: they may reverse
  // an otherwise approved capture/refund while its individual amount still fits aggregate totals.
  if (raw.transaction.some(row => row?.result === 'SUCCESS' && !SUPPORTED_HISTORY_TYPES.has(row.transaction?.type))) nativeFail('native_mpgs_history_requires_review');
}
function requireRefundTotals(raw, refundedMinor) {
  // This selected Retrieve Order schema supplies the complete transaction history. A per-row
  // bound is insufficient: several refunds can individually fit an inconsistent cumulative total.
  const total = raw.transaction.filter(row => row?.result === 'SUCCESS' && row.response?.gatewayCode === 'APPROVED' && row.transaction?.type === 'REFUND')
    .reduce((sum, row) => sum + BigInt(nativeMinor(row.transaction.amount)), 0n);
  if (total !== BigInt(refundedMinor)) nativeFail('native_mpgs_refund_history_requires_review');
}

/** Existing native goods contract remains strictly AED, including when callers add currency. */
export function createNativeMpgsReader(options = {}) {
  return createMpgsReader(options, 'AED');
}

/**
 * Explicit control-only read contract. No default fetch, goods mapping or currency permission.
 * The merchant identifier defaults to the inspected store merchant; a deployment may name the
 * current merchant explicitly, which still never establishes currency permission by itself.
 */
export function createTennisControlMpgsReader(options = {}) {
  if (typeof window !== 'undefined' || options.apiVersion !== '100' || typeof options.fetchImpl !== 'function') nativeFail('tennis_control_reader_unconfigured');
  return createMpgsReader(options, 'USD', '100', /^MC[0-9a-f]{32}$/, true);
}

export const MPGS_MERCHANT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const GATEWAY_TOKEN = /^[A-Z][A-Z0-9_]{0,39}$/;
const token = value => typeof value === 'string' && GATEWAY_TOKEN.test(value) ? value : 'UNKNOWN';

function createMpgsReader({ origin, merchantId, apiVersion, password, schema, fetchImpl, now = () => Date.now(), timeoutMs, maxBodyBytes, signal } = {}, currency, requiredTotalMinor = null, providerOrderPattern = null, control = false) {
  if (origin !== NATIVE_MPGS_ORIGIN || (control ? typeof merchantId !== 'string' || !MPGS_MERCHANT_ID.test(merchantId) : merchantId !== NATIVE_MPGS_MERCHANT)) nativeFail('native_mpgs_route_unverified');
  if (typeof apiVersion !== 'string' || !/^[1-9]\d{0,2}$/.test(apiVersion) || schema !== NATIVE_MPGS_SCHEMA) nativeFail('native_mpgs_schema_unverified');
  if (typeof password !== 'string' || password.length < 1 || password.length > 512 || /[^\x21-\x7e]/.test(password)) nativeFail('native_credentials_invalid');
  const get = createNativeReadHttp({ origin, authorization: `Basic ${Buffer.from(`merchant.${merchantId}:${password}`).toString('base64')}`, fetchImpl, timeoutMs, maxBodyBytes, signal });
  async function readOrder(providerOrderId) {
    nativeId(providerOrderId);
    if (providerOrderPattern && !providerOrderPattern.test(providerOrderId)) nativeFail('native_identifier_invalid');
    return get(`/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${providerOrderId}`);
  }
  /**
   * Control orders exist at the gateway only after the payer's first transaction. Before that,
   * Retrieve Order is an INVALID_REQUEST; for the control reader that is "no movements yet", not a
   * transport failure. The goods reader keeps its strict contract (its orders exist before polling).
   */
  async function readOrderOrAbsent(providerOrderId) {
    if (!control) return readOrder(providerOrderId);
    nativeId(providerOrderId);
    if (providerOrderPattern && !providerOrderPattern.test(providerOrderId)) nativeFail('native_identifier_invalid');
    const { status, data } = await get(`/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${providerOrderId}`, { accept: [400] });
    if (status === 200) return data;
    if (data.result !== 'ERROR' || !nativeRecord(data.error) || data.error.cause !== 'INVALID_REQUEST') nativeFail('native_mpgs_order_mismatch');
    return null;
  }
  function projectMovement(raw, { providerOrderId, transactionId, kind }) {
      nativeId(providerOrderId); nativeId(transactionId);
      if (!['capture', 'refund'].includes(kind)) nativeFail('native_movement_not_supported');
      // Never expose or persist raw sourceOfFunds, payer/card, browser, session or error fields.
      if (raw.result !== 'SUCCESS' || raw.id !== providerOrderId || raw.merchant !== merchantId || raw.currency !== currency || raw.test === true || raw.mock === true || raw.liveMode === false || raw.mode === 'test' || !Array.isArray(raw.transaction) || raw.transaction.length > 1000) nativeFail('native_mpgs_order_mismatch');
      requireSupportedHistory(raw);
      const totalMinor = nativeMinor(raw.amount), capturedMinor = nativeMinor(raw.totalCapturedAmount), refundedMinor = nativeMinor(raw.totalRefundedAmount);
      if (totalMinor === '0' || (requiredTotalMinor !== null && (totalMinor !== requiredTotalMinor || capturedMinor !== requiredTotalMinor)) || BigInt(capturedMinor) > BigInt(totalMinor) || BigInt(refundedMinor) > BigInt(capturedMinor)) nativeFail('native_mpgs_totals_invalid');
      const matches = raw.transaction.filter(row => nativeRecord(row) && row.transaction?.id === transactionId);
      if (matches.length !== 1) nativeFail('native_mpgs_transaction_missing_or_ambiguous');
      const tx = matches[0], movement = tx.transaction;
      const expectedTypes = kind === 'capture' ? ['PAYMENT', 'CAPTURE'] : ['REFUND'];
      if (tx.result !== 'SUCCESS' || tx.response?.gatewayCode !== 'APPROVED' || !expectedTypes.includes(movement.type) || movement.currency !== currency || tx.merchant !== merchantId || tx.order?.id !== providerOrderId || tx.order?.currency !== currency || nativeMinor(tx.order?.amount) !== totalMinor || tx.test === true || tx.mock === true || tx.liveMode === false) nativeFail('native_mpgs_movement_unconfirmed');
      const amountMinor = nativeMinor(movement.amount);
      // Current ledger bridge accepts one complete goods capture. Partial/multi-capture is manual review.
      if (amountMinor === '0' || (kind === 'capture' && (amountMinor !== totalMinor || capturedMinor !== totalMinor)) || (kind === 'refund' && BigInt(amountMinor) > BigInt(refundedMinor))) nativeFail('native_mpgs_movement_amount_invalid');
      requireRefundTotals(raw, refundedMinor);
      if (kind === 'capture' && raw.transaction.filter(row => row?.result === 'SUCCESS' && row.response?.gatewayCode === 'APPROVED' && ['PAYMENT', 'CAPTURE'].includes(row.transaction?.type)).length !== 1) nativeFail('native_mpgs_multi_capture_requires_review');
      const observedAt = now(), occurredAt = nativeTime(tx.timeOfRecord, observedAt);
      if (['DISPUTED', 'CHARGEBACK_PROCESSED'].includes(raw.status)) nativeFail('native_mpgs_dispute_requires_review');
      const projected = { providerOrderId, transactionId, kind, amountMinor, currency, totalMinor, capturedMinor, refundedMinor, occurredAt, merchantId };
      return { ...projected, verifiedAt: new Date(observedAt).toISOString(), evidenceHash: hashPayload(projected) };
  }
  /**
   * Sanitized observation of the gateway order for owner-facing status: order status, the latest
   * transaction's type/result/gateway code and amount/currency agreement. It is not money proof;
   * only `discoverMovements`/`readMovement` establish an approved capture. The gateway creates an
   * order with the payer's first transaction, so before any attempt Retrieve Order is rejected as an
   * invalid request: that case is reported as `present:false`, not as a transport failure.
   */
  async function readSummary({ providerOrderId } = {}) {
    nativeId(providerOrderId);
    if (providerOrderPattern && !providerOrderPattern.test(providerOrderId)) nativeFail('native_identifier_invalid');
    const { status, data: raw } = await get(`/api/rest/version/${apiVersion}/merchant/${merchantId}/order/${providerOrderId}`, { accept: [400] });
    const observedAt = new Date(now()).toISOString();
    if (status === 400) {
      if (raw.result !== 'ERROR' || !nativeRecord(raw.error) || raw.error.cause !== 'INVALID_REQUEST') nativeFail('native_mpgs_order_mismatch');
      return Object.freeze({ present: false, providerOrderId, observedAt, validationType: token(raw.error.validationType) });
    }
    if (raw.result !== 'SUCCESS' || raw.id !== providerOrderId || raw.merchant !== merchantId || raw.test === true || raw.mock === true || raw.liveMode === false || raw.mode === 'test') nativeFail('native_mpgs_order_mismatch');
    const rows = Array.isArray(raw.transaction) ? raw.transaction.filter(row => nativeRecord(row) && nativeRecord(row.transaction)).slice(0, 1000) : [];
    const ordered = rows.map(row => ({ row, at: typeof row.timeOfRecord === 'string' ? Date.parse(row.timeOfRecord) : NaN }))
      .sort((left, right) => (Number.isFinite(left.at) ? left.at : -1) - (Number.isFinite(right.at) ? right.at : -1));
    const last = ordered.length ? ordered[ordered.length - 1].row : null;
    // Retrieve Order reports order.amount as zero while no payer funds were transferred (declined,
    // abandoned or authentication-only orders), so the pinned total is checked only once money moved.
    let amountMinor = null, capturedMinor = '0';
    try { amountMinor = nativeMinor(raw.amount); } catch { amountMinor = null; }
    try { capturedMinor = nativeMinor(raw.totalCapturedAmount); } catch { capturedMinor = '0'; }
    const amountMatches = requiredTotalMinor === null ? amountMinor !== null : amountMinor === requiredTotalMinor || (capturedMinor === '0' && amountMinor === '0');
    return Object.freeze({ present: true, providerOrderId, observedAt, orderStatus: token(raw.status), currencyMatches: raw.currency === currency, amountMatches, capturedMinor,
      transactionCount: rows.length, lastTransaction: last ? Object.freeze({ type: token(last.transaction.type), result: token(last.result), gatewayCode: token(last.response?.gatewayCode) }) : null });
  }
  return Object.freeze({
    readSummary,
    async readMovement(request) {
      nativeId(request?.providerOrderId); nativeId(request?.transactionId);
      if (!['capture', 'refund'].includes(request.kind)) nativeFail('native_movement_not_supported');
      return projectMovement(await readOrder(request.providerOrderId), request);
    },
    async discoverMovements({ providerOrderId, limit = 20 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) nativeFail('native_discovery_limit_invalid');
      const raw = await readOrderOrAbsent(providerOrderId);
      if (raw === null) return [];
      if (raw.result !== 'SUCCESS' || raw.id !== providerOrderId || raw.merchant !== merchantId || raw.currency !== currency || raw.test === true || raw.mock === true || raw.liveMode === false || raw.mode === 'test' || !Array.isArray(raw.transaction) || raw.transaction.length > 1000) nativeFail('native_mpgs_order_mismatch');
      requireSupportedHistory(raw);
      if (['DISPUTED', 'CHARGEBACK_PROCESSED'].includes(raw.status)) nativeFail('native_mpgs_dispute_requires_review');
      // Capture/refund candidates come solely from this authenticated GET; status and callbacks supply none.
      const candidates = raw.transaction.filter(row => row?.result === 'SUCCESS' && row.response?.gatewayCode === 'APPROVED' && ['PAYMENT', 'CAPTURE', 'REFUND'].includes(row.transaction?.type));
      // Control: no approved money movement means a declined, abandoned or authentication-only order.
      // The gateway then reports order.amount as zero, so the pinned total applies once a candidate exists.
      if (control && !candidates.length) return [];
      if (requiredTotalMinor !== null && nativeMinor(raw.amount) !== requiredTotalMinor) nativeFail('native_mpgs_order_mismatch');
      requireRefundTotals(raw, nativeMinor(raw.totalRefundedAmount));
      if (candidates.length > limit) nativeFail('native_discovery_requires_review');
      return candidates.map(row => projectMovement(raw, { providerOrderId, transactionId: row.transaction.id, kind: row.transaction.type === 'REFUND' ? 'refund' : 'capture' }))
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || (left.kind === right.kind ? left.transactionId.localeCompare(right.transactionId) : left.kind === 'capture' ? -1 : 1));
    },
  });
}
