#!/bin/sh
# Production build -> next start -> Playwright (Docker, software GL) -> screenshots + report.json in verify-out/.
# Meant for the cloud lab host; nothing here needs a browser on the developer machine.
set -eu
cd "$(dirname "$0")/../.."
PORT="${PORT:-3100}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.1}"
OUT="$PWD/verify-out"
rm -rf "$OUT" && mkdir -p "$OUT"

# TARGET_URL=https://example.com tests a deployed site and skips the local build and server.
if [ -z "${TARGET_URL:-}" ]; then
  [ "${SKIP_BUILD:-0}" = "1" ] || npm run build
  node node_modules/next/dist/bin/next start -p "$PORT" > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    curl -fsS "http://localhost:$PORT" > /dev/null 2>&1 && break
    sleep 1
  done
fi

docker run --rm --network host --ipc host \
  -v "$PWD/infra/verify":/verify:ro -v "$OUT":/out \
  -e BASE_URL="${TARGET_URL:-http://localhost:$PORT}" -e OUT=/out ${VIEWPORTS:+-e VIEWPORTS="$VIEWPORTS"} ${SHOTS:+-e SHOTS="$SHOTS"} ${DEBUG_CONSOLE:+-e DEBUG_CONSOLE=1} ${SETTLE_MS:+-e SETTLE_MS="$SETTLE_MS"} \
  "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
  sh -c "mkdir -p /tmp/run && cp /verify/shoot.mjs /tmp/run/ && cd /tmp/run && npm init -y >/dev/null && npm i --silent playwright@${PLAYWRIGHT_VERSION} && node shoot.mjs"
