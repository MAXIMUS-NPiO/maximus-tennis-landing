/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Real React DOM tests of the payment-control page in a local browser. No bank, runtime or server endpoint is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { site } from '../data/site.js';
import { tennisControlLabels, tennisControlStateKey } from '../content/tennis-control.js';
import { CONTROL_PAYMENT_STATES } from '../lib/client/tennis-control.js';

const require = createRequire(import.meta.url);
const executable = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(path => path && existsSync(path));
const SCENARIOS = 14;

test('control page copy exists in all 48 locales, maps every payment state and never carries English into a translation', () => {
  assert.equal(site.locales.length, 48);
  assert.deepEqual(Object.keys(tennisControlLabels).sort(), [...site.locales].sort());
  assert.deepEqual(Object.keys(tennisControlStateKey).sort(), [...CONTROL_PAYMENT_STATES].sort());
  const keys = Object.keys(tennisControlLabels.en);
  for (const locale of site.locales) {
    const copy = tennisControlLabels[locale];
    assert.deepEqual(Object.keys(copy), keys, locale);
    assert.ok(keys.every(key => typeof copy[key] === 'string' && copy[key].length >= 2), locale);
    assert.equal(new Set(Object.values(tennisControlStateKey).map(key => copy[key])).size, CONTROL_PAYMENT_STATES.length, locale);
    assert.ok(copy.paid.includes('USD 1.00') && copy.intro.includes('USD 1.00') && copy.intro.includes('maximus.tennis'), locale);
    if (locale !== 'en') for (const key of keys) assert.notEqual(copy[key], tennisControlLabels.en[key], `${locale}.${key}`);
  }
});

test('mounted control page keeps the session private, verifies through the server only and survives lifecycle events', { timeout: 90000, skip: executable ? false : 'Local Chrome/Chromium unavailable; set CHROME_BIN. No browser is downloaded.' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'maximus-tennis-control-component-'));
  let server, browser;
  t.after(async () => { browser?.kill('SIGTERM'); if (server) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const compiler = webpackModule.webpack({
    mode: 'development', target: 'web', devtool: false,
    context: resolve('.'), entry: resolve('tests/browser/tennis-control-component.mjs'),
    output: { path: dir, filename: 'fixture.js' },
    module: { rules: [{ test: /\.js$/, exclude: /node_modules/, use: { loader: resolve('tests/browser/tennis-component-loader.cjs') } }] },
    optimization: { minimize: false }, performance: { hints: false },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError) reject(error || closeError);
    else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  })));
  const bundle = await readFile(join(dir, 'fixture.js'));
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'; style-src 'none'; img-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'");
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
    else if (request.url.startsWith('/')) { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><meta charset="utf-8"><title>LOCAL SYNTHETIC CONTROL COMPONENT TEST — NO PAYMENT</title><div id="mount"></div><pre id="result">pending</pre><script src="/fixture.js"></script>'); }
    else { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const output = await new Promise((resolve, reject) => {
    browser = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', '--virtual-time-budget=20000', `http://127.0.0.1:${server.address().port}/`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    browser.stdout.on('data', chunk => { stdout += chunk; }); browser.stderr.on('data', chunk => { stderr += chunk; });
    browser.on('error', reject); browser.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Local Chrome exited ${code}: ${stderr.slice(-1500)}`)));
  });
  const encoded = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
  assert.ok(encoded && encoded !== 'pending', `Component harness did not complete: ${output.slice(-1500)}`);
  const report = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assert.deepEqual(report.failures, [], JSON.stringify(report));
  assert.equal(report.passed.length, SCENARIOS, JSON.stringify(report));
  t.diagnostic(`Real React DOM cases passed: ${report.passed.join('; ')}`);
});
