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

## Architectural deviation — onion routing (§3.1–§3.8)

The spec describes onion routing performed **client-side**, with the backend
acting only as a **blind first-hop forwarder** (`/forward`) so it cannot see
message content or destination.

The recovered baseline instead performs the 3-hop onion routing **server-side**
inside the proxy (`proxy/src/onion-path.ts`, `session-rpc.ts`): the client sends
plaintext RPC params to `/store` and `/poll`, and the proxy builds and peels the
onion.

- ✅ The on-the-wire property toward the Session network is met: requests are
  3-hop AES-256-GCM onion-routed; snodes never see the client IP.
- ⚠️ The spec's *privacy-from-backend* property is **not yet** met: because the
  proxy builds the onion, it can see the RPC and destination. Meeting the spec
  requires moving onion construction into the browser:
  - `src/shared/api/onion-crypto.ts` — X25519 ECDH + HMAC-SHA256("LOKI") +
    AES-256-GCM per layer (port of `proxy/src/crypto.ts` / `onion-path.ts`)
  - client-side 3-layer build + response peel (§3.5, §3.8)
  - backend reduced to a blind `/forward` endpoint
  - `/snodes` extended to return `pubkey_x25519` / `pubkey_ed25519`

This rewrite was deferred deliberately: it is a large change to the proven
networking path and cannot be verified here without the live Session network.
The current server-side onion path is functional and was kept as the working
baseline.

## Running locally

```
bun install
cp .env.sample .env            # point VITE_BACKEND_URL at your proxy
cd proxy && bun install && bun run start
bun run dev                    # in the repo root
```
