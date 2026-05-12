/**
 * Type declarations for @sparkjsdev/spark
 * These are minimal declarations to satisfy TypeScript until the package ships its own types.
 */
declare module '@sparkjsdev/spark' {
  import type { WebGLRenderer, Object3D } from 'three'

  export interface SparkRendererOptions {
    renderer: WebGLRenderer
    sortRadial?: boolean
    lodSplatScale?: number
    maxStdDev?: number
    enableLod?: boolean
  }

  export class SparkRenderer extends Object3D {
    constructor(options: SparkRendererOptions)
    dispose(): void
    update(params: { scene: Object3D; camera?: unknown }): void
  }

  export interface SplatMeshOptions {
    url?: string
    fileBytes?: Uint8Array | ArrayBuffer
    lod?: boolean | number
    lodScale?: number
    paged?: boolean
    onProgress?: (event: ProgressEvent) => void
    onLoad?: (mesh: SplatMesh) => void | Promise<void>
    editable?: boolean
    raycastable?: boolean
  }

  export class SplatMesh extends Object3D {
    constructor(options?: SplatMeshOptions)
    initialized: Promise<SplatMesh>
    isInitialized: boolean
    numSplats: number
    opacity: number
    dispose(): void
    updateGenerator(): void
  }
}
