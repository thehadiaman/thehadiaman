// Dubai: arrivals, a crowd to welcome him, and the city.
import {
  Mesh, SphereGeometry, MeshStandardMaterial, Vector3,
} from '../../vendor/three.min.js';
import { place, scatter, footprint } from './assets.js';
import { createTerminal, createSupertall, createLamp, sandstone } from './structures.js';
import { createFlapBoard } from './flapboard.js';
import { Crowd } from './crowd.js';
import { DUBAI, STOPS, PLACES, RUNWAY_DUBAI, VEHICLES } from './layout.js';
import { inside, SEA_LEVEL } from './terrain.js';
import { rng } from './world.js';
import { ROADS } from './roads.js';
import { Car } from './vehicles.js';
import { windPatch, stillPatch, addSign, taxiSign } from './kerala.js';

export function buildDubai({ scene, M, world, glyphs }) {
  const R = rng(7);
  const refs = world.refs;
  const solid = (obj, shrink = 0.3) => {
    scene.add(obj);
    world.box(footprint(obj, shrink));
    return obj;
  };

  /* ------------------------------------------------ arrivals */
  const hall = createTerminal({ ...PLACES.arrivals, gap0: -4, gap1: 4, name: 'DUBAI  ·  DXB', material: sandstone, front: -1 });
  scene.add(hall.group);
  hall.colliders.forEach((c) => world.box(c));
  refs.arrivals = createFlapBoard({
    glyphs,
    cols: 22,
    rows: 3,
    title: 'ARRIVALS',
    icon: 'arrive',
    clock: true,
    status: { words: [' ', 'EXPECTED', 'LANDED', 'UNDEAD'], span: 6, row: 0 },
    scale: 0.28,
  });
  refs.arrivals.group.position.copy(hall.boardAnchor);
  refs.arrivals.group.rotation.y = Math.PI;
  scene.add(refs.arrivals.group);

  // the welcome: people behind the barriers either side of the exit, who cheer
  // when he walks out (they're filled in once their models have loaded)
  refs.crowd = new Crowd({
    scene,
    world,
    sides: [
      { x0: 3.2, x1: 7.6, z0: -385.8, z1: -374.2, face: -1, rows: 2 },
      { x0: -7.4, x1: -3.2, z0: -385.8, z1: -374.2, face: 1, rows: 2 },
    ],
  });

  // a pair of lamps framing the arrivals plaza, arms reaching towards the walk
  for (const side of [-1, 1]) {
    const lamp = createLamp(side * 9.5, -379);
    lamp.group.rotation.y = side > 0 ? Math.PI : 0;
    scene.add(lamp.group);
    world.box(lamp.collider);
    refs.streetLamps.push(lamp);
  }
  const taxiStand = taxiSign();
  // behind the waiting taxi, out of its way
  taxiStand.position.set(VEHICLES.taxiDubai.x + 3.4, 0, VEHICLES.taxiDubai.z + 1.9);
  taxiStand.rotation.y = Math.PI;
  scene.add(taxiStand);
  world.circle(taxiStand.position.x, taxiStand.position.z, 0.3);
  addSign(scene, world, 'dubai', { number: 8, title: 'Dubai, from 5 Dec 2026', sub: 'Arrivals. Let’s talk.' });

  /* ------------------------------------------------ skyline */
  const tall = createSupertall(8, -448);
  scene.add(tall.group);
  world.box(tall.collider);
  refs.supertall = tall;
  const towers = [
    ['skyB', -30, -420, 15], ['skyC', -42, -462, 14], ['skyE', 32, -420, 15], ['skyA', 40, -462, 17],
    ['skyA', -14, -474, 13], ['skyE', 26, -480, 12], ['skyC', -78, -440, 12], ['skyB', 80, -432, 13],
    ['skyE', -2, -508, 14], ['skyB', -46, -507, 10], ['skyC', 52, -507, 11], ['skyA', -38, -441, 9],
  ];
  for (const [k, x, z, s] of towers) solid(place(M[k], { x, z, rot: Math.floor(R() * 4) * (Math.PI / 2), scale: s }), 0.5);
  solid(place(M.officeC, { x: -42, z: -384, rot: Math.PI / 2, scale: 10 }));
  solid(place(M.officeA, { x: 44, z: -379, rot: -Math.PI / 2, scale: 10 }));
  solid(place(M.officeH, { x: -58, z: -372, rot: Math.PI / 2, scale: 9 }));
  solid(place(M.officeE, { x: 58, z: -370, rot: -Math.PI / 2, scale: 8 }));

  /* ------------------------------------------------ palms, parasols, dunes */
  const loop = ROADS.loop.curve;
  const length = loop.getLength();
  const palms = [];
  for (let d = 0; d < length; d += 11) {
    const p = loop.getPointAt(d / length);
    const t = loop.getTangentAt(d / length);
    for (const side of [-1, 1]) {
      const x = p.x - t.z * side * 6.5;
      const z = p.z + t.x * side * 6.5;
      if (!inside(DUBAI, x, z) || world.blocked(x, z, 1.2)) continue;
      if (Math.hypot(x, z + 386) < 24) continue; // keep the arrivals view open
      palms.push({ x, z, rot: R() * 6.28, scale: 5.5 + R() * 1.5 });
    }
  }
  for (const [x, z] of [[-26, -380], [26, -380]]) palms.push({ x, z, rot: R() * 6.28, scale: 6 });
  scene.add(scatter(M.palmTall, palms.filter((_, i) => i % 2), { patch: windPatch }));
  scene.add(scatter(M.palm, palms.filter((_, i) => !(i % 2)), { patch: windPatch }));
  palms.forEach((p) => world.circle(p.x, p.z, 0.5));
  scene.add(scatter(M.parasol, [
    { x: -15, z: -386, scale: 7 }, { x: 15, z: -387, scale: 7, rot: 1 },
  ]));
  world.circle(-15, -386, 0.8);
  world.circle(15, -387, 0.8);

  const duneMat = new MeshStandardMaterial({ color: '#e3c58f', roughness: 1, flatShading: true });
  for (const [x, z, r] of [[-87, -472, 11], [84, -476, 11], [-80, -404, 9], [86, -410, 10], [-30, -512, 10], [40, -512, 9]]) {
    const dune = new Mesh(new SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), duneMat);
    dune.scale.set(1.4, 0.28, 1);
    dune.position.set(x, -0.2, z);
    dune.receiveShadow = true;
    scene.add(dune);
    world.circle(x, z, r * 1.1);
  }
  const shrubs = [];
  for (let i = 0; i < 600 && shrubs.length < 90; i++) {
    const x = -95 + R() * 190;
    const z = -525 + R() * 200;
    if (Math.abs(z - RUNWAY_DUBAI.z) < RUNWAY_DUBAI.width && x > RUNWAY_DUBAI.x0 - 8 && x < RUNWAY_DUBAI.x1 + 8) continue;
    if (!inside(DUBAI, x, z) || !world.free(x, z, { road: 1.4, keepOut: [{ x: STOPS.dubai.x, z: STOPS.dubai.z, r: 8 }, { x: VEHICLES.carDubai.x, z: VEHICLES.carDubai.z, r: 5 }, { x: VEHICLES.taxiDubai.x, z: VEHICLES.taxiDubai.z, r: 5 }], gap: 1 })) continue;
    shrubs.push({ x, z, rot: R() * 6.28, scale: 2.4 + R() * 1.6 });
  }
  scene.add(scatter(M.bushDetailed, shrubs.filter((_, i) => i % 3 === 0), { patch: stillPatch }));
  scene.add(scatter(M.grassLarge, shrubs.filter((_, i) => i % 3 === 1), { patch: windPatch }));
  scene.add(scatter(M.rockSmallA, shrubs.filter((_, i) => i % 3 === 2)));

  /* ------------------------------------------------ traffic */
  // Cars drive the ring road in one lane. Each keeps its distance from the car
  // ahead and brakes for Hadi (on foot or at the wheel) and for any car that
  // isn't following the loop. A loop car never moves into anyone.
  const L = loop.getLength();
  const p = new Vector3();
  const tangent = new Vector3();
  const lane = (s, out = {}) => {
    const u = (((s % L) + L) % L) / L;
    loop.getPointAt(u, p);
    loop.getTangentAt(u, tangent);
    out.x = p.x - tangent.z * 1.9; // right-hand lane
    out.z = p.z + tangent.x * 1.9;
    out.h = Math.atan2(tangent.x, tangent.z);
    return out;
  };
  const kinds = ['taxi', 'taxi', 'sedan', 'taxi', 'sedan', 'taxi'];
  const cars = kinds.map((k, i) => {
    const s = (i / kinds.length) * L;
    const at = lane(s);
    const car = new Car({ scene, world, model: M[k], x: at.x, z: at.z, heading: at.h, kind: k === 'taxi' ? 'taxi' : 'traffic' });
    car.mode = 'loop';
    car.s = s;
    car.cruise = 8.5 + (i % 3) * 0.9;
    world.dynamic.push(car);
    return car;
  });
  refs.traffic = cars;
  // nearest point on the loop lane to (x, z), as a distance along the loop
  const nearestS = (x, z) => {
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s < L; s += 2) {
      const q = lane(s);
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };
  refs.loop = { lane, nearestS, length: L };

  const next = {};
  // would this car, moved to (x, z, h), overlap Hadi or a car that isn't on the loop?
  const blocks = (c, x, z, h) => {
    const probe = { x, z, h, hits: c.hits };
    const hadi = refs.player;
    if (hadi && refs.playerRadius < 1 && probe.hits(hadi.x, hadi.z, 0.45)) return true;
    for (const o of refs.vehicles ?? []) {
      if (o === c || o.mode === 'loop') continue;
      // the other car as three circles along its length
      const fx = Math.sin(o.h);
      const fz = Math.cos(o.h);
      for (const k of [-1.1, 0, 1.1]) if (probe.hits(o.x + fx * k, o.z + fz * k, 1.0)) return true;
    }
    return false;
  };
  // something in the lane ahead: how far?
  const aheadOf = (c, x, z, reach) => {
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    const along = (x - c.x) * fx + (z - c.z) * fz;
    const side = Math.abs((x - c.x) * fz - (z - c.z) * fx);
    return along > 0 && along < 16 && side < 1.05 + reach ? along : Infinity;
  };
  world.onUpdate((t, dt) => {
    const hadi = refs.player;
    const order = cars.filter((c) => c.mode === 'loop').sort((a, b) => a.s - b.s);
    order.forEach((c, i) => {
      const ahead = order[(i + 1) % order.length];
      const gap = order.length > 1 ? ((ahead.s - c.s + L) % L) - 3.6 : Infinity;
      let target = Math.min(c.cruise, Math.max(0, (gap - 4) * 0.8));
      // Hadi on foot near the lane, or any other car actually in the lane
      let nearest = hadi && refs.playerRadius < 1 ? aheadOf(c, hadi.x, hadi.z, 1.6) : Infinity;
      for (const o of refs.vehicles ?? []) if (o !== c && o.mode !== 'loop') nearest = Math.min(nearest, aheadOf(c, o.x, o.z, 0.7));
      // stop well back from a car pulling out, so it has room to turn
      if (nearest < Infinity) target = Math.min(target, Math.max(0, (nearest - 1.8 - (refs.playerRadius > 1 ? 7 : 2.2)) * 1.1));
      const rate = target > c.v ? 3 : 10;
      c.v += Math.max(-rate * dt, Math.min(rate * dt, target - c.v));
      lane(c.s + c.v * dt, next);
      if (blocks(c, next.x, next.z, next.h)) {
        c.v = 0;
        return;
      }
      c.s = (c.s + c.v * dt) % L;
      c.x = next.x;
      c.z = next.z;
      c.h = next.h;
      c.sync();
    });
  });

  /* ------------------------------------------------ a ship between the two coasts */
  const ship = place(M.cargoShip, { scale: 5.5 });
  scene.add(ship);
  world.onUpdate((t) => {
    const x = 320 - ((t * 5) % 640);
    ship.position.set(x, SEA_LEVEL - 0.9 + Math.sin(t * 0.8) * 0.15, -232);
    ship.rotation.y = -Math.PI / 2;
  });
}
