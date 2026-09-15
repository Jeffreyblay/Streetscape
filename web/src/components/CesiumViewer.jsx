import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { addBuildings, addFloodOverlay, buildingInfo, BUILDING_COLORS } from '../cesium/layers.js'
import { addWaterSurface, WATER_ANIMATION_SPEED } from '../cesium/water.js'

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN

// Oblique view looking north over the study area
function flyToStudyArea(viewer, bounds) {
  const lon = (bounds.west + bounds.east) / 2
  const lat = (bounds.south + bounds.north) / 2
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.018, 1400),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
    duration: 3,
  })
}

function setBuildingColor(entity, highlighted) {
  const { flooded } = buildingInfo(entity)
  entity.polygon.material = highlighted
    ? BUILDING_COLORS.selected
    : flooded ? BUILDING_COLORS.flooded : BUILDING_COLORS.dry
}

export default function CesiumViewer({
  overlay,
  selectedId,
  onSelectBuilding,
  showWater = true,
  animateWater = true,
  showDepthColors = true,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const buildingsRef = useRef(null)
  const waterRef = useRef(null)
  const overlayLayerRef = useRef(null)
  const showDepthColorsRef = useRef(showDepthColors)
  const onSelectRef = useRef(onSelectBuilding)
  const [waterStatus, setWaterStatus] = useState('loading')

  useEffect(() => {
    onSelectRef.current = onSelectBuilding
  }, [onSelectBuilding])

  // Create the viewer and load buildings + water once; destroy on unmount
  useEffect(() => {
    const viewer = new Cesium.Viewer(containerRef.current, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      scene3DOnly: true,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })
    // Hide anything below the ground (e.g. the water mesh's dry edges)
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewerRef.current = viewer

    addBuildings(viewer).then((source) => {
      if (!viewer.isDestroyed()) buildingsRef.current = source
    })

    fetch('/data/depth_grid.json')
      .then((r) => r.json())
      .then((grid) => addWaterSurface(viewer, grid))
      .then((primitive) => {
        if (!primitive || viewer.isDestroyed()) return
        waterRef.current = primitive
        setWaterStatus('ready')
      })
      .catch((e) => {
        console.error('Water surface failed:', e?.message ?? e, e?.stack ?? JSON.stringify(e))
        if (!viewer.isDestroyed()) setWaterStatus('error')
      })

    // Click a building to select it; click elsewhere to clear.
    // Highlighting is handled by the selectedId effect below.
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction(({ position }) => {
      const picked = viewer.scene.pick(position)
      const entity = picked?.id instanceof Cesium.Entity ? picked.id : null
      const isBuilding = entity && buildingsRef.current?.entities.contains(entity)
      onSelectRef.current?.(isBuilding ? buildingInfo(entity) : null)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      buildingsRef.current = null
      waterRef.current = null
    }
  }, [])

  // Overlay metadata arrives after the fetch in App: drape it and fly there
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !overlay) return
    let cancelled = false
    addFloodOverlay(viewer, overlay).then((layer) => {
      if (viewer.isDestroyed()) return
      if (cancelled) return viewer.imageryLayers.remove(layer)
      overlayLayerRef.current = layer
      layer.show = showDepthColorsRef.current
    })
    flyToStudyArea(viewer, overlay.bounds)
    return () => {
      cancelled = true
      const layer = overlayLayerRef.current
      if (layer && !viewer.isDestroyed()) viewer.imageryLayers.remove(layer)
      overlayLayerRef.current = null
    }
  }, [overlay])

  // Layer toggles
  useEffect(() => {
    showDepthColorsRef.current = showDepthColors
    if (overlayLayerRef.current) overlayLayerRef.current.show = showDepthColors
  }, [showDepthColors])

  useEffect(() => {
    if (waterRef.current) waterRef.current.show = showWater
  }, [showWater, waterStatus])

  useEffect(() => {
    const water = waterRef.current
    if (water) water.appearance.material.uniforms.animationSpeed = animateWater ? WATER_ANIMATION_SPEED : 0
  }, [animateWater, waterStatus])

  // Keep the 3D highlight in sync with the selection in App
  useEffect(() => {
    const source = buildingsRef.current
    if (!source || selectedId == null) return
    const entity = source.entities.values.find((e) => buildingInfo(e).id === selectedId)
    if (!entity) return
    setBuildingColor(entity, true)
    return () => setBuildingColor(entity, false)
  }, [selectedId])

  return (
    <>
      <div ref={containerRef} className="cesium-container" />
      {showWater && waterStatus !== 'ready' && (
        <div className={`viewer-status ${waterStatus}`}>
          {waterStatus === 'loading' ? 'Building water surface…' : 'Water surface failed to load (see console)'}
        </div>
      )}
    </>
  )
}
