/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { catalogue } from '../data/catalogue.js';
import { productDataVersion, catalogueCounts, nationalPackage } from '../data/products.js';
import { routes, navGroups } from '../data/site.js';
import { catalogueCopy, catalogueCopyLocales, fill } from '../content/catalogue-download-copy.js';
import { locales, getDict } from '../lib/i18n.js';
import nextConfig from '../next.config.mjs';

const pub = (p) => path.join(process.cwd(), 'public', p.replace(/^\//, ''));

test('the published catalogue file is the recorded edition, byte for byte', () => {
  const buf = fs.readFileSync(pub(catalogue.editionPath));
  assert.equal(buf.length, catalogue.bytes);
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), catalogue.sha256);
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(path.basename(catalogue.editionPath), catalogue.fileName);
  assert.equal(path.basename(catalogue.stablePath), catalogue.fileName);
  assert.ok(catalogue.editionPath.includes(`/${catalogue.edition}/`));
  for (const p of catalogue.previews) assert.ok(fs.existsSync(pub(p.src)) && p.src.includes(`/${catalogue.edition}/`), p.src);
  assert.equal(catalogue.chapterPages.length, 6);
  assert.ok(catalogue.chapterPages.every((n, i, a) => n > 2 && n <= catalogue.pages && (i === 0 || n > a[i - 1])));
});

test('Edition 6.0: the full catalogue on the current matrix; Edition 5.0 stays published unchanged', () => {
  assert.equal(catalogue.edition, '6.0');
  assert.equal(catalogue.pages, 60);
  assert.deepEqual(catalogue.chapterPages, [3, 8, 22, 23, 33, 57]);
  assert.ok(catalogue.previews.some((p) => p.page === 17), 'the grip size page is previewed');
  const old = fs.readFileSync(pub('/catalogue/5.0/MAXIMUS_TENNIS_Catalogue.pdf'));
  assert.equal(old.length, 3622492);
  assert.equal(crypto.createHash('sha256').update(old).digest('hex'), 'a7000867a03a98beb68d9aff3e442f940bb261f679f7b5d01b4b70732cf7cb90');
});

test('the catalogue uses the product data version of the site', () => {
  assert.equal(catalogue.productDataVersion, productDataVersion);
  assert.equal(catalogueCounts.totalRequestedVariants, 1547);
  assert.equal(nationalPackage.combinations, 12376);
});

test('the stable address serves the current edition without a redirect; edition files are immutable', async () => {
  const rewrites = await nextConfig.rewrites();
  assert.deepEqual(rewrites, [{ source: catalogue.stablePath, destination: catalogue.editionPath }]);
  const headers = await nextConfig.headers();
  const edition = headers.find((h) => h.source === '/catalogue/:edition/:file+');
  assert.ok(edition && /immutable/.test(edition.headers[0].value));
  const stable = headers.find((h) => h.source === catalogue.stablePath);
  assert.ok(stable && /must-revalidate/.test(stable.headers[0].value));
});

test('the catalogue route is in the site map and the racquets menu', () => {
  assert.equal(routes.catalogue, '/catalogue');
  assert.ok(navGroups.find((g) => g.key === 'racquets').items.includes('catalogue'));
});

test('every language has the complete catalogue copy with the same placeholders', () => {
  assert.deepEqual([...catalogueCopyLocales].sort(), [...locales].sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  const en = catalogueCopy('en');
  for (const l of locales) {
    const c = catalogueCopy(l);
    for (const k of Object.keys(en)) {
      if (k === 'chapters') { assert.equal(c.chapters.length, 6, l); continue; }
      assert.equal(ph(c[k]), ph(en[k]), `${l}.${k}`);
    }
    for (const brand of ['Sweet Spot Trainer', 'Spot Trainer']) assert.ok(c.lead.includes(brand), `${l}: ${brand}`);
    assert.ok(c.heroEcosystem.includes('MAXIMUS'), l);
    const d = getDict(l);
    assert.equal(d.catalogueDownload.download, c.download);
    assert.equal(d.nav.catalogue, c.nav);
    assert.equal(d.home.heroTitle, c.heroTitle);
    assert.ok(!/\{\w+\}/.test(fill(c.edition, { edition: '5.0', date: 'd', version: 'v' })), l);
  }
});
