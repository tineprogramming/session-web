# Deploying Apocentro Web

Apocentro has **two pieces** that both need to run:

1. **Frontend** — a static site (the React app). Host on Cloudflare Pages, Netlify,
   Vercel, GitHub Pages, or any static host.
2. **Proxy** — a small Bun server that relays requests to the Session network
   (`proxy/`). It must be reachable over **HTTPS** from the frontend. Host on
   Render, Fly, Railway, or a VPS.

The frontend is told where the proxy lives via the `VITE_BACKEND_URL` build-time
env var. **Deploy the proxy first**, then build the frontend pointing at it.

---

## Quickest way to test for real (local, ~2 minutes)

This needs only [Bun](https://bun.sh). No accounts, no hosting.

```bash
# Terminal 1 — proxy
cd proxy
bun install
bun run start            # -> "App is listening on port 3000"

# Terminal 2 — frontend
cd ..
bun install
cp .env.sample .env
# edit .env so it reads:  VITE_BACKEND_URL=http://localhost:3000
bun run dev              # -> http://localhost:5173
```

Open `http://localhost:5173` in two browser windows (or two profiles), create an
account in each, and message between them.

> Apocentro uses **magic bytes**, so it only talks to other Apocentro clients —
> a standard Session client will not see these messages. To test, use two
> Apocentro instances.

---

## Production deploy

### Step 1 — Deploy the proxy (Render, free tier)

A Render blueprint is included (`render.yaml`) plus `proxy/Dockerfile`.

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select this repo. Render reads `render.yaml`
   and builds the proxy from `proxy/Dockerfile`.
3. When it's live you get a URL like `https://apocentro-proxy.onrender.com`.
   Copy it.

(Any container host works — the Dockerfile is generic. Locally:
`docker build -t apocentro-proxy ./proxy && docker run -p 3000:3000 apocentro-proxy`.)

The proxy's CORS allowlist already permits `https://apocentro.pages.dev` and
`localhost`. If you host the frontend on a **different** domain, add it to the
`cors({ origin: [...] })` list in `proxy/src/index.ts`.

### Step 2 — Deploy the frontend (Cloudflare Pages)

1. Set the proxy URL: edit `.env.sample` (or set the env var in your host) so
   `VITE_BACKEND_URL=https://<your-proxy-url>`.
2. Build:
   ```bash
   bun install
   bun run build        # outputs static files to ./dist
   ```
3. Deploy `./dist`:
   ```bash
   npx wrangler pages deploy ./dist --project-name apocentro
   ```
   Or connect the repo in the Cloudflare Pages dashboard with build command
   `bun run build`, output dir `dist`, and a `VITE_BACKEND_URL` env var.

A GitHub Actions workflow (`.github/workflows/deploy_cfpages.yml`) already
deploys to Cloudflare Pages on push to `master`. To use it, set repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and make sure the
`--project-name` in the workflow matches your Pages project.

### Step 3 — Verify

Open the deployed site, create an account, and confirm:
- the onion-path footer (left panel) shows hops with country flags — this proves
  the frontend can reach the proxy and the proxy can reach the network;
- messaging works between two Apocentro accounts.

---

## Notes

- **HTTPS is required** for the proxy in production. Browsers block a mixed
  HTTPS-page → HTTP-proxy request, and the app sets cross-origin isolation
  headers. Render/Fly/Railway give you HTTPS automatically.
- Render's free tier sleeps when idle; the first request after a nap is slow.
- The proxy holds no secrets and stores nothing; it only relays. Private keys and
  decrypted messages never leave the browser.
