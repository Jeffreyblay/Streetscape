import Controls from './Controls.jsx'
import StreetViewCard from './StreetViewCard.jsx'

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </span>
    </div>
  )
}

function DepthLegend({ legend }) {
  const max = legend[legend.length - 1].depth_ft
  // Non-linear stops: spread labels evenly, colour each stop at its own position
  const gradient = legend
    .map((s, i) => `rgba(${s.rgba.slice(0, 3).join(',')},1) ${(100 * i) / (legend.length - 1)}%`)
    .join(', ')
  return (
    <div className="legend">
      <div className="legend-bar" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="legend-labels">
        {legend.map((s) => (
          <span key={s.depth_ft}>{s.depth_ft === max ? `${s.depth_ft}+` : s.depth_ft}</span>
        ))}
      </div>
      <div className="legend-keys">
        <span><i className="swatch flooded" /> Flooded building</span>
        <span><i className="swatch dry" /> Dry building</span>
      </div>
    </div>
  )
}

function BuildingCard({ building, onClose }) {
  const b = building
  return (
    <section className="card">
      <div className="card-head">
        <h2>Building {b.id}</h2>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className={b.flooded ? 'badge flooded' : 'badge dry'}>{b.flooded ? 'Flooded' : 'Dry'}</p>
      <Stat label="Max depth at walls" value={b.depthMaxFt.toFixed(1)} unit="ft" />
      <Stat label="Mean depth (wet part)" value={b.depthMeanFt.toFixed(1)} unit="ft" />
      <Stat label="Footprint wet" value={b.wetPct.toFixed(0)} unit="%" />
      <Stat label="Est. height" value={b.heightFt} unit="ft" />
      <Stat label="Year built" value={b.yearBuilt && b.yearBuilt !== '0' ? b.yearBuilt : '—'} />
    </section>
  )
}

export default function StatsPanel({
  stats,
  overlay,
  building,
  onClearBuilding,
  layers,
  onLayersChange,
  street,
  error,
}) {
  if (error) return <aside className="panel"><p className="error">{error}</p></aside>
  if (!stats) return <aside className="panel"><p className="muted">Loading stats…</p></aside>

  const { depth_ft, inundated_area, buildings } = stats

  return (
    <aside className="panel">
      {street && <StreetViewCard {...street} />}
      {building && <BuildingCard building={building} onClose={onClearBuilding} />}

      <section>
        <h2>Flood depth</h2>
        <Stat label="Maximum" value={depth_ft.max.toFixed(1)} unit="ft" />
        <Stat label="Mean" value={depth_ft.mean.toFixed(1)} unit="ft" />
        <Stat label="Minimum" value={depth_ft.min.toFixed(2)} unit="ft" />
        {overlay && <DepthLegend legend={overlay.legend} />}
      </section>

      <section>
        <h2>Buildings</h2>
        <Stat
          label="Affected"
          value={`${buildings.flooded} / ${buildings.total}`}
          unit={`(${buildings.pct_flooded.toFixed(0)}%)`}
        />
        <Stat label="Deepest at a building" value={buildings.max_depth_ft.toFixed(1)} unit="ft" />
      </section>

      <section>
        <h2>Inundated area</h2>
        <Stat label="Area" value={inundated_area.acres.toFixed(0)} unit="acres" />
        <Stat label="" value={inundated_area.km2.toFixed(2)} unit="km²" />
      </section>

      <Controls layers={layers} onChange={onLayersChange} />

      {!building && <p className="hint">Click a building to see its flood depth.</p>}
    </aside>
  )
}
