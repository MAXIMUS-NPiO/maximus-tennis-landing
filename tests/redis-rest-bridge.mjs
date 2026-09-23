/**
 * Test-only Upstash-compatible REST bridge in front of a real redis-server (RESP over TCP).
 * POST /            body: ["CMD", "arg", ...]         → { result } | { error }
 * POST /pipeline    body: [["CMD", ...], ...]          → [{ result } | { error }, ...]
 * Authorization: Bearer <token>
 */
import http from "node:http";
import net from "node:net";

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const b = Buffer.from(String(a), "utf8");
    out += `$${b.length}\r\n${b.toString("utf8")}\r\n`;
  }
  return out;
}

function parse(buf, i = 0) {
  const type = String.fromCharCode(buf[i]);
  const end = buf.indexOf("\r\n", i);
  if (end < 0) return null;
  const line = buf.slice(i + 1, end).toString("utf8");
  if (type === "+") return { value: line, next: end + 2 };
  if (type === "-") return { value: { __error: line }, next: end + 2 };
  if (type === ":") return { value: Number(line), next: end + 2 };
  if (type === "$") {
    const len = Number(line);
    if (len < 0) return { value: null, next: end + 2 };
    if (buf.length < end + 2 + len + 2) return null;
    return { value: buf.slice(end + 2, end + 2 + len).toString("utf8"), next: end + 2 + len + 2 };
  }
  if (type === "*") {
    const n = Number(line);
    if (n < 0) return { value: null, next: end + 2 };
    const arr = [];
    let j = end + 2;
    for (let k = 0; k < n; k++) {
      const r = parse(buf, j);
      if (!r) return null;
      arr.push(r.value);
      j = r.next;
    }
    return { value: arr, next: j };
  }
  throw new Error("RESP parse error");
}

class RedisConn {
  constructor(port) {
    this.sock = net.connect(port, "127.0.0.1");
    this.buf = Buffer.alloc(0);
    this.queue = [];
    this.sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.queue.length) {
        const r = parse(this.buf, 0);
        if (!r) break;
        this.buf = this.buf.slice(r.next);
        this.queue.shift()(r.value);
      }
    });
  }
  send(args) {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.sock.write(encode(args));
    });
  }
}

const wrap = (v) => (v && typeof v === "object" && !Array.isArray(v) && v.__error ? { error: v.__error } : { result: v });

export function startBridge({ redisPort, port = 0, token }) {
  const conn = new RedisConn(redisPort);
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    let body = "";
    for await (const c of req) body += c;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "bad json" }));
    }
    if (req.url === "/pipeline") {
      const out = [];
      for (const cmd of data) out.push(wrap(await conn.send(cmd)));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    }
    const r = wrap(await conn.send(data));
    res.writeHead(r.error ? 400 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => { server.close(); conn.sock.destroy(); } })));
}

if (process.argv[1] && process.argv[1].endsWith("redis-rest-bridge.mjs")) {
  const redisPort = Number(process.env.REDIS_PORT || 6390);
  const port = Number(process.env.BRIDGE_PORT || 8079);
  const token = process.env.BRIDGE_TOKEN || "local-test-token";
  startBridge({ redisPort, port, token }).then(({ url }) => console.log(`bridge ${url} → redis :${redisPort}`));
}
