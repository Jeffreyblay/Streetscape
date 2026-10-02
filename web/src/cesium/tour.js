import * as Cesium from 'cesium'
import { whenTerrainReady } from './terrain.js'

const ALTITUDE_M = 120 // above ground
const PITCH_DEG = -25
const BANK_MAX_DEG = 7 // roll into turns, like a bird
const SPEED_MPS = 45
const LOOKAHEAD = 0.05 // fraction of the path used to aim the camera
const TURN_SMOOTHING_S = 1.0 // how quickly heading and bank catch up with the path
const ROLL_PER_RAD_PER_S = 0.25 // how strongly the bank responds to the turn rate

/**
 * Bird's-eye flight along the flood channel (data/processed/tour_path.json).
 * Positions come from a Catmull-Rom spline so the flight curves smoothly
 * through the waypoints instead of turning in steps.
 */
export class Tour {
  // Starts with no path and nothing playing.
  constructor(viewer) {
    this.viewer = viewer
    this.spline = null
    this.length = 0
    this.t = 0
    this.speed = 1
    this.playing = false
    this.saved = null
    this.onEnd = null
    this._tick = null
    this._lastTime = null
    this._heading = null // smoothed, so wobbles in the path don't shake the view
    this._roll = 0
  }

  /** Sample terrain along the path and build the spline. Call once. */
  async prepare(waypoints) {
    if (this.viewer.isDestroyed()) return
    const cartos = waypoints.map((w) => Cesium.Cartographic.fromDegrees(w.lon, w.lat))
    const provider = await whenTerrainReady(this.viewer)
    if (this.viewer.isDestroyed()) return
    await Cesium.sampleTerrainMostDetailed(provider, cartos)
    if (this.viewer.isDestroyed()) return
    const points = cartos.map((c) =>
      Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height ?? 0) + ALTITUDE_M),
    )
    this.spline = new Cesium.CatmullRomSpline({
      times: points.map((_, i) => i / (points.length - 1)),
      points,
    })
    this.length = points.reduce(
      (sum, p, i) => (i ? sum + Cesium.Cartesian3.distance(points[i - 1], p) : 0),
      0,
    )
  }

  // True once the flight path has been built.
  get ready() {
    return this.spline !== null
  }

  // Starts flying, saving the current camera so it can be put back later.
  start() {
    if (!this.ready || this.playing) return
    const { camera, scene } = this.viewer
    this.saved ??= {
      destination: camera.position.clone(),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    }
    scene.screenSpaceCameraController.enableInputs = false
    this.t = this.t >= 1 ? 0 : this.t
    this.playing = true
    this._lastTime = null
    this._heading = null
    this._roll = 0
    this._tick = () => this.#frame()
    scene.preRender.addEventListener(this._tick)
  }

  // Stops moving but stays where it is.
  pause() {
    if (!this.playing) return
    this.viewer.scene.preRender.removeEventListener(this._tick)
    this.playing = false
  }

  /** Stop and fly back to where the tour started. */
  stop() {
    this.pause()
    this.t = 0
    const { camera, scene } = this.viewer
    scene.screenSpaceCameraController.enableInputs = true
    if (this.saved) {
      camera.flyTo({ ...this.saved, duration: 2 })
      this.saved = null
    }
  }

  // Detaches the per-frame updates.
  destroy() {
    if (this._tick) this.viewer.scene.preRender.removeEventListener(this._tick)
    this._tick = null
  }

  // Runs every frame: moves a little further along the path, and finishes at the end.
  #frame() {
    const now = performance.now()
    const dt = this._lastTime ? Math.min((now - this._lastTime) / 1000, 0.1) : 0
    this._lastTime = now

    this.t += (dt * SPEED_MPS * this.speed) / Math.max(this.length, 1)
    if (this.t >= 1) {
      this.t = 1
      this.#place(1, dt)
      this.pause()
      this.onEnd?.()
      return
    }
    this.#place(this.t, dt)
  }

  // Puts the camera at one point along the path, facing forwards and leaning into turns.
  #place(t, dt = 0) {
    const position = this.spline.evaluate(t)
    const ahead = this.spline.evaluate(Math.min(1, t + LOOKAHEAD))
    const target = this.#headingTo(position, ahead)

    // Ease towards the heading the path wants instead of snapping to it every frame
    const blend = dt > 0 ? 1 - Math.exp(-dt / TURN_SMOOTHING_S) : 1
    const turn = this._heading === null ? 0 : Cesium.Math.negativePiToPi(target - this._heading)
    this._heading = this._heading === null ? target : this._heading + turn * blend

    // Bank by how fast the heading changes per second, not per frame, so the
    // lean doesn't jitter with the frame rate
    const targetRoll = Cesium.Math.clamp(
      dt > 0 ? (turn * ROLL_PER_RAD_PER_S) / dt : 0,
      -Cesium.Math.toRadians(BANK_MAX_DEG),
      Cesium.Math.toRadians(BANK_MAX_DEG),
    )
    this._roll += (targetRoll - this._roll) * blend

    this.viewer.camera.setView({
      destination: position,
      orientation: {
        heading: this._heading,
        pitch: Cesium.Math.toRadians(PITCH_DEG),
        roll: this._roll,
      },
    })
  }

  /** Compass heading from one point to another, in the local frame of the first. */
  #headingTo(from, to) {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(from)
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4())
    const local = Cesium.Matrix4.multiplyByPoint(inv, to, new Cesium.Cartesian3())
    return Math.atan2(local.x, local.y) // x = east, y = north
  }
}
