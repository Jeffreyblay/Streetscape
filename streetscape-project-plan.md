# Streetscape — Project Plan

**An immersive 3D flood visualization dashboard with simulated street-level views**

Version 1.0 · Prepared 14 September 2026

---

## 1. Project Summary

Streetscape is a browser-based dashboard that communicates flood risk in a way static maps cannot. It combines three layers of information:

1. A **predicted flood depth raster** (inundation extent + depth values)
2. **Building footprint polygons** with height attributes
3. A **digital elevation model** for ground surface

From these, the application renders a georeferenced 3D scene and lets the user drop into any location on the map to view the flood from a simulated eye-level perspective — turning 360°, adjusting their viewing height, and watching an animated water surface. Summary statistics sit alongside the map and update with the scene.

The core value proposition: a homeowner, planner, or emergency manager can see *what the flood will look like from where they stand*, not just a blue polygon on a map.

---

## 2. Objectives

**Primary**
- Render flood depth and buildings accurately in 3D, georeferenced to real-world coordinates
- Provide a first-person, 360° "street view" at any user-selected point
- Allow the user to adjust camera height and observe how the view changes
- Display live summary statistics (max depth, min depth, affected building count)

**Secondary**
- Animate water surface movement for realism
- Support querying individual buildings for depth at that location
- Run entirely client-side so the tool can be hosted as a static site

---

## 3. Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| 3D engine | **CesiumJS** | Native georeferencing, terrain, 3D Tiles, first-person camera control |
| 3D asset hosting | **Cesium ion** (free tier) | Converts buildings to 3D Tiles; serves world terrain |
| UI framework | **React** + Vite | Component structure for the stats panel and controls |
| Charts | **Recharts** or **Chart.js** | Depth histogram, simple bar/summary visuals |
| Data preparation | **Python**: rasterio, GeoPandas, numpy, shapely | Raster stats, zonal joins, format conversion |
| Raster tiling | **GDAL** / `rio-cogeo` | Convert flood raster to Cloud-Optimized GeoTIFF or image tiles |
| Hosting | **Netlify**, **Vercel**, or **GitHub Pages** | Static; no backend needed |
| Version control | Git + GitHub | Standard |

**Alternative considered:** deck.gl + MapLibre. Lighter and more stylized, but weaker terrain handling and first-person camera support. Cesium is the better fit for the street-view requirement.

---

## 4. Data Preparation Pipeline

This is done once, offline, in Python. Output is a set of static files the web app consumes.

### 4.1 Inputs to gather

| Dataset | Source | Notes |
|---|---|---|
| Flood depth raster | Your model output | Confirm CRS, nodata value, units (ft vs m) |
| Building footprints | OSM (already have) | Must have a height or levels attribute |
| Digital elevation model | USGS 3DEP (1 m or 10 m for North Carolina) | Needed for correct ground and camera height |
| Base imagery | Cesium ion world imagery, or Google Photorealistic 3D Tiles | Backdrop realism |

### 4.2 Step-by-step

**Step 1 — Standardize coordinate systems**
Reproject everything to **EPSG:4326** (WGS84) for Cesium, but keep a projected copy (e.g. EPSG:6543, NC State Plane) for any area or distance calculations. Mixing these up is the single most common source of misalignment.

**Step 2 — Clean and validate the raster**
- Confirm nodata is set correctly so dry areas are not treated as zero-depth
- Note the units. If depth is in feet, you will convert to metres for Cesium (which works in metres)
- Check the min/max range against your legend (your sample shows a maximum around 23.6 ft)

**Step 3 — Compute building-level flood attributes**
For each building polygon, run zonal statistics against the depth raster:
- `depth_max` — deepest water touching the footprint
- `depth_mean` — average depth across the footprint
- `flooded` — boolean, true if `depth_max` exceeds a threshold (e.g. 0.1 ft, to avoid noise from raster edges)

Write these back as attributes on the polygon layer.

**Step 4 — Attach ground elevation to buildings**
Sample the DEM at each building centroid and store as `ground_elev`. Cesium needs this to place buildings on the terrain rather than floating or buried.

**Step 5 — Export buildings for the web**
Two options:
- **Small dataset (< ~5,000 buildings):** export as GeoJSON with height and depth attributes; extrude in Cesium at runtime. Simplest.
- **Large dataset:** upload the polygon layer to Cesium ion, which tiles it into **3D Tiles** for efficient streaming.

Start with GeoJSON. Your sample area appears well under the threshold.

**Step 6 — Export the flood raster for the web**
Two parallel outputs:
- **Visual layer:** a colour-ramped PNG or COG that Cesium drapes over terrain as an imagery layer
- **Query layer:** a downsampled depth array (JSON or binary) so the app can look up depth at a clicked point without a server round-trip

**Step 7 — Precompute statistics**
Write a single `stats.json` containing: max depth, min non-zero depth, mean depth, total inundated area, count of flooded buildings, total building count, and a histogram of depths for the chart. Keeps the app fast.

### 4.3 Suggested output structure

```
/data
  buildings.geojson        # footprints + height + depth attrs + ground_elev
  flood_depth.png          # styled overlay for draping
  flood_depth_cog.tif      # optional, for higher-fidelity display
  depth_grid.json          # downsampled grid for point queries
  stats.json               # precomputed summary statistics
```

---

## 5. Application Architecture

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header: Streetscape — [study area name]                  │
├───────────────┬──────────────────────────────────────────┤
│               │                                          │
│  STATS PANEL  │        3D CESIUM VIEWER                   │
│               │                                          │
│  Max depth    │   (aerial mode ⇄ street view mode)        │
│  Min depth    │                                          │
│  Buildings    │                                          │
│   affected    │                                          │
│  Histogram    │                                          │
│               │                                          │
│  ── controls  │                                          │
│  Eye height   │                                          │
│  [slider]     │                                          │
│  Water anim   │                                          │
│  [toggle]     │                                          │
│  Exit view    │                                          │
└───────────────┴──────────────────────────────────────────┘
```

### 5.2 Component breakdown

| Component | Responsibility |
|---|---|
| `App` | Holds global state: mode (aerial/street), camera position, eye height, selected building |
| `StatsPanel` | Renders values from `stats.json`; updates contextually in street view (e.g. depth at current point) |
| `CesiumViewer` | Initializes the globe, loads terrain, buildings, flood layer |
| `WaterSurface` | Builds and animates the translucent water plane |
| `StreetViewController` | Handles click-to-enter, camera positioning, look-around, height adjustment |
| `Controls` | Eye-height slider, animation toggle, mode exit button |

### 5.3 Core state

```js
{
  mode: 'aerial' | 'street',
  streetPosition: { lon, lat } | null,
  eyeHeight: 1.7,              // metres above ground
  waterAnimating: true,
  depthAtCursor: number | null,
  selectedBuilding: id | null
}
```

---

## 6. Implementation Phases

### Phase 1 — Foundation (Week 1)
**Goal:** a working Cesium globe in a React shell.

- Set up the Vite + React project, install `cesium` and `vite-plugin-cesium`
- Create a Cesium ion account, obtain an access token, store it in `.env`
- Render the viewer with world terrain, flown to your study area
- Build the static dashboard layout (panel + viewer)
- Load `stats.json` and display the numbers

**Done when:** the globe loads at the right place and the stats panel shows real values.

### Phase 2 — Data layers (Week 2)
**Goal:** your flood and buildings visible in 3D.

- Load `buildings.geojson` via `GeoJsonDataSource`; extrude each polygon using its height attribute
- Colour buildings by flood status (e.g. orange = affected, grey = dry), matching your existing legend
- Drape the flood raster over terrain as an imagery layer with transparency
- Add a click handler that shows a building's attributes in a popup

**Done when:** your sample area renders in 3D and resembles the reference image, but navigable.

### Phase 3 — Water surface (Week 3)
**Goal:** the flood reads as water, not as a flat colour overlay.

- Generate a water surface geometry at `ground_elevation + depth` — either a rectangle primitive clipped to the inundation boundary, or a polygon extracted from the raster extent
- Apply Cesium's built-in water material (`Cesium.Material.fromType('Water')`) with normal map, frequency, and animation speed tuned for a slow, shallow-flood look
- Add the on/off toggle
- Clip or mask water where it intersects building footprints so it does not render through walls

**Done when:** water has movement and reflects light, and buildings emerge from it convincingly.

### Phase 4 — Street view (Weeks 4–5)
**Goal:** the headline feature.

- Add a "Drop pin" mode. On map click, capture lon/lat and sample terrain height with `sampleTerrainMostDetailed`
- Position the camera at `terrainHeight + eyeHeight`, pitch level (0°), heading north
- Switch camera controls: disable zoom-to-cursor and tilt, enable free look (`screenSpaceCameraController.enableLook = true`), so dragging rotates the view in place — the Google Street View interaction model
- Implement the eye-height slider (suggested range 0.5 m to 30 m, default 1.7 m) updating camera height live
- Display depth at the current standing point in the stats panel, pulled from `depth_grid.json`
- Add a water-line indicator: a visual cue showing where the water reaches relative to the viewer's height
- Add an "Exit to map" button that flies back to the aerial view

**Done when:** you can click a street, stand there, look around 360°, and raise yourself to roof height.

### Phase 5 — Polish and deploy (Weeks 6–8)
- Add the depth histogram chart
- Add a minimap or pin marker showing where in the study area you are standing
- Add smooth transitions between aerial and street mode (`camera.flyTo` with easing)
- Improve building realism: simple façade textures, or swap in Google Photorealistic 3D Tiles as a backdrop where available
- Responsive layout, loading states, error handling
- Write a short user guide and deploy to static hosting

---

## 7. Key Technical Notes

**Units.** Cesium works in metres throughout. If your raster is in feet, convert during preparation, not in the browser.

**Camera height vs. terrain height.** Always sample terrain asynchronously before positioning the camera. Setting a fixed altitude will bury or float the viewer depending on local relief.

**Water through walls.** The most visible artifact in this kind of visualization. Handle it by either (a) clipping the water polygon against building footprints during data prep, or (b) using Cesium clipping planes per building. Option (a) is simpler and faster.

**Performance.** Building count and raster resolution are the two levers. If frame rate drops below ~30 fps, tile the buildings into 3D Tiles and downsample the depth grid used for queries.

**Terrain quality.** The credibility of the street view depends heavily on the DEM. A 10 m DEM will feel flat and approximate; 1 m LiDAR-derived terrain, where available for your area, makes a large difference.

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Street view looks crude — plain grey boxes at eye level | High — undermines the core feature | Add façade textures, or use photorealistic 3D Tiles as backdrop |
| Water renders inside buildings | Medium — visually breaks realism | Clip water geometry to exclude footprints during data prep |
| Poor DEM resolution flattens the scene | Medium | Source the best available LiDAR DEM early |
| Raster too large for browser | Medium | Tile as COG; downsample the query grid |
| OSM height attributes missing or wrong | Medium | Fall back to `levels × 3 m`; flag estimated heights in the UI |
| Scope creep into full hydrodynamic animation | High — timeline risk | Keep water animation cosmetic in v1; time-series is a v2 feature |

---

## 9. Milestones

| Milestone | Target | Deliverable |
|---|---|---|
| M1 | End of Week 1 | Globe renders; stats panel live |
| M2 | End of Week 2 | Flood and buildings visible in 3D |
| M3 | End of Week 3 | Animated water surface working |
| M4 | End of Week 5 | Street view functional with height control |
| M5 | End of Week 8 | Polished, deployed, documented |

Estimate assumes one developer comfortable with GIS concepts and intermediate JavaScript, working part-time. Add 30–50% if learning Cesium from scratch.

---

## 10. Future Extensions

- **Time-series animation.** If the flood model outputs multiple timesteps, drive a timeline and animate rising and falling water. This is the most compelling upgrade and Cesium supports it natively via its clock and time-dynamic properties.
- **Scenario comparison.** Toggle between return periods (10-yr, 100-yr, 500-yr) with a dropdown.
- **Damage estimation.** Join depth-damage curves to building attributes and report estimated loss.
- **Shareable views.** Encode camera position and height in the URL so a specific street view can be linked.
- **VR mode.** Cesium supports WebXR; the street view concept maps naturally to a headset.

---

## 11. First Actions

1. Create a Cesium ion account and get an access token
2. Spend an hour in Cesium Sandcastle — specifically the terrain, GeoJSON extrusion, and camera examples
3. Confirm the CRS, units, and nodata value of your flood raster
4. Locate and download the best available DEM for your study area
5. Run the zonal statistics join to attach depth values to building footprints
6. Scaffold the Vite + React project and get a bare globe rendering

Steps 3–5 can happen in parallel with 1–2.
