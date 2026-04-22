'use client'

import { useRef, useEffect } from 'react'

export type SpawnTier = 'ground' | 'elevated' | 'mud' | 'peak'
interface SpawnZone {
  tier: SpawnTier
  weight: number
}
interface MemeAssetSpawnerProps {
  spawnRate?: number
  bounds?: [number, number, number]
  spawnHeight?: number
  maxItems?: number
  tiers?: SpawnZone[]
  onSpawn: (item: { id: number; position: [number, number, number]; tier: SpawnTier }) => void
}

let nextId = 1

// Sky island positions (matching SKY_ISLAND_POSITIONS in Experience.tsx)
const SKY_ISLANDS = [
  [20, 30, 20],
  [-20, 35, -15],
  [0, 40, -30],
  [-30, 45, 20],
  [35, 50, -10]
] as const

// Mud zone centers (approximate based on noise pattern)
const MUD_ZONES = [
  [15, 0, 10],
  [-25, 0, 20],
  [30, 0, -15]
] as const

function pickSpawnTier(tiers: SpawnZone[]): SpawnTier {
  const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0)
  let roll = Math.random() * totalWeight
  for (const tier of tiers) {
    roll -= tier.weight
    if (roll <= 0) return tier.tier
  }
  return tiers[0].tier
}

export function MemeAssetSpawner({
  spawnRate = 2,
  bounds = [20, 5, 20],
  spawnHeight = 18,
  maxItems = 30,
  tiers = [
    { tier: 'ground', weight: 0.65 },
    { tier: 'elevated', weight: 0.20 },
    { tier: 'mud', weight: 0.10 },
    { tier: 'peak', weight: 0.05 }
  ],
  onSpawn,
}: MemeAssetSpawnerProps) {
  const countRef = useRef(0)
  const onSpawnRef = useRef(onSpawn)
  onSpawnRef.current = onSpawn

  useEffect(() => {
    const interval = setInterval(() => {
      if (countRef.current >= maxItems) return
      countRef.current++
      const tier = pickSpawnTier(tiers)
      
      let px: number, pz: number, height: number
      switch (tier) {
        case 'elevated': {
          const island = SKY_ISLANDS[Math.floor(Math.random() * SKY_ISLANDS.length)]
          px = island[0] + (Math.random() - 0.5) * 8
          pz = island[2] + (Math.random() - 0.5) * 8
          height = 26 + Math.random() * 10
          break
        }
        case 'mud': {
          const zone = MUD_ZONES[Math.floor(Math.random() * MUD_ZONES.length)]
          px = zone[0] + (Math.random() - 0.5) * 10
          pz = zone[2] + (Math.random() - 0.5) * 10
          height = spawnHeight - 2 + Math.random() * 4
          break
        }
        case 'peak': {
          const angle = Math.random() * Math.PI * 2
          const radius = 15 + Math.random() * 25
          px = Math.cos(angle) * radius
          pz = Math.sin(angle) * radius
          height = 22 + Math.random() * 6
          break
        }
        default: {
          px = (Math.random() - 0.5) * bounds[0]
          pz = (Math.random() - 0.5) * bounds[2]
          height = spawnHeight + Math.random() * 4
        }
      }
      onSpawnRef.current({ id: nextId++, position: [px, height, pz], tier })
    }, 1000 / spawnRate)

    return () => clearInterval(interval)
  }, [spawnRate, bounds, spawnHeight, maxItems, tiers])

  return null
}
