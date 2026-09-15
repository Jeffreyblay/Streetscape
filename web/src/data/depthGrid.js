// Shared loader + point lookup for data/processed/depth_grid.json
// (regular WGS84 grid, row-major from the north-west corner, metres, null = dry)

let gridPromise = null

/** Fetch the grid once; later calls reuse the same promise. */
export function loadDepthGrid() {
  gridPromise ??= fetch('/data/depth_grid.json').then((r) => {
    if (!r.ok) throw new Error(`depth_grid.json: HTTP ${r.status}`)
    return r.json()
  })
  return gridPromise
}

/** Water depth in metres at a point, 0 if dry, null if outside the grid. */
export function depthAt(grid, lon, lat) {
  const col = Math.floor((lon - grid.west) / grid.dlon)
  const row = Math.floor((grid.north - lat) / grid.dlat)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  return grid.values[row * grid.cols + col] ?? 0
}
