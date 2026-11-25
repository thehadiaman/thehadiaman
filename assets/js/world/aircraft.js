// The plane. It flies on autopilot by default; touch the controls and it is
// yours to fly. If a flight under manual control is about to end badly, the
// rescue robot catches the plane and autopilot takes over again.
import { CatmullRomCurve3, Vector3, Quaternion, Euler, MathUtils } from '../../vendor/three.min.js';
import { PLACES, STOPS, KERALA, DUBAI, RUNWAY_KERALA, RUNWAY_DUBAI } from './layout.js';
import { inside } from './terrain.js';

export const AIRPORTS = {
  kerala: { name: 'Kozhikode', code: 'CCJ', runway: RUNWAY_KERALA },
  dubai: { name: 'Dubai', code: 'DXB', runway: RUNWAY_DUBAI },
};

// Every landing comes in from the sea to the east and lands heading west.
// A 6–7° glide that starts 280 m out over the sea.
const FINAL = (z) => [[330, 32, z], [250, 22, z], [170, 12, z], [110, 5, z], [75, 1.5, z], [55, 0.4, z], [20, 0, z], [-20, 0, z], [-44, 0, z]];
const TOUCH = 5; // index of the touchdown point in FINAL
// Base turns onto final: northbound for Dubai, southbound for Kozhikode.
const BASE = {
  dubai: [[365, 58, -262], [378, 48, -318], [360, 38, -343]],
  kerala: [[365, 58, -192], [378, 48, -134], [360, 38, -110]],
};
// Before the base turn when coming from anywhere else.
const PRE_BASE = { dubai: [350, 64, -205], kerala: [350, 64, -250] };
// Take-off rolls east down the runway, then turns towards the other coast.
const TAKEOFF = {
  kerala: [[PLACES.plane.x, 0, -108], [-20, 0, -108], [25, 0, -108], [60, 6, -108], [112, 24, -112], [172, 40, -132], [210, 55, -186]],
  dubai: [[-50, 0, -345], [-12, 0, -345], [30, 0, -345], [65, 6, -345], [112, 24, -338], [165, 42, -310], [205, 56, -262]],
};
const CRUISE = 70;
const SABRE = PLACES.sabre;

const up = new Vector3(0, 1, 0);
const tmp = new Vector3();

function easeInOut(x) {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

function wrap(a) {
  return MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Aircraft {
  constructor({ refs, world, rig, camera, player, ui, rescuer, reducedMotion, onDisembark, onMoved }) {
    Object.assign(this, { refs, world, rig, camera, player, ui, rescuer, reducedMotion, onDisembark, onMoved });
    this.plane = refs.plane.plane;
    this.gear = refs.plane.gear;
    this.mode = 'parked'; // parked | auto | manual | rescue | rollout
    this.at = 'kerala';
    this.dest = 'dubai';
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.v = 0;
    this.route = null;
    this.camPos = new Vector3();
    this.camLook = new Vector3();
    this.rescues = 0;
  }

  get busy() {
    return this.mode !== 'parked';
  }

  get position() {
    return this.plane.position;
  }

  forward(out = new Vector3()) {
    return out.set(
      Math.cos(this.pitch) * Math.cos(this.yaw),
      Math.sin(this.pitch),
      -Math.cos(this.pitch) * Math.sin(this.yaw),
    );
  }

  /* ------------------------------------------------ boarding and arriving */

  async board() {
    if (this.busy) return;
    const from = this.at;
    this.dest = from === 'kerala' ? 'dubai' : 'kerala';
    this.player.locked = true;
    this.player.stop();
    await this.ui.fade(true);
    this.player.root.visible = false;
    this.refs.stairs.visible = false;
    this.refs.luggage.visible = false;
    if (from === 'kerala') this.refs.departures.setStatus('BOARDING', performance.now() + 200);
    const start = TAKEOFF[from][0];
    this.plane.position.set(start[0], 0, start[2]);
    this.yaw = 0; // facing east, down the runway
    this.pitch = 0;
    this.roll = 0;
    this.v = 0;
    this.orient(0);
    this.onMoved?.();
    if (this.reducedMotion) {
      await this.arrive(this.dest, { quiet: true });
      return;
    }
    this.setRoute([...TAKEOFF[from], ...BASE[this.dest], ...FINAL(AIRPORTS[this.dest].runway.z)], TAKEOFF[from].length + BASE[this.dest].length + TOUCH);
    this.mode = 'auto';
    this.departedAt = from;
    this.departed = false;
    this.snapCamera();
    this.rig.override = (dt) => this.follow(dt);
    this.hud();
    await this.ui.fade(false);
  }

  // Parked and passengers off, at `airport`.
  async arrive(airport, { quiet = false } = {}) {
    this.mode = 'parked';
    if (!quiet) await this.ui.fade(true);
    this.ui.flight(null);
    this.rescuer.root.visible = false;
    this.rig.override = null;
    if (airport === 'kerala') {
      this.park('kerala');
    } else {
      const rw = RUNWAY_DUBAI;
      const p = this.plane.position;
      p.y = 0;
      p.z = rw.z;
      p.x = MathUtils.clamp(p.x, rw.x0 + 18, rw.x1 - 14);
      this.pitch = 0;
      this.roll = 0;
      this.orient(0);
      this.gear.forEach((g) => (g.visible = true));
      this.at = 'dubai';
    }
    this.onMoved?.();
    this.player.root.visible = true;
    this.player.locked = false;
    this.onDisembark?.(airport);
    await this.ui.fade(false);
  }

  // The plane on its stand at Kozhikode with the stairs out.
  park(airport = 'kerala') {
    if (airport !== 'kerala') return;
    this.plane.position.set(PLACES.plane.x, 0, PLACES.plane.z);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.v = 0;
    this.orient(0);
    this.gear.forEach((g) => (g.visible = true));
    this.refs.stairs.visible = true;
    this.refs.luggage.visible = true;
    this.refs.departures.setStatus('ON TIME', performance.now());
    this.at = 'kerala';
  }

  // Someone jumped back to Kerala while the plane sits in Dubai.
  reset() {
    if (this.at === 'kerala' || this.busy) return;
    this.park('kerala');
    this.onMoved?.();
  }

  /* ------------------------------------------------ routes */

  setRoute(points, touchIndex) {
    const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
    const divisions = 600;
    const lengths = curve.getLengths(divisions);
    const length = lengths[divisions];
    const sAt = (i) => lengths[Math.round((i / (points.length - 1)) * divisions)];
    this.route = { curve, length, s: 0, touchS: sAt(touchIndex) };
  }

  // A route from wherever the plane is now to `dest`, checked for obstacles.
  routeFromHere(dest) {
    const p = this.plane.position.clone();
    const f = this.forward();
    const z = AIRPORTS[dest].runway.z;
    const tries = [
      { climb: 0, cruise: 0 },
      { climb: 60, cruise: 90 },
      { climb: 120, cruise: 230 },
    ];
    for (const { climb, cruise } of tries) {
      const ahead = p.clone().addScaledVector(f, 110);
      ahead.y = Math.max(ahead.y, p.y, 45) + climb;
      const pre = [...PRE_BASE[dest]];
      if (cruise) pre[1] = Math.max(pre[1], cruise);
      const points = [[p.x, p.y, p.z], [ahead.x, ahead.y, ahead.z], pre, ...BASE[dest], ...FINAL(z)];
      const touch = 3 + BASE[dest].length + TOUCH;
      if (this.routeIsClear(points, 3 + BASE[dest].length + 2)) return { points, touch };
    }
    // last resort: straight up first, then over everything
    const top = Math.max(p.y + 150, 240);
    const points = [[p.x, p.y, p.z], [p.x + f.x * 60, top, p.z + f.z * 60], [PRE_BASE[dest][0], top, PRE_BASE[dest][2]], ...BASE[dest], ...FINAL(z)];
    return { points, touch: 3 + BASE[dest].length + TOUCH };
  }

  // Check the route up to the start of the final descent.
  routeIsClear(points, checkUntil) {
    const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
    const stop = checkUntil / (points.length - 1);
    const n = Math.ceil(curve.getLength() / 6);
    for (let i = 2; i <= n; i++) {
      const t = i / n;
      if (t > stop) break;
      const q = curve.getPoint(t);
      if (this.collides(q.x, q.y, q.z, { margin: 8 })) return false;
    }
    return true;
  }

  engageAutopilot(dest = this.dest) {
    if (this.mode === 'parked' || this.mode === 'rescue' || this.mode === 'rollout') return;
    this.dest = dest;
    const { points, touch } = this.routeFromHere(dest);
    this.setRoute(points, touch);
    this.mode = 'auto';
    this.hud();
  }

  takeControl() {
    if (this.mode !== 'auto') return;
    // can't take off by hand; once airborne, it's yours
    if (this.plane.position.y < 6) {
      this.ui.toast('Wait for take-off, then take the controls.');
      return;
    }
    this.mode = 'manual';
    this.hud();
  }

  /* ------------------------------------------------ obstacles */

  // Which runway is under (x, z)? `ends` stretches it past both ends (the clear
  // strip you fly over on the way in).
  runwayAt(x, z, ends = 2) {
    for (const [name, a] of Object.entries(AIRPORTS)) {
      const rw = a.runway;
      if (x > rw.x0 - ends && x < rw.x1 + ends && Math.abs(z - rw.z) < rw.width / 2 + 3) return name;
    }
    return null;
  }

  // What would the plane hit at this point? null if nothing.
  collides(x, y, z, { margin = 0 } = {}) {
    if (this.world.solidAt(x, y - margin * 0.5, z) || this.world.solidAt(x, y - 3, z)) return 'building';
    if (Math.hypot(x - SABRE.x, z - SABRE.z) < 9 + margin && y < 46 + margin) return 'mast';
    const land = inside(KERALA, x, z) || inside(DUBAI, x, z);
    if (land) {
      if (this.runwayAt(x, z, 45)) return y < 0.4 ? 'runway' : null;
      return y < 9 + margin ? 'ground' : null; // palms and roofs
    }
    return y < 1.5 + margin ? 'sea' : null;
  }

  // Look 2.4 s ahead along the current velocity for trouble.
  predict() {
    const p = this.plane.position;
    const f = this.forward(tmp).multiplyScalar(this.v);
    const onFinal = this.onFinal();
    for (let k = 1; k <= 12; k++) {
      const t = k * 0.2;
      const hit = this.collides(p.x + f.x * t, p.y + f.y * t, p.z + f.z * t);
      if (!hit) continue;
      // lined up and descending gently: leave room to flare, only step in at the last moment
      if (onFinal && (hit === 'sea' || hit === 'ground') && t > 0.6) return null;
      return { t, kind: hit };
    }
    return null;
  }

  // On the approach line to a runway, heading for it, gently.
  onFinal() {
    if (!this.landingOk(9)) return false;
    const p = this.plane.position;
    const east = Math.cos(this.yaw) > 0;
    for (const { runway: rw } of Object.values(AIRPORTS)) {
      if (Math.abs(p.z - rw.z) > 18 || p.y > 40) continue;
      // within 400 m before the near end, coming towards the runway
      if (east ? p.x > rw.x0 - 400 && p.x < rw.x1 : p.x < rw.x1 + 400 && p.x > rw.x0) return true;
    }
    return false;
  }

  // Is this a landing rather than a crash?
  landingOk(maxDescent = 6) {
    const descent = -Math.sin(this.pitch) * this.v;
    return descent < maxDescent && Math.abs(this.roll) < 0.3 && this.pitch > -0.2 && Math.abs(Math.cos(this.yaw)) > 0.93 && this.v < 75;
  }

  /* ------------------------------------------------ the frame */

  update(dt, keys) {
    if (this.mode === 'parked') return;
    if (this.mode === 'auto') {
      if (keys.steering && this.plane.position.y > 6) this.takeControl();
      else this.flyRoute(dt);
    }
    if (this.mode === 'manual') this.flyManual(dt, keys);
    if (this.mode === 'rescue') this.flyRescue(dt);
    if (this.mode === 'rollout') this.rollOut(dt);
    this.rescuer.update(dt, performance.now() / 1000);
    this.hudTick = (this.hudTick || 0) + dt;
    if (this.hudTick > 0.15) {
      this.hudTick = 0;
      this.hud();
    }
  }

  // Autopilot: follow the route, managing speed for take-off, cruise and landing.
  flyRoute(dt) {
    const r = this.route;
    const toTouch = r.touchS - r.s;
    let target = CRUISE;
    if (toTouch <= 0) target = Math.sqrt(2 * 11 * Math.max(0, r.length - r.s));
    else if (toTouch < 320) target = 44 + toTouch * 0.08;
    const onGround = this.plane.position.y < 0.3;
    const rate = target > this.v ? (onGround ? 9 : 6) : onGround && toTouch <= 0 ? 12 : 5;
    this.v += MathUtils.clamp(target - this.v, -rate * dt, rate * dt);
    r.s = Math.min(r.length, r.s + Math.max(this.v, 0.5) * dt);
    const u = r.s / r.length;
    const p = r.curve.getPointAt(u);
    const t = r.curve.getTangentAt(u);
    p.y = Math.max(0, p.y);
    this.plane.position.copy(p);
    const yaw = Math.atan2(-t.z, t.x);
    const yawRate = dt ? wrap(yaw - this.yaw) / dt : 0;
    this.yaw = yaw;
    this.pitch = p.y < 0.05 ? 0 : Math.asin(MathUtils.clamp(t.y, -1, 1));
    this.roll += (MathUtils.clamp(-yawRate * 0.55, -0.55, 0.55) - this.roll) * Math.min(1, dt * 2.5);
    this.orient();
    if (!this.departed && p.y > 3) {
      this.departed = true;
      if (this.departedAt === 'kerala') this.refs.departures.setStatus('DEPARTED', performance.now());
    }
    if (r.s >= r.length - 0.5 && this.v < 1) this.arrive(this.dest);
  }

  // Manual: ↑/W climb, ↓/S dive, ←/→ bank and turn, Shift faster, Space slower.
  flyManual(dt, keys) {
    const pitchIn = keys.forward;
    const rollIn = keys.strafe;
    if (pitchIn) this.pitch += pitchIn * 0.85 * dt;
    else this.pitch += -this.pitch * Math.min(1, dt * 0.6); // eases back to level
    this.pitch = MathUtils.clamp(this.pitch, -0.6, this.plane.position.y > 420 ? 0 : 0.6);
    this.roll += (rollIn * 0.85 - this.roll) * Math.min(1, dt * 2.2);
    this.yaw += -(9.81 * Math.tan(this.roll) / Math.max(this.v, 20)) * 1.7 * dt;
    if (keys.run) this.v += 14 * dt;
    if (keys.brake) this.v -= 14 * dt;
    this.v = MathUtils.clamp(this.v, 36, 95);
    const f = this.forward(tmp);
    this.plane.position.addScaledVector(f, this.v * dt);
    this.orient();
    const p = this.plane.position;
    // a gentle touchdown on either runway becomes a landing
    if (p.y <= 0.4 && this.runwayAt(p.x, p.z) && this.landingOk()) {
      p.y = 0;
      this.mode = 'rollout';
      this.landedAt = this.runwayAt(p.x, p.z);
      this.hud();
      return;
    }
    // touched the ground anywhere else (short of the runway, too hard): rescue
    if (p.y < 0.25) {
      p.y = 0.25;
      this.startRescue({ t: 0.1, kind: 'ground' });
      return;
    }
    // wandered off the map: autopilot brings you back
    if (Math.abs(p.x) > 900 || p.z > 650 || p.z < -1150) {
      this.ui.toast('Too far out. Autopilot is bringing you back.');
      this.engageAutopilot(this.dest);
      return;
    }
    const danger = this.predict();
    if (danger && !(danger.kind === 'runway' && this.landingOk())) this.startRescue(danger);
  }

  // Braking down the runway after a hand-flown landing.
  rollOut(dt) {
    const p = this.plane.position;
    const rw = AIRPORTS[this.landedAt].runway;
    this.v = Math.max(0, this.v - 12 * dt);
    const dir = Math.cos(this.yaw) >= 0 ? 0 : Math.PI;
    this.yaw += wrap(dir - this.yaw) * Math.min(1, dt * 2);
    this.pitch += -this.pitch * Math.min(1, dt * 4);
    this.roll += -this.roll * Math.min(1, dt * 4);
    p.z += (rw.z - p.z) * Math.min(1, dt * 1.5);
    p.x += Math.cos(this.yaw) * this.v * dt;
    p.y = 0;
    // run out of runway: stop hard at the end
    if (p.x < rw.x0 + 14 || p.x > rw.x1 - 14) this.v = Math.max(0, this.v - 30 * dt);
    this.orient();
    if (this.v <= 0.2) {
      this.ui.toast(`Landed at ${AIRPORTS[this.landedAt].name}. Nice flying.`);
      this.arrive(this.landedAt);
    }
  }

  orient() {
    this.plane.rotation.set(this.roll, this.yaw, this.pitch, 'YZX');
    const low = this.plane.position.y < 14;
    this.gear.forEach((g) => (g.visible = low));
  }

  /* ------------------------------------------------ the rescue */

  startRescue(danger) {
    this.mode = 'rescue';
    this.rescues += 1;
    const p = this.plane.position;
    const f = this.forward();
    const side = new Vector3(-f.z, 0, f.x).normalize();
    this.rescue = {
      t: 0,
      approach: danger.t < 0.8 ? 0.55 : 0.95,
      from: p.clone().addScaledVector(up, 70).addScaledVector(side, 45).addScaledVector(f, 40),
      safeYaw: this.safeHeading(),
      startY: p.y,
    };
    const r = this.rescuer;
    r.root.visible = true;
    r.root.position.copy(this.rescue.from);
    r.pose('fall');
    r.lean(1.15);
    this.ui.flight({ ...this.hudState(), banner: 'Mayday. Rescue unit on its way.' });
  }

  // Head for open water between the coasts, away from towers and land.
  safeHeading() {
    const p = this.plane.position;
    return Math.atan2(-(-232 - p.z), 330 - p.x);
  }

  attachPoint(out) {
    return out.set(9, -1.9, 0).applyMatrix4(this.plane.matrixWorld);
  }

  flyRescue(dt) {
    const R = this.rescue;
    R.t += dt;
    const r = this.rescuer;
    const p = this.plane.position;
    const A = R.approach;
    if (R.t < A) {
      // the plane falls in slow motion while the robot dives in
      const slow = dt * 0.25;
      this.plane.position.addScaledVector(this.forward(tmp), this.v * slow);
      p.y = Math.max(p.y, 2);
      this.orient();
      const k = easeInOut(R.t / A);
      this.plane.updateMatrixWorld();
      const target = this.attachPoint(new Vector3());
      r.root.position.lerpVectors(R.from, target, k);
      r.root.position.y += Math.sin(Math.PI * k) * 12;
      r.root.lookAt(target.x, r.root.position.y, target.z);
      return;
    }
    if (R.t < A + 3.2) {
      // caught: level the wings, slow down, climb, and turn out to sea
      if (!R.caught) {
        R.caught = true;
        r.pose('holding-both');
        r.lean(0);
        this.ui.flight({ ...this.hudState(), banner: 'Caught it.' });
      }
      this.v += (32 - this.v) * Math.min(1, dt * 1.5);
      this.pitch += (0.42 - this.pitch) * Math.min(1, dt * 2);
      this.roll += -this.roll * Math.min(1, dt * 3);
      this.yaw += wrap(R.safeYaw - this.yaw) * Math.min(1, dt * 0.8);
      p.addScaledVector(this.forward(tmp), this.v * dt);
      p.y = Math.max(p.y, 2);
      this.orient();
      this.plane.updateMatrixWorld();
      this.attachPoint(r.root.position);
      r.root.quaternion.copy(this.plane.quaternion).multiply(new Quaternion().setFromEuler(new Euler(0, -Math.PI / 2, 0)));
      return;
    }
    if (R.t < A + 4.8) {
      // let go: the robot flies off, the plane levels out
      if (!R.released) {
        R.released = true;
        R.leaveFrom = r.root.position.clone();
        r.pose('fall');
        r.lean(0.4);
      }
      const k = (R.t - A - 3.2) / 1.6;
      this.v += (58 - this.v) * Math.min(1, dt * 1.2);
      this.pitch += (0.08 - this.pitch) * Math.min(1, dt * 2);
      this.yaw += wrap(R.safeYaw - this.yaw) * Math.min(1, dt * 0.8);
      p.addScaledVector(this.forward(tmp), this.v * dt);
      this.orient();
      r.root.position.copy(R.leaveFrom).addScaledVector(up, 90 * k * k).add(new Vector3(0, 0, 0));
      return;
    }
    r.root.visible = false;
    this.mode = 'auto';
    this.engageAutopilot(this.dest);
    this.ui.toast('Saved. Autopilot has the controls; take over any time.');
  }

  /* ------------------------------------------------ camera and HUD */

  snapCamera() {
    this.camPos.copy(this.plane.position).add(new Vector3(-34, 10, 14));
    this.camLook.copy(this.plane.position);
  }

  follow(dt) {
    const p = this.plane.position;
    const nose = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const side = new Vector3(nose.z, 0, -nose.x);
    const zoom = this.rig.distance / 17;
    const want = p.clone();
    if (this.mode === 'rescue') {
      want.addScaledVector(nose, -12).addScaledVector(side, 34 * zoom).add(new Vector3(0, 3, 0));
    } else if (this.mode === 'manual') {
      want.addScaledVector(nose, -30 * zoom).add(new Vector3(0, 9 * zoom, 0));
    } else {
      want.addScaledVector(nose, -30 * zoom).addScaledVector(side, 10 * zoom).add(new Vector3(0, 9 * zoom, 0));
    }
    want.y = Math.max(want.y, 2);
    this.camPos.lerp(want, 1 - Math.exp(-dt * (this.mode === 'manual' ? 4 : 2.2)));
    this.camLook.lerp(p.clone().addScaledVector(nose, this.mode === 'rescue' ? 0 : 12), 1 - Math.exp(-dt * 5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  hudState() {
    return {
      mode: this.mode,
      dest: AIRPORTS[this.dest].name,
      alt: Math.max(0, Math.round(this.plane.position.y)),
      speed: Math.round(this.v * 3.6),
      onGround: this.plane.position.y < 6,
    };
  }

  hud() {
    if (this.mode === 'parked') return;
    this.ui.flight(this.hudState());
  }

  // "Skip" on autopilot: straight to the arrival.
  skip() {
    if (this.mode === 'auto' || this.mode === 'manual') this.arrive(this.dest);
  }
}
