'use client'

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef } from "react";

export function CustomFogEffect() {
  const { camera } = useThree();
  const fogCenter = useRef(new THREE.Vector3());

  // Use a simple fog with THREE.js FogExp2
  useFrame(() => {
    // Update fog center based on camera for dynamic fog
    if (camera) {
      fogCenter.current.copy(camera.position)
      fogCenter.current.y = 0
    }
  })

  return <fogExp2 attach="fog" args={['#1a1a2e', 0.02]} />
}
