#!/usr/bin/env bash
#
# Apocentro one-shot server deploy (run on the target server as root).
#
# Sets up:
#   - the proxy backend as a systemd service on 127.0.0.1:3000
#   - the built frontend served by nginx over HTTPS with the required
#     cross-origin-isolation headers (COOP/COEP)
#   - nginx reverse-proxy /api/ -> the proxy
#   - a Let's Encrypt certificate via certbot
#
# Usage (run from inside a checkout of this repo, as root):
#   sudo bash deploy/apocentro-deploy.sh <domain> [letsencrypt-email]
#
# Example:
#   git clone -b claude/apocentro-web-recovery-q13fec \
#       https://github.com/tineprogramming/session-web.git
#   cd session-web
#   sudo bash deploy/apocentro-deploy.sh tinebritania.tinestuff.com you@example.com
#
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-admin@${DOMAIN}}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash deploy/apocentro-deploy.sh <domain> [email]" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="/var/www/apocentro"
SERVICE="apocentro-proxy"

echo "==> Apocentro deploy for ${DOMAIN}"
echo "    repo: ${REPO_DIR}"

# --- 1. system packages -------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx unzip
# certbot (Let's Encrypt) for HTTPS
apt-get install -y certbot python3-certbot-nginx || echo "WARN: certbot install failed; you can run it manually later"

# --- 2. bun -------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing Bun"
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
BUN_BIN="$(command -v bun)"
echo "    bun: ${BUN_BIN}"

# --- 3. build the frontend (talks to nginx /api -> proxy) ---------------------
echo "==> Building frontend"
cd "$REPO_DIR"
printf 'VITE_BACKEND_URL=/api\n' > .env
"$BUN_BIN" install
"$BUN_BIN" run build

echo "==> Publishing static site to ${WEBROOT}"
mkdir -p "$WEBROOT"
rm -rf "${WEBROOT:?}/"*
cp -r dist/* "$WEBROOT"/

# --- 4. proxy backend deps + systemd service ----------------------------------
echo "==> Installing proxy dependencies"
cd "$REPO_DIR/proxy"
"$BUN_BIN" install

echo "==> Creating systemd service ${SERVICE}"
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=Apocentro proxy (Session network forwarder)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}/proxy
Environment=PORT=3000
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
echo "    proxy service started on 127.0.0.1:3000"

# --- 5. nginx site ------------------------------------------------------------
# Apocentro needs cross-origin isolation (SharedArrayBuffer / wasm crypto),
# which requires HTTPS + COOP/COEP headers.
echo "==> Writing nginx site"
cat > "/etc/nginx/sites-available/apocentro.conf" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    # certbot will add the HTTPS server block + redirect below.
    root ${WEBROOT};
    index index.html;

    # API -> proxy backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        client_max_body_size 25m;
    }

    # Static app with cross-origin isolation headers + SPA fallback
    location / {
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/apocentro.conf /etc/nginx/sites-enabled/apocentro.conf
nginx -t
systemctl reload nginx

# --- 6. HTTPS via Let's Encrypt ----------------------------------------------
if command -v certbot >/dev/null 2>&1; then
  echo "==> Obtaining HTTPS certificate for ${DOMAIN}"
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect || {
    echo "WARN: certbot failed. The site is up on HTTP, but Apocentro REQUIRES HTTPS"
    echo "      (cross-origin isolation). Fix DNS/cert then run:"
    echo "      certbot --nginx -d ${DOMAIN} --redirect"
  }
else
  echo "WARN: certbot not available — install it and run: certbot --nginx -d ${DOMAIN} --redirect"
fi

echo ""
echo "================================================================"
echo " Apocentro deployed:  https://${DOMAIN}"
echo "   proxy:  systemctl status ${SERVICE}"
echo "   logs:   journalctl -u ${SERVICE} -f"
echo "   site:   ${WEBROOT}  (nginx)"
echo "================================================================"
