# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

**Apocentro Web** — a white‑label, browser‑based fork of the Session messenger
(originally `session-web` by hloth). It speaks the real Session protocol
(snodes, swarms, onion routing, storage RPC) but is a **closed ecosystem**: every
payload is wrapped in 4 "magic bytes" so only other Apocentro clients (web + the
Apocentro Android app) can read it.

It runs entirely client‑side in the browser; a small Bun proxy only forwards
encrypted onion bytes and serves the static frontend.

Live: `https://tinebritania.tinestuff.com/apocentro/`

## Architecture

```
Browser (React SPA)  ──HTTPS──▶  nginx  ──/apocentro/──▶  Bun proxy (one port)
  │  client-side 3-hop onion crypto                         ├─ serves /dist (frontend)
  │  libsodium-sumo (wasm), Dexie/IndexedDB                 ├─ /forward  (blind onion relay)
  │  redux + redux-persist                                  ├─ /snodes /swarms /upload /download
  └─ service worker (background poll)                       └─ /geoip /ons /network_time
                                                            (internal bunrest server on loopback)
```

- **Frontend**: React + Vite + TypeScript, Redux Toolkit (+redux-persist),
  Dexie (IndexedDB), libsodium-wrappers-sumo (wasm), protobufjs.
- **Backend** (`proxy/`): Bun. A public `Bun.serve` server (serves the frontend
  + forwards API paths) and an internal `bunrest` server (snode/swarm logic) on
  loopback. The proxy is a **blind** onion forwarder — it never sees message
  destinations or plaintext.
- **Crypto**: client builds real 3‑hop onion requests (X25519 ECDH +
  HMAC‑SHA256("LOKI") key derivation + AES‑256‑GCM per layer). See
  `src/shared/api/onion-*.ts`.
- **Closed ecosystem**: `src/shared/api/magic-bytes.ts` wraps/strips a 4‑byte
  prefix; `messages-decrypter.ts` drops anything without it.

## Directory map

- `src/app/` — bootstrap (`main.tsx`), `app.tsx` (routes + poll loop), staged
  loaders (`sodium-loader`, `indexeddb-loader`, `i18n-loader`), error boundary.
- `src/shared/api/` — the protocol core:
  - `onion-crypto.ts`, `onion-request.ts`, `onion-path.ts` — onion routing.
  - `snodes.ts`, `swarms.ts`, `nodes.ts` — snode pool / swarm selection.
  - `messages-sender.ts`, `messages-receiver.ts`, `messages-encrypter.ts`,
    `messages-decrypter.ts` — send/receive pipeline.
  - `attachments.ts` — AES‑256‑CBC + HMAC‑SHA256 (Session standard), 64‑byte key.
  - `magic-bytes.ts`, `account-manager.ts`, `storage.ts` (Dexie schema + types),
    `group-admin.ts` (fan‑out groups), `resend.ts`.
  - `groups-v2/libsession.ts` — loader for the official Session Foundation
    `@session-foundation/libsession-wasm` (real closed groups; WIP).
  - `signal-service/` — generated protobuf (`bun run protobuf`).
- `src/shared/poll-core.ts` — context‑agnostic poll (shared by page + SW).
- `src/shared/poll.ts` — page wrapper around `poll-core`.
- `src/sw/sw.ts` — bundled service worker (background poll via Periodic Background
  Sync; notifications). Built separately by `vite.sw.config.ts`.
- `src/features/`, `src/widgets/`, `src/entities/`, `src/pages/` — UI.
- `proxy/` — the Bun backend (`src/index.ts`).
- `deploy/apocentro-deploy-subpath.sh` — builds + installs systemd service +
  writes the nginx snippet (serves under a sub‑path).
- `.github/workflows/deploy-server.yml` — SSH deploy.

## Build / run / test

- `bun run build` — protobuf + `vite build` + `vite build --config vite.sw.config.ts`
  (the SW is a separate bundle → `dist/sw.js`). Pass `VITE_BASE=/apocentro/` and
  `VITE_BACKEND_URL=/apocentro` for the sub‑path deploy.
- `bun run dev` / `bun run preview` — local. Cross‑origin isolation headers
  (COOP/COEP) are required for the wasm; the dev server and the Bun proxy set them.
- **Testing**: there's no unit suite. Verify against the **live** URL with
  Playwright (`node_modules/.bin/playwright`); launch with
  `--ignore-certificate-errors` / `ignoreHTTPSErrors` (the sandbox intercepts the
  cert). Read state straight from IndexedDB (`session-web` db) and the session id
  from `localStorage['persist:root']`. The sandbox only allows ports 80/443
  outbound (no SSH, no snode ports) — the app talks to snodes via the deployed
  proxy, not directly.

## Deploy

- Pushing a commit whose message contains the marker **`[deploy-server]`** (to
  any of `main`, `master`, or the working branch) triggers
  `.github/workflows/deploy-server.yml`. GitHub's runner SSHes to the server
  (it is not behind the sandbox firewall), does a **fresh `git clone`** of
  `${{ github.repository }}` @ `${{ github.ref_name }}` into `/opt/apocentro`,
  and runs `deploy/apocentro-deploy-subpath.sh`. Required repo secrets:
  `SERVER_HOST`, `SERVER_PORT`, `SERVER_USER`, `SERVER_PASSWORD`.
- The workflow is **repo‑portable**: moving to your own (non‑fork) repo only needs
  the four secrets re‑added — no code change.
- The deploy rewrites the nginx snippet (with gzip) and restarts the
  `apocentro-proxy` systemd unit each time, so the server is never pinned to a
  specific repo.
- Watch a deploy by polling the live site (e.g. an asset hash or a known string),
  not by SSH. The server embeds the git hash into the bundle, so local build
  hashes won't match the server's.

## Conventions & gotchas

- **Dexie: never change a record's primary key in `.update()`** — it throws and
  aborts the whole update. (This caused outgoing attachment messages to stick on
  "sending".) Update other fields; keep the key.
- **DB writes must be idempotent** — the page poll and the SW poll run
  concurrently; use `put`/tolerate `ConstraintError` (see `poll-core.ts`).
- **`window`/DOM is not available in the service worker** — shared modules used
  by `poll-core` are guarded (`typeof window !== 'undefined'`), and the SW build
  aliases `sonner` to a console stub (`src/sw/sonner-stub.ts`).
- **Cache**: the proxy serves `/assets/*` (content‑hashed) as immutable but
  `index.html`/`sw.js` as `no-cache`, and the frontend self‑heals a stale deploy
  by reloading once on `vite:preloadError`. Don't call `preventDefault()` on that
  event unless you actually reload (it makes the dynamic import resolve to
  `undefined`).
- **Mobile UI** scales via `clamp(...)` root font‑size below the `lg` (1024px)
  breakpoint; `useIsMobile()` switches `MainWrapper` to a single column. Keep
  desktop styles behind `lg:` and the desktop branch.
- The proxy has process‑level `uncaughtException`/`unhandledRejection` guards and
  `systemd Restart=always StartLimitIntervalSec=0` so a stray rejection can't take
  it down permanently.

## Feature status

- ✅ DM (text, images, files, voice), magic bytes, client onion routing.
- ✅ Voice: press‑and‑hold to record, release to send, slide left to cancel.
- ✅ Attachments: AES‑CBC+HMAC, interop with the Android app for DMs.
- ✅ Fan‑out "groups v1" (DM to each member + `GroupContext`): create, send,
  add/remove/leave, system messages. **Web‑only** (not the app's groups).
- ✅ Notifications: in‑page when the tab is hidden; background via SW + Periodic
  Background Sync (Chromium + installed PWA; browser‑throttled, no push server).
- ✅ Failed‑send retry (tap ⚠️) + auto‑retry on reconnect.
- ✅ Responsive single‑column mobile + compose FAB.
- 🚧 **Groups v2** (real Session closed groups, interop with the app): Phase 1
  (libsession‑wasm integrated, verified in browser) and Phase 2 (decode the
  app's `GroupUpdateInviteMessage` so an app group appears on web) done. Reading
  the group swarm, sending, and creating from web are still to do. See
  `src/shared/api/groups-v2/`, `protos/SignalService.proto` (`GroupUpdateMessage`
  field 120), and `poll-core.ts` `handleGroupV2Update`.

> Note: the app's real closed groups and the web's fan‑out groups are **different
> protocols** and do not interoperate until groups v2 is finished on web.
