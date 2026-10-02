import Stat from './Stat.jsx'

// Details for the building you clicked, shown beside it in the 3D view.
export default function BuildingCard({ building, onClose }) {
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
