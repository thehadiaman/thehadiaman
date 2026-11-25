// Hadi, walking around the world.
const WALK = 4.2;
const RUN = 8.6;
const GRAVITY = 20;

function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class Player {
  constructor(actor, world, { x, z, face }) {
    this.actor = actor;
    this.root = actor.root;
    this.world = world;
    this.heading = face;
    this.speed = 0;
    this.route = null; // list of points (walk along the road)
    this.arrive = null;
    this.locked = false;
    this.sitting = false;
    this.seatLift = 0;
    this.standUpTo = null;
    this.busyUntil = 0; // a one-off animation (nod, pick up) is playing
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.stuck = 0;
    this.side = 1; // which way we last stepped around something
    this.onStuck = null;
    this.faceTo = null; // a direction to turn to once standing still
    this.time = 0;
    // Hadi as an obstacle for cars (only while he's on foot)
    this.body = {
      hits: (x, z, r) => this.root.visible && !this.locked
        && Math.hypot(x - this.root.position.x, z - this.root.position.z) < r + 0.4,
    };
    this.teleport(x, z, face);
    actor.play('idle');
  }

  get position() {
    return this.root.position;
  }

  // Turn smoothly to face a direction once he has stopped.
  turnTo(face) {
    this.faceTo = face;
  }

  teleport(x, z, face = this.heading) {
    this.stop();
    this.faceTo = null;
    this.sitting = false;
    this.seatLift = 0;
    this.standUpTo = null;
    this.heading = face;
    this.y = this.world.heightAt(x, z);
    this.root.position.set(x, this.y, z);
    this.root.rotation.y = face;
    this.speed = 0;
  }

  stop() {
    this.route = null;
    this.arrive = null;
    this.onStuck = null;
  }

  // Walk a planned path. onStuck runs if something blocks the way for a moment.
  follow(points, arrive, onStuck) {
    this.stand();
    this.busyUntil = 0;
    this.route = points.map(([x, z]) => ({ x, z }));
    this.arrive = arrive;
    this.onStuck = onStuck;
    this.stuck = 0;
  }

  get moving() {
    return Boolean(this.route) || this.speed > 0.3;
  }

  // A one-off gesture; movement input interrupts it.
  gesture(name, seconds = 1.6) {
    // only when standing still: never interrupt a walk
    if (this.sitting || this.airborne || this.route || this.speed > 0.5) return;
    this.actor.play(name, { once: true, then: 'idle' });
    this.busyUntil = this.time + seconds;
  }

  // Sit down at (x, z) facing `face`. `lift` raises him onto a taller seat;
  // `up` is where he steps to when he stands (clear of the seat's collider).
  sit(x, z, face, { lift = 0, up = null } = {}) {
    this.stop();
    this.faceTo = null;
    this.root.position.x = x;
    this.root.position.z = z;
    this.heading = face;
    this.root.rotation.y = face;
    this.speed = 0;
    this.sitting = true;
    this.seatLift = lift;
    this.standUpTo = up;
    this.actor.play('sit', { fade: 0.35 });
  }

  stand() {
    if (!this.sitting) return;
    this.sitting = false;
    this.seatLift = 0;
    if (this.standUpTo) {
      const [x, z] = this.standUpTo;
      this.standUpTo = null;
      this.root.position.x = x;
      this.root.position.z = z;
    }
    this.actor.play('idle', { fade: 0.3 });
  }

  jump() {
    if (this.airborne || this.sitting || this.locked) return;
    this.airborne = true;
    this.vy = 6.2;
    this.actor.play('jump', { once: true, then: 'idle', fade: 0.1 });
  }

  update(dt, keys, rig) {
    this.time += dt;
    if (this.locked) {
      this.actor.update(dt);
      return;
    }
    const pos = this.root.position;
    let dx = 0;
    let dz = 0;
    let run = keys.run;
    const f = keys.forward;
    const s = keys.strafe;
    if (f || s) {
      this.stand();
      this.stop();
      this.busyUntil = 0;
      const fw = rig.forward();
      const rt = rig.right();
      dx = fw.x * f + rt.x * s;
      dz = fw.z * f + rt.z * s;
    } else if (this.route) {
      const target = this.route[0];
      const tx = target.x - pos.x;
      const tz = target.z - pos.z;
      const d = Math.hypot(tx, tz);
      const last = this.route.length === 1;
      if (d < (last ? 0.35 : 0.9)) {
        this.route.shift();
        if (!this.route.length) this.finish();
      } else {
        dx = tx / d;
        dz = tz / d;
        // run while there's a way to go, ease into a walk for the last few metres
        // (measured along the whole route, so corners don't cause a slow-down)
        let left = d;
        for (let k = 1; k < this.route.length; k++) {
          left += Math.hypot(this.route[k].x - this.route[k - 1].x, this.route[k].z - this.route[k - 1].z);
        }
        run = left > 5;
      }
    }

    const len = Math.hypot(dx, dz);
    const want = len > 0.01 && this.time >= this.busyUntil ? (run ? RUN : WALK) : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * 9);
    let faceX = dx;
    let faceZ = dz;
    if (len > 0.01) {
      dx /= len;
      dz /= len;
      faceX = dx;
      faceZ = dz;
    }
    if (this.speed > 0.05 && len > 0.01) {
      const moved = this.step(dx, dz, this.speed * dt, Boolean(this.route));
      if (moved) {
        [faceX, faceZ] = moved;
        this.stuck = Math.max(0, this.stuck - dt);
      } else {
        this.stuck += dt;
        if (this.stuck > 0.6 && this.route) {
          this.stuck = 0;
          const end = this.route[this.route.length - 1];
          // close enough to where we were going: call it arrived
          if (Math.hypot(end.x - pos.x, end.z - pos.z) < 1.6) this.finish();
          else if (this.onStuck) this.onStuck();
          else this.finish();
        }
      }
    }
    if (len > 0.01) {
      this.faceTo = null;
      this.heading = angleLerp(this.heading, Math.atan2(faceX, faceZ), Math.min(1, dt * 9));
    } else if (this.faceTo !== null && this.speed < 0.5) {
      this.heading = angleLerp(this.heading, this.faceTo, Math.min(1, dt * 5));
    }

    const ground = this.world.heightAt(pos.x, pos.z);
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        this.y = ground;
        this.airborne = false;
      }
    } else {
      const want = ground + (this.sitting ? this.seatLift : 0);
      this.y += (want - this.y) * Math.min(1, dt * (this.sitting ? 8 : 14));
    }
    pos.y = this.y;
    this.root.rotation.y = this.heading;

    if (!this.sitting && !this.airborne && this.time >= this.busyUntil) {
      if (this.speed > 6) this.actor.play('sprint', { speed: this.speed / RUN });
      else if (this.speed > 0.4) this.actor.play('walk', { speed: Math.max(0.6, this.speed / WALK) });
      else this.actor.play('idle');
    }
    this.actor.update(dt);
  }

  // Take one step, bending around whatever is in the way (palms, posts, a car).
  // Returns the direction actually walked, or null if every way is blocked.
  step(dx, dz, distance, wide) {
    const pos = this.root.position;
    for (const a0 of wide ? [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25] : [0, 0.4, -0.4, 0.8, -0.8]) {
      const a = a0 * this.side;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      // a bent step is shorter, so we slide along walls rather than bounce off them
      const k = distance * Math.max(0.35, Math.cos(a));
      const nx = pos.x + rx * k;
      const nz = pos.z + rz * k;
      if (!this.world.blocked(nx, nz, 0.35, false, this.body)) {
        pos.x = nx;
        pos.z = nz;
        if (a0) this.side = Math.sign(a);
        return [rx, rz];
      }
    }
    return null;
  }

  finish() {
    const done = this.arrive;
    this.route = null;
    this.arrive = null;
    this.onStuck = null;
    done?.();
  }
}
