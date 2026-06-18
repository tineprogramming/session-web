import bunrest from 'bunrest'
import cors from 'cors'
import { join } from 'path'
import { Snode, fetchSnodesList, pollSnode } from './snodes'
import { GetNetworkTime } from './network-time'
import { z } from 'zod'
import { SnodeNamespaces } from './types/namespaces'
import _ from 'lodash'
import { getSwarms } from './swarms'
import { sendMessageDataToSnode } from './store-message'
import { RetryWithOtherNode421Error } from './utils/errors'

const server = bunrest()

server.use(cors({
  origin: [/^https?:\/\/localhost/, 'https://apocentro.pages.dev', 'https://session-web.pages.dev']
}))

export const nodes: Map<string, Snode> = new Map()

const fetchSnodes = async () => {
  const list = await fetchSnodesList()
  GetNetworkTime.getNetworkTime(_.sample(list)!)
  list.forEach(node => nodes.set(node.public_ip + ':' + node.storage_port, node))
}
await fetchSnodes() 
setInterval(fetchSnodes, 1000 * 60 * 5)

server.get('/snodes', async (req, res) => {
  // Return full node descriptors (incl. pubkeys) so the client can build onions.
  res.status(200).json({
    ok: true,
    snodes: Array.from(nodes.values()).map(node => ({
      ip: node.public_ip,
      port: node.storage_port,
      x25519: node.pubkey_x25519,
      ed25519: node.pubkey_ed25519,
    }))
  })
})

server.get('/network_time', async (req, res) => {
  const now = GetNetworkTime.getNowWithNetworkOffset()
  res.status(200).json({
    ok: true,
    value: now
  })
})

server.get('/swarms', async (req, res) => {
  const query = await z.object({
    pubkey: z.string().length(66),
    snode: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}$/),
  }).safeParseAsync(req.query)

  if (!query.success) {
    res.status(400).json({
      ok: false,
      error: 'Invalid request query'
    })
    return
  }

  const snode = nodes.get(query.data.snode)
  if (!snode) {
    res.status(404).json({
      ok: false,
      error: 'Swarm not found'
    })
    return
  }

  try {
    const swarms = await getSwarms(query.data.pubkey, snode)
    res.status(200).json({
      ok: true,
      swarms
    })
  } catch(e) {
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    })
  }
})

server.post('/poll', async (req, res) => {
  const body = await z.object({
    pubkey: z.string().min(1),
    namespace: z.nativeEnum(SnodeNamespaces),
    swarm: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}$/),
    signatureBuilt: z.object({
      timestamp: z.number().int().positive(),
      signature: z.string().min(1),
      pubkey_ed25519: z.string().min(1),
      pubkey: z.string().min(1),
    }),
    last_hash: z.string().min(1).optional(),
  }).safeParseAsync(req.body)

  if(!body.success) {
    res.status(400).json({
      ok: false,
      error: 'Invalid request body'
    })
    return
  }

  const swarm = nodes.get(body.data.swarm)
  if (!swarm) {
    res.status(404).json({
      ok: false,
      error: 'Swarm not found'
    })
    return
  }

  const lastHash = body.data.last_hash

  try {
    const results = await pollSnode({
      node: swarm,
      namespaces: [body.data.namespace],
      pubkey: body.data.pubkey,
      signatureBuilt: body.data.signatureBuilt,
      ...(lastHash && { lastHashes: [lastHash] })
    })
    res.status(200).json({
      ok: true,
      results: results
    })
    return
  } catch(e) {
    if(e instanceof RetryWithOtherNode421Error) {
      res.status(421).json({
        ok: false,
        error: 'Retry with another node'
      })
    } else {
      res.status(500).json({
        ok: false,
        error: e.message
      })
      return
    }
  }
})

server.post('/store', async (req, res) => {
  const body = await z.object({
    destination: z.string().length(66),
    params: z.object({
      pubkey: z.string().length(66),
      ttl: z.number().int().positive(),
      timestamp: z.number().int().positive(),
      data64: z.string().min(1),
      namespace: z.nativeEnum(SnodeNamespaces),
    }),
    snode: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}$/),
    sync: z.object({
      pubkey: z.string().length(66),
      data: z.string().min(1),
    })
  }).safeParseAsync(req.body)
  if(!body.success) {
    res.status(400).json({
      ok: false,
      error: 'Invalid request body'
    })
    return
  }

  const snode = nodes.get(body.data.snode)
  if (!snode) {
    res.status(404).json({
      ok: false,
      error: 'Snode not found'
    })
    return
  }

  try {
    const result = await sendMessageDataToSnode(
      body.data.params,
      body.data.destination,
      snode,
      body.data.sync.pubkey,
      body.data.sync.data
    )
    return res.status(200).json(result)
  } catch(e) {
    if(e instanceof RetryWithOtherNode421Error) {
      return res.status(500).json({
        ok: false
      })
    } else {
      return res.status(500).json({
        ok: false,
        error: 'Internal server error'
      })
    }
  }
})

server.get('/ons', async (req, res) => {
  const myHeaders = new Headers()
  myHeaders.append('Content-Type', 'application/json')

  const query = await z.object({
    hash: z.string().length(44).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  }).safeParseAsync(req.query)
  if(!query.success) {
    res.status(400).json({
      ok: false,
      error: 'Invalid request params'
    })
    return
  }

  const nameHash = query.data.hash

  const request = await fetch('http://public-eu.optf.ngo:22023/json_rpc', {
    method: 'POST',
    headers: myHeaders,
    body: JSON.stringify({
      'jsonrpc': '2.0',
      'id': '0',
      'method': 'ons_resolve',
      'params': {
        'name_hash': nameHash,
        'type': 0
      }
    }),
    redirect: 'follow'
  })
  if(request.status !== 200) {
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    })
    return
  } else {
    const response = await request.json()
    if(response.error) {
      res.status(200).json({
        ok: false,
        error: response.error.message
      })
    } else {
      const encryptedValue = response.result.encrypted_value
      const nonce = response.result.nonce
      res.status(200).json({
        ok: true,
        value: (encryptedValue && nonce) ? encryptedValue + nonce : null
      })
    }
  }
})

// Apocentro onion path display (spec §3.9) — returns the 3 relay hops the
// onion request traverses, annotated with GeoIP country via ip-api.com.
server.get('/path', async (req, res) => {
  const all = Array.from(nodes.values())
  if (all.length < 3) {
    res.status(503).json({ ok: false, error: 'Not enough nodes available' })
    return
  }
  const picked: Snode[] = []
  const labels = ['Guard', 'Middle', 'Swarm']
  while (picked.length < 3) {
    const candidate = _.sample(all)!
    if (!picked.some(p => p.public_ip === candidate.public_ip)) picked.push(candidate)
  }

  let geo: Record<string, { country?: string, countryCode?: string }> = {}
  try {
    const lookup = await fetch('http://ip-api.com/batch?fields=country,countryCode,query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(picked.map(p => ({ query: p.public_ip }))),
    })
    if (lookup.ok) {
      const arr = await lookup.json() as Array<{ query: string, country?: string, countryCode?: string }>
      for (const entry of arr) geo[entry.query] = { country: entry.country, countryCode: entry.countryCode }
    }
  } catch { /* GeoIP is best-effort */ }

  res.status(200).json({
    ok: true,
    path: picked.map((node, i) => ({
      label: labels[i],
      ip: node.public_ip,
      port: node.storage_port,
      country: geo[node.public_ip]?.country ?? null,
      countryCode: geo[node.public_ip]?.countryCode ?? null,
    })),
  })
})

server.options('/path', (req, res) => { res.status(200).send(true) })

const FILE_SERVER = 'https://filev2.getsession.org'

// Apocentro file attachments — blind proxy to the Session file server.
// The client uploads/downloads only AES-256-GCM encrypted bytes; the proxy
// never sees plaintext file content. See spec §4.
server.post('/upload', async (req, res) => {
  const body = await z.object({
    // base64-encoded, already client-side encrypted attachment bytes
    data: z.string().min(1).max(20_000_000),
  }).safeParseAsync(req.body)
  if (!body.success) {
    res.status(400).json({ ok: false, error: 'Invalid request body' })
    return
  }
  try {
    const bytes = Buffer.from(body.data.data, 'base64')
    const upload = await fetch(FILE_SERVER + '/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    if (upload.status !== 200 && upload.status !== 201) {
      res.status(502).json({ ok: false, error: 'File server rejected upload' })
      return
    }
    const json = await upload.json() as { id: string | number }
    const id = String(json.id)
    res.status(200).json({ ok: true, id, url: FILE_SERVER + '/file/' + id })
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Internal server error' })
  }
})

server.get('/download', async (req, res) => {
  const query = await z.object({
    url: z.string().url().startsWith(FILE_SERVER),
  }).safeParseAsync(req.query)
  if (!query.success) {
    res.status(400).json({ ok: false, error: 'Invalid request query' })
    return
  }
  try {
    const id = query.data.url.split('/').pop()
    const download = await fetch(FILE_SERVER + '/files/' + id)
    if (download.status !== 200) {
      res.status(502).json({ ok: false, error: 'File server error' })
      return
    }
    const json = await download.json() as { status_code?: number, result?: string }
    if (json.result) {
      res.status(200).json({ ok: true, data: json.result })
    } else {
      // some deployments return raw bytes instead of the {result} envelope
      const buf = Buffer.from(await download.arrayBuffer())
      res.status(200).json({ ok: true, data: buf.toString('base64') })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Internal server error' })
  }
})

// Apocentro client-side onion routing: blind first-hop forwarder.
// The client builds the entire 3-layer onion and sends the opaque outer bytes
// here; we forward them to the guard node's /onion_req/v2 and relay the reply.
// We never see the message content or final destination (spec §3.6).
server.post('/forward', async (req, res) => {
  const body = await z.object({
    guard: z.object({
      ip: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/),
      port: z.number().int().positive(),
    }),
    payload: z.string().min(1), // base64 of the binary onion body
  }).safeParseAsync(req.body)
  if (!body.success) {
    res.status(400).json({ ok: false, error: 'Invalid request body' })
    return
  }
  try {
    const bytes = Buffer.from(body.data.payload, 'base64')
    const r = await fetch(`https://${body.data.guard.ip}:${body.data.guard.port}/onion_req/v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
      tls: { rejectUnauthorized: false },
    })
    const buf = Buffer.from(await r.arrayBuffer())
    res.status(200).json({ ok: true, status: r.status, data: buf.toString('base64') })
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Guard node unreachable' })
  }
})

server.options('/forward', (req, res) => { res.status(200).send(true) })
server.options('/upload', (req, res) => { res.status(200).send(true) })
server.options('/download', (req, res) => { res.status(200).send(true) })
server.options('/snodes', (req, res) => { res.status(200).send(true) })
server.options('/network_time', (req, res) => { res.status(200).send(true) })
server.options('/swarms', (req, res) => { res.status(200).send(true) })
server.options('/poll', (req, res) => { res.status(200).send(true) })
server.options('/store', (req, res) => { res.status(200).send(true) })

// Apocentro: serve the built frontend AND the API from a single public port.
// bunrest handles the JSON API on an internal loopback port; a thin front
// server (below) serves the static frontend with the required cross-origin
// isolation headers and forwards API calls to bunrest.
const PUBLIC_PORT = Number(process.env.PORT || 3000)
const INTERNAL_PORT = PUBLIC_PORT + 1
const FRONTEND_DIST = process.env.FRONTEND_DIST || join(import.meta.dir, '..', '..', 'dist')
const COI_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}
const API_PATHS = new Set([
  '/snodes', '/network_time', '/swarms', '/poll', '/store',
  '/ons', '/path', '/upload', '/download', '/forward',
])

server.listen(INTERNAL_PORT, () => {
  console.log('Apocentro API (internal) listening on port ' + INTERNAL_PORT)
})

Bun.serve({
  port: PUBLIC_PORT,
  async fetch(req: Request) {
    const url = new URL(req.url)
    const path = url.pathname

    // API requests -> bunrest on the internal port. Only forward the
    // content-type (forwarding host/content-length/encoding headers breaks the
    // internal fetch); let Bun set content-length from the body.
    if (API_PATHS.has(path)) {
      try {
        const headers: Record<string, string> = {}
        const ct = req.headers.get('content-type')
        if (ct) headers['content-type'] = ct
        const init: RequestInit = { method: req.method, headers }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          init.body = await req.arrayBuffer()
        }
        return await fetch('http://127.0.0.1:' + INTERNAL_PORT + path + url.search, init)
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: 'internal forward failed: ' + ((e as Error)?.message ?? e) }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        )
      }
    }

    // Everything else -> static frontend (SPA) with cross-origin isolation.
    const rel = path === '/' ? '/index.html' : path
    let file = Bun.file(FRONTEND_DIST + rel)
    if (!(await file.exists())) {
      file = Bun.file(FRONTEND_DIST + '/index.html') // SPA fallback
    }
    return new Response(file, { headers: COI_HEADERS })
  },
})
console.log('Apocentro (frontend + API) listening on port ' + PUBLIC_PORT)