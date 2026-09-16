import { useEffect, useState } from 'react'
import CesiumViewer from './components/CesiumViewer.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import Minimap from './components/Minimap.jsx'
import { BASEMAPS } from './cesium/layers.js'
import { depthAt, loadDepthGrid } from './data/depthGrid.js'
import './App.css'

const hasToken = Boolean(import.meta.env.VITE_CESIUM_TOKEN)

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
  const [eyeHeight, setEyeHeight] = useState(1.7)
  const [heading, setHeading] = useState(0)
  const [basemap, setBasemap] = useState('satellite')
  const [tourState, setTourState] = useState('off') // 'off' | 'playing' | 'paused'
  const [replayToken, setReplayToken] = useState(0)
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

  const startPicking = () => {
    setTourState('off')
    setMode('picking')
  }

  const handlePick = (pos) => {
    setStreetPosition(pos)
    setMode('street')
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
        building={building}
        onClearBuilding={() => setBuilding(null)}
        layers={layers}
        onLayersChange={setLayers}
        basemap={basemap}
        onBasemapChange={setBasemap}
        basemaps={BASEMAPS}
        onReplay={() => setReplayToken((t) => t + 1)}
        street={
          mode === 'street'
            ? { depth: depthHere, eyeHeight, onEyeHeightChange: setEyeHeight, onExit: exitStreetView }
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
              showWaterMarks={layers.showWaterMarks}
              replayToken={replayToken}
            />
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
                <button className="btn" onClick={exitStreetView}>⤺ Exit to map</button>
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
