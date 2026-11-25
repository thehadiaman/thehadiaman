// The flight from Kozhikode to Dubai: take-off roll, a climbing turn out over
// the sea, cruise north, and a landing on Dubai's runway. Camera follows the plane.
import { CatmullRomCurve3, Vector3, MathUtils } from '../../vendor/three.min.js';
import { PLACES, STOPS } from './layout.js';

const ROUTE = [
  [PLACES.plane.x, 0, PLACES.plane.z], [-30, 0, -108], [5, 0, -108], [36, 3, -108], [70, 16, -118],
  [100, 38, -160], [112, 55, -230], [106, 50, -290], [86, 30, -330], [60, 12, -345], [36, 1.5, -345],
  [10, 0, -345], [-20, 0, -345], [-42, 0, -345],
];
const DURATION = 17;

function ease(x) {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

export class Flight {
  constructor({ refs, rig, camera, player, ui, reducedMotion }) {
    this.refs = refs;
    this.rig = rig;
    this.camera = camera;
    this.player = player;
    this.ui = ui;
    this.reducedMotion = reducedMotion;
    this.curve = new CatmullRomCurve3(ROUTE.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
    this.active = false;
    this.t = 0;
    this.camPos = new Vector3();
    this.lookAt = new Vector3();
    this.yaw = 0;
    this.roll = 0;
    this.atDubai = false;
  }

  get busy() {
    return this.active;
  }

  async start(onLanded) {
    if (this.active) return;
    this.active = true;
    this.onLanded = onLanded;
    this.player.locked = true;
    this.player.stop();
    await this.ui.fade(true);
    this.player.root.visible = false;
    this.refs.stairs.visible = false;
    this.refs.luggage.visible = false;
    this.refs.departures.setStatus('BOARDING', performance.now() + 200);
    if (this.reducedMotion) {
      this.finish();
      return;
    }
    this.t = 0;
    this.yaw = 0;
    this.roll = 0;
    this.place(0);
    const plane = this.refs.plane.plane;
    this.camPos.copy(plane.position).add(new Vector3(-34, 10, 14));
    this.lookAt.copy(plane.position);
    this.rig.override = (dt) => this.follow(dt);
    this.ui.flightBanner(true, () => this.finish());
    await this.ui.fade(false);
  }

  place(u, dt = 0) {
    const { plane, gear } = this.refs.plane;
    const p = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(u);
    p.y = Math.max(0, p.y);
    plane.position.copy(p);
    const yaw = Math.atan2(-tan.z, tan.x);
    const rate = dt ? MathUtils.euclideanModulo(yaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI : 0;
    this.yaw = yaw;
    const targetRoll = dt ? MathUtils.clamp((-rate / dt) * 0.55, -0.55, 0.55) : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 2.5);
    const pitch = Math.asin(MathUtils.clamp(tan.y, -1, 1));
    plane.rotation.set(this.roll, yaw, pitch, 'YZX');
    const gearDown = p.y < 9 && (u < 0.3 || u > 0.7);
    gear.forEach((g) => (g.visible = gearDown));
  }

  follow(dt) {
    const plane = this.refs.plane.plane;
    const nose = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const side = new Vector3(nose.z, 0, -nose.x);
    const want = plane.position.clone().addScaledVector(nose, -30).addScaledVector(side, 10).add(new Vector3(0, 9, 0));
    const k = 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(want, k);
    this.lookAt.lerp(plane.position.clone().addScaledVector(nose, 12), 1 - Math.exp(-dt * 4));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookAt);
  }

  update(dt) {
    if (!this.active || this.reducedMotion || this.finishing) return;
    this.t += dt;
    const x = Math.min(1, this.t / DURATION);
    this.place(ease(x), dt);
    if (this.t > 5 && !this.departed) {
      this.departed = true;
      this.refs.departures.setStatus('DEPARTED', performance.now());
    }
    if (x >= 1) this.finish();
  }

  async finish() {
    if (this.finishing) return;
    this.finishing = true;
    await this.ui.fade(true);
    this.place(1);
    this.refs.plane.gear.forEach((g) => (g.visible = true));
    this.ui.flightBanner(false);
    this.rig.override = null;
    const d = STOPS.dubai;
    this.player.root.visible = true;
    this.player.locked = false;
    this.player.teleport(d.x, d.z + 6, d.face);
    this.rig.yaw = d.view;
    this.rig.snap(this.player.position.clone().add(new Vector3(0, 1.5, 0)));
    this.active = false;
    this.finishing = false;
    this.departed = false;
    this.atDubai = true;
    this.onLanded?.();
    await this.ui.fade(false);
  }

  // Back at Kozhikode: plane on its stand with the stairs out.
  reset() {
    if (!this.atDubai) return;
    this.atDubai = false;
    const { plane, gear } = this.refs.plane;
    plane.position.set(PLACES.plane.x, 0, PLACES.plane.z);
    plane.rotation.set(0, 0, 0);
    gear.forEach((g) => (g.visible = true));
    this.refs.stairs.visible = true;
    this.refs.luggage.visible = true;
    const status = this.refs.departures;
    status.setStatus('ON TIME', performance.now());
  }
}
