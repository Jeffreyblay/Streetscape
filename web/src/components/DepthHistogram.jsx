// Bar chart of flooded area by depth band, coloured with the same ramp as the map.

/** Colour at a depth, interpolated between the overlay legend stops. */
function rampColor(legend, depth) {
  const i = Math.max(1, legend.findIndex((s) => s.depth_ft >= depth))
  const lo = legend[i - 1]
  const hi = legend[i] ?? legend[legend.length - 1]
  const t = hi.depth_ft === lo.depth_ft ? 0 : (depth - lo.depth_ft) / (hi.depth_ft - lo.depth_ft)
  const ch = (k) => Math.round(lo.rgba[k] + t * (hi.rgba[k] - lo.rgba[k]))
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`
}

export default function DepthHistogram({ histogram, legend }) {
  const { bin_edges_ft: edges, counts } = histogram
  const total = counts.reduce((a, b) => a + b, 0)
  const max = Math.max(...counts)
  const H = 90

  return (
    <div className="histogram">
      <div className="bars" style={{ height: H }}>
        {counts.map((n, i) => {
          const pct = (100 * n) / total
          return (
            <div
              key={edges[i]}
              className="bar"
              style={{
                height: `${Math.max(1, (100 * n) / max)}%`,
                background: legend ? rampColor(legend, (edges[i] + edges[i + 1]) / 2) : 'var(--accent)',
              }}
              title={`${edges[i]}–${edges[i + 1]} ft: ${pct.toFixed(1)}% of flooded area`}
            />
          )
        })}
      </div>
      <div className="bar-labels">
        {edges.slice(0, -1).map((e) => (
          <span key={e}>{e}</span>
        ))}
        <span>{edges[edges.length - 1]}</span>
      </div>
      <p className="caption">Share of flooded area by depth (ft)</p>
    </div>
  )
}
