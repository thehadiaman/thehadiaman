// Zombie apocalypse: a secret mode (press H five times). Night falls under a red
// moon and the dead shamble after Hadi. Outrun them (Shift), punch them (F),
// or drive through them. Three bites and he wakes up back at the last stop.
import { Actor } from './actors.js';

const MAX_ALIVE = 9;
const BITE_RANGE = 1.45;
const PUNCH_RANGE = 2.5;
const HEARTS = 3;

export class Apocalypse {
  constructor({ scene, world, nav, player, ui, dayNight }) {
    this.scene = scene;
    this.world = world;
    this.nav = nav;
    this.player = player;
    this.ui = ui;
    this.dayNight = dayNight;
    this.active = false;
    this.zombies = [];
    this.model = null;
    this.clips = null;
    this.hearts = HEARTS;
    this.downed = 0;
    this.time = 0;
    this.biteCooldown = 0;
    this.onCaught = null; // main: take him back to the last stop
    this.seed = 99;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  start(model, clips) {
    this.model = model;
    this.clips = clips;
    this.active = true;
    this.hearts = HEARTS;
    this.downed = 0;
    this.time = 0;
    this.dayNight.haunt(true);
    for (let i = 0; i < MAX_ALIVE; i++) this.spawn(this.zombies[i]);
    this.hud();
  }

  stop() {
    this.active = false;
    this.dayNight.haunt(false);
    for (const z of this.zombies) z.actor.root.visible = false;
    this.ui.zombie(null);
  }

  // A walkable spot 16–30 m from Hadi, out of his way.
  spot() {
    const p = this.player.position;
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rand() * Math.PI * 2;
      const d = 16 + this.rand() * 14;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (this.nav.open(this.nav.indexOf(x, z)) && !this.world.blocked(x, z, 0.45)) return { x, z };
    }
    return null;
  }

  spawn(existing) {
    const at = this.spot();
    if (!at) return existing ?? null;
    let z = existing;
    if (!z) {
      const actor = new Actor(this.model, this.clips);
      this.scene.add(actor.root);
      z = {
        actor,
        arms: { l: actor.bone('arm-left'), r: actor.bone('arm-right') },
        speed: 0,
        path: null,
        replan: 0,
        side: 1,
      };
      this.zombies.push(z);
    }
    z.state = 'walk';
    z.down = 0;
    z.speed = 1.5 + this.rand() * 0.9; // Hadi walks at 4.2 and runs at 8.6
    z.phase = this.rand() * 10;
    z.replan = this.rand() * 1.2;
    z.path = null;
    z.actor.root.visible = true;
    z.actor.root.position.set(at.x, this.world.heightAt(at.x, at.z) - 1.6, at.z); // they rise out of the ground
    z.rising = 1;
    z.actor.play('walk', { speed: 0.55 });
    return z;
  }

  hud() {
    this.ui.zombie({ hearts: this.hearts, max: HEARTS, downed: this.downed });
  }

  // F: a right hook. Knocks down every zombie close in front of him.
  punch() {
    if (!this.active || !this.player.punch()) return;
    const p = this.player.position;
    const fx = Math.sin(this.player.heading);
    const fz = Math.cos(this.player.heading);
    setTimeout(() => {
      for (const z of this.zombies) {
        if (z.state !== 'walk' || z.rising > 0) continue;
        const r = z.actor.root.position;
        const dx = r.x - p.x;
        const dz = r.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < PUNCH_RANGE && (dx * fx + dz * fz) / (d || 1) > 0.25) this.knock(z, dx / (d || 1), dz / (d || 1));
      }
    }, 180);
  }

  knock(z, dx, dz) {
    z.state = 'down';
    z.down = 0;
    z.fly = { x: dx * 6, z: dz * 6 };
    z.actor.root.rotation.y = Math.atan2(-dx, -dz); // falls away from the hit
    z.actor.play('die', { once: true, then: null, fade: 0.08 });
    this.downed += 1;
    this.hud();
  }

  update(dt, { mode, vehicle }) {
    if (!this.active) return;
    this.time += dt;
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    const p = this.player.position;
    const onFoot = mode === 'walk';
    for (const z of this.zombies) {
      const root = z.actor.root;
      if (!root.visible) continue;
      z.actor.update(dt);
      const ground = this.world.heightAt(root.position.x, root.position.z);
      if (z.state === 'down') {
        z.down += dt;
        // thrown back, sliding to a stop
        const k = Math.exp(-dt * 5);
        z.fly.x *= k;
        z.fly.z *= k;
        const nx = root.position.x + z.fly.x * dt;
        const nz = root.position.z + z.fly.z * dt;
        if (!this.world.blocked(nx, nz, 0.3)) root.position.set(nx, ground, nz);
        // after a while they sink back into the ground, and another one rises
        if (z.down > 3.5) root.position.y = ground - (z.down - 3.5) * 1.2;
        if (z.down > 5) this.spawn(z);
        continue;
      }
      if (z.rising > 0) {
        z.rising = Math.max(0, z.rising - dt * 0.7);
        root.position.y = ground - z.rising * 1.6;
      } else {
        root.position.y = ground;
      }
      // drift them back in if he has gone far (a chapter jump, a flight)
      const dx = p.x - root.position.x;
      const dz = p.z - root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 70 && mode !== 'fly') {
        this.spawn(z);
        continue;
      }
      // run over by a car
      if (vehicle && Math.abs(vehicle.v) > 3 && vehicle.hits(root.position.x, root.position.z, 0.45)) {
        this.knock(z, Math.sin(vehicle.h) * Math.sign(vehicle.v), Math.cos(vehicle.h) * Math.sign(vehicle.v));
        continue;
      }
      if (mode === 'fly' || z.rising > 0.3) {
        this.pose(z);
        continue;
      }
      // walk at him: straight when close, by the planner when further off
      let tx = p.x;
      let tz = p.z;
      z.replan -= dt;
      if (d > 5) {
        if (z.replan <= 0 || !z.path?.length) {
          z.replan = 1.2;
          z.path = this.nav.find(root.position.x, root.position.z, p.x, p.z)?.points ?? null;
        }
        while (z.path?.length && Math.hypot(z.path[0][0] - root.position.x, z.path[0][1] - root.position.z) < 0.8) z.path.shift();
        if (z.path?.length) [tx, tz] = z.path[0];
      }
      const ux = tx - root.position.x;
      const uz = tz - root.position.z;
      const len = Math.hypot(ux, uz) || 1;
      const stopAt = onFoot ? BITE_RANGE * 0.85 : 1.8;
      if (d > stopAt) this.step(z, ux / len, uz / len, z.speed * dt);
      // lurch round to face him
      const turn = ((Math.atan2(dx, dz) - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      root.rotation.y += turn * Math.min(1, dt * 4) + Math.sin(this.time * 2 + z.phase) * 0.004;
      // close enough to bite
      if (onFoot && d < BITE_RANGE && this.biteCooldown === 0 && !this.player.locked) this.bite(dx, dz, d);
      this.pose(z);
    }
  }

  // One shambling step, bending round whatever is in the way.
  step(z, dx, dz, distance) {
    const pos = z.actor.root.position;
    for (const a0 of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const a = a0 * z.side;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      const nx = pos.x + rx * distance;
      const nz = pos.z + rz * distance;
      if (this.world.blocked(nx, nz, 0.35)) continue;
      // keep a little apart from each other
      if (this.zombies.some((o) => o !== z && o.state === 'walk' && o.actor.root.visible
        && Math.hypot(o.actor.root.position.x - nx, o.actor.root.position.z - nz) < 1.3
        && Math.hypot(o.actor.root.position.x - pos.x, o.actor.root.position.z - pos.z) > Math.hypot(o.actor.root.position.x - nx, o.actor.root.position.z - nz))) continue;
      pos.x = nx;
      pos.z = nz;
      if (a0) z.side = Math.sign(a);
      return;
    }
  }

  bite(dx, dz, d) {
    this.biteCooldown = 1.3;
    this.hearts -= 1;
    this.ui.flash();
    // knocked back a step
    const p = this.player.position;
    const bx = p.x + (dx / (d || 1)) * 1.4;
    const bz = p.z + (dz / (d || 1)) * 1.4;
    if (!this.world.blocked(bx, bz, 0.4)) {
      p.x = bx;
      p.z = bz;
    }
    if (this.hearts <= 0) {
      this.hearts = HEARTS;
      this.onCaught?.();
      // give him room when he wakes up
      setTimeout(() => this.zombies.forEach((z) => z.state === 'walk' && this.spawn(z)), 700);
    }
    this.hud();
  }

  // Arms out in front, as zombies do (this rig's arms point sideways at rest:
  // turning them about y swings them forward).
  pose(z) {
    const { l, r } = z.arms;
    if (!l || !r) return;
    const sway = Math.sin(this.time * 3 + z.phase) * 0.12;
    l.rotation.set(0, -1.4 + sway, 0.15);
    r.rotation.set(0, 1.4 + sway, -0.15);
  }
}
