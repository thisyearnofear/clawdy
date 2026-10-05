import { CHASSIS_IDS, type ChassisId } from './chassis'
import { getMintAsset, getMintModelArtifact, getMintModelTransform, getMintModelUrl, type MintAssetTransform } from './mintAssets'

/**
 * Chassis body assets (league plan, Stream D). One registry entry per chassis,
 * keyed `chassis.<id>`. Rendering never depends on them: a missing entry falls
 * back to the entrant's legacy `${id}Rover` asset, and then to the procedural rover.
 */
export function chassisAssetKey(chassis: ChassisId): string {
  return `chassis.${chassis}`
}

export interface RoverModelSource {
  /** Registry key that resolved, or undefined when only the procedural rover is available. */
  key?: string
  url?: string
  transform?: MintAssetTransform
}

function modelFor(key: string): RoverModelSource | undefined {
  const asset = getMintAsset(key)
  const artifact = asset ? getMintModelArtifact(asset) : undefined
  if (!asset || !artifact || artifact.localPath.length === 0) return undefined
  return { key, url: getMintModelUrl(artifact), transform: getMintModelTransform(asset) }
}

/**
 * Resolve which model a rover renders. Order: chassis body, legacy per-entrant
 * asset (`championRover` / `rivalRover`), procedural. Old brains and every pinned
 * scenario carry no chassis and keep the legacy look.
 */
export function resolveRoverModel(entrantId: string, chassis?: ChassisId | string): RoverModelSource {
  if (chassis && (CHASSIS_IDS as readonly string[]).includes(chassis)) {
    const body = modelFor(chassisAssetKey(chassis as ChassisId))
    if (body) return body
  }
  return modelFor(`${entrantId}Rover`) ?? {}
}

const IDENTITY_TRANSFORM: MintAssetTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }

/**
 * A forged rover (Forge, Stream D) is a raw Tripo GLB stored in Convex. Tripo
 * normalises size and the same style of prompt comes back oriented like the
 * shipped chassis bodies, so the forged model borrows its chassis body's
 * registry transform (facing, ground offset, scale). A forged model never
 * replaces the legacy model unless it loads: the caller wraps it in an error
 * boundary that falls back to {@link resolveRoverModel}.
 */
export function resolveForgedModel(chassis: string, url: string): RoverModelSource {
  const body = (CHASSIS_IDS as readonly string[]).includes(chassis) ? modelFor(chassisAssetKey(chassis as ChassisId)) : undefined
  return { key: `forged.${chassis}`, url, transform: body?.transform ?? IDENTITY_TRANSFORM }
}

/** Chassis ids that currently have a registered body, for the asset board and the harness. */
export function registeredChassisBodies(): ChassisId[] {
  return CHASSIS_IDS.filter(id => modelFor(chassisAssetKey(id)) !== undefined)
}
