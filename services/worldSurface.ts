import * as THREE from 'three'

export type SurfacePoint = [number, number, number]
export type SurfaceSample = { point: SurfacePoint; normal: SurfacePoint; distance: number }
export type RouteCheckOptions = { spacing: number; clearance: number; maxDrop: number; minNormalY?: number }
export type RouteCheck = { valid: boolean; samples: number; failure: 'missing-ground' | 'steep-ground' | null; point: SurfacePoint | null }

const MAX_VERTICES = 2_000_000
const MAX_INDICES = 6_000_000
const MAX_ROUTE_SAMPLES = 4096

function validPoint(point: SurfacePoint) {
  return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)
}

export function createWorldSurface(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const meshes: THREE.Mesh[] = []
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh || Object.keys(object.geometry.morphAttributes).length > 0) {
      throw new Error('World collider must contain static, non-instanced meshes')
    }
    meshes.push(object)
  })
  if (meshes.length === 0) throw new Error('World collider contains no mesh')
  let vertexCount = 0
  let indexCount = 0
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position')
    const indices = mesh.geometry.getIndex()
    if (!positions || positions.itemSize !== 3 || positions.count === 0) throw new Error('Invalid collider vertex positions')
    const count = indices?.count ?? positions.count
    if (count === 0 || count % 3 !== 0) throw new Error('Collider mesh is not a triangle list')
    vertexCount += positions.count
    indexCount += count
  }
  if (vertexCount > MAX_VERTICES || indexCount > MAX_INDICES) throw new Error('Collider exceeds geometry budget')
  const vertices = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(indexCount)
  const point = new THREE.Vector3()
  let vertexOffset = 0
  let indexOffset = 0
  for (const mesh of meshes) {
    const sourcePositions = mesh.geometry.getAttribute('position')
    const sourceIndices = mesh.geometry.getIndex()
    const determinant = mesh.matrixWorld.determinant()
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error('Invalid collider transform')
    for (let index = 0; index < sourcePositions.count; index++) {
      point.fromBufferAttribute(sourcePositions, index).applyMatrix4(mesh.matrixWorld)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) throw new Error('Non-finite collider vertex')
      point.toArray(vertices, (vertexOffset + index) * 3)
    }
    const count = sourceIndices?.count ?? sourcePositions.count
    for (let index = 0; index < count; index += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const source = index + (determinant < 0 && corner > 0 ? 3 - corner : corner)
        const value = sourceIndices ? sourceIndices.getX(source) : source
        if (!Number.isSafeInteger(value) || value < 0 || value >= sourcePositions.count) throw new Error('Invalid collider index')
        indices[indexOffset + index + corner] = value + vertexOffset
      }
    }
    vertexOffset += sourcePositions.count
    indexOffset += count
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const collider = new THREE.Mesh(geometry, material)
  collider.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  const direction = new THREE.Vector3(0, -1, 0)
  let disposed = false

  function ensureActive() {
    if (disposed) throw new Error('World surface is disposed')
  }

  function sample(origin: SurfacePoint, maxDistance = Infinity): SurfaceSample | null {
    ensureActive()
    if (!validPoint(origin) || !(maxDistance >= 0)) throw new Error('Invalid surface query')
    raycaster.set(point.fromArray(origin), direction)
    raycaster.near = 0
    raycaster.far = maxDistance
    const hit = raycaster.intersectObject(collider, false)[0]
    if (!hit?.face) return null
    const normal = hit.face.normal.clone()
    if (normal.y < 0) normal.negate()
    return { point: hit.point.toArray() as SurfacePoint, normal: normal.toArray() as SurfacePoint, distance: hit.distance }
  }

  return {
    meshCount: meshes.length,
    triangleCount: indexCount / 3,
    get bounds() {
      ensureActive()
      return { min: geometry.boundingBox!.min.toArray() as SurfacePoint, max: geometry.boundingBox!.max.toArray() as SurfacePoint }
    },
    colliderData() {
      ensureActive()
      return { vertices: vertices.slice(), indices: indices.slice() }
    },
    sample,
    checkRouteGrounding(route: SurfacePoint[], options: RouteCheckOptions): RouteCheck {
      ensureActive()
      const { spacing, clearance, maxDrop, minNormalY = 0.7 } = options
      if (!Array.isArray(route) || route.length < 2 || route.length > 256 || !route.every(validPoint) ||
          !Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(clearance) || clearance < 0 ||
          !Number.isFinite(maxDrop) || maxDrop <= 0 || !Number.isFinite(minNormalY) || minNormalY < 0 || minNormalY > 1) {
        throw new Error('Invalid route validation options')
      }
      const counts = route.slice(1).map((end, index) => {
        const start = route[index]
        return Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) / spacing))
      })
      if (counts.reduce((total, count) => total + count + 1, 0) > MAX_ROUTE_SAMPLES) throw new Error('Route exceeds sample budget')
      let samples = 0
      for (let segment = 0; segment < counts.length; segment++) {
        const start = route[segment]
        const end = route[segment + 1]
        for (let index = 0; index <= counts[segment]; index++) {
          const progress = index / counts[segment]
          const candidate = start.map((value, axis) => value + (end[axis] - value) * progress) as SurfacePoint
          candidate[1] += clearance
          const ground = sample(candidate, maxDrop)
          samples += 1
          if (!ground || ground.normal[1] < minNormalY) {
            return { valid: false, samples, failure: ground ? 'steep-ground' : 'missing-ground', point: candidate }
          }
        }
      }
      return { valid: true, samples, failure: null, point: null }
    },
    dispose() {
      if (disposed) return
      disposed = true
      geometry.dispose()
      material.dispose()
    },
  }
}

export type WorldSurface = ReturnType<typeof createWorldSurface>
