import * as Cesium from 'cesium'

/**
 * Resolve once the viewer has real terrain. While World Terrain is still loading,
 * viewer.terrainProvider may be undefined or a flat EllipsoidTerrainProvider
 * placeholder, and sampling against either fails.
 */
export function whenTerrainReady(viewer) {
  const isReal = (p) => p && !(p instanceof Cesium.EllipsoidTerrainProvider)
  if (isReal(viewer.terrainProvider)) return Promise.resolve(viewer.terrainProvider)
  return new Promise((resolve) => {
    const remove = viewer.scene.terrainProviderChanged.addEventListener(() => {
      if (!isReal(viewer.terrainProvider)) return
      remove()
      resolve(viewer.terrainProvider)
    })
  })
}
