"""
Step 7 of the data pipeline: precomputed summary statistics.

Reads the depth raster and the processed buildings layer, and writes
data/processed/stats.json for the dashboard's stats panel.

Run building_depth.py first - this script reads its output.
"""
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
DEPTH = ROOT / "data" / "raster" / "depth.tif"
BUILDINGS = ROOT / "data" / "processed" / "buildings.geojson"
OUT = ROOT / "data" / "processed" / "stats.json"

# Uneven bins: 99% of wet cells are under ~8.4 ft
BIN_EDGES_FT = [0, 1, 2, 3, 4, 6, 8, 12, 24]
SQFT_PER_ACRE = 43_560
SQFT_TO_M2 = 0.09290304


def r2(x):
    """Round and convert numpy numbers to plain floats for JSON."""
    return round(float(x), 2)


def main():
    """Works out the summary numbers and the depth histogram for the panel."""
    with rasterio.open(DEPTH) as src:
        wet = src.read(1, masked=True).compressed()  # wet cells only
        cell_w, cell_h = src.res                     # feet (EPSG:2264)

    area_sqft = wet.size * cell_w * cell_h
    counts, _ = np.histogram(wet, bins=BIN_EDGES_FT)

    bldgs = gpd.read_file(BUILDINGS)
    n_total = len(bldgs)
    n_flooded = int(bldgs["flooded"].sum())

    stats = {
        "depth_ft": {
            "max": r2(wet.max()),
            "min": r2(wet.min()),
            "mean": r2(wet.mean()),
            "median": r2(np.median(wet)),
        },
        "inundated_area": {
            "wet_cells": int(wet.size),
            "sq_ft": round(float(area_sqft)),
            "acres": r2(area_sqft / SQFT_PER_ACRE),
            "km2": r2(area_sqft * SQFT_TO_M2 / 1e6),
        },
        "buildings": {
            "total": n_total,
            "flooded": n_flooded,
            "pct_flooded": r2(100 * n_flooded / n_total),
            "max_depth_ft": r2(bldgs["depth_max_ft"].max()),
        },
        "histogram": {
            "bin_edges_ft": BIN_EDGES_FT,
            "counts": [int(c) for c in counts],
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
