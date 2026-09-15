"""
Step 6b of the data pipeline: downsampled depth grid for the web app.

Used for:
  - point queries ("depth where you're standing") without a server
  - building the 3D water surface mesh (Phase 3)

Writes data/processed/depth_grid.json: a regular WGS84 grid, row-major from
the north-west corner, depth in METRES, null = dry.

Browser lookup:
  col = floor((lon - west) / dlon)
  row = floor((north - lat) / dlat)
  depth = values[row * cols + col]
"""
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds

ROOT = Path(__file__).resolve().parents[1]
DEPTH = ROOT / "data" / "raster" / "depth.tif"
OUT = ROOT / "data" / "processed" / "depth_grid.json"
DST_CRS = "EPSG:4326"

CELL_M = 7.62           # ~25 ft target cell size
MIN_WET_FRACTION = 0.5  # coarse cell counts as wet only if >= half its area is wet
FT_TO_M = 0.3048


def main():
    with rasterio.open(DEPTH) as src:
        west, south, east, north = transform_bounds(src.crs, DST_CRS, *src.bounds)

        # Degrees per cell at this latitude (lon degrees shrink with cos(lat))
        lat_mid = math.radians((south + north) / 2)
        dlat = CELL_M / 111_320
        dlon = CELL_M / (111_320 * math.cos(lat_mid))
        cols = math.ceil((east - west) / dlon)
        rows = math.ceil((north - south) / dlat)
        dst_transform = from_origin(west, north, dlon, dlat)

        depth_ft = src.read(1, masked=True)
        wet = (~depth_ft.mask).astype("float32")

        # Mean depth of the wet fine cells inside each coarse cell
        mean_depth = np.full((rows, cols), np.nan, dtype="float32")
        reproject(
            source=depth_ft.filled(src.nodata), destination=mean_depth,
            src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
            dst_transform=dst_transform, dst_crs=DST_CRS, dst_nodata=np.nan,
            resampling=Resampling.average)

        # Fraction of each coarse cell that is wet
        wet_frac = np.zeros((rows, cols), dtype="float32")
        reproject(
            source=wet, destination=wet_frac,
            src_transform=src.transform, src_crs=src.crs,
            dst_transform=dst_transform, dst_crs=DST_CRS,
            resampling=Resampling.average)

    depth_m = np.where(wet_frac >= MIN_WET_FRACTION, mean_depth * FT_TO_M, np.nan)

    values = [None if np.isnan(v) else round(float(v), 2) for v in depth_m.ravel()]
    grid = {
        "crs": DST_CRS,
        "units": "m",
        "origin": "north-west, row-major",
        "west": west, "north": north,
        "dlon": dlon, "dlat": dlat,
        "cols": cols, "rows": rows,
        "values": values,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(grid, separators=(",", ":")))

    n_wet = int(np.count_nonzero(~np.isnan(depth_m)))
    wet_area_acres = n_wet * CELL_M**2 / 4046.86
    print(f"Grid: {cols} x {rows} = {cols * rows:,} cells (~{CELL_M} m each)")
    print(f"Wet cells: {n_wet:,} (~{wet_area_acres:.0f} acres; full-res raster = 322 acres)")
    print(f"Depth range: {np.nanmin(depth_m):.2f} - {np.nanmax(depth_m):.2f} m")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
