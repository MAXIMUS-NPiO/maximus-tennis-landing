/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Local HTTP receiving side; never bind a public interface or connect to a live store. */
import http from 'node:http';
export async function startLocalReceiver(receiver) {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    let body = '', bytes = 0;
    try {
      if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') { response.writeHead(405).end('{}'); return; }
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 32768) throw new Error('body_too_large'); body += chunk.toString('utf8'); }
      const p = JSON.parse(body);
      const data = request.url === '/handoff' ? await receiver.handoff(p) : request.url === '/status' ? await receiver.status(p, request.headers['x-receiver-signature']) : null;
      if (!data) { response.writeHead(404).end('{}'); return; }
      response.writeHead(200).end(JSON.stringify(data));
    } catch { response.writeHead(400).end(JSON.stringify({ status: 'receiver_rejected' })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
