"""Shared fix for the depth raster's projection.

The raster is exported from ArcGIS with an unusable `LOCAL_CS` definition: its label
says NAD83(2011) / North Carolina (ftUS), but the unit is recorded as metres, so nothing
can reproject it. The coordinates themselves are correct - only the label is wrong - so
the scripts fall back to the projection the label names.
"""
from rasterio.crs import CRS

SOURCE_CRS = CRS.from_epsg(6543)  # NAD83(2011) / North Carolina (ftUS)


def depth_crs(src):
    """The raster's real projection, falling back when the file's own definition is unusable."""
    return src.crs if src.crs and src.crs.is_projected else SOURCE_CRS
