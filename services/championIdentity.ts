export type ChampionLookId = 'canopy' | 'ember' | 'tide' | 'dusk'

export type ChampionLook = {
  id: ChampionLookId
  label: string
  /** Accent used for rover tint, base ring, and UI mark. */
  accent: string
  mark: string
}

export const CHAMPION_LOOKS: readonly ChampionLook[] = Object.freeze([
  { id: 'canopy', label: 'Canopy', accent: '#bce478', mark: 'C' },
  { id: 'ember', label: 'Ember', accent: '#ef9f6a', mark: 'E' },
  { id: 'tide', label: 'Tide', accent: '#6bc8c4', mark: 'T' },
  { id: 'dusk', label: 'Dusk', accent: '#c4a0e8', mark: 'D' },
])

export type ChampionIdentity = {
  name: string
  lookId: ChampionLookId
}

const STORAGE_KEY = 'clawdy_champion_v1'
const DEFAULT_IDENTITY: ChampionIdentity = { name: 'Champion', lookId: 'canopy' }

function isLookId(value: unknown): value is ChampionLookId {
  return typeof value === 'string' && CHAMPION_LOOKS.some(look => look.id === value)
}

export function getChampionLook(lookId: ChampionLookId): ChampionLook {
  return CHAMPION_LOOKS.find(look => look.id === lookId) ?? CHAMPION_LOOKS[0]
}

export function normalizeChampionName(raw: string): string {
  const trimmed = raw.trim().slice(0, 24)
  return trimmed.length > 0 ? trimmed : DEFAULT_IDENTITY.name
}

type IdentityStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): IdentityStore | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadChampionIdentity(store: IdentityStore | null = defaultStore()): ChampionIdentity {
  if (!store) return DEFAULT_IDENTITY
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_IDENTITY
    const parsed = JSON.parse(raw) as Partial<ChampionIdentity>
    return {
      name: typeof parsed.name === 'string' ? normalizeChampionName(parsed.name) : DEFAULT_IDENTITY.name,
      lookId: isLookId(parsed.lookId) ? parsed.lookId : DEFAULT_IDENTITY.lookId,
    }
  } catch {
    return DEFAULT_IDENTITY
  }
}

export function saveChampionIdentity(
  identity: ChampionIdentity,
  store: IdentityStore | null = defaultStore(),
): void {
  if (!store) return
  try {
    const next: ChampionIdentity = {
      name: normalizeChampionName(identity.name),
      lookId: isLookId(identity.lookId) ? identity.lookId : DEFAULT_IDENTITY.lookId,
    }
    store.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}
