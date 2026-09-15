import { useEffect, useState } from 'react'
import CesiumViewer from './components/CesiumViewer.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import { depthAt, loadDepthGrid } from './data/depthGrid.js'
import './App.css'

const hasToken = Boolean(import.meta.env.VITE_CESIUM_TOKEN)

export default function App() {
  const [stats, setStats] = useState(null)
  const [overlay, setOverlay] = useState(null)
  const [grid, setGrid] = useState(null)
  const [building, setBuilding] = useState(null)
  const [layers, setLayers] = useState({ showWater: true, animateWater: true, showDepthColors: true })
  const [mode, setMode] = useState('aerial') // 'aerial' | 'picking' | 'street'
  const [streetPosition, setStreetPosition] = useState(null)
  const [eyeHeight, setEyeHeight] = useState(1.7)
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

  const handlePick = (pos) => {
    setStreetPosition(pos)
    setMode('street')
  }

  // Esc cancels picking or leaves street view
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && mode !== 'aerial') exitStreetView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const depthHere = grid && streetPosition ? depthAt(grid, streetPosition.lon, streetPosition.lat) : null

  return (
    <div className="app">
      <header className="header">
        <h1>Streetscape</h1>
        <span className="subtitle">Flood depth · eastern North Carolina</span>
      </header>
      <StatsPanel
        stats={stats}
        overlay={overlay}
        building={building}
        onClearBuilding={() => setBuilding(null)}
        layers={layers}
        onLayersChange={setLayers}
        street={
          mode === 'street'
            ? { depth: depthHere, eyeHeight, onEyeHeightChange: setEyeHeight, onExit: exitStreetView }
            : null
        }
        error={error}
      />
      <main className="viewer">
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
            />
            <div className="toolbar">
              {mode === 'aerial' && (
                <button className="btn" onClick={() => setMode('picking')}>📍 Street view</button>
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
