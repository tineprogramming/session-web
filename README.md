# Apocentro Web

A private, end‑to‑end encrypted messenger that runs **entirely in your browser** —
a white‑label fork of [Session](https://getsession.org) (based on
[`session-web`](https://github.com/VityaSchel/session-web) by hloth).

Apocentro is a **closed ecosystem**: after Session's E2E encryption, every
message is wrapped with magic bytes (`0x41 0x50 0x43 0x01` = `"APC"` + version)
so only other Apocentro clients (this web app and the Apocentro Android app) can
read it — and Apocentro messages are unreadable to standard Session clients.

There are no accounts, phone numbers, or central servers — just a mnemonic and
the decentralized Session network, reached through a real client‑side 3‑hop
onion route. Private keys and decrypted messages never leave the browser.

**Live:** https://tinebritania.tinestuff.com/apocentro/

## Features

- 🔒 End‑to‑end encryption + client‑side **3‑hop onion routing** (the proxy is a
  blind relay; it never sees recipients or plaintext).
- 💬 Direct messages with **images, files, and voice notes** (hold the mic to
  record, release to send, slide left to cancel).
- 👥 **Groups** (web ⇄ web): create, message, add / remove / leave members, with
  system notices.
- 🔔 **Notifications** (PWA) — in‑page when the tab is hidden and, when installed
  to the home screen, in the background via Periodic Background Sync (no push
  server).
- 🌐 **Onion path** view — your IP plus each hop with country/flag.
- ↻ Failed messages retry on tap and auto‑retry when the network returns.
- 📱 Responsive, one‑handed mobile layout; installable as a PWA.
- 🧩 App ⇄ web interoperability for DMs and attachments (real Session protocol).

## Tech

React + Vite + TypeScript · Redux Toolkit (+ redux‑persist) · Dexie (IndexedDB) ·
libsodium‑wrappers‑sumo (wasm) · protobufjs · a small **Bun** proxy that serves
the frontend and blindly forwards onion requests on a single port.

A proxy is required only because Session nodes use self‑signed TLS and send no
CORS headers — it relays the (already onion‑encrypted) bytes and never sees
destinations or content.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture and developer notes, and
`Apocentro-Android/Web_Version_Tech_Spec/07_Apocentro_Technical_Specification.md`
for the protocol spec.

## Develop

```bash
bun install
bun run dev          # local dev (sets the COOP/COEP headers the wasm needs)

# production build for a sub-path deploy:
VITE_BASE=/apocentro/ VITE_BACKEND_URL=/apocentro bun run build
bun run preview
```

`bun run build` runs the protobuf codegen, builds the app, and bundles the
service worker separately into `dist/sw.js`.

## Deploy

The frontend **and** the API are served by one Bun process under a URL sub‑path
(default `/apocentro`), fronted by your existing nginx.

A push whose commit message contains **`[deploy-server]`** triggers
`.github/workflows/deploy-server.yml`: GitHub's runner SSHes to the server, does
a fresh clone, and runs `deploy/apocentro-deploy-subpath.sh` (build → systemd
service → nginx snippet with gzip → reload).

Set these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Example |
| --- | --- |
| `SERVER_HOST` | `your-domain.com` |
| `SERVER_PORT` | `22` |
| `SERVER_USER` | `root` |
| `SERVER_PASSWORD` | your SSH password |

The workflow is repo‑portable: moving to your own (non‑fork) repository only
requires re‑adding these four secrets — no code change.

## Credits

Built on Session (Oxen / Session Technology Foundation) and the open‑source
`session-web` browser client by [hloth.dev](https://github.com/VityaSchel/session-web).
Apocentro branding, magic bytes, and the closed‑ecosystem changes are this
fork's own.
