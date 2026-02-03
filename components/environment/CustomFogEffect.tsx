import { extend, useThree, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef } from "react";

// Create a custom fog shader material
const FogMaterial = shaderMaterial(
  {
    uCenter: new THREE.Vector3(0, 0, 0),
    uRadius: 30.0,
    uColor: new THREE.Color(0.878, 0.969, 1.0), // #e0f7fa in decimal
    uTime: 0,
  },
  `
    varying vec3 vWorldPos;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
    }
  `,
  `
    uniform vec3 uCenter;
    uniform float uRadius;
    uniform vec3 uColor;
    uniform float uTime;
    varying vec3 vWorldPos;

    void main() {
      float dist = distance(vWorldPos, uCenter);
      float alpha = smoothstep(uRadius - 5.0, uRadius + 5.0, dist);

      // Add subtle animated fog effect
      float noise = sin(vWorldPos.x * 0.05 + uTime * 0.5) * cos(vWorldPos.z * 0.05 + uTime * 0.5) * 0.05;
      alpha += noise;

      gl_FragColor = vec4(uColor, (1.0 - alpha) * 0.15);
    }
  `
);

extend({ FogMaterial });

export function CustomFogEffect() {
  const { camera } = useThree();
  const fogMaterialRef = useRef<any>(null);
  const fogCenter = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (fogMaterialRef.current) {
      // Update fog center to follow camera
      fogCenter.current.copy(camera.position);
      fogMaterialRef.current.uCenter = fogCenter.current;
      fogMaterialRef.current.uTime = clock.getElapsedTime();
    }
  });

  return (
    <mesh position={fogCenter.current}>
      <sphereGeometry args={[60, 32, 32]} />
      <primitive object={new FogMaterial()} ref={fogMaterialRef} transparent depthWrite={false} />
    </mesh>
  );
}