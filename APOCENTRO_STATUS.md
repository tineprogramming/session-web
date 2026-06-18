# Apocentro Web — Recovery & Implementation Status

This document tracks the state of the Apocentro web client after the server
crash, relative to the technical specification at
`Apocentro-Android/Web_Version_Tech_Spec/07_Apocentro_Technical_Specification.md`.

## Recovery

The most recent frontend code was lost in the crash. It was recovered from
`session-web-master.zip` (the gongchandang49 `session-web` fork) and restored as
the project baseline, including the 38-language locale set and CI workflows.

## Implemented

| Spec | Feature | Status | Where |
|------|---------|--------|-------|
| §2 | **Magic bytes** (closed ecosystem) | ✅ Done | `src/shared/api/magic-bytes.ts`, wired in `messages-sender.ts` (send) and `messages-decrypter.ts` (receive) |
| — | **Apocentro branding** (logo, icons, OGP, manifest, metadata, README) | ✅ Done | `public/*`, `src/assets/apocentro-logo.png`, `index.html`, `src/widgets/{loader,session-web-info}.tsx` |
| §4 | **File attachments** (per-file AES-256-GCM, upload/download proxy, UI) | ✅ Done | `src/shared/api/attachments.ts`, `proxy/src/index.ts` (`/upload`, `/download`), message input + bubble + poll |
| §3 | **Client-side onion routing** (real 3-hop onion built in the browser; blind backend forwarder) | ✅ Done & verified live | `src/shared/api/onion-crypto.ts`, `onion-request.ts`, `proxy/src/index.ts` (`/forward`, `/snodes` pubkeys), wired in `snodes.ts`/`swarms.ts`/`nodes.ts`/`messages-sender.ts` |
| §3.9 | **Onion path display** (You → Guard → Middle → Swarm → Recipient, GeoIP flags) | ✅ Done | `proxy/src/index.ts` (`/path`), `src/shared/api/onion-path.ts`, `src/widgets/path-display.tsx` |
| — | **Group chat** (private groups via DM fan-out + GroupContext) | ✅ Done | `VisibleMessage.ts`, `messages` fan-out in `conversation-message-input.tsx`, `poll.ts`, `new-conversation.tsx` |
| — | **Deploy config** (Cloudflare Pages frontend + Render/Docker proxy) | ✅ Done | `DEPLOY.md`, `render.yaml`, `proxy/Dockerfile` |

All of the above were verified with a full production build (`bun run build`)
and the proxy with a transpile check. The proxy was also run live: it bootstrapped
1039 snodes from the Session network and `/path` returned real GeoIP-annotated hops.

### Group chat — how it works

A group is a local conversation keyed by a synthetic 16-byte hex `groupId`.
Sending fans the proven `sendMessage` out to every other member, each message
carrying a `GroupContext` (full roster including self), so magic bytes and
attachments apply unchanged. Each send's self-sync hash is recorded in
`messages_seen` so loopback copies aren't duplicated; the outgoing row is stored
once under the `groupId`. On receive, the poller reads `GroupContext`, upserts
the `ClosedGroup` conversation (roster minus self), and threads messages by
`groupId`. Group members are entered as raw `05…` Session IDs.

*Known v1 limitation:* your own group messages don't sync to your other devices.

### Magic bytes — exact behaviour

A 4-byte prefix `[0x41 0x50 0x43 0x01]` (`"APC"` + version 1) is wrapped around
the encoded `WebSocketMessage` **after** Session's E2E encryption and **before**
base64 transmission. On receive, messages without the prefix are silently
dropped. Result:

- Apocentro → Apocentro: delivered
- Session → Apocentro: rejected (no prefix)
- Apocentro → Session: discarded (prefix corrupts the protobuf)

## Onion routing (§3.1–§3.8) — client-side, verified live

The full 3-hop onion is now built **in the browser**; the backend is only a
**blind first-hop forwarder** (`/forward`), so it never sees message content or
the final destination (the spec's privacy-from-backend property).

- `src/shared/api/onion-crypto.ts` — per-layer X25519 ECDH + HMAC-SHA256("LOKI")
  + AES-256-GCM (§3.3); little-endian length framing + routing metadata (§3.4).
- `src/shared/api/onion-request.ts` — 3-layer build (guard/middle/exit, §3.5),
  send via `/forward` (§3.6), response peel (§3.8); high-level `onionGetSwarm`,
  `onionSubRequest`.
- `proxy/src/index.ts` — `/forward` relays the opaque onion bytes to the guard's
  `/onion_req/v2`; `/snodes` returns node `pubkey_x25519` / `pubkey_ed25519`.
- Wired into `snodes.ts` (retrieve), `swarms.ts` (`get_swarm`), `nodes.ts`,
  `messages-sender.ts` (store to recipient + sync swarms).

**Verified end-to-end against the live Session network:** a message sent from
one account was delivered to another, each hop store/retrieve routed through a
real client-built 3-hop onion. (A get_swarm onion self-test confirmed the crypto
first.)

> Note: a latent bug was also fixed here — bunrest 1.3.8 read the request body
> twice ("Body already used"), which crashed every POST on modern Bun, so the
> store/poll endpoints never actually worked before. `proxy/scripts/fix-bunrest.mjs`
> (run from postinstall) patches it.

## Running locally

```
bun install
cp .env.sample .env            # point VITE_BACKEND_URL at your proxy
cd proxy && bun install && bun run start
bun run dev                    # in the repo root
```
