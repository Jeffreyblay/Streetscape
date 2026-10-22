// Where the numbers come from and what they do not claim. Collapsed by default.
export default function AboutData({ stats }) {
  return (
    <details className="about">
      <summary>About the data</summary>

      <p>
        <strong>Flood depths are predicted by a physics-informed attention U-Net</strong>,
        trained on roughly 97 million labelled pixels at 1 m resolution. Its output is a depth
        raster on a 3.1 ft (about 1 m) grid, in NC State Plane feet.
      </p>

      <p>
        Depths shown for a building are measured from that raster inside its footprint. The
        depth where you stand in street view comes from a 12.5 ft lookup grid, so it is
        slightly coarser.
      </p>

      <p>
        <strong>Building heights are estimated</strong>, not surveyed. The source inventory
        (NC Emergency Management building footprints) carries no height, so heights are worked
        out from the ratio of heated floor area to footprint area, capped at two storeys, with
        a handful corrected by hand against aerial imagery.
      </p>

      <p>
        <strong>Ground is Cesium World Terrain</strong>, which is coarser than the model's own
        ground surface. Buildings and water sit relative to it, and the water surface is
        lightly smoothed so it reads as flat water. Expect small differences from the model at
        kerbs, ditches and embankments.
      </p>

      {stats && (
        <p>
          This scene covers {stats.inundated_area.acres.toFixed(0)} acres, with depths from{' '}
          {stats.depth_ft.min.toFixed(2)} to {stats.depth_ft.max.toFixed(1)} ft across{' '}
          {stats.buildings.total} buildings.
        </p>
      )}

      <p className="about-note">
        An indicative visualisation for understanding flood extent and depth — not a regulatory
        flood product, and not for navigation or emergency decisions.
      </p>
    </details>
  )
}
