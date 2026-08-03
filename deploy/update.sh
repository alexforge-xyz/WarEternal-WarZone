#!/bin/bash
# Pull latest code, apply schema, rebuild, restart WarZone.
# On the droplet:
#   cd /var/www/warzone && bash deploy/update.sh
#
# Schema renames can make `db:push` ask a question — run that step from an
# interactive shell if a release renames a column (see deploy/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

: "${SQLITE_PATH:=warzone.db}"
: "${PORT:=3002}"

echo "==> git pull"
git pull

# .env.local often has NODE_ENV=production. That makes bare `npm ci` skip
# devDependencies — no drizzle-kit (db:push), no typescript (next build).
# Install the full tree for this machine step; the systemd unit still runs
# the app with NODE_ENV=production.
echo "==> npm ci (with devDependencies)"
npm ci --include=dev

if [ -f "$SQLITE_PATH" ]; then
  bak="${SQLITE_PATH}.bak-$(date +%F-%H%M)"
  echo "==> backup DB → $bak"
  cp -a "$SQLITE_PATH" "$bak"
else
  echo "==> no DB at $SQLITE_PATH yet (first boot will seed)"
fi

echo "==> db:push (schema → $SQLITE_PATH)"
npm run db:push

echo "==> build"
npm run build

echo "==> restart warzone"
sudo systemctl restart warzone

echo "==> smoke"
sleep 1
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)"
echo "    GET / → HTTP $code"
if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "308" ]; then
  echo "    warning: unexpected status — check: journalctl -u warzone -n 50 --no-pager"
  exit 1
fi

echo "✅ warzone updated & running"
