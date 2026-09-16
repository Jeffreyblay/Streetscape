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

/**
 * Build an animated water surface from depth_grid.json.
 * Vertices are grid cell centres; a quad is kept if any corner is wet.
 */
export async function addWaterSurface(viewer, grid) {
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

  // 4. Geometry: positions + texture coordinates (for the ripple normal map)
  const span = Math.max(cols, rows)
  const positions = new Float64Array(gridIds.length * 3)
  const st = new Float32Array(gridIds.length * 2)
  gridIds.forEach((i, v) => {
    const h = Number.isNaN(wse[v]) ? ground[v] + DRY_EDGE_OFFSET_M : wse[v]
    const p = Cesium.Cartesian3.fromRadians(cartos[v].longitude, cartos[v].latitude, h)
    positions.set([p.x, p.y, p.z], v * 3)
    st.set([(i % cols) / span, (rows - Math.floor(i / cols)) / span], v * 2)
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

  // 5. Cesium's animated water material. Kept light and transparent so the depth
  //    colours underneath show through; the surface adds ripples and reflections.
  const material = Cesium.Material.fromType('Water', {
    baseWaterColor: Cesium.Color.fromCssColorString('#3a96d6').withAlpha(0.3), // "2 ft" stop of the depth ramp
    normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
    frequency: 800,
    animationSpeed: WATER_ANIMATION_SPEED,
    amplitude: 6,
    specularIntensity: 0.6,
  })

  // The surface is nearly parallel to the ellipsoid, so EllipsoidSurfaceAppearance
  // (which the Water material needs) gives correct lighting.
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry }),
    appearance: new Cesium.EllipsoidSurfaceAppearance({ aboveGround: true, material }),
    asynchronous: false, // custom geometry can't be built in a web worker
  })
  viewer.scene.primitives.add(primitive)

  const wetCount = gridIds.filter(isWet).length
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  console.info(
    `Water surface: ${gridIds.length} vertices (${wetCount} wet), ${quads.length * 2} triangles, ${secs}s`,
  )
  return primitive
}
