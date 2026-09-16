import * as Cesium from 'cesium'

export const BUILDING_COLORS = {
  flooded: Cesium.Color.fromCssColorString('#e03131'),
  dry: Cesium.Color.fromCssColorString('#f39c12'),
  selected: Cesium.Color.fromCssColorString('#ffe14d'),
}

/** Drape the colour-ramped flood PNG over the terrain. */
export async function addFloodOverlay(viewer, overlay) {
  const { west, south, east, north } = overlay.bounds
  const provider = await Cesium.SingleTileImageryProvider.fromUrl(`/data/${overlay.image}`, {
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
  })
  if (viewer.isDestroyed()) return null
  return viewer.imageryLayers.addImageryProvider(provider)
}

/** Load footprints and extrude them, sitting on Cesium's terrain. */
export async function addBuildings(viewer) {
  const source = await Cesium.GeoJsonDataSource.load('/data/buildings.geojson')
  if (viewer.isDestroyed()) return null // React dev mode may unmount before loading finishes

  for (const entity of source.entities.values) {
    const props = entity.properties
    const flooded = props.flooded.getValue()
    const poly = entity.polygon

    // Base clamped to the ground; top = ground + building height
    poly.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND
    poly.extrudedHeight = props.height_m.getValue()
    poly.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND
    poly.material = flooded ? BUILDING_COLORS.flooded : BUILDING_COLORS.dry
    poly.outline = false // outlines aren't supported on terrain-relative polygons
  }

  await viewer.dataSources.add(source)
  return source
}

/** Plain object of a building's attributes, for the React side. */
export function buildingInfo(entity) {
  const p = entity.properties
  const get = (k) => p[k]?.getValue()
  return {
    id: get('BLDG_ID'),
    yearBuilt: get('YEAR_BUILT'),
    heightFt: get('estimate_h'),
    depthMaxFt: get('depth_max_ft'),
    depthMeanFt: get('depth_mean_ft'),
    wetPct: get('wet_pct'),
    flooded: get('flooded'),
  }
}

/** Base map choices that need no extra API key. */
export const BASEMAPS = {
  satellite: { label: 'Satellite' },
  labels: { label: 'Satellite + labels', ionAsset: 3 }, // Bing aerial with roads/labels
  streets: { label: 'Streets (OSM)' },
  plain: { label: 'Plain (terrain only)' },
}

/** Replace the bottom imagery layer, leaving the flood overlay on top. */
export async function setBasemap(viewer, key) {
  const layers = viewer.imageryLayers
  const current = layers.get(0)
  // The flood overlay is added after the base map, so index 0 is always the base
  const isOverlay = current?.imageryProvider instanceof Cesium.SingleTileImageryProvider
  let provider = null
  if (key === 'satellite') provider = await Cesium.createWorldImageryAsync()
  else if (key === 'labels') provider = await Cesium.IonImageryProvider.fromAssetId(BASEMAPS.labels.ionAsset)
  else if (key === 'streets') provider = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      maximumLevel: 19, // OSM serves no deeper; Cesium stretches level 19 when you zoom closer
    })

  if (viewer.isDestroyed()) return
  if (current && !isOverlay) layers.remove(current, true)
  if (provider) layers.addImageryProvider(provider, 0)
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1b2733')
}
