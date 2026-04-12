'use client'

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { 
  MeshStandardNodeMaterial, 
  NodeMaterial 
} from 'three/webgpu';
import { 
  vec3, 
  distance, 
  smoothstep, 
  sin, 
  cos, 
  timerLocal, 
  worldPosition, 
  cameraPosition, 
  float, 
  color,
  mul,
  add,
  sub
} from 'three/tsl';

export function CustomFogEffect() {
  const { camera } = useThree();
  const fogCenter = useRef(new THREE.Vector3());

  // Use useMemo to define the TSL material logic
  const material = useMemo(() => {
    const mat = new MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
    });

    // Fog Logic using TSL
    const uRadius = float(30.0);
    const uColor = color('#e0f7fa');
    
    // Calculate distance from world position to camera position
    const dist = distance(worldPosition, cameraPosition);
    
    // Smoothstep for fog density
    const alpha = smoothstep(sub(uRadius, 5.0), add(uRadius, 5.0), dist);

    // Animated noise effect
    const time = timerLocal();
    const noiseX = mul(worldPosition.x, 0.05);
    const noiseZ = mul(worldPosition.z, 0.05);
    const animatedTime = mul(time, 0.5);
    
    const noise = mul(
      mul(sin(add(noiseX, animatedTime)), cos(add(noiseZ, animatedTime))),
      0.05
    );
    
    // Final opacity calculation
    const finalAlpha = mul(sub(1.0, add(alpha, noise)), 0.15);
    
    // Apply nodes to material
    mat.colorNode = uColor;
    mat.opacityNode = finalAlpha;

    return mat;
  }, []);

  useFrame(() => {
    if (camera && camera.position) {
      fogCenter.current.copy(camera.position);
    }
  });

  return (
    <mesh position={fogCenter.current}>
      <sphereGeometry args={[60, 32, 32]} />
      <primitive object={material} />
    </mesh>
  );
}
