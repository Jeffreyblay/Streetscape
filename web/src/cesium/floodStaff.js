import * as Cesium from 'cesium'

const FT_TO_M = 0.3048
const BANDS = 12 // 12 ft of staff, in 1 ft bands
const RADIUS_M = 0.045
const AHEAD_M = 5 // planted this far in front of the viewer
const LABEL_EVERY_FT = 2

/**
 * A surveyor's depth staff planted in front of the viewer: red and white 1 ft
 * bands with labels, so the water line can be read straight off the scene.
 */
export class FloodStaff {
  constructor(viewer) {
    this.viewer = viewer
    this.anchor = null
    this.source = new Cesium.CustomDataSource('flood-staff')
    viewer.dataSources.add(this.source)
  }

  /**
   * Plant the staff `AHEAD_M` in front of a viewer standing at (lon, lat, ground).
   * Positions are callbacks, so the staff stays ahead of you as you turn.
   */
  plant({ lon, lat, ground }) {
    this.source.entities.removeAll()
    this.anchor = { lon, lat, ground }

    const positionAt = (height) =>
      new Cesium.CallbackPositionProperty(() => this.#pointAhead(height), false)

    for (let ft = 0; ft < BANDS; ft++) {
      const bottom = ground + ft * FT_TO_M
      this.source.entities.add({
        position: positionAt(bottom + FT_TO_M / 2),
        cylinder: {
          length: FT_TO_M,
          topRadius: RADIUS_M,
          bottomRadius: RADIUS_M,
          material: ft % 2 ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#e03131'),
          outline: false,
        },
      })
      if (ft > 0 && ft % LABEL_EVERY_FT === 0) {
        this.source.entities.add({
          position: positionAt(bottom),
          label: {
            text: `${ft} ft`,
            font: '600 13px system-ui, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#111'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(22, 0),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            scaleByDistance: new Cesium.NearFarScalar(5, 1.0, 60, 0.4),
            translucencyByDistance: new Cesium.NearFarScalar(30, 1.0, 90, 0.0),
          },
        })
      }
    }
  }

  /**
   * A point AHEAD_M in front of the camera, at the given height. Anchored to the
   * camera itself (not the clicked point) so the staff is always dead ahead.
   */
  #pointAhead(height) {
    const { camera } = this.viewer
    const eye = Cesium.Cartographic.fromCartesian(camera.positionWC)
    const lon = Cesium.Math.toDegrees(eye.longitude)
    const lat = Cesium.Math.toDegrees(eye.latitude)
    const heading = camera.heading
    const metresPerDegLat = 111_320
    const metresPerDegLon = metresPerDegLat * Math.cos(Cesium.Math.toRadians(lat))
    return Cesium.Cartesian3.fromDegrees(
      lon + (AHEAD_M * Math.sin(heading)) / metresPerDegLon,
      lat + (AHEAD_M * Math.cos(heading)) / metresPerDegLat,
      height,
    )
  }

  set show(value) {
    this.source.show = value
  }

  clear() {
    this.source.entities.removeAll()
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.source, true)
  }
}
