/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Test-only Upstash-compatible REST bridge in front of a real redis-server (RESP over TCP).
 * POST /            body: ["CMD", "arg", ...]         → { result } | { error }
 * POST /pipeline    body: [["CMD", ...], ...]          → [{ result } | { error }, ...]
 * Authorization: Bearer <token>
 */
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each native-store suite owns its Redis process and a fresh, disposable data directory.
// Never attach to an already listening server or load another checkout's dump.rdb.
export async function startTestRedis(port, { timeoutMs = 3000, persist = false, directory: reuseDirectory = null } = {}) {
  // `persist` turns on the append-only file so that a restart on the same directory (a
  // restart/persistence test) sees every committed record; the default stays memory-only.
  const directory = reuseDirectory || mkdtempSync(join(tmpdir(), "maximus-native-redis-"));
  let child;
  const close = async ({ keepDirectory = false } = {}) => {
    try {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve, reject) => {
          let killTimer, finalTimer;
          const finish = (error) => {
            clearTimeout(killTimer); clearTimeout(finalTimer);
            child.removeListener("exit", onExit);
            error ? reject(error) : resolve();
          };
          const onExit = () => finish();
          child.once("exit", onExit);
          killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
          finalTimer = setTimeout(() => finish(bridgeError("redis_cleanup_timeout")), 2000);
          child.kill("SIGTERM");
        });
      }
    } finally {
      if (!keepDirectory) rmSync(directory, { recursive: true, force: true });
    }
  };
  try {
    child = spawn("redis-server", ["--bind", "127.0.0.1", "--protected-mode", "yes", "--port", String(port), "--dir", directory, "--save", "", "--appendonly", persist ? "yes" : "no", ...(persist ? ["--appendfsync", "always"] : [])], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH || "/usr/bin:/bin", TMPDIR: tmpdir(), MAXIMUS_TEST_REDIS_DIR: directory },
    });
    await new Promise((resolve, reject) => {
      let settled = false, output = "";
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout.removeListener("data", onData);
        child.stdout.resume();
        error ? reject(error) : resolve();
      };
      const onData = data => {
        output = (output + String(data)).slice(-4096);
        if (output.includes("Ready to accept connections")) finish();
      };
      const timer = setTimeout(() => finish(bridgeError("redis_startup_timeout")), timeoutMs);
      child.stderr.resume();
      child.stdout.on("data", onData);
      child.on("error", finish);
      child.once("exit", () => finish(bridgeError("redis_startup_exit")));
    });
    return { close, directory };
  } catch (error) {
    await close();
    throw error;
  }
}

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

function bridgeError(code) {
  return Object.assign(new Error(code), { code });
}

// Test-only connection with bounded readiness and command waits. A failed connection cannot
// serve later commands: keeping the RESP queue alive would pair replies with the wrong request.
export class RedisConn {
  constructor(port, { connectImpl = net.connect, timeoutMs = 2000 } = {}) {
    this.buf = Buffer.alloc(0);
    this.queue = [];
    this.failure = null;
    this.sock = connectImpl(port, "127.0.0.1");
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.connectTimer = setTimeout(() => this.fail(bridgeError("redis_connect_timeout")), timeoutMs);
      this.sock.once("connect", () => {
        clearTimeout(this.connectTimer);
        resolve();
      });
    });
    // startBridge consumes this immediately; direct callers may await it after a socket event.
    this.ready.catch(() => {});
    this.timeoutMs = timeoutMs;
    this.sock.on("error", (e) => this.fail(e));
    this.sock.on("close", () => this.fail(bridgeError("redis_connection_closed")));
    this.sock.on("data", (d) => {
      try {
        this.buf = Buffer.concat([this.buf, d]);
        while (this.queue.length) {
          const r = parse(this.buf, 0);
          if (!r) break;
          this.buf = this.buf.slice(r.next);
          const pending = this.queue.shift();
          clearTimeout(pending.timer);
          pending.resolve(r.value);
        }
      } catch (e) {
        this.fail(e);
      }
    });
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    clearTimeout(this.connectTimer);
    this.rejectReady(error);
    for (const pending of this.queue.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.sock.destroy();
  }
  async send(args) {
    await this.ready;
    if (this.failure) throw this.failure;
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, timer: setTimeout(() => this.fail(bridgeError("redis_command_timeout")), this.timeoutMs) };
      this.queue.push(pending);
      try {
        this.sock.write(encode(args));
      } catch (e) {
        this.fail(e);
      }
    });
  }
  close() {
    this.fail(bridgeError("bridge_closed"));
  }
}

const wrap = (v) => (v && typeof v === "object" && !Array.isArray(v) && v.__error ? { error: v.__error } : { result: v });

export async function startBridge({ redisPort, port = 0, token, timeoutMs = 2000, connectImpl = net.connect, createServerImpl = http.createServer }) {
  const conn = new RedisConn(redisPort, { connectImpl, timeoutMs });
  const server = createServerImpl(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      let body = "";
      for await (const c of req) body += c;
      let data;
      try {
        data = JSON.parse(body);
        if (!Array.isArray(data) || (req.url === "/pipeline" && data.some((cmd) => !Array.isArray(cmd)))) throw new Error("bad json");
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
    } catch {
      if (!res.headersSent) res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "redis_unavailable" }));
    }
  });
  const close = () => { server.close(); server.closeAllConnections?.(); conn.close(); };
  let listenTimer;
  const listening = new Promise((resolve, reject) => {
    listenTimer = setTimeout(() => reject(bridgeError("bridge_listen_timeout")), timeoutMs);
    // Retain an error listener after startup too, so an error is never an uncaught event.
    server.on("error", (e) => { reject(e); close(); });
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    await Promise.all([conn.ready, listening]);
    return { server, url: `http://127.0.0.1:${server.address().port}`, close };
  } catch (e) {
    close();
    throw e;
  } finally {
    clearTimeout(listenTimer);
  }
}

if (process.argv[1] && process.argv[1].endsWith("redis-rest-bridge.mjs")) {
  const redisPort = Number(process.env.REDIS_PORT || 6390);
  const port = Number(process.env.BRIDGE_PORT || 8079);
  const token = process.env.BRIDGE_TOKEN || "local-test-token";
  startBridge({ redisPort, port, token }).then(({ url }) => console.log(`bridge ${url} → redis :${redisPort}`)).catch((e) => {
    console.error(`bridge startup failed: ${e.code || "unknown_error"}`);
    process.exitCode = 1;
  });
}
