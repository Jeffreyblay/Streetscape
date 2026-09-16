import * as Cesium from 'cesium'
import { whenTerrainReady } from './terrain.js'
import { buildingInfo } from './layers.js'

const LINE_COLOR = '#ffe14d'

/**
 * Draw a bright line around each flooded building at its water level - the mark a
 * real flood leaves on a wall. Lets you read depths across the street at a glance.
 */
export async function addWaterMarks(viewer, buildings) {
  const flooded = buildings.entities.values.filter((e) => buildingInfo(e).flooded)
  if (!flooded.length) return null

  // Terrain height at each footprint, so the line sits at ground + depth
  const centroids = flooded.map((e) => {
    const positions = e.polygon.hierarchy.getValue().positions
    return Cesium.Cartographic.fromCartesian(Cesium.BoundingSphere.fromPoints(positions).center)
  })
  const provider = await whenTerrainReady(viewer)
  await Cesium.sampleTerrainMostDetailed(provider, centroids)
  if (viewer.isDestroyed()) return null

  const source = new Cesium.CustomDataSource('water-marks')
  flooded.forEach((entity, i) => {
    const depth = entity.properties.depth_max_m.getValue()
    const height = (centroids[i].height ?? 0) + depth
    const ring = entity.polygon.hierarchy.getValue().positions.map((p) => {
      const c = Cesium.Cartographic.fromCartesian(p)
      return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, height)
    })
    source.entities.add({
      polyline: {
        positions: [...ring, ring[0]], // close the loop
        width: 3,
        arcType: Cesium.ArcType.NONE,
        material: Cesium.Color.fromCssColorString(LINE_COLOR),
      },
    })
  })
  await viewer.dataSources.add(source)
  return source
}
