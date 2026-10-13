/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** The payment-control page alone carries the per-request Content Security Policy; every other path keeps the site defaults. */
import test from 'node:test';
import assert from 'node:assert/strict';
import nextServer from 'next/server.js';
const { NextRequest } = nextServer;
import { middleware } from '../middleware.js';
import { CONTROL_GATEWAY_ORIGIN, controlPaymentCsp, controlPaymentLocale, controlPaymentNonce } from '../lib/control-csp.js';

const request = (path, headers = {}) => new NextRequest(`https://maximus.tennis${path}`, { headers: { 'accept-language': 'en', ...headers } });
const directives = policy => Object.fromEntries(policy.split(';').map(part => part.trim()).filter(Boolean).map(part => { const [name, ...values] = part.split(/\s+/); return [name, values]; }));

test('the control path of every registered locale, and nothing else, is recognised', () => {
  for (const locale of ['en', 'ru', 'zh', 'fil']) assert.equal(controlPaymentLocale(`/${locale}/checkout/control`), locale);
  assert.equal(controlPaymentLocale('/en/checkout/control/'), 'en');
  for (const path of ['/xx/checkout/control', '/en/checkout', '/en/checkout/control/extra', '/checkout/control', '/en/account', '/api/accounts/control/current', '']) assert.equal(controlPaymentLocale(path), null);
});

test('the policy allows the gateway for scripts and frames only, with a nonce, and nothing else from third parties', () => {
  const nonce = controlPaymentNonce();
  assert.match(nonce, /^[A-Za-z0-9+/=]{24}$/);
  assert.notEqual(nonce, controlPaymentNonce());
  const d = directives(controlPaymentCsp(nonce));
  assert.deepEqual(d['default-src'], ["'none'"]); assert.deepEqual(d['base-uri'], ["'none'"]); assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['script-src'], ["'self'", `'nonce-${nonce}'`, CONTROL_GATEWAY_ORIGIN]);
  assert.deepEqual(d['frame-src'], [CONTROL_GATEWAY_ORIGIN]);
  assert.deepEqual(d['connect-src'], ["'self'"]); assert.deepEqual(d['form-action'], ["'self'"]); assert.deepEqual(d['frame-ancestors'], ["'self'"]);
  assert.ok('upgrade-insecure-requests' in d);
  assert.equal(JSON.stringify(d).includes('unsafe-eval'), false);
  assert.equal(controlPaymentCsp(nonce).match(/https:\/\/[^\s;']+/g).every(url => url === CONTROL_GATEWAY_ORIGIN), true, 'no other third-party origin');
  const dev = directives(controlPaymentCsp(nonce, { production: false }));
  assert.ok(dev['script-src'].includes("'unsafe-eval'") && dev['connect-src'].includes('ws:') && !('upgrade-insecure-requests' in dev));
  assert.throws(() => controlPaymentCsp('short'), /control_csp_nonce_invalid/);
});

test('middleware stamps the control page with the policy, nonce and private caching headers and leaves other pages untouched', () => {
  const control = middleware(request('/ru/checkout/control'));
  const policy = control.headers.get('content-security-policy');
  assert.ok(policy, 'policy on the control page');
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)[1];
  assert.equal(control.headers.get('x-middleware-request-content-security-policy'), policy, 'the same policy reaches the render through the request');
  assert.equal(control.headers.get('x-middleware-request-x-nonce'), nonce);
  assert.equal(control.headers.get('cache-control'), 'no-store, private');
  assert.equal(control.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(control.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(control.status, 200);
  for (const path of ['/ru/checkout', '/en/account', '/en', '/en/build']) {
    const other = middleware(request(path));
    assert.equal(other.headers.get('content-security-policy'), null, path);
    assert.equal(other.headers.get('x-middleware-request-x-nonce'), null, path);
    assert.equal(other.status, 200, path);
  }
  const redirect = middleware(request('/checkout/control'));
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('content-security-policy'), null, 'a redirect carries no policy');
  assert.equal(new URL(redirect.headers.get('location')).pathname, '/en/checkout/control');
});
