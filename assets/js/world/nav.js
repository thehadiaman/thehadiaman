// Path finding: a 1 m grid over both islands, A* with a preference for the
// footpath, then the path is straightened wherever a straight line is clear
// and no more expensive.
import { KERALA, DUBAI } from './layout.js';
import { roadClearance } from './roads.js';

// Default costs are for walking: footpaths cheap, the taxis' road avoided.
const WALKING = { foot: 0.55, car: 1.6, grass: 1 };

function bounds(points, pad) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
}
const ISLANDS = [bounds(KERALA, 1), bounds(DUBAI, 1)];

class Heap {
  constructor() {
    this.items = [];
    this.keys = [];
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items.length = 0;
    this.keys.length = 0;
  }

  push(item, key) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop() {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < n && keys[r] < mk) m = r;
        if (m === i) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

export class NavGrid {
  constructor(world, { x0 = -100, x1 = 100, z0 = -530, z1 = 128, cell = 1, radius = 0.45, costs = WALKING } = {}) {
    this.world = world;
    this.costs = costs;
    this.minCost = Math.min(costs.foot, costs.car, costs.grass);
    this.x0 = x0;
    this.z0 = z0;
    this.cell = cell;
    this.radius = radius;
    this.w = Math.ceil((x1 - x0) / cell);
    this.h = Math.ceil((z1 - z0) / cell);
    const n = this.w * this.h;
    this.cost = new Float32Array(n);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.done = new Uint32Array(n);
    this.run = 0;
    this.heap = new Heap();
    this.fill(0, 0, this.w - 1, this.h - 1);
  }

  centre(i) {
    return [this.x0 + ((i % this.w) + 0.5) * this.cell, this.z0 + (Math.floor(i / this.w) + 0.5) * this.cell];
  }

  fill(ix0, iz0, ix1, iz1) {
    const { world, radius } = this;
    for (let iz = Math.max(0, iz0); iz <= Math.min(this.h - 1, iz1); iz++) {
      const z = this.z0 + (iz + 0.5) * this.cell;
      for (let ix = Math.max(0, ix0); ix <= Math.min(this.w - 1, ix1); ix++) {
        const x = this.x0 + (ix + 0.5) * this.cell;
        let c = 0;
        const island = ISLANDS.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
        if (island && !world.blocked(x, z, radius, true)) {
          // footpaths are cheap; the taxis' ring road is crossed, not walked along
          const foot = roadClearance(x, z, { reach: 1, which: 'foot' }) < -0.4;
          const carRoad = !foot && roadClearance(x, z, { reach: 1, which: 'car' }) < 0;
          c = foot ? this.costs.foot : carRoad ? this.costs.car : this.costs.grass;
        }
        this.cost[iz * this.w + ix] = c;
      }
    }
  }

  // Re-read an area after something in it moved (the plane).
  refresh({ x0, x1, z0, z1 }) {
    this.fill(
      Math.floor((x0 - this.x0) / this.cell) - 2,
      Math.floor((z0 - this.z0) / this.cell) - 2,
      Math.ceil((x1 - this.x0) / this.cell) + 2,
      Math.ceil((z1 - this.z0) / this.cell) + 2,
    );
  }

  indexOf(x, z) {
    const ix = Math.floor((x - this.x0) / this.cell);
    const iz = Math.floor((z - this.z0) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }

  open(i) {
    return i >= 0 && this.cost[i] > 0;
  }

  // The nearest walkable cell, searching outwards in rings.
  nearestOpen(x, z, maxRing = 14) {
    const ix = Math.floor((x - this.x0) / this.cell);
    const iz = Math.floor((z - this.z0) / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let ring = 0; ring <= maxRing && best < 0; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h) continue;
          const i = jz * this.w + jx;
          if (this.cost[i] <= 0) continue;
          const [cx, cz] = this.centre(i);
          const d = Math.hypot(cx - x, cz - z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  /**
   * Points from (sx, sz) to (tx, tz), or null if there is no way there.
   * If the target itself is blocked, the path ends at the nearest open spot;
   * `end` tells you where that is.
   */
  find(sx, sz, tx, tz, { avoidTraffic = false } = {}) {
    let start = this.indexOf(sx, sz);
    if (!this.open(start)) start = this.nearestOpen(sx, sz, 4);
    // the exact spot must fit a person, not just its grid cell
    const goalOpen = this.open(this.indexOf(tx, tz)) && !this.world.blocked(tx, tz, this.radius - 0.05, true);
    const goal = goalOpen ? this.indexOf(tx, tz) : this.nearestOpen(tx, tz);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return { points: [[goalOpen ? tx : this.centre(goal)[0], goalOpen ? tz : this.centre(goal)[1]]], end: goalOpen ? [tx, tz] : this.centre(goal) };

    const { w, cost, g, from, seen, done, heap } = this;
    const run = ++this.run;
    const gx = goal % w;
    const gz = Math.floor(goal / w);
    const h = (i) => {
      const dx = Math.abs((i % w) - gx);
      const dz = Math.abs(Math.floor(i / w) - gz);
      return this.minCost * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
    };
    heap.clear();
    g[start] = 0;
    seen[start] = run;
    from[start] = -1;
    heap.push(start, h(start));
    let found = false;
    let expanded = 0;
    while (heap.size) {
      const i = heap.pop();
      if (done[i] === run) continue;
      done[i] = run;
      if (i === goal) {
        found = true;
        break;
      }
      if (++expanded > 120000) break;
      const ix = i % w;
      const iz = Math.floor(i / w);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= w || jz >= this.h) continue;
          const j = jz * w + jx;
          if (cost[j] <= 0 || done[j] === run) continue;
          if (avoidTraffic && this.trafficAt(j, sx, sz)) continue;
          // no cutting corners past blocked cells
          if (dx && dz && (cost[iz * w + jx] <= 0 || cost[jz * w + ix] <= 0)) continue;
          const step = (dx && dz ? Math.SQRT2 : 1) * (cost[i] + cost[j]) * 0.5;
          const ng = g[i] + step;
          if (seen[j] !== run || ng < g[j]) {
            seen[j] = run;
            g[j] = ng;
            from[j] = i;
            heap.push(j, ng + h(j));
          }
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let i = goal; i >= 0; i = from[i]) cells.push(i);
    cells.reverse();
    const points = this.straighten(cells).map((i) => this.centre(i));
    points.shift(); // that's where we are
    const end = goalOpen ? [tx, tz] : this.centre(goal);
    if (points.length) points[points.length - 1] = end;
    else points.push(end);
    return { points, end };
  }

  // A car standing in this cell right now (only checked near the start, where it matters).
  trafficAt(i, sx, sz) {
    const [x, z] = this.centre(i);
    if (Math.abs(x - sx) > 30 || Math.abs(z - sz) > 30) return false;
    return this.world.dynamic.some((d) => !d.nav && d.hits(x, z, 0.6));
  }

  // Cost of walking a straight line between two cells, or Infinity if blocked.
  // Checks the real obstacles too: a line can pass through open cells and still
  // clip the corner of a box or the edge of a palm trunk.
  lineCost(a, b) {
    const [ax, az] = this.centre(a);
    const [bx, bz] = this.centre(b);
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.25)));
    let total = 0;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const i = this.indexOf(x, z);
      if (!this.open(i) || this.world.blocked(x, z, this.radius - 0.03, true)) return Infinity;
      total += this.cost[i];
    }
    return (total / steps) * len;
  }

  // Greedy string-pulling: skip ahead while the shortcut is clear and no dearer
  // than the stretch of path it replaces (so a path along the road stays on it).
  straighten(cells) {
    if (cells.length < 3) return cells;
    const acc = [0];
    for (let k = 1; k < cells.length; k++) {
      const [ax, az] = this.centre(cells[k - 1]);
      const [bx, bz] = this.centre(cells[k]);
      acc.push(acc[k - 1] + Math.hypot(bx - ax, bz - az) * (this.cost[cells[k - 1]] + this.cost[cells[k]]) * 0.5);
    }
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = i + 1;
      while (j + 1 < cells.length && this.lineCost(cells[i], cells[j + 1]) <= acc[j + 1] - acc[i] + 0.05) j++;
      out.push(cells[j]);
      i = j;
    }
    return out;
  }
}
