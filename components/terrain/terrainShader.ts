import * as THREE from 'three'

export interface TerrainShaderUniforms {
  uCurvatureStrength: { value: number }
  uCurvatureRadius: { value: number }
  uTime: { value: number }
  uWetness: { value: number }
}

const vertexPreamble = /* glsl */ `
uniform float uCurvatureStrength;
uniform float uCurvatureRadius;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
`

const vertexTransform = /* glsl */ `
vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
vWorldPosition = worldPos.xyz;
vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

float dist = length(worldPos.xz - cameraPosition.xz);
float curveMask = smoothstep(0.0, uCurvatureRadius, dist);
worldPos.y -= (dist * dist) * uCurvatureStrength * curveMask;

vec4 mvPosition = viewMatrix * worldPos;
gl_Position = projectionMatrix * mvPosition;
`

const fragmentPreamble = /* glsl */ `
uniform float uTime;
uniform float uWetness;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// ─── Hash & Noise ────────────────────────────────────────────

float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    value += amplitude * valueNoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec2 voronoiNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  float secondMin = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = vec2(hash2D(i + neighbor), hash2D(i + neighbor + vec2(37.0, 17.0)));
      vec2 diff = neighbor + point - f;
      float d = dot(diff, diff);
      if (d < minDist) {
        secondMin = minDist;
        minDist = d;
      } else if (d < secondMin) {
        secondMin = d;
      }
    }
  }
  return vec2(sqrt(minDist), sqrt(secondMin));
}

// ─── Road Constants ──────────────────────────────────────────

const int NUM_ROADS = 8;
const float roadAngles[8]  = float[8](0.0, 1.5707963, 3.1415927, 4.7123890,
                                       0.7853982, 2.3561945, 3.9269908, 5.4977871);
const float roadWidths[8]  = float[8](6.0, 6.0, 6.0, 6.0, 4.0, 4.0, 4.0, 4.0);
const float roadLengths[8] = float[8](90.0, 90.0, 90.0, 90.0, 70.0, 70.0, 70.0, 70.0);

const float RING_ROAD_RADIUS = 40.0;
const float RING_ROAD_WIDTH  = 5.0;
const float CENTER_ROAD_RADIUS = 12.0;
const float BLEND_WIDTH = 3.0;

// ─── Surface helpers ─────────────────────────────────────────

float distToRoad(vec2 pos) {
  float minD = 1e6;
  for (int i = 0; i < NUM_ROADS; i++) {
    float ca = cos(roadAngles[i]);
    float sa = sin(roadAngles[i]);
    float t = clamp(pos.x * ca + pos.y * sa, 0.0, roadLengths[i]);
    vec2 proj = vec2(ca * t, sa * t);
    float d = length(pos - proj) - roadWidths[i] * 0.5;
    minD = min(minD, d);
  }
  float dist = length(pos);
  float ringD = abs(dist - RING_ROAD_RADIUS) - RING_ROAD_WIDTH * 0.5;
  minD = min(minD, ringD);
  minD = min(minD, dist - CENTER_ROAD_RADIUS);
  return minD;
}

// Returns vec4(roadWeight, grassWeight, sandWeight, mudWeight)
vec4 surfaceWeights(vec3 wp) {
  vec2 pos = wp.xz;
  float roadD = distToRoad(pos);
  float dist = length(pos);
  float height = wp.y;
  float slope = abs(height) / max(1.0, dist * 0.05);
  float mudNoise = valueNoise(pos * 0.15);

  float roadW = 1.0 - smoothstep(-0.5, BLEND_WIDTH, roadD);
  float mudW  = smoothstep(0.60, 0.70, mudNoise) + smoothstep(1.5, 2.5, slope);
  mudW = clamp(mudW, 0.0, 1.0);
  float sandW = step(60.0, dist) * smoothstep(0.3, 0.7, slope);
  float grassW = 1.0;

  // Diminish non-road weights inside road zone
  float nonRoad = 1.0 - roadW;
  mudW  *= nonRoad;
  sandW *= nonRoad;
  grassW = max(0.0, nonRoad - mudW - sandW);

  float total = roadW + grassW + sandW + mudW;
  return vec4(roadW, grassW, sandW, mudW) / max(total, 0.001);
}

// ─── Per-surface texturing ───────────────────────────────────

// Distance from camera for LOD detail blending
float camDist(vec3 wp) {
  return length(wp.xz - cameraPosition.xz);
}

// Close-range micro-detail that fades with distance
float microDetail(vec2 uv, float dist) {
  float near = 1.0 - smoothstep(5.0, 25.0, dist);
  if (near < 0.01) return 0.0;
  float fine = valueNoise(uv * 24.0) * 0.5 + valueNoise(uv * 48.0) * 0.25;
  return fine * near;
}

vec3 grassColor(vec3 wp) {
  vec2 uv = wp.xz;
  float dist = camDist(wp);
  float n = fbm(uv * 1.8);
  float tuft = fbm(uv * 6.0);
  vec3 lo = vec3(0.14, 0.38, 0.08);
  vec3 hi = vec3(0.32, 0.58, 0.20);
  vec3 col = mix(lo, hi, n);
  col *= 0.85 + 0.3 * tuft;
  // Close-range: individual grass clump impression
  float micro = microDetail(uv, dist);
  col *= 0.9 + 0.2 * micro;
  // Height-based: lower = darker/wetter
  col *= 0.88 + 0.12 * clamp(wp.y * 0.5 + 0.5, 0.0, 1.0);
  // AO in crevices
  float ao = smoothstep(0.2, 0.5, tuft);
  col *= 0.75 + 0.25 * ao;
  // Scattered wildflower hints (tiny color spots at close range)
  float flower = step(0.92, valueNoise(uv * 18.0));
  float flowerDist = 1.0 - smoothstep(3.0, 12.0, dist);
  vec3 flowerCol = mix(vec3(0.8, 0.7, 0.2), vec3(0.7, 0.3, 0.5), valueNoise(uv * 7.0));
  col = mix(col, flowerCol, flower * 0.4 * flowerDist);
  return col;
}

float grassRoughness(vec3 wp) {
  float n = fbm(wp.xz * 3.0);
  float micro = microDetail(wp.xz, camDist(wp));
  return mix(0.72, 0.92, n) + micro * 0.05;
}

vec3 roadColor(vec3 wp) {
  vec2 uv = wp.xz;
  float dist = camDist(wp);
  vec3 base = vec3(0.22, 0.22, 0.25);
  // Asphalt grain – more visible up close
  float grain = valueNoise(uv * 12.0) * 0.06;
  float fineGrain = microDetail(uv, dist) * 0.03;
  base += grain + fineGrain;
  // Cracks
  vec2 vor = voronoiNoise(uv * 0.8);
  float crack = smoothstep(0.04, 0.02, vor.y - vor.x);
  base -= crack * 0.14;
  // Fine crack network at close range
  vec2 vorFine = voronoiNoise(uv * 3.0);
  float fineCrack = smoothstep(0.06, 0.03, vorFine.y - vorFine.x);
  float nearMask = 1.0 - smoothstep(5.0, 20.0, dist);
  base -= fineCrack * 0.06 * nearMask;
  // Tire marks – elongated in z
  float tire = valueNoise(vec2(uv.x * 6.0, uv.y * 0.4)) * 0.04;
  base -= tire * smoothstep(2.0, 0.5, abs(uv.x));
  // Road edge weathering
  float roadD = distToRoad(uv);
  float edgeWear = smoothstep(-1.0, 0.0, roadD) * smoothstep(1.0, -0.5, roadD);
  base = mix(base, base * 0.85 + vec3(0.03, 0.02, 0.01), edgeWear * 0.5);
  return base;
}

float roadRoughness(vec3 wp) {
  float n = valueNoise(wp.xz * 8.0);
  float micro = microDetail(wp.xz, camDist(wp));
  return mix(0.45, 0.65, n) + micro * 0.04;
}

vec3 sandColor(vec3 wp) {
  vec2 uv = wp.xz;
  float dist = camDist(wp);
  vec3 base = vec3(0.76, 0.66, 0.46);
  // Ripple pattern – directional
  float ripple = sin(uv.x * 2.0 + uv.y * 0.5 + valueNoise(uv * 0.3) * 6.0) * 0.5 + 0.5;
  base += ripple * 0.06;
  base += valueNoise(uv * 4.0) * 0.04;
  // Close-range grain
  float micro = microDetail(uv, dist);
  base += micro * 0.04;
  // Scattered pebble darkening
  float pebble = step(0.88, valueNoise(uv * 15.0));
  float nearP = 1.0 - smoothstep(4.0, 15.0, dist);
  base -= pebble * 0.1 * nearP;
  return base;
}

float sandRoughness(vec3 wp) {
  float n = valueNoise(wp.xz * 5.0);
  return mix(0.82, 0.95, n);
}

vec3 mudColor(vec3 wp) {
  vec2 uv = wp.xz;
  float dist = camDist(wp);
  vec3 base = vec3(0.10, 0.05, 0.02);
  float n = fbm(uv * 2.5);
  base += n * 0.05;
  // Wet sheen variation
  float micro = microDetail(uv, dist);
  base += micro * 0.02;
  // Subtle standing water color shift
  float puddle = valueNoise(uv * 1.5);
  float puddleMask = smoothstep(0.55, 0.7, puddle);
  base = mix(base, vec3(0.06, 0.05, 0.04), puddleMask * 0.6);
  return base;
}

float mudRoughness(vec3 wp) {
  float puddle = valueNoise(wp.xz * 1.5);
  float base = mix(0.2, 0.4, valueNoise(wp.xz * 3.0));
  // Puddles: very low roughness (reflective)
  base = mix(base, 0.02, smoothstep(0.55, 0.7, puddle));
  return base;
}

// ─── Procedural normal mapping ───────────────────────────────

vec3 proceduralNormal(vec3 wp, vec3 geometryNormal) {
  float dist = camDist(wp);
  float eps = 0.15;

  // Macro normal from terrain FBM
  float hC = fbm(wp.xz * 2.0);
  float hR = fbm((wp.xz + vec2(eps, 0.0)) * 2.0);
  float hU = fbm((wp.xz + vec2(0.0, eps)) * 2.0);
  float dX = (hR - hC) / eps;
  float dZ = (hU - hC) / eps;

  // Micro normal detail at close range (fine bumps)
  float nearMask = 1.0 - smoothstep(5.0, 20.0, dist);
  float epsF = 0.05;
  float mC = valueNoise(wp.xz * 16.0);
  float mR = valueNoise((wp.xz + vec2(epsF, 0.0)) * 16.0);
  float mU = valueNoise((wp.xz + vec2(0.0, epsF)) * 16.0);
  dX += ((mR - mC) / epsF) * 0.15 * nearMask;
  dZ += ((mU - mC) / epsF) * 0.15 * nearMask;

  vec3 N = normalize(geometryNormal);
  vec3 T = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
  vec3 B = cross(N, T);
  vec3 perturbedN = normalize(N - dX * T * 0.35 - dZ * B * 0.35);
  return perturbedN;
}
`

const fragmentOverride = /* glsl */ `
vec4 w = surfaceWeights(vWorldPosition);

vec3 col = w.x * roadColor(vWorldPosition)
          + w.y * grassColor(vWorldPosition)
          + w.z * sandColor(vWorldPosition)
          + w.w * mudColor(vWorldPosition);

float rough = w.x * roadRoughness(vWorldPosition)
            + w.y * grassRoughness(vWorldPosition)
            + w.z * sandRoughness(vWorldPosition)
            + w.w * mudRoughness(vWorldPosition);

// Wetness: darken color, lower roughness
col *= mix(1.0, 0.7, uWetness);
rough = mix(rough, rough * 0.3, uWetness);

// Distance desaturation: fade to muted grey-green at horizon
float distFromCam = length(vWorldPosition.xz - cameraPosition.xz);
float desat = smoothstep(30.0, 80.0, distFromCam);
float lum = dot(col, vec3(0.299, 0.587, 0.114));
vec3 greyCol = vec3(lum) * vec3(0.85, 0.9, 0.82); // slightly tinted grey
col = mix(col, greyCol, desat * 0.5);

diffuseColor = vec4(col, 1.0);
`

const fragmentRoughnessOverride = /* glsl */ `
vec4 wR = surfaceWeights(vWorldPosition);
float customRough = wR.x * roadRoughness(vWorldPosition)
                  + wR.y * grassRoughness(vWorldPosition)
                  + wR.z * sandRoughness(vWorldPosition)
                  + wR.w * mudRoughness(vWorldPosition);
customRough = mix(customRough, customRough * 0.3, uWetness);
float roughnessFactor = customRough;
`

const fragmentNormalOverride = /* glsl */ `
normal = proceduralNormal(vWorldPosition, vWorldNormal);
`

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const uniforms: TerrainShaderUniforms = {
    uCurvatureStrength: { value: 0.00018 },
    uCurvatureRadius: { value: 120 },
    uTime: { value: 0 },
    uWetness: { value: 0 },
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: false,
    flatShading: false,
    roughness: 0.8,
    metalness: 0.1,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurvatureStrength = uniforms.uCurvatureStrength
    shader.uniforms.uCurvatureRadius = uniforms.uCurvatureRadius
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWetness = uniforms.uWetness

    // ── Vertex shader ──────────────────────────────────────
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${vertexPreamble}`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      vertexTransform
    )

    // ── Fragment shader ────────────────────────────────────
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${fragmentPreamble}`
    )

    // Override diffuse color after the map sampling
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      fragmentOverride
    )

    // Override roughness
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      fragmentRoughnessOverride
    )

    // Override normals
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      fragmentNormalOverride
    )
  }

  material.customProgramCacheKey = () => 'terrain-splatmap-v1'

  // Stash uniforms on the material for external updates
  ;(material as unknown as { _terrainUniforms: TerrainShaderUniforms })._terrainUniforms = uniforms

  return material
}

export function updateTerrainMaterial(
  material: THREE.MeshStandardMaterial,
  time: number,
  wetness: number
): void {
  const u = (material as unknown as { _terrainUniforms: TerrainShaderUniforms })._terrainUniforms
  if (!u) return
  u.uTime.value = time
  u.uWetness.value = wetness
}
