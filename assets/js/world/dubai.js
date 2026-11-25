// Dubai: arrivals, someone waiting with a sign, and the city.
import {
  Mesh, SphereGeometry, MeshStandardMaterial, Vector3,
} from '../../vendor/three.min.js';
import { place, scatter, footprint } from './assets.js';
import { Panel, text, roundRect } from './canvasart.js';
import { createTerminal, createSupertall, createLamp, sandstone } from './structures.js';
import { createFlapBoard } from './flapboard.js';
import { Actor } from './actors.js';
import { DUBAI, STOPS, PLACES, RUNWAY_DUBAI } from './layout.js';
import { inside, SEA_LEVEL } from './terrain.js';
import { rng } from './world.js';
import { ROADS } from './roads.js';
import { windPatch, stillPatch, addSign } from './kerala.js';

export function buildDubai({ scene, M, world, glyphs, clips }) {
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
    status: { words: [' ', 'EXPECTED', 'LANDED'], span: 6, row: 0 },
    scale: 0.28,
  });
  refs.arrivals.group.position.copy(hall.boardAnchor);
  refs.arrivals.group.rotation.y = Math.PI;
  scene.add(refs.arrivals.group);

  // a recruiter waiting at arrivals, holding up a name sign
  refs.recruiter = new Actor(M.recruiter, clips, { x: 4.5, z: -381, rot: Math.PI });
  scene.add(refs.recruiter.root);
  refs.recruiter.play('idle');
  world.circle(4.5, -381, 0.6);
  const nameSign = new Panel({
    width: 1.25,
    height: 0.62,
    paint(ctx, w, h) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 0, 0, w, h, h * 0.06);
      ctx.fill();
      text(ctx, 'HADI AMAN', w / 2, h * 0.6, { cap: h * 0.26, color: '#1b1d21', align: 'center', tracking: 0.04 });
    },
  });
  nameSign.mesh.material.side = 2;
  refs.nameSign = nameSign.mesh;
  const torso = refs.recruiter.bone('torso');
  if (torso) {
    // held in front of the chest (bone space is in the model's unscaled units)
    nameSign.mesh.scale.setScalar(1 / 2.4);
    nameSign.mesh.position.set(0, 0.12, 0.2);
    torso.add(nameSign.mesh);
  } else {
    nameSign.mesh.position.set(4.5, 2, -380.4);
    scene.add(nameSign.mesh);
  }

  // a pair of lamps framing the arrivals plaza, arms reaching towards the walk
  for (const side of [-1, 1]) {
    const lamp = createLamp(side * 9.5, -379);
    lamp.group.rotation.y = side > 0 ? Math.PI : 0;
    lamp.set(0.35);
    scene.add(lamp.group);
    world.box(lamp.collider);
  }
  addSign(scene, world, 'dubai', { number: 8, title: 'Dubai, from 5 Dec 2026', sub: 'Arrivals. Let’s talk.' });

  /* ------------------------------------------------ skyline */
  const tall = createSupertall(8, -448);
  scene.add(tall.group);
  world.box(tall.collider);
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
    if (!inside(DUBAI, x, z) || !world.free(x, z, { road: 1.4, keepOut: [{ x: STOPS.dubai.x, z: STOPS.dubai.z, r: 8 }], gap: 1 })) continue;
    shrubs.push({ x, z, rot: R() * 6.28, scale: 2.4 + R() * 1.6 });
  }
  scene.add(scatter(M.bushDetailed, shrubs.filter((_, i) => i % 3 === 0), { patch: stillPatch }));
  scene.add(scatter(M.grassLarge, shrubs.filter((_, i) => i % 3 === 1), { patch: windPatch }));
  scene.add(scatter(M.rockSmallA, shrubs.filter((_, i) => i % 3 === 2)));

  /* ------------------------------------------------ traffic */
  // Cars drive the ring road in one lane. Each keeps its distance from the car
  // ahead and brakes for Hadi when he is in the road in front of it; a car never
  // moves into him, and he can't walk through one.
  const L = loop.getLength();
  const HALF_LEN = 1.9;
  const HALF_WIDTH = 1.05;
  const pose = (s, out) => {
    const u = (((s % L) + L) % L) / L;
    loop.getPointAt(u, p);
    loop.getTangentAt(u, tangent);
    out.dx = tangent.x;
    out.dz = tangent.z;
    // keep to the right-hand lane
    out.x = p.x - tangent.z * 1.9;
    out.z = p.z + tangent.x * 1.9;
    return out;
  };
  const p = new Vector3();
  const tangent = new Vector3();
  const kinds = ['taxi', 'taxi', 'sedan', 'taxi', 'sedan', 'taxi'];
  const cars = kinds.map((k, i) => {
    const mesh = place(M[k], { scale: 1.3 });
    scene.add(mesh);
    const car = pose((i / kinds.length) * L, { mesh, s: (i / kinds.length) * L, v: 0, cruise: 8.5 + (i % 3) * 0.9 });
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = Math.atan2(car.dx, car.dz);
    return car;
  });
  const hitsCar = (c, x, z, r) => {
    const rx = x - c.x;
    const rz = z - c.z;
    return Math.abs(rx * c.dx + rz * c.dz) < HALF_LEN + r && Math.abs(rx * c.dz - rz * c.dx) < HALF_WIDTH + r;
  };
  world.dynamic.push({ hits: (x, z, r) => cars.some((c) => hitsCar(c, x, z, r)) });
  refs.cars = cars;
  const next = {};
  world.onUpdate((t, dt) => {
    const hadi = world.refs.player;
    const order = [...cars].sort((a, b) => a.s - b.s);
    order.forEach((c, i) => {
      const ahead = order[(i + 1) % order.length];
      const gap = ((ahead.s - c.s + L) % L) - HALF_LEN * 2;
      let target = Math.min(c.cruise, Math.max(0, (gap - 4) * 0.8));
      if (hadi) {
        const rx = hadi.x - c.x;
        const rz = hadi.z - c.z;
        const along = rx * c.dx + rz * c.dz;
        const side = Math.abs(rx * c.dz - rz * c.dx);
        if (along > 0 && along < 16 && side < HALF_WIDTH + 1.6) {
          target = Math.min(target, Math.max(0, (along - HALF_LEN - 2.2) * 1.1));
        }
      }
      const rate = target > c.v ? 3 : 10;
      c.v += Math.max(-rate * dt, Math.min(rate * dt, target - c.v));
      pose(c.s + c.v * dt, next);
      if (hadi && hitsCar(next, hadi.x, hadi.z, 0.45)) {
        c.v = 0;
        return;
      }
      c.s = (c.s + c.v * dt) % L;
      c.x = next.x;
      c.z = next.z;
      c.dx = next.dx;
      c.dz = next.dz;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = Math.atan2(c.dx, c.dz);
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
