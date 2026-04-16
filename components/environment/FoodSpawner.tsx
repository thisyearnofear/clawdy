'use client'

import { useRef, useEffect } from 'react'

interface FoodSpawnerProps {
  spawnRate?: number
  bounds?: [number, number, number]
  spawnHeight?: number
  maxItems?: number
  onSpawn: (item: { id: number; position: [number, number, number] }) => void
}

let nextId = 1

export function FoodSpawner({
  spawnRate = 2,
  bounds = [20, 5, 20],
  spawnHeight = 18,
  maxItems = 30,
  onSpawn,
}: FoodSpawnerProps) {
  const countRef = useRef(0)
  const onSpawnRef = useRef(onSpawn)
  onSpawnRef.current = onSpawn

  useEffect(() => {
    const interval = setInterval(() => {
      if (countRef.current >= maxItems) return
      // Use full bounds for distribution
      const px = (Math.random() - 0.5) * bounds[0]
      const pz = (Math.random() - 0.5) * bounds[2]
      const id = nextId++
      countRef.current++
      onSpawnRef.current({ id, position: [px, spawnHeight, pz] })
    }, 1000 / spawnRate)

    return () => clearInterval(interval)
  }, [spawnRate, bounds, spawnHeight, maxItems])

  return null
}
