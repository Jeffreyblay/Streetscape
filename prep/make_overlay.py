"""
Step 6 of the data pipeline: flood overlay image for Cesium.

Reprojects the depth raster to WGS84, colours it with a depth ramp, and writes:
  data/processed/flood_depth.png    - RGBA overlay (dry cells transparent)
  data/processed/flood_overlay.json - bounds (degrees) + legend for the web app

Cesium's SingleTileImageryProvider stretches an image linearly between
lon/lat bounds, so the image must be in EPSG:4326 to line up.
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import Resampling, calculate_default_transform, reproject

ROOT = Path(__file__).resolve().parents[1]
DEPTH = ROOT / "data" / "raster" / "depth.tif"
OUT_DIR = ROOT / "data" / "processed"
DST_CRS = "EPSG:4326"

# Colour ramp stops: (depth_ft, (R, G, B, A)). Colours are interpolated between stops.
RAMP = [
    (0.0,  (198, 236, 250, 140)),   # very shallow - light cyan, most transparent
    (1.0,  (120, 198, 235, 160)),
    (2.0,  (58, 150, 214, 175)),
    (4.0,  (30, 100, 180, 190)),
    (8.0,  (18, 60, 140, 205)),
    (24.0, (8, 29, 88, 220)),       # channel - dark navy, most opaque
]


def to_wgs84(src):
    """Reproject band 1 to WGS84. Returns (array with NaN for dry, transform)."""
    transform, width, height = calculate_default_transform(
        src.crs, DST_CRS, src.width, src.height, *src.bounds)
    dst = np.full((height, width), np.nan, dtype="float32")
    reproject(
        source=rasterio.band(src, 1), destination=dst,
        src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
        dst_transform=transform, dst_crs=DST_CRS, dst_nodata=np.nan,
        resampling=Resampling.bilinear)
    return dst, transform


def colourize(depth):
    """Map depth (ft, NaN = dry) to an RGBA uint8 image."""
    stops = np.array([s[0] for s in RAMP])
    colours = np.array([s[1] for s in RAMP], dtype=float)
    wet = ~np.isnan(depth)
    d = np.where(wet, depth, 0)

    rgba = np.zeros(depth.shape + (4,), dtype=np.uint8)
    for ch in range(4):
        rgba[..., ch] = np.interp(d, stops, colours[:, ch]).round()
    rgba[~wet] = 0  # dry cells fully transparent
    return rgba


def main():
    """Makes the coloured flood image, plus a small file giving its position and legend."""
    with rasterio.open(DEPTH) as src:
        depth, transform = to_wgs84(src)

    h, w = depth.shape
    west, north = transform * (0, 0)
    east, south = transform * (w, h)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(colourize(depth), "RGBA").save(OUT_DIR / "flood_depth.png", optimize=True)

    meta = {
        "image": "flood_depth.png",
        "crs": DST_CRS,
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "size_px": {"width": w, "height": h},
        "units": "ft",
        "legend": [{"depth_ft": d, "rgba": list(c)} for d, c in RAMP],
    }
    (OUT_DIR / "flood_overlay.json").write_text(json.dumps(meta, indent=2))

    wet = ~np.isnan(depth)
    print(f"Image: {w} x {h} px, wet pixels: {wet.sum():,} ({100 * wet.mean():.1f}%)")
    print(f"Depth range after reprojection: {np.nanmin(depth):.2f} - {np.nanmax(depth):.2f} ft")
    print(f"Bounds: W {west:.6f}  S {south:.6f}  E {east:.6f}  N {north:.6f}")
    print(f"Wrote {OUT_DIR / 'flood_depth.png'}")
    print(f"Wrote {OUT_DIR / 'flood_overlay.json'}")


if __name__ == "__main__":
    main()
