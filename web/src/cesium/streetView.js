import * as Cesium from 'cesium'
import { whenTerrainReady } from './terrain.js'

const LOOK_DEG_PER_PX = 0.15
const MAX_PITCH = Cesium.Math.toRadians(85)
const STREET_NEAR_PLANE_M = 0.1 // default 1 m would clip the ground at low eye heights

/**
 * First-person "street view" camera: stand at ground + eye height,
 * drag to look around (Google Street View style), move with goTo().
 */
export class StreetView {
  constructor(viewer) {
    this.viewer = viewer
    this.active = false
    this.position = null // { lon, lat }
    this.ground = null // terrain height (m, ellipsoid) at position
    this.eyeHeight = 1.7
    this.saved = null // aerial camera to return to
    this.requestId = 0
    this.dragHandler = null
  }

  /** Stand at a point (entering street view if needed). */
  async goTo(position, eyeHeight) {
    const viewer = this.viewer
    const id = ++this.requestId
    const provider = await whenTerrainReady(viewer)
    const [carto] = await Cesium.sampleTerrainMostDetailed(provider, [
      Cesium.Cartographic.fromDegrees(position.lon, position.lat),
    ])
    if (viewer.isDestroyed() || id !== this.requestId) return // superseded by a newer click/exit

    this.position = position
    this.ground = carto.height ?? 0
    this.eyeHeight = eyeHeight

    const entering = !this.active
    if (entering) this.#enable()
    const { camera } = viewer
    camera.flyTo({
      destination: this.#eyePosition(),
      orientation: { heading: camera.heading, pitch: entering ? 0 : camera.pitch, roll: 0 },
      duration: entering ? 3 : 0.8,
      // Arc down and level off, rather than dropping straight in
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      pitchAdjustHeight: entering ? this.ground + 150 : undefined,
    })
  }

  setEyeHeight(eyeHeight) {
    this.eyeHeight = eyeHeight
    if (!this.active || this.ground == null) return
    const { camera } = this.viewer
    camera.cancelFlight()
    camera.setView({
      destination: this.#eyePosition(),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 },
    })
  }

  /** Leave street view and fly back to the saved aerial camera. */
  exit() {
    this.requestId++ // cancel any pending goTo
    if (!this.active) return
    this.#disable()
    if (this.saved) this.viewer.camera.flyTo({ ...this.saved, duration: 2 })
  }

  destroy() {
    this.dragHandler?.destroy()
    this.dragHandler = null
  }

  #eyePosition() {
    const { lon, lat } = this.position
    return Cesium.Cartesian3.fromDegrees(lon, lat, this.ground + this.eyeHeight)
  }

  #enable() {
    const { camera, scene } = this.viewer
    this.saved = {
      destination: camera.position.clone(),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    }
    scene.screenSpaceCameraController.enableInputs = false // no zoom/pan/orbit
    this.savedNear = camera.frustum.near
    camera.frustum.near = STREET_NEAR_PLANE_M

    // Drag the scene to look around: drag right = turn left, drag down = look up.
    // Cesium reuses its event position objects, so keep copies, not references.
    let last = null
    const h = new Cesium.ScreenSpaceEventHandler(scene.canvas)
    h.setInputAction(({ position }) => {
      last = Cesium.Cartesian2.clone(position)
      camera.cancelFlight()
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN)
    h.setInputAction(() => (last = null), Cesium.ScreenSpaceEventType.LEFT_UP)
    h.setInputAction(({ endPosition }) => {
      if (!last) return
      const k = Cesium.Math.toRadians(LOOK_DEG_PER_PX)
      const heading = camera.heading - (endPosition.x - last.x) * k
      const pitch = Cesium.Math.clamp(camera.pitch + (endPosition.y - last.y) * k, -MAX_PITCH, MAX_PITCH)
      camera.setView({ orientation: { heading, pitch, roll: 0 } })
      last = Cesium.Cartesian2.clone(endPosition, last)
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    this.dragHandler = h
    this.active = true
  }

  #disable() {
    const { camera, scene } = this.viewer
    this.dragHandler?.destroy()
    this.dragHandler = null
    scene.screenSpaceCameraController.enableInputs = true
    camera.frustum.near = this.savedNear
    this.active = false
  }
}
