import { getLogLevel } from './runtimeConfig'

const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production'
const logLevel = getLogLevel()
const shouldLogInfo = logLevel === 'debug' || logLevel === 'info'
const shouldLogDebug = logLevel === 'debug'

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev && shouldLogInfo) console.info('[clawdy]', ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[clawdy]', ...args)
  },
  error: (...args: unknown[]) => {
    console.error('[clawdy]', ...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev && shouldLogDebug) console.debug('[clawdy]', ...args)
  },
}
