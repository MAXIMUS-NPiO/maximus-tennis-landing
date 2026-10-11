#!/usr/bin/env node
/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { pathToFileURL } from 'node:url';
import { createCsCartReadClient, inspectCsCartSelection, CsCartReadError } from '../lib/commerce/cscart-api.js';

const usage = 'Read-only existing CS-Cart API metadata.\n' +
  'Usage: node scripts/inspect-cscart.mjs --store-id ID --product-id ID [--product-id ID ...] [--api-version 2.0|1.0] [--primary-currency AED]\n' +
  'Supply CS_CART_API_USER and CS_CART_API_KEY through an authorized private runtime. Do not paste credentials into chat or command arguments.\n' +
  'Origin is fixed to https://maximussports.ae; only payment 18, the selected store/products and their options are read.\n';
function parse(args) {
  const out = { productIds: [] };
  const known = new Set(['--store-id', '--product-id', '--api-version', '--primary-currency']);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!known.has(flag) || value === undefined || value.startsWith('--')) throw new CsCartReadError('cscart_cli_arguments_invalid');
    if (flag === '--product-id') out.productIds.push(value);
    else {
      const field = { '--store-id': 'storeId', '--api-version': 'apiVersion', '--primary-currency': 'declaredPrimaryCurrency' }[flag];
      if (Object.hasOwn(out, field)) throw new CsCartReadError('cscart_cli_arguments_invalid');
      out[field] = value;
    }
  }
  return out;
}
export async function runCsCartInspection(args, { env = process.env, fetchImpl = globalThis.fetch,
  write = text => process.stdout.write(text), writeError = text => process.stderr.write(text) } = {}) {
  if (args.length === 1 && args[0] === '--help') { write(usage); return 0; }
  try {
    const selected = parse(args);
    const client = createCsCartReadClient({ user: env.CS_CART_API_USER, key: env.CS_CART_API_KEY,
      storeId: selected.storeId, productIds: selected.productIds, apiVersion: selected.apiVersion, fetchImpl });
    const report = await inspectCsCartSelection(client, { declaredPrimaryCurrency: selected.declaredPrimaryCurrency });
    write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    // The CLI must not stringify a raw exception, credentials, response or cause.
    const safe = error instanceof CsCartReadError ? { code: error.code, ...(error.status ? { httpStatus: error.status } : {}) }
      : { code: 'cscart_inspection_failed' };
    writeError(`${JSON.stringify({ ok: false, ...safe })}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCsCartInspection(process.argv.slice(2));
}
