import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'

// https://vitejs.dev/config/
export default defineConfig({
  // Base public path — set VITE_BASE=/apocentro/ to serve under a sub-path.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    allowedHosts: true
  }
})
