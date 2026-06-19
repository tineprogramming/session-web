// Build-time replacement for `sonner` inside the service-worker bundle, where
// there is no DOM. Aliased via vite.sw.config.ts so shared modules that import
// `toast` from 'sonner' (e.g. messages-decrypter, nodes) keep working in the SW.

type Args = unknown[]
export const toast = {
  error: (...a: Args) => console.warn('[sw toast.error]', ...a),
  warning: (...a: Args) => console.warn('[sw toast.warning]', ...a),
  message: (...a: Args) => console.log('[sw toast]', ...a),
  success: (...a: Args) => console.log('[sw toast.success]', ...a),
  info: (...a: Args) => console.log('[sw toast.info]', ...a),
}

export function Toaster() {
  return null
}

export default { toast, Toaster }
