'use client'

import { Clouds, Cloud } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'

export interface CloudConfig {
  seed: number
  segments: number
  volume: number
  growth: number
  opacity: number
  speed: number
  color: string
  secondaryColor?: string
  bounds: [number, number, number]
  preset?: 'custom' | 'stormy' | 'sunset' | 'candy' | 'cosmic'
  count?: number // Number of individual cloud clusters
  clusterBounds?: [number, number, number] // Size of individual cloud clusters
}

export const CLOUD_PRESETS = {
  stormy: {
    seed: 10,
    segments: 80,
    volume: 18,
    growth: 6,
    opacity: 1,
    speed: 0.8,
    color: '#6a7588', // Lighter gray
    secondaryColor: '#2d3436', // Darker gray
    bounds: [100, 10, 100] as [number, number, number],
    count: 22,
    clusterBounds: [12, 3, 12],
  },
  sunset: {
    seed: 20,
    segments: 60,
    volume: 12,
    growth: 8,
    opacity: 0.7,
    speed: 0.2,
    color: '#ff9f43', // Orange
    secondaryColor: '#ff6b6b', // Pinkish red
    bounds: [120, 8, 120] as [number, number, number],
    count: 20,
    clusterBounds: [12, 3, 12],
  },
  candy: {
    seed: 30,
    segments: 50,
    volume: 10,
    growth: 5,
    opacity: 0.9,
    speed: 0.3,
    color: '#ff9ff3', // Pink
    secondaryColor: '#74b9ff', // Blue
    bounds: [100, 5, 100] as [number, number, number],
    count: 25,
    clusterBounds: [10, 3, 10],
  },
  cosmic: {
    seed: 40,
    segments: 30,
    volume: 6,
    growth: 3,
    opacity: 0.4,
    speed: 0.05,
    color: '#1a1a3e',
    secondaryColor: '#4a0080',
    bounds: [150, 15, 150] as [number, number, number],
    count: 15,
    clusterBounds: [15, 5, 15],
  }
}

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function CloudManager({ config }: { config: CloudConfig }) {
  const activeConfig = useMemo(() => {
    if (config.preset && config.preset !== 'custom' && config.preset in CLOUD_PRESETS) {
      return { ...config, ...CLOUD_PRESETS[config.preset as keyof typeof CLOUD_PRESETS] }
    }
    return config
  }, [config])

  const cloudMaterial = useMemo(() => {
    return THREE.MeshStandardMaterial
  }, [])

  const clouds = useMemo(() => {
    const random = seededRandom(activeConfig.seed)
    const count = activeConfig.count || 12
    const items: { position: [number, number, number]; color: string; speed: number }[] = []
    
    // Increased distribution range
    const rangeX = activeConfig.bounds[0] * 2
    const rangeZ = activeConfig.bounds[2] * 2
    
    // Support configurable cluster bounds (default: [12, 3, 12] for more dispersed clouds)
    const clusterBounds = activeConfig.clusterBounds || [12, 3, 12]
    const verticalRange = clusterBounds[1] // Use the Y component for vertical spread
    
    // Always keep one center cloud
    items.push({ position: [0, 25, 0], color: activeConfig.color, speed: activeConfig.speed })

    for (let i = 1; i < count; i++) {
      const isSecondary = activeConfig.secondaryColor && random() > 0.5
      // Spread clouds across wider vertical range (y=15-40)
      const baseHeight = 25 + (random() - 0.5) * verticalRange * 2
      const clampedHeight = Math.max(15, Math.min(40, baseHeight))
      items.push({
        position: [
          (random() - 0.5) * rangeX,
          clampedHeight,
          (random() - 0.5) * rangeZ
        ],
        color: isSecondary ? activeConfig.secondaryColor! : activeConfig.color,
        speed: activeConfig.speed * (0.8 + random() * 0.4)
      })
    }
    return items
  }, [activeConfig.bounds, activeConfig.color, activeConfig.count, activeConfig.secondaryColor, activeConfig.seed, activeConfig.speed, activeConfig.clusterBounds])

  return (
    <Clouds material={cloudMaterial}>
      {clouds.map((item, index) => (
        <Cloud
          key={index}
          seed={activeConfig.seed + index}
          segments={activeConfig.segments}
          bounds={(activeConfig.clusterBounds || [12, 3, 12]) as [number, number, number]}
          volume={activeConfig.volume}
          growth={activeConfig.growth}
          opacity={activeConfig.opacity}
          speed={item.speed}
          color={item.color}
          fade={100}
          position={item.position}
        />
      ))}
    </Clouds>
  )
}
