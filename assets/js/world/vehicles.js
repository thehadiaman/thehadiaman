// Cars: ones you drive yourself, and taxis that drive themselves to where you
// ask. Kenney's car models face +z; heading h means facing (sin h, cos h).
import {
  MathUtils, Group, Mesh, ConeGeometry, MeshBasicMaterial, AdditiveBlending,
} from '../../vendor/three.min.js';
import { place } from './assets.js';

const WHEELBASE = 2.5;
const HALF_LEN = 1.8;
const HALF_WIDTH = 1;
const NITRO_SECONDS = 3.2; // a full tank lasts this long
const NITRO_REFILL = 9; // and takes this long to fill back up
const NITRO_TOP = 36; // m/s, about 130 km/h

// Two blue exhaust flames under the back bumper (in the model's own units).
function nitroFlames() {
  const group = new Group();
  const outer = new MeshBasicMaterial({ color: '#4d5dff', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, fog: false });
  const core = new MeshBasicMaterial({ color: '#cdeeff', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false });
  for (const x of [-0.3, 0.3]) {
    for (const [mat, r, len] of [[outer, 0.1, 0.62], [core, 0.05, 0.34]]) {
      const geo = new ConeGeometry(r, len, 10, 1, true).translate(0, len / 2, 0).rotateX(-Math.PI / 2);
      const flame = new Mesh(geo, mat);
      flame.position.set(x, 0.22, -1.36);
      group.add(flame);
    }
  }
  group.visible = false;
  return group;
}

function wrap(a) {
  return MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Car {
  constructor({ scene, world, model, x, z, heading, kind = 'car', home = null }) {
    this.world = world;
    this.kind = kind; // 'car' (you drive) or 'taxi' (drives itself)
    this.mesh = place(model, { scale: 1.3 });
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.h = heading;
    this.v = 0;
    this.steer = 0;
    this.home = home; // where a taxi waits between rides
    this.mode = 'parked'; // parked | manual | auto | loop
    this.path = null;
    this.blockedFor = 0;
    this.reverseFor = 0;
    this.nitro = 1; // tank, 0…1
    this.boosting = false;
    this.flames = null;
    this.sync();
  }

  // Oriented-box test, used by everything that must not drive or walk into this car.
  hits(x, z, r) {
    const rx = x - this.x;
    const rz = z - this.z;
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    return Math.abs(rx * fx + rz * fz) < HALF_LEN + r && Math.abs(rx * fz - rz * fx) < HALF_WIDTH + r;
  }

  // Would the car fit here? Three circles along its length.
  fits(x, z, h) {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    for (const k of [-1.1, 0, 1.1]) {
      if (this.world.blocked(x + fx * k, z + fz * k, 1.0, false, this)) return false;
    }
    return true;
  }

  // Integrate one step of bicycle-model motion; refuse to move into anything.
  move(dt) {
    const h = this.h + ((this.v * Math.tan(this.steer)) / WHEELBASE) * dt;
    const x = this.x + Math.sin(h) * this.v * dt;
    const z = this.z + Math.cos(h) * this.v * dt;
    if (!this.fits(x, z, h)) return false;
    this.x = x;
    this.z = z;
    this.h = h;
    return true;
  }

  // You at the wheel: ↑/W go, ↓/S brake then reverse, ←/→ steer, Shift faster, Space handbrake.
  drive(dt, keys) {
    const f = keys.forward;
    // nitro: hold N for a shove in the back, while the tank lasts
    this.boosting = Boolean(keys.nitro) && this.nitro > 0.01 && f > -0.1 && !keys.brake && this.v > -0.5;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / NITRO_SECONDS);
    else this.nitro = Math.min(1, this.nitro + dt / NITRO_REFILL);
    const top = this.boosting ? NITRO_TOP : keys.run ? 22 : 15;
    if (this.boosting) this.v = Math.max(this.v, Math.min(NITRO_TOP, this.v + 22 * dt));
    else if (f > 0.1) this.v += (this.v < 0 ? 16 : 8) * f * dt;
    else if (f < -0.1) this.v -= (this.v > 0 ? 16 : 6) * -f * dt;
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 3 * dt);
    if (keys.brake) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 22 * dt);
    // over the limit (after a boost): ease back down rather than snapping
    if (this.v > top) this.v = Math.max(top, this.v - 10 * dt);
    this.v = Math.max(this.v, -6);
    this.flame(dt);
    // less steering lock at speed, so it doesn't spin out
    const lock = 0.55 - Math.min(0.28, Math.abs(this.v) * 0.013);
    this.steer += (-keys.strafe * lock - this.steer) * Math.min(1, dt * 8);
    if (!this.move(dt)) this.v *= -0.2; // bump
    this.sync();
  }

  // The exhaust flames: on while boosting, flickering.
  flame(dt) {
    if (!this.flames) {
      if (!this.boosting) return;
      this.flames = nitroFlames();
      this.mesh.add(this.flames);
    }
    this.flameLevel = MathUtils.clamp((this.flameLevel ?? 0) + (this.boosting ? dt * 10 : -dt * 6), 0, 1);
    this.flames.visible = this.flameLevel > 0.01;
    if (!this.flames.visible) return;
    this.flames.children.forEach((m, i) => {
      const flicker = 0.75 + Math.random() * 0.5;
      m.scale.set(1, 1, this.flameLevel * flicker * (i % 2 ? 0.9 : 1));
    });
  }

  // Follow a planned path by pure pursuit; slow for bends and for the stop.
  drivePath(points, arrive) {
    this.path = points.map(([x, z]) => ({ x, z }));
    this.arrive = arrive;
    this.mode = 'auto';
    this.blockedFor = 0;
    this.reverseFor = 0;
  }

  autopilot(dt) {
    if (!this.path) {
      this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 10 * dt);
      this.move(dt);
      this.sync();
      return;
    }
    // drop points already passed
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 3) this.path.shift();
    const look = MathUtils.clamp(Math.abs(this.v) * 0.8, 4, 9);
    const target = this.lookahead(look);
    const end = this.path[this.path.length - 1];
    let remain = Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z);
    for (let i = 1; i < this.path.length; i++) remain += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);

    if (this.reverseFor > 0) {
      // backing out of a tight spot
      this.reverseFor -= dt;
      this.v = -3;
      this.steer = -this.reverseSteer;
      this.move(dt);
      this.sync();
      return;
    }
    const alpha = wrap(Math.atan2(target.x - this.x, target.z - this.z) - this.h);
    const steer = MathUtils.clamp(Math.atan2(2 * WHEELBASE * Math.sin(alpha), look), -0.6, 0.6);
    this.steer += (steer - this.steer) * Math.min(1, dt * 6);
    let want = Math.min(this.cruise ?? 13, 3 + 11 * (1 - Math.abs(this.steer) / 0.6));
    want = Math.min(want, Math.sqrt(2 * 5 * Math.max(0, remain - 0.6)));
    if (Math.abs(alpha) > 1.6) want = Math.min(want, 3); // turning round
    this.v += MathUtils.clamp(want - this.v, -9 * dt, 5 * dt);
    if (!this.move(dt)) {
      this.v = 0;
      this.blockedFor += dt;
      // traffic moves on: wait for it rather than backing away
      const patience = this.trafficAhead() ? 5 : 1.2;
      if (this.blockedFor > patience) {
        this.blockedFor = 0;
        this.reverseFor = 1.1;
        this.reverseSteer = Math.sign(steer) || 1;
        this.stuckCount = (this.stuckCount || 0) + 1;
      }
    } else {
      this.blockedFor = 0;
    }
    this.sync();
    const close = Math.hypot(end.x - this.x, end.z - this.z) < 1.6;
    if ((close && Math.abs(this.v) < 0.6) || this.stuckCount > 6) {
      this.stuckCount = 0;
      this.v = 0;
      this.path = null;
      const done = this.arrive;
      this.arrive = null;
      done?.();
    }
  }

  // Is a moving car (Dubai's ring-road traffic) right in front of us?
  trafficAhead() {
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    for (const d of this.world.dynamic) {
      if (d === this || d.mode !== 'loop') continue;
      if (d.hits(this.x + fx * 2.4, this.z + fz * 2.4, 1.4)) return true;
    }
    return false;
  }

  lookahead(distance) {
    let left = distance;
    let px = this.x;
    let pz = this.z;
    for (const q of this.path) {
      const d = Math.hypot(q.x - px, q.z - pz);
      if (d >= left) return { x: px + ((q.x - px) * left) / d, z: pz + ((q.z - pz) * left) / d };
      left -= d;
      px = q.x;
      pz = q.z;
    }
    return this.path[this.path.length - 1];
  }

  // Where a passenger gets out: beside the car, wherever there is room.
  exitSpot() {
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    for (const [side, along] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1]]) {
      const x = this.x + fz * side * 2.2 + fx * along * 3;
      const z = this.z - fx * side * 2.2 + fz * along * 3;
      if (!this.world.blocked(x, z, 0.45, false, this)) return { x, z };
    }
    return { x: this.x + fz * 2.2, z: this.z - fx * 2.2 };
  }

  sync() {
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    const front = this.world.heightAt(this.x + fx * 1.3, this.z + fz * 1.3);
    const back = this.world.heightAt(this.x - fx * 1.3, this.z - fz * 1.3);
    this.mesh.position.set(this.x, (front + back) / 2, this.z);
    this.mesh.rotation.set(-Math.atan2(front - back, 2.6), this.h, 0, 'YXZ');
  }

  update(dt) {
    if (this.mode === 'auto') this.autopilot(dt);
  }
}
