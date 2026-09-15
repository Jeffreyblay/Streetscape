import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

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

export default function CesiumViewer({ bounds }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)

  // Create the viewer once; destroy it on unmount (Cesium manages its own render loop)
  useEffect(() => {
    const viewer = new Cesium.Viewer(containerRef.current, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
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
    viewerRef.current = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (viewerRef.current && bounds) flyToStudyArea(viewerRef.current, bounds)
  }, [bounds])

  return <div ref={containerRef} className="cesium-container" />
}
