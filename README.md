# Apocentro Web

Apocentro is a private, end-to-end encrypted messenger that runs in the browser. It is a
white-label client built on top of the [Session](https://getsession.org) messaging protocol
and operates over the existing Session Network without running its own relay infrastructure.

Apocentro keeps a **closed organizational ecosystem**: a custom protocol layer (magic bytes)
is layered on top of Session's end-to-end encryption so that Apocentro clients only exchange
messages with other Apocentro clients.

## What makes it Apocentro

- **Magic bytes (closed ecosystem).** Every message is prefixed with `0x41 0x50 0x43 0x01`
  (`"APC"` + version) after Session's E2E encryption. Messages without the prefix are silently
  dropped, and Apocentro messages are unreadable to standard Session clients.
  See `src/shared/api/magic-bytes.ts`.
- **Onion-routed transport.** Requests to the Session storage network are relayed through a
  3-hop onion path so message content and destination are hidden from the proxy.
- **Apocentro branding.** Logo, icons, and metadata are Apocentro's.

All confidential data (private keys, decrypted messages) never leaves the browser. A proxy
server is still required to reach the network nodes, because nodes use self-signed TLS
certificates and do not send CORS headers.

## Run it locally

1. Install [Bun](https://bun.sh) (`npm i -g bun`).
2. `bun install`
3. Copy the env file: `cp .env.sample .env` and point `VITE_BACKEND_URL` at your proxy.
4. Start the proxy (separate terminal): `cd proxy && bun install && bun run start`
5. Start the frontend: `bun run dev`

## Build

```
bun run build
```

The static site is generated in `dist/`.

## Technical specification

The full protocol design (magic bytes, onion routing, attachments) is documented in the
Apocentro technical specification:
`Apocentro-Android/Web_Version_Tech_Spec/07_Apocentro_Technical_Specification.md`.

## Credits

Built on the Session protocol by the Oxen / Session Foundation, and on the open-source
`session-web` browser client by [hloth.dev](https://github.com/VityaSchel/session-web).
