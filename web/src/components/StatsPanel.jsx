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

export default function StatsPanel({ stats, error }) {
  if (error) return <aside className="panel"><p className="error">{error}</p></aside>
  if (!stats) return <aside className="panel"><p className="muted">Loading stats…</p></aside>

  const { depth_ft, inundated_area, buildings } = stats

  return (
    <aside className="panel">
      <section>
        <h2>Flood depth</h2>
        <Stat label="Maximum" value={depth_ft.max.toFixed(1)} unit="ft" />
        <Stat label="Mean" value={depth_ft.mean.toFixed(1)} unit="ft" />
        <Stat label="Minimum" value={depth_ft.min.toFixed(2)} unit="ft" />
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
    </aside>
  )
}
