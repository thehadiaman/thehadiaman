// The roads as they are actually drawn: smooth curves through the layout's
// points, with a width. Everything that needs to know "is this on a road?"
// (drawing, scenery placement, lamps, the path planner) asks here, so the
// answer always matches what you see.
import { CatmullRomCurve3, Vector3 } from '../../vendor/three.min.js';
import { ROAD_KERALA, ROAD_DUBAI, DUBAI_LOOP } from './layout.js';

const curve = (points, closed) => new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), closed, 'centripetal');

export const ROADS = {
  // laterite footpath through Kerala (drawn 4.2 m wide including its darker edge)
  kerala: { curve: curve(ROAD_KERALA, false), width: 4.2, foot: true },
  // the paved walk from Dubai arrivals into the city
  dubaiWalk: { curve: curve(ROAD_DUBAI, false), width: 5, foot: true },
  // Dubai's ring road, where the taxis drive
  loop: { curve: curve(DUBAI_LOOP, true), width: 8, foot: false },
};

// Sample every road densely and bucket the samples, so lookups stay cheap.
const CELL = 4;
const buckets = new Map();
for (const [name, road] of Object.entries(ROADS)) {
  const length = road.curve.getLength();
  road.length = length;
  const steps = Math.ceil(length / 0.5);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = road.curve.getPointAt(u);
    const sample = { x: p.x, z: p.z, half: road.width / 2, foot: road.foot, name, u };
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(sample);
  }
}

/**
 * Distance from (x, z) to the nearest road edge: negative means on the road.
 * Only looks `reach` metres around; beyond that it returns `reach`.
 * which: 'foot' for footpaths only, 'car' for the ring road only.
 */
export function roadClearance(x, z, { reach = 8, which = null } = {}) {
  const r = Math.ceil((reach + 4) / CELL);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = reach;
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      const list = buckets.get(`${ix},${iz}`);
      if (!list) continue;
      for (const s of list) {
        if (which === 'foot' && !s.foot) continue;
        if (which === 'car' && s.foot) continue;
        const d = Math.hypot(x - s.x, z - s.z) - s.half;
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/**
 * Points beside a road: every `step` metres between curve positions u0 and u1,
 * `offset` metres from the road's edge, on `side` (+1 left, −1 right of travel).
 * Each comes with the direction pointing back at the road.
 */
export function alongRoad(road, { u0 = 0, u1 = 1, step, offset, side = 1 }) {
  const out = [];
  const t = new Vector3();
  const from = u0 * road.length;
  const to = u1 * road.length;
  for (let d = from + step / 2; d < to; d += step) {
    const u = d / road.length;
    const p = road.curve.getPointAt(u);
    road.curve.getTangentAt(u, t);
    // left of travel is (−t.z, t.x) when looking down on the map
    const nx = -t.z * side;
    const nz = t.x * side;
    const k = road.width / 2 + offset;
    out.push({ x: p.x + nx * k, z: p.z + nz * k, towardX: -nx, towardZ: -nz });
  }
  return out;
}
