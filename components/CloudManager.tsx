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
  preset?: 'custom' | 'stormy' | 'sunset' | 'candy'
  count?: number // Number of individual cloud clusters
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
    bounds: [25, 4, 25] as [number, number, number],
    count: 8
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
    bounds: [30, 3, 20] as [number, number, number],
    count: 6
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
    bounds: [20, 2, 20] as [number, number, number],
    count: 10
  }
}

export function CloudManager({ config }: { config: CloudConfig }) {
  const activeConfig = useMemo(() => {
    if (config.preset && config.preset !== 'custom') {
      return { ...config, ...CLOUD_PRESETS[config.preset] }
    }
    return config
  }, [config])

  const clouds = useMemo(() => {
    const count = activeConfig.count || 5
    const items: { position: [number, number, number]; color: string }[] = []
    const rangeX = activeConfig.bounds[0] * 1.5
    const rangeZ = activeConfig.bounds[2] * 1.5
    
    // Always keep one center cloud
    items.push({ position: [0, 15, 0], color: activeConfig.color })

    for (let i = 1; i < count; i++) {
      const isSecondary = activeConfig.secondaryColor && Math.random() > 0.5
      items.push({
        position: [
          (Math.random() - 0.5) * rangeX,
          15 + (Math.random() - 0.5) * 4, // Vary height slightly
          (Math.random() - 0.5) * rangeZ
        ],
        color: isSecondary ? activeConfig.secondaryColor! : activeConfig.color
      })
    }
    return items
  }, [activeConfig.count, activeConfig.bounds, activeConfig.color, activeConfig.secondaryColor])

  return (
    <Clouds material={THREE.MeshStandardMaterial}>
      {clouds.map((item, index) => (
         <Cloud
          key={index}
          seed={activeConfig.seed + index}
          segments={activeConfig.segments}
          bounds={activeConfig.bounds}
          volume={activeConfig.volume}
          growth={activeConfig.growth}
          opacity={activeConfig.opacity}
          speed={activeConfig.speed * (0.8 + Math.random() * 0.4)} // Vary speed per cloud
          color={item.color}
          fade={100}
          position={item.position}
        />
      ))}
    </Clouds>
  )
}
