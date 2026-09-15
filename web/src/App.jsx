import { useEffect, useState } from 'react'
import CesiumViewer from './components/CesiumViewer.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import './App.css'

const hasToken = Boolean(import.meta.env.VITE_CESIUM_TOKEN)

export default function App() {
  const [stats, setStats] = useState(null)
  const [overlay, setOverlay] = useState(null)
  const [building, setBuilding] = useState(null)
  const [layers, setLayers] = useState({ showWater: true, animateWater: true, showDepthColors: true })
  const [error, setError] = useState(null)

  // Load the prepared data (served from data/processed by vite.config.js)
  useEffect(() => {
    Promise.all([
      fetch('/data/stats.json').then((r) => r.json()),
      fetch('/data/flood_overlay.json').then((r) => r.json()),
    ])
      .then(([s, o]) => {
        setStats(s)
        setOverlay(o)
      })
      .catch((e) => setError(`Could not load data: ${e.message}`))
  }, [])

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
        error={error}
      />
      <main className="viewer">
        {hasToken ? (
          <CesiumViewer
            overlay={overlay}
            selectedId={building?.id}
            onSelectBuilding={setBuilding}
            {...layers}
          />
        ) : (
          <p className="error pad">
            No Cesium token found. Add VITE_CESIUM_TOKEN to web/.env and restart <code>npm run dev</code>.
          </p>
        )}
      </main>
    </div>
  )
}
