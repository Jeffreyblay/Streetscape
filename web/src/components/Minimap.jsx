// Overview of the study area with the viewer's position and facing direction.

export default function Minimap({ overlay, position, heading }) {
  if (!overlay || !position) return null
  const { west, south, east, north } = overlay.bounds
  const left = (100 * (position.lon - west)) / (east - west)
  const top = (100 * (north - position.lat)) / (north - south)
  if (left < 0 || left > 100 || top < 0 || top > 100) return null

  return (
    <div className="minimap">
      <img src={`/data/${overlay.image}`} alt="Study area" />
      <div className="minimap-you" style={{ left: `${left}%`, top: `${top}%` }}>
        <svg viewBox="-12 -12 24 24" style={{ transform: `rotate(${heading}deg)` }}>
          <path className="cone" d="M0 0 L-7 -12 A13 13 0 0 1 7 -12 Z" />
          <circle className="dot" cx="0" cy="0" r="3.2" />
        </svg>
      </div>
    </div>
  )
}
