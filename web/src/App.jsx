import { useEffect, useRef, useState } from 'react'
import CesiumViewer from './components/CesiumViewer.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import Minimap from './components/Minimap.jsx'
import BuildingCard from './components/BuildingCard.jsx'
import { BASEMAPS } from './cesium/layers.js'
import { EYE_MAX_M } from './components/StreetViewCard.jsx'
import { depthAt, loadDepthGrid } from './data/depthGrid.js'
import './App.css'

const hasToken = Boolean(import.meta.env.VITE_CESIUM_TOKEN)
const SURFACE_CLEARANCE_M = 0.6 // how far above the water the eye is lifted
const DEFAULT_EYE_M = 1.7 // standing adult

// The whole dashboard: loads the data and keeps track of what the user is doing.
export default function App() {
  const [stats, setStats] = useState(null)
  const [overlay, setOverlay] = useState(null)
  const [grid, setGrid] = useState(null)
  const [building, setBuilding] = useState(null)
  const [layers, setLayers] = useState({
    showWater: true,
    animateWater: true,
    colorWaterByDepth: true,
    showDepthColors: false,
    showWaterMarks: false,
  })
  const [mode, setMode] = useState('aerial') // 'aerial' | 'picking' | 'street'
  const [streetPosition, setStreetPosition] = useState(null)
  const [eyeHeight, setEyeHeight] = useState(DEFAULT_EYE_M)
  const [heading, setHeading] = useState(0)
  const [basemap, setBasemap] = useState('streets')
  const [tourState, setTourState] = useState('off') // 'off' | 'playing' | 'paused'
  const [replayToken, setReplayToken] = useState(0)
  const [autoRaised, setAutoRaised] = useState(false)
  const popupRef = useRef(null) // Cesium moves this to follow the selected building
  const [error, setError] = useState(null)

  // Load the prepared data (served from data/processed by vite.config.js)
  useEffect(() => {
    Promise.all([
      fetch('/data/stats.json').then((r) => r.json()),
      fetch('/data/flood_overlay.json').then((r) => r.json()),
      loadDepthGrid(),
    ])
      .then(([s, o, g]) => {
        setStats(s)
        setOverlay(o)
        setGrid(g)
      })
      .catch((e) => setError(`Could not load data: ${e.message}`))
  }, [])

  const exitStreetView = () => {
    setMode('aerial')
    setStreetPosition(null)
  }

  // Drops the water below ground and raises it again, so the flood arrives while you watch.
  const animateFlooding = () => setReplayToken((t) => t + 1)

  const startPicking = () => {
    setTourState('off')
    setMode('picking')
  }

  const handlePick = (pos) => {
    setStreetPosition(pos)
    setMode('street')
    // Most of this flood is over head height, so surface instead of arriving underwater
    const depth = grid ? depthAt(grid, pos.lon, pos.lat) : null
    const raise = depth != null && depth > eyeHeight
    if (raise) {
      setEyeHeight(Math.min(EYE_MAX_M, Math.round((depth + SURFACE_CLEARANCE_M) * 10) / 10))
    } else if (autoRaised) {
      setEyeHeight(DEFAULT_EYE_M) // back to standing height once the water is shallow again
    }
    setAutoRaised(raise)
  }

  // Any manual height change means the viewer has taken over
  const changeEyeHeight = (metres) => {
    setEyeHeight(metres)
    setAutoRaised(false)
  }

  // Esc cancels picking or leaves street view
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (tourState !== 'off') setTourState('off')
      if (mode !== 'aerial') exitStreetView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, tourState])

  const loading = !stats && !error
  const depthHere = grid && streetPosition ? depthAt(grid, streetPosition.lon, streetPosition.lat) : null
  const underwater = mode === 'street' && depthHere != null && eyeHeight < depthHere

  return (
    <div className="app">
      <header className="header">
        <h1>Streetscape</h1>
        <span className="subtitle">
          3D immersive floodwater depth dashboard · Hanchey Store, eastern North Carolina
        </span>
      </header>
      <StatsPanel
        stats={stats}
        overlay={overlay}
        layers={layers}
        onLayersChange={setLayers}
        basemap={basemap}
        onBasemapChange={setBasemap}
        basemaps={BASEMAPS}
        street={
          mode === 'street'
            ? {
                depth: depthHere,
                eyeHeight,
                onEyeHeightChange: changeEyeHeight,
                onExit: exitStreetView,
                autoRaised,
              }
            : null
        }
        error={error}
      />
      <main className="viewer">
        {loading && (
          <div className="splash">
            <div className="spinner" />
            <p>Loading flood data…</p>
          </div>
        )}
        {hasToken ? (
          <>
            <CesiumViewer
              overlay={overlay}
              selectedId={building?.id}
              onSelectBuilding={setBuilding}
              {...layers}
              mode={mode}
              streetPosition={streetPosition}
              eyeHeight={eyeHeight}
              onPickLocation={handlePick}
              onHeadingChange={setHeading}
              basemap={basemap}
              tourState={tourState}
              onTourEnd={() => setTourState('off')}
              popupRef={popupRef}
              showWaterMarks={layers.showWaterMarks}
              replayToken={replayToken}
            />
            <div className="popup" ref={popupRef} style={{ visibility: 'hidden' }}>
              {building && <BuildingCard building={building} onClose={() => setBuilding(null)} />}
            </div>
            {underwater && (
              <div className="underwater" aria-hidden="true">
                <span>Underwater — raise your eye height to surface</span>
              </div>
            )}
            {mode === 'street' && (
              <Minimap overlay={overlay} position={streetPosition} heading={heading} />
            )}
            <div className="toolbar">
              {mode === 'aerial' && tourState === 'off' && (
                <>
                  <button className="btn" onClick={startPicking}>📍 Street view</button>
                  <button className="btn" onClick={() => setTourState('playing')}>🕊 Fly through</button>
                  <button className="btn" onClick={animateFlooding} disabled={!layers.showWater}>
                    ▶ Animate flooding
                  </button>
                </>
              )}
              {mode === 'aerial' && tourState !== 'off' && (
                <>
                  <button className="btn" onClick={() => setTourState(tourState === 'playing' ? 'paused' : 'playing')}>
                    {tourState === 'playing' ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button className="btn ghost" onClick={() => setTourState('off')}>Stop tour</button>
                </>
              )}
              {mode === 'picking' && (
                <>
                  <span className="toolbar-hint">Click a spot on the map to stand there</span>
                  <button className="btn ghost" onClick={exitStreetView}>Cancel</button>
                </>
              )}
              {mode === 'street' && (
                <>
                  <button className="btn" onClick={exitStreetView}>⤺ Exit to map</button>
                  <button className="btn" onClick={animateFlooding} disabled={!layers.showWater}>
                    ▶ Animate flooding
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="error pad">
            No Cesium token found. Add VITE_CESIUM_TOKEN to web/.env and restart <code>npm run dev</code>.
          </p>
        )}
      </main>
    </div>
  )
}
