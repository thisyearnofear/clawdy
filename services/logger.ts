const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production'

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev) console.info('[clawdy]', ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[clawdy]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[clawdy]', ...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[clawdy]', ...args)
  },
}
