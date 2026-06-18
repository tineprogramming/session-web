#!/usr/bin/env bash
#
# Apocentro deploy UNDER A SUB-PATH of an existing site (e.g. example.com/apocentro).
# It does NOT create a new nginx server block and does NOT touch SSL/certbot — it
# adds an include to your existing server block (with a backup + nginx -t + rollback).
#
# Usage (run on the server as root, from inside a checkout of this repo):
#   sudo bash deploy/apocentro-deploy-subpath.sh [nginx-config-file] [url-path]
#
# Defaults:
#   nginx-config-file = /etc/nginx/sites-enabled/tinestuff.com
#   url-path          = apocentro      (i.e. served at https://<your-domain>/apocentro)
#
set -euo pipefail

NGINX_CONF="${1:-/etc/nginx/sites-enabled/tinestuff.com}"
URLPATH="${2:-apocentro}"
URLPATH="${URLPATH#/}"; URLPATH="${URLPATH%/}"          # normalise: no leading/trailing slash
BASE="/${URLPATH}/"                                     # e.g. /apocentro/
WEBROOT="/var/www/${URLPATH}"
SNIPPET="/etc/nginx/snippets/${URLPATH}.conf"
SERVICE="apocentro-proxy"
# High, uncommon port so we don't collide with an app already on 3000 etc.
# Override with env PROXY_PORT if needed.
PROXY_PORT="${PROXY_PORT:-41730}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "==> Apocentro sub-path deploy"
echo "    url path : ${BASE}"
echo "    nginx    : ${NGINX_CONF}"
echo "    webroot  : ${WEBROOT}"

if [[ ! -f "$NGINX_CONF" ]]; then
  echo "ERROR: nginx config '${NGINX_CONF}' not found. Pass the correct path as arg 1." >&2
  exit 1
fi

# --- 1. toolchain -------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
command -v curl >/dev/null 2>&1 || { apt-get update -y && apt-get install -y curl; }
if ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing Bun"; curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"; export PATH="$BUN_INSTALL/bin:$PATH"
BUN_BIN="$(command -v bun)"

# --- 2. build frontend (sub-path base + api under the sub-path) ---------------
echo "==> Building frontend for ${BASE}"
cd "$REPO_DIR"
printf 'VITE_BACKEND_URL=%sapi\n' "$BASE" > .env       # e.g. /apocentro/api
"$BUN_BIN" install
VITE_BASE="$BASE" "$BUN_BIN" run build

echo "==> Publishing to ${WEBROOT}"
mkdir -p "$WEBROOT"; rm -rf "${WEBROOT:?}/"*; cp -r dist/* "$WEBROOT"/

# --- 3. proxy backend as a systemd service ------------------------------------
echo "==> Proxy dependencies + systemd service"
cd "$REPO_DIR/proxy"; "$BUN_BIN" install
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=Apocentro proxy (Session network forwarder)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}/proxy
Environment=PORT=${PROXY_PORT}
ExecStart=${BUN_BIN} run ${REPO_DIR}/proxy/src/index.ts
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "${SERVICE}"
systemctl restart "${SERVICE}"

# Confirm the proxy actually came up on its port (it bootstraps snodes first).
echo "==> Waiting for proxy on 127.0.0.1:${PROXY_PORT}"
PROXY_OK=0
for i in $(seq 1 20); do
  if curl -fsS -m4 "http://127.0.0.1:${PROXY_PORT}/snodes" >/dev/null 2>&1; then PROXY_OK=1; break; fi
  sleep 2
done
if [[ "$PROXY_OK" != 1 ]]; then
  echo "WARN: proxy not responding on ${PROXY_PORT}. Recent logs:" >&2
  systemctl --no-pager status "${SERVICE}" || true
  journalctl -u "${SERVICE}" -n 30 --no-pager || true
fi

# --- 4. nginx snippet (location blocks) ---------------------------------------
echo "==> Writing nginx snippet ${SNIPPET}"
mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" <<NGINX
# Apocentro — served under ${BASE}
location = /${URLPATH} { return 301 ${BASE}; }

location ${BASE}api/ {
    proxy_pass http://127.0.0.1:${PROXY_PORT}/;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
    client_max_body_size 25m;
}

location ${BASE} {
    root /var/www;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    try_files \$uri \$uri/ ${BASE}index.html;
}
NGINX

# --- 5. include the snippet in the existing server block (safely) -------------
# NOTE: backups/temp files must live OUTSIDE the nginx config dirs, otherwise
# nginx loads them too (sites-enabled/* is a wildcard include) and you get
# "duplicate default server" errors.
CONF_DIR="$(dirname "$NGINX_CONF")"
CONF_NAME="$(basename "$NGINX_CONF")"
BACKUP_DIR="/etc/nginx/apocentro-backups"
mkdir -p "$BACKUP_DIR"

# Clean up any stray backup/temp copies a previous failed run may have left
# inside the nginx config dir (these would break nginx -t).
find "$CONF_DIR" -maxdepth 1 -name "${CONF_NAME}.apocentro.bak.*" -delete 2>/dev/null || true
find "$CONF_DIR" -maxdepth 1 -name "${CONF_NAME}.apocentro.tmp" -delete 2>/dev/null || true

INCLUDE_LINE="    include snippets/${URLPATH}.conf;"
if grep -q "snippets/${URLPATH}.conf" "$NGINX_CONF"; then
  echo "==> include already present in ${NGINX_CONF}"
else
  BACKUP="${BACKUP_DIR}/${CONF_NAME}.$(date +%s).bak"
  cp "$NGINX_CONF" "$BACKUP"
  echo "==> Backed up config to ${BACKUP}"
  TMP="$(mktemp)"
  # Insert the include right after the first 'listen ... 443' line (inside the SSL server block).
  awk -v inc="$INCLUDE_LINE" '
    /listen[^;]*443/ && !done { print; print inc; done=1; next }
    { print }
  ' "$BACKUP" > "$TMP"
  if grep -q "snippets/${URLPATH}.conf" "$TMP"; then
    cp "$TMP" "$NGINX_CONF"; rm -f "$TMP"
    if ! nginx -t; then
      echo "ERROR: nginx test failed after injecting include — rolling back" >&2
      cp "$BACKUP" "$NGINX_CONF"
      nginx -t
      exit 1
    fi
  else
    rm -f "$TMP"
    echo "WARN: could not find a 'listen 443' line to auto-inject into ${NGINX_CONF}."
    echo "      Add this line manually inside your HTTPS server block, then reload nginx:"
    echo "        ${INCLUDE_LINE}"
  fi
fi

echo "==> Reloading nginx"
nginx -t && systemctl reload nginx

echo ""
echo "================================================================"
echo " Apocentro deployed under sub-path:"
echo "   https://<your-domain>${BASE}"
echo "   proxy:  systemctl status ${SERVICE}   |  journalctl -u ${SERVICE} -f"
echo "   files:  ${WEBROOT}"
echo "   nginx:  ${SNIPPET} (included from ${NGINX_CONF})"
echo "================================================================"
