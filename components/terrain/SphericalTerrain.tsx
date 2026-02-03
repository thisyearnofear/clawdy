import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { TERRAIN_CONFIG } from './terrainUtils';

// Configuration for spherical terrain
const SPHERICAL_CONFIG = {
  PLANET_RADIUS: 80,
  SPHERE_SEGMENTS: 64,
  SPHERE_STACKS: 32,
  CURVATURE_STRENGTH: 1.0,
  GRID_RADIUS: 1, // How many chunks around the player to render
  CHUNK_SIZE: TERRAIN_CONFIG.SIZE, // Size of each chunk
} as const;

// Spherical terrain chunk manager
class SphericalTerrainChunkManager {
  private chunks: Map<string, THREE.BufferGeometry> = new Map();
  private chunkCache: Map<string, Float32Array> = new Map(); // Cache for deformation
  private readonly chunkSize: number;
  private readonly gridRadius: number;

  constructor(chunkSize: number = SPHERICAL_CONFIG.CHUNK_SIZE, gridRadius: number = SPHERICAL_CONFIG.GRID_RADIUS) {
    this.chunkSize = chunkSize;
    this.gridRadius = gridRadius;
  }

  // Get chunk key based on coordinates
  getChunkKey(x: number, z: number): string {
    return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
  }

  // Generate a spherical terrain chunk
  generateChunk(chunkX: number, chunkZ: number): THREE.BufferGeometry {
    const key = this.getChunkKey(chunkX, chunkZ);
    
    // Check if we have a cached chunk
    if (this.chunks.has(key)) {
      return this.chunks.get(key)!;
    }

    // Create a plane geometry for this chunk
    const geometry = new THREE.PlaneGeometry(
      this.chunkSize, 
      this.chunkSize, 
      TERRAIN_CONFIG.SEGMENTS, 
      TERRAIN_CONFIG.SEGMENTS
    );
    
    const vertices = geometry.attributes.position.array as Float32Array;
    const colors: number[] = [];
    
    // Apply spherical transformation to wrap the flat terrain onto a sphere
    for (let i = 0; i < vertices.length; i += 3) {
      const localX = vertices[i] + chunkX;
      const localZ = vertices[i + 2] + chunkZ;
      
      // Convert 2D coordinates to spherical coordinates
      // Normalize to sphere coordinates (-1 to 1)
      const normX = (localX / SPHERICAL_CONFIG.PLANET_RADIUS);
      const normZ = (localZ / SPHERICAL_CONFIG.PLANET_RADIUS);
      
      // Calculate spherical coordinates
      const u = (normX + 1) * Math.PI; // longitude: 0 to 2π
      const v = (normZ + 1) * (Math.PI / 2); // latitude: 0 to π
      
      // Apply spherical mapping to convert flat terrain to sphere
      const radius = SPHERICAL_CONFIG.PLANET_RADIUS;
      const sphereX = radius * Math.cos(u) * Math.sin(v);
      const sphereY = radius * Math.cos(v);
      const sphereZ = radius * Math.sin(u) * Math.sin(v);
      
      // Apply noise for terrain features
      const height = this.getTerrainHeight(localX, localZ);
      
      // Calculate the direction from center of sphere to this point
      const direction = new THREE.Vector3(sphereX, sphereY, sphereZ).normalize();
      
      // Apply height as displacement along the normal (radial direction)
      const adjustedX = sphereX + direction.x * height;
      const adjustedY = sphereY + direction.y * height;
      const adjustedZ = sphereZ + direction.z * height;
      
      vertices[i] = adjustedX;
      vertices[i + 1] = adjustedY;
      vertices[i + 2] = adjustedZ;
      
      // Assign colors based on height
      if (height < -2) colors.push(0.1, 0.3, 0.8) // Water
      else if (height < -0.5) colors.push(0.9, 0.8, 0.6) // Sand
      else if (height < 2) colors.push(0.2, 0.6, 0.2) // Grass
      else if (height < 5) colors.push(0.5, 0.5, 0.5) // Rock
      else colors.push(1, 1, 1) // Snow
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    // Store the original positions for deformation restoration
    const originalPositions = new Float32Array(vertices);
    this.chunkCache.set(key, originalPositions);
    
    this.chunks.set(key, geometry);
    return geometry;
  }

  // Get terrain height at a specific point using the same algorithm as flat terrain
  private getTerrainHeight(x: number, z: number): number {
    const noise2D = (require('simplex-noise') as any).createNoise2D();
    let noise = 0;
    
    for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
      noise += noise2D(x * layer.frequency, z * layer.frequency) * layer.amplitude;
    }
    
    // Apply a center flattening effect for gameplay
    const dist = Math.sqrt(x * x + z * z);
    const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20));
    return noise * (1 - flatFactor);
  }

  // Get all visible chunks around a center point
  getVisibleChunks(centerX: number, centerZ: number): Array<{key: string, geometry: THREE.BufferGeometry}> {
    const chunks = [];
    
    for (let x = -this.gridRadius; x <= this.gridRadius; x++) {
      for (let z = -this.gridRadius; z <= this.gridRadius; z++) {
        const chunkX = Math.round(centerX / this.chunkSize) * this.chunkSize + x * this.chunkSize;
        const chunkZ = Math.round(centerZ / this.chunkSize) * this.chunkSize + z * this.chunkSize;
        
        const key = this.getChunkKey(chunkX, chunkZ);
        const geometry = this.generateChunk(chunkX, chunkZ);
        
        chunks.push({ key, geometry });
      }
    }
    
    return chunks;
  }

  // Clear all chunks (for cleanup)
  clear(): void {
    this.chunks.clear();
    this.chunkCache.clear();
  }
}

export function SphericalTerrain({ 
  position = [0, 0, 0],
  playerPosition = new THREE.Vector3(0, 0, 0)
}: { 
  position?: [number, number, number]; 
  playerPosition?: THREE.Vector3;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const chunkManagerRef = useRef<SphericalTerrainChunkManager>(null);
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const tempVector = useRef(new THREE.Vector3());

  // Initialize chunk manager
  useEffect(() => {
    chunkManagerRef.current = new SphericalTerrainChunkManager();
  }, []);

  // Generate initial chunks based on player position
  useEffect(() => {
    if (!chunkManagerRef.current) return;

    const chunks = chunkManagerRef.current.getVisibleChunks(
      playerPosition.x, 
      playerPosition.z
    );

    // Update meshes based on visible chunks
    const currentKeys = new Set(chunks.map(c => c.key));
    const existingKeys = Array.from(meshRefs.current.keys());

    // Remove meshes for chunks no longer visible
    existingKeys.forEach(key => {
      if (!currentKeys.has(key)) {
        const mesh = meshRefs.current.get(key);
        if (mesh && groupRef.current) {
          groupRef.current.remove(mesh);
          mesh.geometry.dispose();
          meshRefs.current.delete(key);
        }
      }
    });

    // Add/update meshes for visible chunks
    chunks.forEach(({ key, geometry }) => {
      if (!meshRefs.current.has(key)) {
        // Create new mesh for this chunk
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          roughness: 0.8,
          metalness: 0.1,
          wireframe: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // Position the chunk appropriately
        const chunkX = parseInt(key.split(',')[0]) * SPHERICAL_CONFIG.CHUNK_SIZE;
        const chunkZ = parseInt(key.split(',')[1]) * SPHERICAL_CONFIG.CHUNK_SIZE;
        mesh.position.set(chunkX, 0, chunkZ);
        mesh.receiveShadow = true;

        if (groupRef.current) {
          groupRef.current.add(mesh);
          meshRefs.current.set(key, mesh);
        }
      } else {
        // Update existing mesh geometry if needed
        const mesh = meshRefs.current.get(key)!;
        mesh.geometry.dispose();
        mesh.geometry = geometry;
      }
    });
  }, [playerPosition]);

  // Update terrain based on player movement
  useFrame(() => {
    if (!chunkManagerRef.current) return;

    // Get current visible chunks
    const chunks = chunkManagerRef.current.getVisibleChunks(
      playerPosition.x, 
      playerPosition.z
    );

    // Update meshes
    chunks.forEach(({ key, geometry }) => {
      if (meshRefs.current.has(key)) {
        const mesh = meshRefs.current.get(key)!;
        mesh.geometry.dispose();
        mesh.geometry = geometry;
      }
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {/* The actual meshes are managed dynamically */}
    </group>
  );
}

// Simplified version for initial implementation
export function SimpleSphericalTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create a basic spherical terrain
  const { geometry, colors } = useMemo(() => {
    // Create a sphere with noise-based terrain features
    const sphereGeometry = new THREE.SphereGeometry(
      SPHERICAL_CONFIG.PLANET_RADIUS,
      SPHERICAL_CONFIG.SPHERE_SEGMENTS,
      SPHERICAL_CONFIG.SPHERE_STACKS
    );
    
    const vertices = sphereGeometry.attributes.position.array as Float32Array;
    const colorArray: number[] = [];
    
    // Apply noise to create terrain variations
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      
      // Calculate spherical coordinates for noise sampling
      const lat = Math.asin(y / SPHERICAL_CONFIG.PLANET_RADIUS); // Latitude
      const lon = Math.atan2(z, x); // Longitude
      
      // Convert to 2D coordinates for noise function
      const noiseX = lon * SPHERICAL_CONFIG.PLANET_RADIUS / Math.PI;
      const noiseY = lat * SPHERICAL_CONFIG.PLANET_RADIUS / (Math.PI / 2);
      
      // Apply the same terrain noise algorithm as flat terrain
      const noise2D = (require('simplex-noise') as any).createNoise2D();
      let noise = 0;
      
      for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
        noise += noise2D(noiseX * layer.frequency, noiseY * layer.frequency) * layer.amplitude;
      }
      
      // Apply center flattening
      const dist = Math.sqrt(noiseX * noiseX + noiseY * noiseY);
      const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20));
      const height = noise * (1 - flatFactor);
      
      // Adjust the vertex position radially based on height
      const direction = new THREE.Vector3(x, y, z).normalize();
      const adjustedRadius = SPHERICAL_CONFIG.PLANET_RADIUS + height;
      
      vertices[i] = direction.x * adjustedRadius;
      vertices[i + 1] = direction.y * adjustedRadius;
      vertices[i + 2] = direction.z * adjustedRadius;
      
      // Assign colors based on height
      if (height < -2) colorArray.push(0.1, 0.3, 0.8) // Water
      else if (height < -0.5) colorArray.push(0.9, 0.8, 0.6) // Sand
      else if (height < 2) colorArray.push(0.2, 0.6, 0.2) // Grass
      else if (height < 5) colorArray.push(0.5, 0.5, 0.5) // Rock
      else colorArray.push(1, 1, 1) // Snow
    }
    
    sphereGeometry.attributes.position.needsUpdate = true;
    sphereGeometry.computeVertexNormals();
    
    return { geometry: sphereGeometry, colors: new Float32Array(colorArray) };
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry.setAttribute(
        'color', 
        new THREE.BufferAttribute(colors, 3)
      );
    }
  }, [colors]);

  return (
    <group>
      <RigidBody type="fixed" colliders="trimesh" position={[0, 0, 0]}>
        <mesh 
          ref={meshRef} 
          geometry={geometry} 
          receiveShadow
        >
          <meshStandardMaterial 
            vertexColors 
            flatShading 
            roughness={0.8} 
            metalness={0.1} 
            wireframe={false}
          />
        </mesh>
      </RigidBody>
    </group>
  );
}

// Function to get height at a specific point on spherical terrain
export const getSphericalTerrainHeight = (x: number, z: number): number => {
  // Convert 2D coordinates to spherical coordinates
  const radius = SPHERICAL_CONFIG.PLANET_RADIUS;
  const lat = Math.atan2(z, radius); // Latitude approximation
  const lon = Math.atan2(x, radius); // Longitude approximation
  
  // Convert to 2D coordinates for noise function
  const noiseX = lon * radius / Math.PI;
  const noiseY = lat * radius / (Math.PI / 2);
  
  // Apply the same terrain noise algorithm as flat terrain
  const noise2D = (require('simplex-noise') as any).createNoise2D();
  let noise = 0;
  
  for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
    noise += noise2D(noiseX * layer.frequency, noiseY * layer.frequency) * layer.amplitude;
  }
  
  // Apply center flattening
  const dist = Math.sqrt(noiseX * noiseX + noiseY * noiseY);
  const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20));
  return noise * (1 - flatFactor);
};

// Enhanced spherical terrain with camera/vehicle integration
export function IntegratedSphericalTerrain({ 
  playerPosition = new THREE.Vector3(0, 0, 0),
  onTerrainReady 
}: { 
  playerPosition?: THREE.Vector3;
  onTerrainReady?: (getHeightFn: (x: number, z: number) => number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const lastUpdateRef = useRef(0);
  const updateInterval = 0.1; // Update every 100ms

  // Create spherical terrain geometry
  const { geometry, colors } = useMemo(() => {
    // Create a sphere with noise-based terrain features
    const sphereGeometry = new THREE.SphereGeometry(
      SPHERICAL_CONFIG.PLANET_RADIUS,
      SPHERICAL_CONFIG.SPHERE_SEGMENTS,
      SPHERICAL_CONFIG.SPHERE_STACKS
    );
    
    const vertices = sphereGeometry.attributes.position.array as Float32Array;
    const colorArray: number[] = [];
    
    // Apply noise to create terrain variations
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      
      // Calculate spherical coordinates for noise sampling
      const lat = Math.asin(y / SPHERICAL_CONFIG.PLANET_RADIUS); // Latitude
      const lon = Math.atan2(z, x); // Longitude
      
      // Convert to 2D coordinates for noise function
      const noiseX = lon * SPHERICAL_CONFIG.PLANET_RADIUS / Math.PI;
      const noiseY = lat * SPHERICAL_CONFIG.PLANET_RADIUS / (Math.PI / 2);
      
      // Apply the same terrain noise algorithm as flat terrain
      const noise2D = (require('simplex-noise') as any).createNoise2D();
      let noise = 0;
      
      for (const layer of TERRAIN_CONFIG.NOISE_LAYERS) {
        noise += noise2D(noiseX * layer.frequency, noiseY * layer.frequency) * layer.amplitude;
      }
      
      // Apply center flattening
      const dist = Math.sqrt(noiseX * noiseX + noiseY * noiseY);
      const flatFactor = Math.max(0, 1 - Math.min(1, dist / 20));
      const height = noise * (1 - flatFactor);
      
      // Adjust the vertex position radially based on height
      const direction = new THREE.Vector3(x, y, z).normalize();
      const adjustedRadius = SPHERICAL_CONFIG.PLANET_RADIUS + height;
      
      vertices[i] = direction.x * adjustedRadius;
      vertices[i + 1] = direction.y * adjustedRadius;
      vertices[i + 2] = direction.z * adjustedRadius;
      
      // Assign colors based on height
      if (height < -2) colorArray.push(0.1, 0.3, 0.8) // Water
      else if (height < -0.5) colorArray.push(0.9, 0.8, 0.6) // Sand
      else if (height < 2) colorArray.push(0.2, 0.6, 0.2) // Grass
      else if (height < 5) colorArray.push(0.5, 0.5, 0.5) // Rock
      else colorArray.push(1, 1, 1) // Snow
    }
    
    sphereGeometry.attributes.position.needsUpdate = true;
    sphereGeometry.computeVertexNormals();
    
    return { geometry: sphereGeometry, colors: new Float32Array(colorArray) };
  }, []);

  // Setup terrain sampler callback
  useEffect(() => {
    if (onTerrainReady) {
      onTerrainReady(getSphericalTerrainHeight);
    }
  }, [onTerrainReady]);

  // Update mesh colors when needed
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry.setAttribute(
        'color', 
        new THREE.BufferAttribute(colors, 3)
      );
    }
  }, [colors]);

  // Handle camera following and terrain updates
  useFrame((state) => {
    const currentTime = state.clock.getElapsedTime();
    if (currentTime - lastUpdateRef.current < updateInterval) return;
    
    lastUpdateRef.current = currentTime;
    
    // In a spherical world, we may want to rotate the terrain based on player position
    // to keep the player at a "local up" position relative to the sphere
    if (groupRef.current) {
      // Calculate rotation based on player position to simulate walking on sphere
      const playerSphereCoords = cartesianToSpherical(playerPosition);
      const rotationY = -playerSphereCoords.longitude;
      const rotationX = -playerSphereCoords.latitude;
      
      groupRef.current.rotation.y = rotationY;
      groupRef.current.rotation.x = rotationX;
    }
  });

  // Helper function to convert Cartesian to spherical coordinates
  const cartesianToSpherical = (cartesian: THREE.Vector3) => {
    const radius = cartesian.length();
    const latitude = Math.asin(cartesian.y / radius);
    const longitude = Math.atan2(cartesian.z, cartesian.x);
    
    return { radius, latitude, longitude };
  };

  return (
    <group ref={groupRef}>
      <RigidBody type="fixed" colliders="trimesh" position={[0, 0, 0]}>
        <mesh 
          ref={meshRef} 
          geometry={geometry} 
          receiveShadow
        >
          <meshStandardMaterial 
            vertexColors 
            flatShading 
            roughness={0.8} 
            metalness={0.1} 
            wireframe={false}
          />
        </mesh>
      </RigidBody>
    </group>
  );
}

// Function to get surface normal at a point on the sphere
export const getSphericalNormalAt = (x: number, z: number): THREE.Vector3 => {
  // For a sphere centered at origin, the normal at any point is the normalized position vector
  const lat = Math.atan2(z, SPHERICAL_CONFIG.PLANET_RADIUS);
  const lon = Math.atan2(x, SPHERICAL_CONFIG.PLANET_RADIUS);

  // Convert back to 3D position on unit sphere
  const normal = new THREE.Vector3(
    Math.cos(lon) * Math.cos(lat),
    Math.sin(lat),
    Math.sin(lon) * Math.cos(lat)
  );

  return normal.normalize();
};