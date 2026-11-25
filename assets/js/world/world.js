// What the world knows about itself: where you can walk, how high the ground is,
// and the things that move every frame.
import { BRIDGE } from './layout.js';
import { roadClearance } from './roads.js';

function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function polylineDistance(points, x, z, closed = false) {
  let best = Infinity;
  const n = points.length;
  for (let i = 1; i < n + (closed ? 1 : 0); i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i % n];
    best = Math.min(best, segmentDistance(x, z, ax, az, bx, bz));
  }
  return best;
}

const CELL = 8; // spatial hash cell, metres
const REACH = 2; // colliders are indexed this far beyond their edges, so radius ≤ 2 needs one lookup

export class World {
  constructor(land) {
    this.land = land;
    this.boxes = [];
    this.circles = [];
    this.hash = new Map();
    this.dynamic = []; // moving obstacles: { hits(x, z, r) }
    this.updaters = [];
    this.refs = {};
  }

  index(item, x0, x1, z0, z1) {
    for (let ix = Math.floor((x0 - REACH) / CELL); ix <= Math.floor((x1 + REACH) / CELL); ix++) {
      for (let iz = Math.floor((z0 - REACH) / CELL); iz <= Math.floor((z1 + REACH) / CELL); iz++) {
        const key = `${ix},${iz}`;
        let list = this.hash.get(key);
        if (!list) this.hash.set(key, (list = []));
        list.push(item);
      }
    }
  }

  near(x, z) {
    return this.hash.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  }

  // Walls for walking. `top` (optional) also keeps the camera out of it;
  // `walk: false` makes a box that only the camera respects (e.g. a canopy).
  box(b, pad = 0) {
    const item = {
      kind: 'box',
      x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad,
      bottom: b.bottom ?? 0, top: b.top ?? 0, walk: b.walk ?? true,
    };
    this.boxes.push(item);
    this.index(item, item.x0, item.x1, item.z0, item.z1);
    return item;
  }

  circle(x, z, r) {
    const item = { kind: 'circle', x, z, r };
    this.circles.push(item);
    this.index(item, x - r, x + r, z - r, z + r);
    return item;
  }

  // Is a body of radius r (≤ 2) blocked at (x, z)? The path planner passes
  // forNav, which ignores traffic (cars move; the planner shouldn't route around
  // where a car happened to be).
  blocked(x, z, r = 0.35, forNav = false) {
    if (!this.land.walkable(x, z)) return true;
    if (this.staticHit(x, z, r)) return true;
    for (const d of this.dynamic) if ((!forNav || d.nav) && d.hits(x, z, r)) return true;
    return false;
  }

  staticHit(x, z, r) {
    const list = this.near(x, z);
    if (!list) return false;
    for (const c of list) {
      if (c.kind === 'box') {
        if (c.walk && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
      } else {
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
      }
    }
    return false;
  }

  // Is there a building (or canopy) at this point in space? Used to keep the camera out.
  solidAt(x, y, z) {
    const list = this.near(x, z);
    if (!list) return false;
    for (const c of list) {
      if (c.kind !== 'box' || !c.top) continue;
      if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && y > c.bottom - 0.4 && y < c.top + 0.4) return true;
    }
    return false;
  }

  // Ground height: flat, except the arched bridge over the lagoon.
  heightAt(x, z) {
    if (x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5 && z > BRIDGE.z0 && z < BRIDGE.z1) {
      return bridgeHeight(z);
    }
    return 0;
  }

  // Free for scenery: not blocked, at least `road` metres from any road's edge,
  // and outside the keep-out circles.
  free(x, z, { road = 0.5, keepOut = [], gap = 1.5 } = {}) {
    if (!this.land.walkable(x, z) || this.staticHit(x, z, gap)) return false;
    if (roadClearance(x, z, { reach: road + 1 }) < road) return false;
    for (const k of keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r) return false;
    return true;
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  update(t, dt) {
    for (const fn of this.updaters) fn(t, dt);
  }
}

export const BRIDGE_RISE = 1.8;
export function bridgeHeight(z) {
  const u = (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0);
  return BRIDGE_RISE * Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
}

// Seeded random numbers so the scenery is the same on every visit.
export function rng(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
