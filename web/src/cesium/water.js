import * as Cesium from 'cesium'
import { whenTerrainReady } from './terrain.js'

// Dry vertices at the water's edge sit this far below ground, so the terrain
// cuts a natural shoreline through the mesh instead of a jagged step.
const DRY_EDGE_OFFSET_M = -1.5
// Passes of 3x3 averaging on the water surface elevation. Cesium's terrain is
// not the model's DEM, so ground + depth is bumpy; real floodwater is flat.
const SMOOTH_PASSES = 3
const MIN_DEPTH_M = 0.02

export const WATER_ANIMATION_SPEED = 0.01


const M_TO_FT = 3.28084
const SHALLOW_ALPHA = 0.5
const DEEP_ALPHA = 0.85
const DEEP_FT = 8 // depth at which the water reaches DEEP_ALPHA

/** Colour at a depth (ft), interpolated between the overlay legend stops. */
function rampColor(legend, ft) {
  const i = Math.max(1, legend.findIndex((stop) => stop.depth_ft >= ft))
  const lo = legend[i - 1]
  const hi = legend[i] ?? legend[legend.length - 1]
  const t = hi.depth_ft === lo.depth_ft ? 0 : (ft - lo.depth_ft) / (hi.depth_ft - lo.depth_ft)
  return [0, 1, 2].map((k) => lo.rgba[k] + t * (hi.rgba[k] - lo.rgba[k]))
}

/**
 * Paint the depth grid into a texture using the legend ramp, so the water
 * surface itself carries the depth colours. Deeper water is more opaque.
 */
function depthTexture(grid, legend) {
  const { cols, rows, values } = grid
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(cols, rows)

  for (let i = 0; i < values.length; i++) {
    const depth = values[i]
    const px = i * 4
    if (depth === null) continue // dry: transparent
    const ft = depth * M_TO_FT
    const [r, g, b] = rampColor(legend, ft)
    const a = SHALLOW_ALPHA + (DEEP_ALPHA - SHALLOW_ALPHA) * Math.min(1, ft / DEEP_FT)
    img.data[px] = r
    img.data[px + 1] = g
    img.data[px + 2] = b
    img.data[px + 3] = Math.round(a * 255)
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

/** Cesium's water shader, with the flat base colour replaced by the depth texture. */
const DEPTH_WATER_SOURCE = `
uniform sampler2D depthMap;
uniform sampler2D normalMap;
uniform vec2 aspect;
uniform float frequency;
uniform float animationSpeed;
uniform float amplitude;
uniform float specularIntensity;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float time = czm_frameNumber * animationSpeed;

    // ripples: scale by aspect so they stay square on a non-square grid
    vec4 noise = czm_getWaterNoise(normalMap, materialInput.st * aspect * frequency, time, 0.0);
    vec3 normalTangentSpace = normalize(noise.xyz * vec3(1.0, 1.0, (1.0 / amplitude)));
    float tsPerturbationRatio = clamp(dot(normalTangentSpace, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);

    vec4 depthColor = texture(depthMap, materialInput.st);
    material.diffuse = czm_gammaCorrect(depthColor.rgb) + (0.1 * tsPerturbationRatio);
    material.alpha = depthColor.a;
    material.normal = normalize(materialInput.tangentToEyeMatrix * normalTangentSpace);
    material.specular = specularIntensity;
    material.shininess = 10.0;
    return material;
}
`

/** Plain tinted water (the original look) and depth-coloured water. */
export function buildWaterMaterials(grid, legend) {
  const span = Math.max(grid.cols, grid.rows)
  const shared = {
    normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
    frequency: 800,
    animationSpeed: WATER_ANIMATION_SPEED,
    amplitude: 6,
    specularIntensity: 0.6,
  }
  return {
    plain: Cesium.Material.fromType('Water', {
      ...shared,
      baseWaterColor: Cesium.Color.fromCssColorString('#3a96d6').withAlpha(0.3),
    }),
    depth: new Cesium.Material({
      fabric: {
        type: 'DepthWater',
        uniforms: { ...shared, depthMap: depthTexture(grid, legend), aspect: new Cesium.Cartesian2(grid.cols / span, grid.rows / span) },
        source: DEPTH_WATER_SOURCE,
      },
      translucent: true,
    }),
  }
}

/**
 * Build an animated water surface from depth_grid.json.
 * Vertices are grid cell centres; a quad is kept if any corner is wet.
 */
export async function addWaterSurface(viewer, grid, legend, colorByDepth = true) {
  if (viewer.isDestroyed()) return null
  const t0 = performance.now()
  const { cols, rows, west, north, dlon, dlat, values } = grid
  const at = (r, c) => r * cols + c
  const isWet = (i) => values[i] !== null

  // 1. Quads with at least one wet corner, and the grid points they use
  const quads = []
  const vertexOf = new Int32Array(cols * rows).fill(-1)
  const gridIds = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const q = [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)] // NW NE SE SW
      if (!q.some(isWet)) continue
      quads.push(q)
      for (const i of q) {
        if (vertexOf[i] === -1) {
          vertexOf[i] = gridIds.length
          gridIds.push(i)
        }
      }
    }
  }

  // 2. Ground height from Cesium terrain at every vertex
  const cartos = gridIds.map((i) =>
    Cesium.Cartographic.fromDegrees(
      west + ((i % cols) + 0.5) * dlon,
      north - (Math.floor(i / cols) + 0.5) * dlat,
    ),
  )
  const provider = await whenTerrainReady(viewer)
  if (viewer.isDestroyed()) return null
  await Cesium.sampleTerrainMostDetailed(provider, cartos)
  if (viewer.isDestroyed()) return null
  const ground = cartos.map((p) => p.height ?? 0)

  // 3. Water surface elevation = ground + depth, lightly smoothed over wet vertices
  let wse = gridIds.map((i, v) => (isWet(i) ? ground[v] + values[i] : NaN))
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    wse = gridIds.map((i, v) => {
      if (Number.isNaN(wse[v])) return NaN
      const r = Math.floor(i / cols)
      const c = i % cols
      let sum = 0
      let n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
          const nv = vertexOf[at(rr, cc)]
          if (nv !== -1 && !Number.isNaN(wse[nv])) {
            sum += wse[nv]
            n++
          }
        }
      }
      return Math.max(sum / n, ground[v] + MIN_DEPTH_M)
    })
  }

  // 4. Geometry: positions + texture coordinates.
  //    st spans the grid exactly, so the depth texture lines up cell for cell.
  const positions = new Float64Array(gridIds.length * 3)
  const st = new Float32Array(gridIds.length * 2)
  gridIds.forEach((i, v) => {
    const h = Number.isNaN(wse[v]) ? ground[v] + DRY_EDGE_OFFSET_M : wse[v]
    const p = Cesium.Cartesian3.fromRadians(cartos[v].longitude, cartos[v].latitude, h)
    positions.set([p.x, p.y, p.z], v * 3)
    st.set([((i % cols) + 0.5) / cols, 1 - (Math.floor(i / cols) + 0.5) / rows], v * 2)
  })

  const indices = new Uint32Array(quads.length * 6)
  quads.forEach(([nw, ne, se, sw], k) => {
    const [a, b, c, d] = [nw, ne, se, sw].map((i) => vertexOf[i])
    indices.set([a, d, c, a, c, b], k * 6) // two counter-clockwise triangles
  })

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: st,
      }),
    },
    indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  })

  // 5. Two materials: depth-coloured (the water IS the depth map) and plain tint
  const materials = buildWaterMaterials(grid, legend)

  // The surface is nearly parallel to the ellipsoid, so EllipsoidSurfaceAppearance
  // (which the Water material needs) gives correct lighting.
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry }),
    appearance: new Cesium.EllipsoidSurfaceAppearance({
      aboveGround: true,
      material: colorByDepth ? materials.depth : materials.plain,
    }),
    asynchronous: false, // custom geometry can't be built in a web worker
  })
  primitive.materials = materials // so the UI can switch between them
  viewer.scene.primitives.add(primitive)

  const wetCount = gridIds.filter(isWet).length
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  console.info(
    `Water surface: ${gridIds.length} vertices (${wetCount} wet), ${quads.length * 2} triangles, ${secs}s`,
  )
  return primitive
}
