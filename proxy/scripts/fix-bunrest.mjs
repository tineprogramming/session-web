// Fix bunrest 1.3.8's double request-body read, which throws
// "Body already used" (ERR_BODY_ALREADY_USED) on modern Bun and crashes the
// server on every POST. bunrest reads req.text() and then req.blob(); we drop
// the redundant blob read. Idempotent — safe to run on every install.
import { readFileSync, writeFileSync } from 'fs'

const file = new URL('../node_modules/bunrest/src/server/server.ts', import.meta.url)

try {
  let src = readFileSync(file, 'utf8')
  if (src.includes('newReq.blob = req.blob();')) {
    src = src.replace(
      /\n\s*req\.arrayBuffer;\n\s*newReq\.blob = req\.blob\(\);/,
      '\n    // Apocentro: avoid double body read (Bun throws "Body already used")\n    newReq.blob = undefined as any;',
    )
    writeFileSync(file, src)
    console.log('[fix-bunrest] patched bunrest double body-read')
  } else {
    console.log('[fix-bunrest] bunrest already patched (or pattern absent)')
  }
} catch (e) {
  console.warn('[fix-bunrest] skipped:', e.message)
}
