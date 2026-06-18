# [Session Web](https://sessionweb.pages.dev)

Experimental project running [Session messenger](https://getsession.org) in the browser.

![image](https://github.com/user-attachments/assets/7a1d2d79-2161-4dff-95c5-e8daf358f734)

Visit Session Web: [sessionweb.pages.dev](https://sessionweb.pages.dev)

Works in Tor! 99% client-side (still requires proxy to swarms though). All encryption and private keys never leave the browser.

**This is an experimental project, not a stable client**

- [X] Receiving messages
- [X] Sending messages
  - [ ] Attachments support
- [ ] Clearing network
- [ ] Conversations pinning
- [ ] Closed groups
- [ ] Open groups (communities)
- [ ] Blocked list
- [ ] Profile editing
- [ ] Searching conversations
- [ ] Searching in conversations
- [ ] Optimizations
  - [ ] Partial conversations loading
- [X] Multiaccount
- [X] Localization
  - [X] 38 most used languages on the internet [[Wikipedia]](https://en.wikipedia.org/wiki/Languages_used_on_the_Internet)
  - [ ] Option to change UI language
- [ ] PWA
  - [ ] Offline support
  - [ ] Updates
- [ ] Push notifications
  - [ ] Notifications settings
- [ ] Calls
- [ ] Custom proxy server support
- [ ] Direct nodes connection support
  - [ ] Onion routing

## How to deploy your own instance

1. Install Bun from https://bun.sh or `npm i -g bun`

2. ```git clone https://github.com/gongchandang49/session-web.git && cd session-web```

3. ```mv .env.sample .env``` _(This will use my backend by default, feel free to change it)_

4. ```bun i && bun run build```

5. Deploy the version generated on `dist/` folder. Example for Cloudflare Pages:
```wrangler pages deploy ./dist```

## Backend server

Source code of backend/proxy server has been moved to the [session-web-backend repo](https://github.com/gongchandang49/session-web-backend).

## Credits

- Original project (archived): [VityaSchel/session-web](https://github.com/VityaSchel/session-web) by `hloth.dev`
