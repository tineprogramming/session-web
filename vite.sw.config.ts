import { defineConfig } from 'vite'
import path from 'node:path'

// Separate build that bundles the service worker (src/sw/sw.ts) into dist/sw.js
// as a single self-contained classic worker. Runs after the main `vite build`
// with emptyOutDir disabled so it only adds sw.js.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      // No DOM in the worker — swap sonner for a console-logging stub so shared
      // modules that import { toast } from 'sonner' still compile and run.
      sonner: path.resolve(__dirname, 'src/sw/sonner-stub.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false,
    target: 'es2020',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/sw/sw.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'sw.js',
        inlineDynamicImports: true,
      },
    },
  },
})
