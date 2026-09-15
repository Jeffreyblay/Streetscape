"""
Step 3 of the data pipeline: flood depth per building.

For each footprint, reads the depth raster cells inside it and computes:
  depth_max_ft  - deepest water touching the footprint
  depth_mean_ft - average depth over the wet part of the footprint
  wet_pct       - % of the footprint's cells that are wet
  flooded       - True if depth_max_ft > FLOOD_THRESHOLD_FT

Also adds metre versions of height and depth (Cesium works in metres),
then writes:
  data/processed/buildings_depth.gpkg  - NC State Plane (ft), for ArcGIS / analysis
  data/processed/buildings.geojson     - WGS84, for the web app
"""
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.mask import mask

ROOT = Path(__file__).resolve().parents[1]
BUILDINGS = ROOT / "data" / "building_footprint" / "building_footprint_HS.shp"
DEPTH = ROOT / "data" / "raster" / "depth.tif"
OUT_DIR = ROOT / "data" / "processed"

FLOOD_THRESHOLD_FT = 0.1  # ignore raster-edge noise
FT_TO_M = 0.3048


def zonal_depth(geom, src):
    """Return (max, mean, wet_pct) of depth cells inside one polygon."""
    try:
        # Masked where the cell is outside the polygon OR dry (nodata)
        data, transform = mask(src, [geom], crop=True, filled=False)
    except ValueError:  # polygon doesn't overlap the raster
        return 0.0, 0.0, 0.0

    wet = data[0].compressed()
    if wet.size == 0:
        return 0.0, 0.0, 0.0

    # Count all cells inside the polygon (wet or dry) for the wet percentage
    outside = geometry_mask([geom], out_shape=data.shape[1:], transform=transform)
    n_inside = max(np.count_nonzero(~outside), wet.size)
    return float(wet.max()), float(wet.mean()), 100.0 * wet.size / n_inside


def main():
    bldgs = gpd.read_file(BUILDINGS)

    with rasterio.open(DEPTH) as src:
        if bldgs.crs != src.crs:
            bldgs = bldgs.to_crs(src.crs)
        stats = [zonal_depth(g, src) for g in bldgs.geometry]

    bldgs["depth_max_ft"] = [round(s[0], 2) for s in stats]
    bldgs["depth_mean_ft"] = [round(s[1], 2) for s in stats]
    bldgs["wet_pct"] = [round(s[2], 1) for s in stats]
    bldgs["flooded"] = bldgs["depth_max_ft"] > FLOOD_THRESHOLD_FT

    # Metre versions for Cesium
    bldgs["height_m"] = (bldgs["estimate_h"] * FT_TO_M).round(2)
    bldgs["depth_max_m"] = (bldgs["depth_max_ft"] * FT_TO_M).round(2)
    bldgs["depth_mean_m"] = (bldgs["depth_mean_ft"] * FT_TO_M).round(2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bldgs.to_file(OUT_DIR / "buildings_depth.gpkg", driver="GPKG")

    web_cols = ["BLDG_ID", "YEAR_BUILT", "estimate_h", "height_m",
                "depth_max_ft", "depth_mean_ft", "depth_max_m", "depth_mean_m",
                "wet_pct", "flooded", "geometry"]
    bldgs[web_cols].to_crs("EPSG:4326").to_file(
        OUT_DIR / "buildings.geojson", driver="GeoJSON")

    # Summary
    f = bldgs[bldgs["flooded"]]
    print(f"Buildings:         {len(bldgs)}")
    print(f"Flooded (>{FLOOD_THRESHOLD_FT} ft): {len(f)}")
    print(f"Max depth at bldg: {bldgs['depth_max_ft'].max():.2f} ft")
    print(f"Mean of max depth (flooded): {f['depth_max_ft'].mean():.2f} ft")
    print(f"Wrote {OUT_DIR / 'buildings_depth.gpkg'}")
    print(f"Wrote {OUT_DIR / 'buildings.geojson'}")


if __name__ == "__main__":
    main()
