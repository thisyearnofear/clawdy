import * as THREE from 'three'

/**
 * PBR material for generated terrain.
 *
 * The maps are a PBRgen material — one plain sentence ("dark grey fractured
 * basalt rock, sharp angular cracks, volcanic stone, fine grain") turned into a
 * seamless tileable set of albedo, normal and roughness. Two things make it
 * more than a skin: the palette tint still comes from the resolver's own
 * vertex-colour ramp, and the shader's response is driven by fields the
 * simulator already certified — per-vertex slope decides how dusty or how bare
 * the rock reads, and the flood footprint's waterline decides where ground is
 * wet enough to go specular. All of it is visual; none of it reaches the
 * collider or the certificate.
 */

export type PbrMaps = {
  albedo: THREE.Texture
  normal: THREE.Texture
  roughness: THREE.Texture
}

const BASE = '/materials/pbrgen/rock'
const textureLoader = new THREE.TextureLoader()

function load(url: string, srgb: boolean): THREE.Texture {
  const texture = textureLoader.load(url)
  // Albedo is colour; normal and roughness carry numbers, and tagging those
  // sRGB would make the relief and the specular response read wrong per light.
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

let cached: PbrMaps | null = null

export function loadPbrRock(): PbrMaps {
  cached ??= {
    albedo: load(`${BASE}/albedo.jpg`, true),
    normal: load(`${BASE}/normal.jpg`, false),
    roughness: load(`${BASE}/rough.jpg`, false),
  }
  return cached
}

/**
 * Slope per vertex, read off the geometry's own normals: 1 on flat ground, 0 on
 * a wall. The generated mesh is built in world space with an identity
 * transform, so its normals are world normals and its Y is world Y.
 */
export function prepareTerrainAttributes(geometry: THREE.BufferGeometry): void {
  const normal = geometry.getAttribute('normal')
  if (!normal || geometry.getAttribute('aSlope')) return
  const slope = new Float32Array(normal.count)
  for (let i = 0; i < normal.count; i++) slope[i] = THREE.MathUtils.clamp(normal.getY(i), 0, 1)
  geometry.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1))
}

export type PbrTuning = {
  /** Map repeat across the basin. */
  repeat: number
  /** World-Y of the flood surface; ground at it reads as wet. Omit for dry worlds. */
  waterline?: number
}

/**
 * The exported albedo is a dark rock: its mean decodes to about 0.086 linear, so
 * multiplying it straight into the palette ramp buries the hue in the toe of the
 * tone curve and basalt, copper and gypsum all render the same grey. Lifting the
 * map before the multiply lets the palette the resolver specified show through,
 * while leaving the rock dark enough to keep its own relief — the full
 * normalisation (1/0.086) is the other end of that dial and it washes the flats.
 * Anything the lift pushes past 1.0 takes a shoulder instead of clipping, so the
 * bright faces keep a little range.
 */
const ALBEDO_LIFT = 4.0
const ALBEDO_SHOULDER = 0.85

/** Half-width, in world units, of the wet band that hugs the flood surface. */
const WET_BAND = 1.4

export function applyPbrRock(
  material: THREE.MeshStandardMaterial,
  maps: PbrMaps,
  tuning: PbrTuning,
): void {
  for (const texture of [maps.albedo, maps.normal, maps.roughness]) {
    texture.repeat.set(tuning.repeat, tuning.repeat)
  }
  material.map = maps.albedo
  material.normalMap = maps.normal
  material.roughnessMap = maps.roughness
  // Stone is a dielectric: the roughness map carries the surface and there is
  // no metal in it. Metalness stays a per-object decision for the props.
  material.metalness = 0
  material.roughness = 1
  material.normalScale.set(1.35, 1.35)

  const uniforms = {
    uWetLine: { value: tuning.waterline ?? 0 },
    uWetStrength: { value: tuning.waterline === undefined ? 0 : 1 },
  }
  material.userData.pbrUniforms = uniforms

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWetLine = uniforms.uWetLine
    shader.uniforms.uWetStrength = uniforms.uWetStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSlope;\nvarying float vSlopeMix;\nvarying float vWorldY;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlopeMix = aSlope;\nvWorldY = transformed.y;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vSlopeMix;
varying float vWorldY;
uniform float uWetLine;
uniform float uWetStrength;
float pbrWetness = 0.0;`,
      )
      // Own this chunk outright: three resolves #include after onBeforeCompile,
      // so the only way to modulate the map is to write the block.
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 rockAlbedo = texture2D( map, vMapUv );
	vec3 lifted = rockAlbedo.rgb * ${ALBEDO_LIFT.toFixed(2)};
	diffuseColor.rgb *= lifted / ( 1.0 + ${ALBEDO_SHOULDER.toFixed(2)} * max( lifted - 1.0, vec3( 0.0 ) ) );
	diffuseColor.a *= rockAlbedo.a;
	// The flood surface is a line, not a depth: only ground within the band
	// holds a sheen, and a world with no flood never enters it.
	float wetDistance = abs( vWorldY - uWetLine ) / ${WET_BAND.toFixed(2)};
	pbrWetness = uWetStrength * ( 1.0 - clamp( wetDistance, 0.0, 1.0 ) );
	diffuseColor.rgb *= mix( 1.0, 0.74, pbrWetness );
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	float mapRoughness = texture2D( roughnessMap, vRoughnessMapUv ).g;
	// Dust settles on the flats and blows off the faces, so a ridge reads
	// tighter and glossier than the floor it rises from.
	float dusty = smoothstep( 0.80, 0.96, vSlopeMix );
	float bare = mix( mapRoughness * 0.72, clamp( mapRoughness + 0.18, 0.0, 1.0 ), dusty );
	// Wet grain still scatters; it only ever tightens as far as polished stone.
	roughnessFactor *= clamp( mix( bare, 0.30, pbrWetness ), 0.04, 1.0 );
#endif`,
      )
  }
  material.needsUpdate = true
}
