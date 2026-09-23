#!/usr/bin/env bash
# Local production-mode stack for acceptance tests (no external services, no real mailbox):
#   redis-server → Upstash-compatible REST bridge → `next start` (production build)
#   SMTP sink with implicit TLS + AUTH (self-signed certificate trusted via NODE_EXTRA_CA_CERTS)
# Usage: tests/local-stack.sh start|stop   (WORK=<dir> for logs, mail and certificate)
set -euo pipefail
WORK="${WORK:-/tmp/mx-local}"
PORT="${PORT:-3100}"
cmd="${1:-start}"
mkdir -p "$WORK/mail"
if [ "$cmd" = "stop" ]; then
  for f in "$WORK"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  redis-cli -p 6390 shutdown nosave >/dev/null 2>&1 || true
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
  exit 0
fi
if [ ! -f "$WORK/smtp.crt" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WORK/smtp.key" -out "$WORK/smtp.crt" -days 30 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
fi
redis-server --port 6390 --daemonize yes --save "" --appendonly no >/dev/null
REDIS_PORT=6390 BRIDGE_PORT=8079 BRIDGE_TOKEN=local-test-token nohup node tests/redis-rest-bridge.mjs >"$WORK/bridge.log" 2>&1 &
echo $! >"$WORK/bridge.pid"
nohup python3 tests/smtp_sink.py "$WORK/mail" 2465 --tls "$WORK/smtp.crt" "$WORK/smtp.key" --auth website@maximus.tennis:app-password-test >"$WORK/smtp.log" 2>&1 &
echo $! >"$WORK/smtp.pid"
sleep 1
KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=local-test-token \
SMTP_HOST=localhost SMTP_PORT=2465 SMTP_SECURE=true SMTP_USER=website@maximus.tennis SMTP_PASS=app-password-test \
LEAD_NOTIFY_TO=gps@maximus.tennis LEAD_NOTIFY_FROM=website@maximus.tennis \
NODE_EXTRA_CA_CERTS="$WORK/smtp.crt" LEADS_ADMIN_PASSWORD=local-admin-password-123 \
CRON_SECRET=local-cron-secret-0123456789abcd LEADS_RATE_LIMIT="${LEADS_RATE_LIMIT:-500}" \
nohup npx next start -p "$PORT" >"$WORK/next.log" 2>&1 &
echo $! >"$WORK/next.pid"
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$PORT/en" >/dev/null && break; sleep 0.5; done
echo "stack up: http://127.0.0.1:$PORT (mail → $WORK/mail)"
