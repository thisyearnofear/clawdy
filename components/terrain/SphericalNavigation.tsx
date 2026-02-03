import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Configuration for spherical navigation
const SPHERICAL_NAVIGATION_CONFIG = {
  SPHERE_RADIUS: 80,
  GRAVITY_NORMAL_FORCE: 9.81,
  ROTATION_SPEED: 0.02,
  MAX_SPEED: 0.5,
} as const;

/**
 * Spherical navigation controller that handles vehicle movement on a spherical surface
 * This component manages the physics and navigation for vehicles on a spherical world
 */
export function SphericalNavigationController({
  vehicleRef,
  terrainRadius = SPHERICAL_NAVIGATION_CONFIG.SPHERE_RADIUS,
  onSurfacePositionUpdate
}: {
  vehicleRef: React.RefObject<THREE.Object3D>;
  terrainRadius?: number;
  onSurfacePositionUpdate?: (position: THREE.Vector3, normal: THREE.Vector3) => void;
}) {
  const velocityRef = useRef(new THREE.Vector3());
  const lastPositionRef = useRef(new THREE.Vector3());
  const surfaceNormalRef = useRef(new THREE.Vector3());

  // Update vehicle to stay on spherical surface
  useFrame(() => {
    if (!vehicleRef.current) return;

    const vehicle = vehicleRef.current;
    
    // Calculate the vehicle's distance from the center of the sphere
    const currentPos = vehicle.position;
    const distanceFromCenter = currentPos.length();
    
    // Calculate the surface normal (points outward from sphere center)
    surfaceNormalRef.current.copy(currentPos).normalize();
    
    // Project the vehicle position onto the sphere surface
    const surfacePosition = surfaceNormalRef.current.clone().multiplyScalar(terrainRadius);
    
    // Apply gravity toward the center of the sphere
    const gravityForce = surfaceNormalRef.current.clone().multiplyScalar(-SPHERICAL_NAVIGATION_CONFIG.GRAVITY_NORMAL_FORCE * 0.1);
    
    // Update velocity based on forces
    velocityRef.current.add(gravityForce);
    
    // Limit maximum speed
    if (velocityRef.current.length() > SPHERICAL_NAVIGATION_CONFIG.MAX_SPEED) {
      velocityRef.current.normalize().multiplyScalar(SPHERICAL_NAVIGATION_CONFIG.MAX_SPEED);
    }
    
    // Update position
    vehicle.position.copy(surfacePosition);
    
    // Orient the vehicle to align with the surface normal
    // Point the vehicle's up direction to match the surface normal
    const targetUp = surfaceNormalRef.current.clone();
    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.quaternion);
    
    // Create a new orientation that keeps the vehicle aligned with the surface
    const newQuaternion = new THREE.Quaternion();
    newQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetUp);
    
    // Apply the new orientation while preserving forward direction
    const rotatedForward = currentForward.clone().applyQuaternion(newQuaternion);
    vehicle.quaternion.copy(newQuaternion);
    
    // Notify parent of position update
    if (onSurfacePositionUpdate) {
      onSurfacePositionUpdate(vehicle.position, targetUp);
    }
    
    // Store last position for velocity calculations
    lastPositionRef.current.copy(vehicle.position);
  });

  // Method to apply movement force to the vehicle
  const applyMovement = (direction: THREE.Vector3) => {
    if (!vehicleRef.current) return;
    
    // Convert movement direction to be relative to the surface
    const surfaceNormal = surfaceNormalRef.current.clone();
    const tangentPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      surfaceNormal, 
      vehicleRef.current.position
    );
    
    // Project the movement direction onto the tangent plane
    const projectedDirection = direction.clone();
    tangentPlane.projectPoint(projectedDirection, projectedDirection);
    projectedDirection.normalize();
    
    // Apply the projected direction as a force
    velocityRef.current.add(projectedDirection.multiplyScalar(0.01));
  };

  // Method to get the current surface normal at the vehicle's position
  const getCurrentSurfaceNormal = (): THREE.Vector3 => {
    return surfaceNormalRef.current.clone();
  };

  // Method to get the closest point on the sphere surface
  const getSurfacePosition = (): THREE.Vector3 => {
    if (!vehicleRef.current) return new THREE.Vector3();
    
    const pos = vehicleRef.current.position.clone();
    return pos.normalize().multiplyScalar(terrainRadius);
  };

  return {
    applyMovement,
    getCurrentSurfaceNormal,
    getSurfacePosition
  };
}

/**
 * Hook for spherical navigation that can be used with any vehicle
 */
export function useSphericalNavigation(vehicleRef: React.RefObject<THREE.Object3D>) {
  const navigationController = useRef<any>(null);
  const controllerMethods = useRef({
    applyMovement: (direction: THREE.Vector3) => {},
    getCurrentSurfaceNormal: () => new THREE.Vector3(),
    getSurfacePosition: () => new THREE.Vector3()
  });

  useEffect(() => {
    if (!vehicleRef.current) return;

    // Create the navigation controller
    navigationController.current = new SphericalNavigationController({
      vehicleRef
    });

    // Copy methods to ref for access
    if ('applyMovement' in navigationController.current) {
      controllerMethods.current = navigationController.current;
    }
  }, [vehicleRef]);

  return controllerMethods.current;
}

/**
 * Spherical terrain collision handler
 * This system detects when objects interact with the spherical terrain
 */
export class SphericalTerrainCollision {
  private sphereCenter: THREE.Vector3;
  private radius: number;
  private objects: Map<string, THREE.Object3D> = new Map();

  constructor(radius: number = SPHERICAL_NAVIGATION_CONFIG.SPHERE_RADIUS, center?: THREE.Vector3) {
    this.radius = radius;
    this.sphereCenter = center || new THREE.Vector3(0, 0, 0);
  }

  // Register an object to be managed by this collision system
  registerObject(id: string, object: THREE.Object3D) {
    this.objects.set(id, object);
  }

  // Unregister an object
  unregisterObject(id: string) {
    this.objects.delete(id);
  }

  // Update all registered objects to stay on the spherical surface
  updateObjects() {
    this.objects.forEach((object, id) => {
      this.updateObjectPosition(id);
    });
  }

  // Update a specific object to stay on the spherical surface
  updateObjectPosition(objectId: string) {
    const object = this.objects.get(objectId);
    if (!object) return;

    // Calculate position relative to sphere center
    const relPos = object.position.clone().sub(this.sphereCenter);
    const distance = relPos.length();
    
    if (distance === 0) {
      // If at center, place at arbitrary position on sphere
      object.position.set(this.radius, 0, 0).add(this.sphereCenter);
      return;
    }

    // Normalize and scale to sphere radius
    const surfacePos = relPos.normalize().multiplyScalar(this.radius);
    object.position.copy(surfacePos.add(this.sphereCenter));
  }

  // Get the surface normal at a given world position
  getSurfaceNormalAt(worldPos: THREE.Vector3): THREE.Vector3 {
    const relPos = worldPos.clone().sub(this.sphereCenter);
    return relPos.normalize();
  }

  // Get the closest surface point to a given world position
  getClosestSurfacePoint(worldPos: THREE.Vector3): THREE.Vector3 {
    const relPos = worldPos.clone().sub(this.sphereCenter);
    const distance = relPos.length();
    
    if (distance === 0) {
      // If at center, return arbitrary surface point
      return new THREE.Vector3(this.radius, 0, 0).add(this.sphereCenter);
    }
    
    return relPos.normalize().multiplyScalar(this.radius).add(this.sphereCenter);
  }

  // Check if a position is on the spherical surface (within tolerance)
  isOnSurface(worldPos: THREE.Vector3, tolerance: number = 0.1): boolean {
    const relPos = worldPos.clone().sub(this.sphereCenter);
    const distance = relPos.length();
    return Math.abs(distance - this.radius) <= tolerance;
  }
}

// Default spherical terrain collision manager
export const sphericalCollisionManager = new SphericalTerrainCollision();