const M_TO_FT = 3.28084
const PERSON_M = 1.7

export const EYE_MIN_M = 0.5
export const EYE_MAX_M = 30
const PRESETS = [
  { label: 'Child', m: 1.1 },
  { label: 'Adult', m: 1.7 },
  { label: '2nd floor', m: 4.5 },
  { label: 'Rooftop', m: 8 },
]

const ft = (m) => (m * M_TO_FT).toFixed(1)

/** Where the water would reach on a standing adult. */
function bodyLevel(depth) {
  if (!depth) return 'Dry here'
  if (depth < 0.15) return 'Ankle-deep'
  if (depth < 0.5) return 'Knee-deep'
  if (depth < 0.95) return 'Waist-deep'
  if (depth < 1.35) return 'Chest-deep'
  if (depth < PERSON_M) return 'Neck-deep'
  return "Over an adult's head"
}

/** Side view: ground, a 1.7 m person, the water level and the camera's eye height. */
function WaterGauge({ depth, eyeHeight }) {
  const W = 220
  const H = 150
  const pad = 14
  const top = Math.max(2.2, depth * 1.15, eyeHeight * 1.15)
  const y = (m) => H - pad - (m / top) * (H - 2 * pad)
  const ground = y(0)
  const person = { x: 70, head: y(PERSON_M) }
  const r = Math.max(3, (ground - person.head) * 0.08)

  return (
    <svg className="gauge" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Water ${ft(depth)} ft deep, eye height ${ft(eyeHeight)} ft`}>
      {/* person silhouette */}
      <g className="gauge-person">
        <circle cx={person.x} cy={person.head + r} r={r} />
        <rect x={person.x - r * 0.9} y={person.head + 2 * r} width={r * 1.8} height={ground - person.head - 2 * r} rx={r * 0.6} />
      </g>
      {/* water */}
      {depth > 0 && <rect className="gauge-water" x={pad} y={y(depth)} width={W - 2 * pad} height={ground - y(depth)} />}
      {depth > 0 && <text className="gauge-label water" x={W - pad} y={y(depth) - 4} textAnchor="end">water {ft(depth)} ft</text>}
      {/* eye height */}
      <line className="gauge-eye" x1={pad} x2={W - pad} y1={y(eyeHeight)} y2={y(eyeHeight)} />
      <text className="gauge-label eye" x={pad + 2} y={y(eyeHeight) - 4}>eye {ft(eyeHeight)} ft</text>
      {/* ground */}
      <line className="gauge-ground" x1={pad} x2={W - pad} y1={ground} y2={ground} />
    </svg>
  )
}

// The street view panel: depth here, the gauge, the height slider and the exit button.
export default function StreetViewCard({ depth, eyeHeight, onEyeHeightChange, onExit }) {
  const d = depth ?? 0
  const underwater = eyeHeight < d

  return (
    <section className="card street-card">
      <div className="card-head">
        <h2>Street view</h2>
        <button className="btn-small" onClick={onExit}>Exit to map</button>
      </div>

      <p className="street-depth">
        <span className="big">{ft(d)} ft</span> of water here
        <span className="level">{depth == null ? 'Outside study area' : bodyLevel(d)}</span>
      </p>

      <WaterGauge depth={d} eyeHeight={eyeHeight} />
      {underwater && <p className="warn">Your eye is below the water surface.</p>}

      <label className="slider">
        <span>
          Eye height <strong>{eyeHeight.toFixed(1)} m</strong> ({ft(eyeHeight)} ft)
        </span>
        <input
          type="range"
          min={EYE_MIN_M}
          max={EYE_MAX_M}
          step={0.1}
          value={eyeHeight}
          onChange={(e) => onEyeHeightChange(Number(e.target.value))}
        />
      </label>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.label} className={`chip ${Math.abs(eyeHeight - p.m) < 0.05 ? 'on' : ''}`}
            onClick={() => onEyeHeightChange(p.m)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="hint small">Drag to look around · click the ground to walk · Esc to exit</p>
    </section>
  )
}
