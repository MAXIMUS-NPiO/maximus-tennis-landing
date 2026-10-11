/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Local-test durable file transactions. A crashed lock freezes writes for manual recovery.
 * This is not a replacement for a CS-Cart DB transaction / unique constraints in production.
 */
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export function fileReceiverStore(directory) {
  const filename = path.join(directory, 'receiver-state.json'), lockname = path.join(directory, 'receiver-state.lock');
  const empty = () => ({ schema: 1, orders: {}, nonces: {} });
  return {
    async transaction(change) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      let lock;
      for (let i = 0; i < 200; i++) {
        try { lock = await open(lockname, 'wx', 0o600); break; }
        catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 5)); }
      }
      if (!lock) throw new Error('receiver_store_locked');
      const temporary = path.join(directory, `receiver-${crypto.randomUUID()}.tmp`);
      try {
        let state;
        try { state = JSON.parse(await readFile(filename, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; state = empty(); }
        if (state.schema !== 1 || !state.orders || !state.nonces) throw new Error('receiver_store_invalid');
        const result = await change(state);
        const out = await open(temporary, 'wx', 0o600);
        try { await out.writeFile(JSON.stringify(state)); await out.sync(); } finally { await out.close(); }
        await rename(temporary, filename);
        const dir = await open(directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
        return result;
      } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(lockname); }
    },
  };
}
