export type AnalyticsEventName =
  | 'spectator_cta_viewed'
  | 'connect_wallet_clicked'
  | 'wallet_connected'
  | 'queue_joined'
  | 'queue_activated'
  | 'queue_left'
  | 'weather_auction_effect_applied'
  | 'player_influence_window_started'

export interface AnalyticsPayload {
  playerId?: string
  walletAddress?: string
  preset?: string
  domain?: string
  intensity?: number
  source?: string
  position?: number
  estimatedWait?: number
  vehicleId?: string
  vehicleType?: string
  reason?: string
  [key: string]: string | number | boolean | null | undefined
}

export interface AnalyticsEvent {
  event: AnalyticsEventName
  timestamp: number
  sessionId: string
  payload?: AnalyticsPayload
}

const SESSION_STORAGE_KEY = 'clawdy-analytics-session-id'
const SESSION_FALLBACK_PREFIX = 'session'

function createSessionId() {
  const random = Math.random().toString(36).slice(2, 10)
  return `${SESSION_FALLBACK_PREFIX}-${Date.now()}-${random}`
}

function getSessionId() {
  if (typeof window === 'undefined') {
    return `${SESSION_FALLBACK_PREFIX}-server`
  }

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing

  const next = createSessionId()
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next)
  return next
}

function getAnalyticsMode() {
  return process.env.NEXT_PUBLIC_ANALYTICS_MODE ?? 'console'
}

function pushToDataLayer(evt: AnalyticsEvent) {
  if (typeof window === 'undefined') return
  const w = window as Window & { dataLayer?: Array<Record<string, unknown>> }
  if (!w.dataLayer) {
    w.dataLayer = []
  }
  w.dataLayer.push({
    event: evt.event,
    timestamp: evt.timestamp,
    sessionId: evt.sessionId,
    ...evt.payload,
  })
}

function emitToConsole(evt: AnalyticsEvent) {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[analytics]', evt.event, evt)
  }
}

export function trackEvent(event: AnalyticsEventName, payload?: AnalyticsPayload) {
  const evt: AnalyticsEvent = {
    event,
    payload,
    timestamp: Date.now(),
    sessionId: getSessionId(),
  }

  const mode = getAnalyticsMode()
  if (mode === 'off') return
  if (mode === 'datalayer') {
    pushToDataLayer(evt)
    return
  }

  if (mode === 'both') {
    pushToDataLayer(evt)
    emitToConsole(evt)
    return
  }

  emitToConsole(evt)
}
