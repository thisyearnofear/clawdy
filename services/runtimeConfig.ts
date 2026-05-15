export type RuntimeMode = 'local-play' | 'demo' | 'production'
export type AnalyticsMode = 'off' | 'console' | 'datalayer' | 'both'
export type LogLevel = 'warn' | 'info' | 'debug'

export interface RuntimeProfile {
  mode: RuntimeMode
  enableAIAgents: boolean
  enable0GPersistence: boolean
  analyticsMode: AnalyticsMode
  logLevel: LogLevel
  loadingSplashMs: number
  cloudCountLimit: number
  enableSpectacleOnBoot: boolean
  aiTickIntervalMs: number
}

function readPublicString(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readOptionalBoolean(name: string): boolean | undefined {
  const value = readPublicString(name)
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

function readOptionalNumber(name: string): number | undefined {
  const value = readPublicString(name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function resolveMode(): RuntimeMode {
  const explicit = readPublicString('NEXT_PUBLIC_CLAWDY_RUNTIME_MODE')
  if (explicit === 'local-play' || explicit === 'demo' || explicit === 'production') return explicit
  if (process.env.NODE_ENV === 'production') return 'production'
  if (process.env.NODE_ENV === 'test') return 'local-play'
  return 'local-play'
}

function baseProfile(mode: RuntimeMode): RuntimeProfile {
  switch (mode) {
    case 'demo':
      return {
        mode,
        enableAIAgents: true,
        enable0GPersistence: false,
        analyticsMode: 'console',
        logLevel: 'info',
        loadingSplashMs: 1200,
        cloudCountLimit: 10,
        enableSpectacleOnBoot: true,
        aiTickIntervalMs: 500,
      }
    case 'production':
      return {
        mode,
        enableAIAgents: true,
        enable0GPersistence: true,
        analyticsMode: 'off',
        logLevel: 'warn',
        loadingSplashMs: 1000,
        cloudCountLimit: 12,
        enableSpectacleOnBoot: true,
        aiTickIntervalMs: 750,
      }
    case 'local-play':
    default:
      return {
        mode: 'local-play',
        enableAIAgents: false,
        enable0GPersistence: false,
        analyticsMode: 'off',
        logLevel: 'info',
        loadingSplashMs: 300,
        cloudCountLimit: 8,
        enableSpectacleOnBoot: true,
        aiTickIntervalMs: 1000,
      }
  }
}

let cachedProfile: RuntimeProfile | null = null

export function getRuntimeProfile(): RuntimeProfile {
  if (cachedProfile) return cachedProfile

  const profile = baseProfile(resolveMode())
  const enableAIAgents = readOptionalBoolean('NEXT_PUBLIC_CLAWDY_ENABLE_AI_AGENTS')
  const enable0GPersistence = readOptionalBoolean('NEXT_PUBLIC_CLAWDY_ENABLE_0G_PERSISTENCE')
  const analyticsMode = readPublicString('NEXT_PUBLIC_ANALYTICS_MODE')
  const logLevel = readPublicString('NEXT_PUBLIC_CLAWDY_LOG_LEVEL')
  const loadingSplashMs = readOptionalNumber('NEXT_PUBLIC_CLAWDY_SPLASH_MS')
  const cloudCountLimit = readOptionalNumber('NEXT_PUBLIC_CLAWDY_CLOUD_COUNT_LIMIT')
  const enableSpectacleOnBoot = readOptionalBoolean('NEXT_PUBLIC_CLAWDY_ENABLE_SPECTACLE_ON_BOOT')
  const aiTickIntervalMs = readOptionalNumber('NEXT_PUBLIC_CLAWDY_AI_TICK_INTERVAL_MS')

  cachedProfile = {
    ...profile,
    enableAIAgents: enableAIAgents ?? profile.enableAIAgents,
    enable0GPersistence: enable0GPersistence ?? profile.enable0GPersistence,
    analyticsMode: (analyticsMode === 'off' || analyticsMode === 'console' || analyticsMode === 'datalayer' || analyticsMode === 'both')
      ? analyticsMode
      : profile.analyticsMode,
    logLevel: (logLevel === 'warn' || logLevel === 'info' || logLevel === 'debug') ? logLevel : profile.logLevel,
    loadingSplashMs: loadingSplashMs ?? profile.loadingSplashMs,
    cloudCountLimit: cloudCountLimit ?? profile.cloudCountLimit,
    enableSpectacleOnBoot: enableSpectacleOnBoot ?? profile.enableSpectacleOnBoot,
    aiTickIntervalMs: aiTickIntervalMs ?? profile.aiTickIntervalMs,
  }

  return cachedProfile
}

export function isLocalPlayMode(): boolean {
  return getRuntimeProfile().mode === 'local-play'
}

export function isAIAgentsEnabled(): boolean {
  return getRuntimeProfile().enableAIAgents
}

export function is0GPersistenceEnabled(): boolean {
  return getRuntimeProfile().enable0GPersistence
}

export function getLoadingSplashDurationMs(): number {
  return getRuntimeProfile().loadingSplashMs
}

export function getAnalyticsMode(): AnalyticsMode {
  return getRuntimeProfile().analyticsMode
}

export function getLogLevel(): LogLevel {
  return getRuntimeProfile().logLevel
}

export function getCloudCountLimit(): number {
  return getRuntimeProfile().cloudCountLimit
}

export function shouldEnableSpectacleOnBoot(): boolean {
  return getRuntimeProfile().enableSpectacleOnBoot
}

export function getAiTickIntervalMs(): number {
  return getRuntimeProfile().aiTickIntervalMs
}
