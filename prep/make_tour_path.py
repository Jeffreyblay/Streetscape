"""
Step 8 of the data pipeline: flight path for the bird's-eye tour.

Finds the deep water (the stream channel), fits a centreline through it, and
writes data/processed/tour_path.json - an ordered list of WGS84 waypoints the
web app flies along.

Method: take cells deeper than DEEP_PCT of the maximum, project them onto their
principal axis (the direction the channel runs), then take the median position
of each slice along that axis. Robust to side channels and isolated ponds.
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform

ROOT = Path(__file__).resolve().parents[1]
DEPTH = ROOT / "data" / "raster" / "depth.tif"
OUT = ROOT / "data" / "processed" / "tour_path.json"

DEEP_PCT = 0.35     # keep cells deeper than this share of max depth
SLICES = 14         # waypoints along the channel
MARGIN = 0.06       # extend the path past both ends, as a share of its length


def main():
    """Traces a line down the middle of the deep water to use as the fly-through route."""
    with rasterio.open(DEPTH) as src:
        depth = src.read(1, masked=True)
        rows, cols = np.nonzero(~depth.mask & (depth.filled(0) > depth.max() * DEEP_PCT))
        xs, ys = rasterio.transform.xy(src.transform, rows, cols)
        crs = src.crs

    pts = np.column_stack([xs, ys])
    centre = pts.mean(axis=0)
    # Principal axis = direction of greatest spread (the channel's direction)
    axis = np.linalg.svd(pts - centre, full_matrices=False)[2][0]
    t = (pts - centre) @ axis

    # Median cross-channel position within each slice along the axis
    edges = np.linspace(t.min(), t.max(), SLICES + 1)
    way = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = pts[(t >= lo) & (t <= hi)]
        if len(sel) >= 20:
            way.append(np.median(sel, axis=0))
    way = np.array(way)

    # Light smoothing, then extend slightly past each end for a run-in / run-out
    smooth = way.copy()
    smooth[1:-1] = (way[:-2] + 2 * way[1:-1] + way[2:]) / 4
    span = smooth[-1] - smooth[0]
    smooth = np.vstack([smooth[0] - span * MARGIN, smooth, smooth[-1] + span * MARGIN])

    lons, lats = warp_transform(crs, "EPSG:4326", smooth[:, 0], smooth[:, 1])
    path = [{"lon": round(lo, 7), "lat": round(la, 7)} for lo, la in zip(lons, lats)]

    length_m = float(np.sum(np.linalg.norm(np.diff(smooth, axis=0), axis=1)) * 0.3048)
    OUT.write_text(json.dumps({"waypoints": path, "length_m": round(length_m)}, indent=1))

    print(f"Deep cells used: {len(pts):,} (> {depth.max() * DEEP_PCT:.1f} ft)")
    print(f"Waypoints: {len(path)}, path length ~{length_m:.0f} m")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
