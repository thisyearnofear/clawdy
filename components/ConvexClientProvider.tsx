'use client'

import { ConvexProvider, ConvexReactClient, useQuery } from 'convex/react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { api } from '../convex/_generated/api'
import { getOrCreateGuestKey, shortGuestLabel } from '../services/guestIdentity'
import { isConvexConfigured } from '../services/convexSync'

const ConvexClientContext = createContext<ConvexReactClient | null>(null)

export function useConvexClient(): ConvexReactClient | null {
  return useContext(ConvexClientContext)
}

function LineageStrip() {
  const [guestKey] = useState(() => getOrCreateGuestKey())
  const chain = useQuery(api.lineage.latestChain, { guestKey })
  if (chain === undefined) {
    return <p className="convexLineage" data-state="loading">Convex · syncing…</p>
  }
  if (chain === null) {
    return (
      <p className="convexLineage" data-state="empty">
        Convex · guest {shortGuestLabel(guestKey)} · awaiting first train or match
      </p>
    )
  }
  const bits = [
    `job ${chain.jobStatus}`,
    `${chain.exampleCount} examples`,
    chain.checkpointName ? `→ ${chain.checkpointName}` : null,
    chain.matchScenarioId ? `→ match ${chain.matchScenarioId}` : null,
  ].filter(Boolean)
  return (
    <p className="convexLineage" data-state="linked" title={chain.jobId}>
      Convex · linked · {bits.join(' · ')}
    </p>
  )
}

/** Visible when Convex is configured — shows example → checkpoint → match lineage. */
export function ConvexLineageBadge() {
  if (!isConvexConfigured()) {
    return (
      <p className="convexLineage" data-state="offline">
        Convex · offline (set NEXT_PUBLIC_CONVEX_URL)
      </p>
    )
  }
  return <LineageStrip />
}

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  const client = useMemo(() => (url ? new ConvexReactClient(url) : null), [url])

  if (!client) {
    return <ConvexClientContext.Provider value={null}>{children}</ConvexClientContext.Provider>
  }

  return (
    <ConvexProvider client={client}>
      <ConvexClientContext.Provider value={client}>{children}</ConvexClientContext.Provider>
    </ConvexProvider>
  )
}
