import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { addBuildings, addFloodOverlay, buildingInfo, setBasemap, BUILDING_COLORS } from '../cesium/layers.js'
import { addWaterSurface, replayFlooding, WATER_ANIMATION_SPEED } from '../cesium/water.js'
import { StreetView } from '../cesium/streetView.js'
import { Tour } from '../cesium/tour.js'
import { FloodStaff } from '../cesium/floodStaff.js'
import { addWaterMarks } from '../cesium/waterMarks.js'
import { loadDepthGrid } from '../data/depthGrid.js'

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

// Colours a building: yellow when selected, otherwise red if flooded and orange if dry.
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
  colorWaterByDepth = true,
  mode = 'aerial', // 'aerial' | 'picking' | 'street'
  streetPosition = null,
  eyeHeight = 1.7,
  onPickLocation,
  onHeadingChange,
  basemap = 'satellite',
  tourState = 'off', // 'off' | 'playing' | 'paused'
  onTourEnd,
  showWaterMarks = false,
  replayToken = 0,
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const buildingsRef = useRef(null)
  const waterRef = useRef(null)
  const overlayLayerRef = useRef(null)
  const streetViewRef = useRef(null)
  const tourRef = useRef(null)
  const staffRef = useRef(null)
  const waterMarksRef = useRef(null)
  const showDepthColorsRef = useRef(showDepthColors)
  const colorWaterByDepthRef = useRef(colorWaterByDepth)
  const eyeHeightRef = useRef(eyeHeight)
  const modeRef = useRef(mode)
  const onSelectRef = useRef(onSelectBuilding)
  const onPickRef = useRef(onPickLocation)
  const onHeadingRef = useRef(onHeadingChange)
  const onTourEndRef = useRef(onTourEnd)
  const [waterStatus, setWaterStatus] = useState('loading')
  const [buildingsReady, setBuildingsReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelectBuilding
    onPickRef.current = onPickLocation
    onHeadingRef.current = onHeadingChange
    onTourEndRef.current = onTourEnd
  }, [onSelectBuilding, onPickLocation, onHeadingChange, onTourEnd])

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
      if (viewer.isDestroyed()) return
      buildingsRef.current = source
      setBuildingsReady(true)
    })

    const streetView = new StreetView(viewer)
    streetViewRef.current = streetView
    // Plant the depth staff wherever the viewer arrives
    staffRef.current = new FloodStaff(viewer)
    streetView.onArrive = (where) => staffRef.current?.plant(where)

    const tour = new Tour(viewer)
    tour.onEnd = () => onTourEndRef.current?.()
    tourRef.current = tour
    fetch('/data/tour_path.json')
      .then((r) => r.json())
      .then((p) => tour.prepare(p.waypoints))
      .catch((e) => console.error('Tour path failed:', e?.message ?? e))

    // Report the compass heading (rounded) whenever it changes, for the minimap
    let lastHeading = null
    const onRender = () => {
      const deg = Math.round(Cesium.Math.toDegrees(viewer.camera.heading))
      if (deg !== lastHeading) {
        lastHeading = deg
        onHeadingRef.current?.(deg)
      }
    }
    viewer.scene.postRender.addEventListener(onRender)
    // Dev-only handle for debugging in the browser console (stripped from production builds)
    if (import.meta.env.DEV) window.__streetscape = { viewer, streetView: streetViewRef.current, Cesium }

    Promise.all([loadDepthGrid(), fetch('/data/flood_overlay.json').then((r) => r.json())])
      .then(([grid, ov]) => addWaterSurface(viewer, grid, ov.legend, colorWaterByDepthRef.current))
      .then((primitive) => {
        if (!primitive || viewer.isDestroyed()) return
        waterRef.current = primitive
        setWaterStatus('ready')
      })
      .catch((e) => {
        console.error('Water surface failed:', e?.message ?? e, e?.stack ?? JSON.stringify(e))
        if (!viewer.isDestroyed()) setWaterStatus('error')
      })

    // Click a building (any mode) to select it. Otherwise:
    //   aerial  -> clear selection
    //   picking -> enter street view at the clicked ground point
    //   street  -> walk to the clicked ground point
    // (A drag doesn't count as a click, so drag-to-look won't trigger a walk.)
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction(({ position }) => {
      const picked = viewer.scene.pick(position)
      const entity = picked?.id instanceof Cesium.Entity ? picked.id : null
      if (entity && buildingsRef.current?.entities.contains(entity)) {
        onSelectRef.current?.(buildingInfo(entity))
        return
      }
      if (modeRef.current === 'aerial') {
        onSelectRef.current?.(null)
        return
      }
      // Ground point under the cursor, ignoring water and buildings
      const ground = viewer.scene.globe.pick(viewer.camera.getPickRay(position), viewer.scene)
      if (!ground) return
      const c = Cesium.Cartographic.fromCartesian(ground)
      onPickRef.current?.({ lon: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude) })
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      viewer.scene.postRender.removeEventListener(onRender)
      handler.destroy()
      streetViewRef.current?.destroy()
      streetViewRef.current = null
      tourRef.current?.destroy()
      tourRef.current = null
      staffRef.current?.destroy()
      staffRef.current = null
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
    colorWaterByDepthRef.current = colorWaterByDepth
    const water = waterRef.current
    if (water?.materials) {
      water.appearance.material = colorWaterByDepth ? water.materials.depth : water.materials.plain
    }
  }, [colorWaterByDepth, waterStatus])

  useEffect(() => {
    const water = waterRef.current
    if (water) water.appearance.material.uniforms.animationSpeed = animateWater ? WATER_ANIMATION_SPEED : 0
  }, [animateWater, waterStatus])

  // Street view: follow mode/position from App
  useEffect(() => {
    modeRef.current = mode
    const sv = streetViewRef.current
    if (!sv) return
    if (mode === 'street' && streetPosition) sv.goTo(streetPosition, eyeHeightRef.current)
    else if (mode === 'aerial') {
      sv.exit()
      staffRef.current?.clear()
    }
  }, [mode, streetPosition])

  useEffect(() => {
    eyeHeightRef.current = eyeHeight
    streetViewRef.current?.setEyeHeight(eyeHeight)
  }, [eyeHeight])

  // Base map
  useEffect(() => {
    const viewer = viewerRef.current
    if (viewer) setBasemap(viewer, basemap).catch((e) => console.error('Base map failed:', e?.message ?? e))
  }, [basemap])

  // Bird's-eye tour
  useEffect(() => {
    const tour = tourRef.current
    if (!tour) return
    if (tourState === 'playing') tour.start()
    else if (tourState === 'paused') tour.pause()
    else tour.stop()
  }, [tourState])

  // Water marks on flooded buildings (built once, on first use)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !buildingsRef.current) return
    if (waterMarksRef.current) {
      waterMarksRef.current.show = showWaterMarks
      return
    }
    if (!showWaterMarks) return
    let cancelled = false
    addWaterMarks(viewer, buildingsRef.current)
      .then((source) => {
        if (!source || viewer.isDestroyed()) return
        if (cancelled) return viewer.dataSources.remove(source, true)
        waterMarksRef.current = source
      })
      .catch((e) => console.error('Water marks failed:', e?.message ?? e))
    return () => {
      cancelled = true
    }
  }, [showWaterMarks, buildingsReady])

  // "Replay flooding": each new token starts the animation again
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !replayToken || !waterRef.current) return
    return replayFlooding(viewer, waterRef.current)
  }, [replayToken, waterStatus])

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
      <div ref={containerRef} className={`cesium-container mode-${mode}`} />
      {showWater && waterStatus !== 'ready' && (
        <div className={`viewer-status ${waterStatus}`}>
          {waterStatus === 'loading' ? 'Building water surface…' : 'Water surface failed to load (see console)'}
        </div>
      )}
    </>
  )
}
