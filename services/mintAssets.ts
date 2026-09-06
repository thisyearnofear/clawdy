import registry from '../mint-assets.json'

export interface MintAssetTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export interface MintAssetArtifact {
  artifactId: string
  role: string
  format: string
  contentType: string
  filename: string
  localPath: string
  loaderHint: string
  byteSize?: number
  usesDraco?: boolean
  requiresDraco?: boolean
  usesMeshopt?: boolean
  usesKtx2?: boolean
  unknownRequiredExtensions?: string[]
}

export interface MintAsset {
  source: {
    manifestVersion: number
    kind: string
    assetType: string
    assetId: string
  }
  artifacts: Record<string, MintAssetArtifact>
  transform?: MintAssetTransform
}

export interface MintAssetRegistry {
  registryVersion: number
  mintProject?: { projectId: string; name: string }
  assetRoot: string
  assets: Record<string, MintAsset>
}

const typedRegistry = registry as MintAssetRegistry

export function getMintRegistry(): MintAssetRegistry {
  return typedRegistry
}

export function getMintAsset(key: string): MintAsset | undefined {
  return typedRegistry.assets[key]
}

export function getMintModelArtifact(asset: MintAsset): MintAssetArtifact | undefined {
  const values = Object.values(asset.artifacts)
  return values.find(a => a.format === 'glb' || a.role === 'model' || a.loaderHint === 'gltf')
    ?? values[0]
}

export function getMintModelUrl(artifact: MintAssetArtifact): string {
  // The sync script stores local paths relative to the project root, often under
  // public/. Strip that prefix so the browser receives a standard URL.
  const stripped = artifact.localPath.replace(/^public\//, '').replace(/^public\\/, '')
  return stripped.startsWith('/') ? stripped : `/${stripped}`
}

export function getMintModelTransform(asset: MintAsset): MintAssetTransform {
  return asset.transform ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }
}

export function isMintAssetReady(key: string): boolean {
  const asset = getMintAsset(key)
  if (!asset) return false
  const artifact = getMintModelArtifact(asset)
  return artifact !== undefined && artifact.localPath.length > 0
}
