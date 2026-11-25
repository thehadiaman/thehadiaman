// Kerala: home, college, the freelance desk by the backwater, Nucore, the
// projects plaza and the airport at Kozhikode.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, PlaneGeometry, MeshStandardMaterial,
  Vector3, RoundedBoxGeometry,
} from '../../vendor/three.min.js';
import { place, scatter, footprint, centered, terracottaRoofs } from './assets.js';
import { stopSign, Panel, label, text, FONTS, roundRect, COBALT } from './canvasart.js';
import {
  createTerminal, createControlTower, createSabreMast, createRedisCabinet, createLamp, box, steel,
} from './structures.js';
import { createPlane, createStairs } from './plane.js';
import { createFlapBoard } from './flapboard.js';
import { Actor } from './actors.js';
import { KERALA, LAGOON, BRIDGE, STOPS, PLACES, VEHICLES } from './layout.js';
import { inside, SEA_LEVEL } from './terrain.js';
import { rng, bridgeHeight } from './world.js';
import { ROADS, alongRoad } from './roads.js';

export const wind = { value: 0 };

// Plants sway (bend by height, out of phase per instance). Any plant standing
// between the camera and Hadi dissolves, so a palm never hides him or fills the screen.
export const focus = { value: new Vector3() };
export function windPatch(material, { sway = true } = {}) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.uniforms.uFocus = focus;
    let vertex = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float uWind;
      varying vec3 vFoliageWorld;`);
    if (sway) {
      vertex = vertex.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float phase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        #else
          float phase = 0.0;
        #endif
        float bend = max(position.y, 0.0);
        transformed.x += sin(uWind * 1.3 + phase) * 0.03 * bend * bend;
        transformed.z += cos(uWind * 1.05 + phase) * 0.022 * bend * bend;`);
    }
    shader.vertexShader = vertex.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 foliageWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        foliageWorld = instanceMatrix * foliageWorld;
      #endif
      vFoliageWorld = (modelMatrix * foliageWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uFocus;
        varying vec3 vFoliageWorld;
        float bayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          float i = q.x + q.y * 4.0;
          return mod(i * 7.0 + floor(i / 4.0) * 2.0, 16.0) / 16.0 + 0.03;
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 seg = uFocus - cameraPosition;
          float len = max(length(seg), 0.001);
          vec3 dir = seg / len;
          float t = clamp(dot(vFoliageWorld - cameraPosition, dir), 0.0, len);
          float off = length(vFoliageWorld - (cameraPosition + dir * t));
          float between = (1.0 - smoothstep(1.4, 3.2, off)) * (1.0 - smoothstep(0.78, 0.93, t / len));
          float nearLens = 1.0 - smoothstep(2.5, 5.5, length(vViewPosition));
          if (max(between * 0.88, nearLens) > bayer4(gl_FragCoord.xy)) discard;
        }`);
  };
  m.customProgramCacheKey = () => (sway ? 'foliage-sway' : 'foliage');
  return m;
}
export const stillPatch = (material) => windPatch(material, { sway: false });

// A post with a TAXI sign, for the taxi stands.
export function taxiSign() {
  const group = new Group();
  const sign = label('TAXI', { height: 0.6, color: '#1b1d21', bg: '#f3aa1c', tracking: 0.12, pad: 0.2 });
  sign.mesh.position.y = 2.5;
  const post = new Mesh(new CylinderGeometry(0.05, 0.05, 2.5, 8), rubber);
  post.position.y = 1.25;
  group.add(sign.mesh, post);
  return group;
}

export function faceToward(obj, x, z) {
  obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z);
}

export function addSign(scene, world, stopKey, spec) {
  const stop = STOPS[stopKey];
  const [x, z] = stop.sign;
  const sign = stopSign(spec);
  sign.position.set(x, 0, z);
  sign.rotation.y = stop.view;
  scene.add(sign);
  world.circle(x, z, 0.6);
  return sign;
}

const wood = new MeshStandardMaterial({ color: '#9b6b45', roughness: 0.9 });
const darkWood = new MeshStandardMaterial({ color: '#7a5235', roughness: 0.9 });
const rubber = new MeshStandardMaterial({ color: '#2d3036', roughness: 0.8 });
const stone = new MeshStandardMaterial({
  color: '#dcd3c1', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const phoneBody = new MeshStandardMaterial({ color: '#23262b', roughness: 0.35, metalness: 0.3 });

export function buildKerala({ scene, M, world, glyphs, clips }) {
  const R = rng(42);
  const refs = world.refs;
  const solid = (obj, shrink = 0.3) => {
    scene.add(obj);
    world.box(footprint(obj, shrink));
    return obj;
  };

  /* ------------------------------------------------ 01 home */
  terracottaRoofs([M.houseA, M.houseB]);
  solid(place(M.houseA, { x: PLACES.home.x, z: PLACES.home.z, rot: PLACES.home.rot, scale: 6.5 }));
  solid(place(M.houseB, { x: 30, z: 108, rot: -Math.PI / 2, scale: 6.5 }));
  solid(place(M.houseB, { x: -34, z: 100, rot: Math.PI / 2, scale: 6.5 }));
  solid(place(M.houseA, { x: 44, z: 82, rot: -Math.PI / 2, scale: 6.5 }));
  scene.add(scatter(M.planter, [
    { x: -2.5, z: 99, scale: 3 }, { x: -2.5, z: 109, scale: 3 }, { x: 24, z: 104, scale: 3, rot: Math.PI / 2 },
  ]));
  addSign(scene, world, 'home', {
    number: 1, title: 'Kozhikode, Kerala', sub: 'Home. Where the route starts.',
  });

  const taxiStand = taxiSign();
  // behind the waiting taxi, out of its way
  taxiStand.position.set(VEHICLES.taxiKerala.x + 1.9, 0, VEHICLES.taxiKerala.z + 3.4);
  taxiStand.rotation.y = Math.PI * 0.85;
  scene.add(taxiStand);
  world.circle(taxiStand.position.x, taxiStand.position.z, 0.3);

  /* ------------------------------------------------ 02 college */
  solid(place(M.officeE, { x: PLACES.college.x, z: PLACES.college.z, rot: PLACES.college.rot, scale: 9 }));
  const plate = new Panel({
    width: 6.4,
    height: 2.4,
    paint(ctx, w, h) {
      ctx.fillStyle = '#f4f0e6';
      roundRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      ctx.fillStyle = COBALT;
      ctx.fillRect(0, 0, w * 0.018, h);
      text(ctx, 'DIPLOMA · ELECTRICAL & ELECTRONICS ENGINEERING', w * 0.05, h * 0.24, { cap: h * 0.075, maxW: w * 0.9 });
      text(ctx, 'JDT Islam Polytechnic College, Calicut · 2017–2020 · 70%', w * 0.05, h * 0.38, {
        cap: h * 0.06, font: FONTS.sans, weight: 500, color: '#50545c', maxW: w * 0.9,
      });
      text(ctx, 'BACHELOR OF COMPUTER APPLICATIONS (ONLINE)', w * 0.05, h * 0.64, { cap: h * 0.075, maxW: w * 0.9 });
      text(ctx, 'Manipal University Jaipur · 2023–2026 · attested for the UAE', w * 0.05, h * 0.78, {
        cap: h * 0.06, font: FONTS.sans, weight: 500, color: '#50545c', maxW: w * 0.9,
      });
    },
  });
  plate.mesh.position.set(-40.6, 2.4, 63);
  faceToward(plate.mesh, -28, 70);
  scene.add(plate.mesh);
  for (const dx of [-2.6, 2.6]) {
    const post = new Mesh(new CylinderGeometry(0.07, 0.07, 3.6, 8), rubber);
    const off = new Vector3(dx, 0, -0.08).applyAxisAngle(new Vector3(0, 1, 0), plate.mesh.rotation.y);
    post.position.set(plate.mesh.position.x + off.x, 1.8, plate.mesh.position.z + off.z);
    scene.add(post);
  }
  world.circle(-40.6, 63, 1.8);
  addSign(scene, world, 'college', {
    number: 2, title: 'College', sub: 'Electrical engineering, then computer applications',
  });
  // street lamps that switch on when you arrive (a nod to the electrical diploma):
  // just off the path's edge, arms reaching over it
  const near = (u) => ROADS.kerala.curve.getPointAt(u);
  const college = new Vector3(STOPS.college.x, 0, STOPS.college.z);
  let uCollege = 0;
  for (let u = 0, best = Infinity; u <= 1; u += 0.002) {
    const d = near(u).distanceTo(college);
    if (d < best) {
      best = d;
      uCollege = u;
    }
  }
  const span = 30 / ROADS.kerala.length;
  refs.lamps = alongRoad(ROADS.kerala, { u0: uCollege - span, u1: uCollege + span, step: 9, offset: 0.9, side: -1 })
    .filter(({ x, z }) => world.free(x, z, { road: 0.5, gap: 0.6 }) && Math.hypot(x - STOPS.college.x, z - STOPS.college.z) > 2.5)
    .map(({ x, z, towardX, towardZ }) => {
      const lamp = createLamp(x, z);
      lamp.group.rotation.y = Math.atan2(-towardZ, towardX); // the arm is the lamp's +x
      scene.add(lamp.group);
      world.box(lamp.collider);
      return lamp;
    });
  refs.streetLamps.push(...refs.lamps);

  /* ------------------------------------------------ 03 freelance desk */
  const desk = new Group();
  desk.position.set(PLACES.freelanceDesk.x, 0, PLACES.freelanceDesk.z);
  desk.rotation.y = PLACES.freelanceDesk.rot;
  const table = centered(M.desk, 2.3);
  const chair = centered(M.chairDesk, 2.2);
  chair.position.set(0, 0, 1.15);
  chair.rotation.y = Math.PI;
  const laptop = centered(M.laptop, 2.2);
  laptop.position.set(0.1, 0.88, -0.05);
  laptop.rotation.y = Math.PI;
  const lamp = centered(M.lamp, 2.2);
  lamp.position.set(-1.2, 0, -0.2);
  const plant = centered(M.pottedPlant, 2.4);
  plant.position.set(1.35, 0, -0.1);
  desk.add(table, chair, laptop, lamp, plant);
  scene.add(desk);
  world.box(footprint(table, 0.05));
  world.box(footprint(plant, 0));
  // where you sit: just behind the chair, facing the desk
  const seat = new Vector3(0, 0, 1.25).applyAxisAngle(new Vector3(0, 1, 0), desk.rotation.y).add(desk.position);
  refs.desk = { x: seat.x, z: seat.z, rot: desk.rotation.y + Math.PI };
  // a screen that rises above the desk with the 2021 projects
  refs.freelanceScreen = new Panel({
    width: 4.6,
    height: 2.7,
    lit: false,
    paint(ctx, w, h, progress = 0) {
      ctx.fillStyle = '#1b1d21';
      roundRect(ctx, 0, 0, w, h, h * 0.05);
      ctx.fill();
      text(ctx, 'FREELANCE · FEB–MAY 2021', w * 0.06, h * 0.17, { cap: h * 0.06, color: '#8fa7ff', tracking: 0.08 });
      const items = [
        ['SaaS membership management', 'Python · Django · Next.js · MongoDB'],
        ['ID card data extraction (OCR)', 'Python microservice · SQLite'],
      ];
      items.forEach(([title, stack], i) => {
        const show = Math.max(0, Math.min(1, progress * 2 - i));
        if (!show) return;
        ctx.globalAlpha = show;
        const y = h * (0.36 + i * 0.3);
        text(ctx, title, w * 0.06, y, { cap: h * 0.075, color: '#f4f0e6', maxW: w * 0.88 });
        text(ctx, stack, w * 0.06, y + h * 0.11, { cap: h * 0.05, font: FONTS.sans, weight: 500, color: '#b9b4a8' });
        ctx.globalAlpha = 1;
      });
    },
  });
  const screen = refs.freelanceScreen.mesh;
  screen.position.set(desk.position.x - 1.5, 3, desk.position.z + 1);
  faceToward(screen, STOPS.freelance.x + 4, STOPS.freelance.z - 3);
  screen.visible = false;
  scene.add(screen);
  addSign(scene, world, 'freelance', {
    number: 3, title: 'Freelance, 2021', sub: 'First paid work, by the backwater',
  });

  /* ------------------------------------------------ bridge and lagoon */
  const bridge = new Group();
  const plank = new BoxGeometry(BRIDGE.x1 - BRIDGE.x0, 0.25, 1.05);
  for (let z = BRIDGE.z0 + 0.5; z < BRIDGE.z1; z += 1) {
    const p = new Mesh(plank, (Math.round(z) % 2 ? wood : darkWood));
    p.position.set((BRIDGE.x0 + BRIDGE.x1) / 2, bridgeHeight(z) - 0.08, z);
    const tilt = bridgeHeight(z + 0.5) - bridgeHeight(z - 0.5);
    p.rotation.x = -Math.atan(tilt);
    p.castShadow = true;
    p.receiveShadow = true;
    bridge.add(p);
  }
  for (const x of [BRIDGE.x0 + 0.2, BRIDGE.x1 - 0.2]) {
    for (let z = BRIDGE.z0 + 1; z < BRIDGE.z1; z += 3) {
      const post = new Mesh(new BoxGeometry(0.18, 1.1, 0.18), darkWood);
      post.position.set(x, bridgeHeight(z) + 0.55, z);
      post.castShadow = true;
      bridge.add(post);
      const z2 = Math.min(z + 3, BRIDGE.z1 - 1);
      if (z2 > z) {
        const len = Math.hypot(z2 - z, bridgeHeight(z2) - bridgeHeight(z));
        const rail = new Mesh(new BoxGeometry(0.12, 0.12, len), wood);
        rail.position.set(x, (bridgeHeight(z) + bridgeHeight(z2)) / 2 + 1.05, (z + z2) / 2);
        rail.rotation.x = -Math.atan2(bridgeHeight(z2) - bridgeHeight(z), z2 - z);
        bridge.add(rail);
      }
    }
  }
  scene.add(bridge);

  const lagoonPoints = [];
  for (let i = 0; i < 400 && lagoonPoints.length < 70; i++) {
    const x = -64 + R() * 120;
    const z = 9 + R() * 19;
    if (!inside(LAGOON, x, z)) continue;
    if (x > BRIDGE.x0 - 3 && x < BRIDGE.x1 + 3) continue;
    if (Math.abs(z - 18.5) < 4.5) continue; // keep the boat lanes clear
    lagoonPoints.push({ x, y: SEA_LEVEL + 0.12, z, rot: R() * 6.28, scale: 3 + R() * 2.5 });
  }
  scene.add(scatter(M.lilyLarge, lagoonPoints.filter((_, i) => i % 2), { cast: false }));
  scene.add(scatter(M.lilySmall, lagoonPoints.filter((_, i) => !(i % 2)), { cast: false }));

  // houseboats on two loops, either side of the bridge
  const boats = [
    { model: M.houseboatA, cx: -38, rx: 13, phase: 0 },
    { model: M.houseboatB, cx: 25, rx: 19, phase: 2.2 },
  ].map(({ model, cx, rx, phase }) => {
    const boat = place(model, { scale: 2.3 });
    scene.add(boat);
    return { boat, cx, rx, phase };
  });
  const rowboat = place(M.rowboat, { x: -60, y: SEA_LEVEL - 0.15, z: 20.5, rot: 0.4, scale: 1.8 });
  scene.add(rowboat);
  world.onUpdate((t) => {
    for (const b of boats) {
      const a = t * 0.075 + b.phase;
      const x = b.cx + Math.cos(a) * b.rx;
      const z = 18.5 + Math.sin(a) * 3.2;
      b.boat.position.set(x, SEA_LEVEL - 0.35 + Math.sin(t * 1.3 + b.phase) * 0.06, z);
      // heading along the loop's tangent
      b.boat.rotation.y = Math.atan2(-Math.sin(a) * b.rx, Math.cos(a) * 3.2);
    }
    rowboat.position.y = SEA_LEVEL - 0.15 + Math.sin(t * 1.7) * 0.05;
    rowboat.rotation.z = Math.sin(t * 1.1) * 0.04;
  });

  /* ------------------------------------------------ 04 nucore */
  solid(place(M.officeA, { x: PLACES.nucore.x, z: PLACES.nucore.z, rot: PLACES.nucore.rot, scale: 10 }));
  solid(place(M.officeH, { x: 56, z: -30, rot: -Math.PI / 2, scale: 10 }));
  solid(place(M.officeC, { x: 58, z: -6, rot: -Math.PI / 2, scale: 10 }));
  const nucoreName = label('NUCORE', { height: 1.3, color: '#1b1d21', bg: '#f4f0e6', tracking: 0.16 });
  nucoreName.mesh.position.set(35.15, 11.6, -16);
  nucoreName.mesh.rotation.y = -Math.PI / 2;
  scene.add(nucoreName.mesh);
  // the agencies screen: 240 lights, one per travel agency on nuTRAACS
  refs.agencies = new Panel({
    width: 6.6,
    height: 3.9,
    lit: false,
    paint(ctx, w, h, lit = 240) {
      ctx.fillStyle = '#15171b';
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'nuTRAACS', w * 0.05, h * 0.16, { cap: h * 0.08, color: '#f4f0e6' });
      text(ctx, 'multi-tenant ERP for travel agencies', w * 0.05, h * 0.25, {
        cap: h * 0.045, font: FONTS.sans, weight: 500, color: '#b9b4a8',
      });
      const cols = 24;
      const rows = 10;
      const gx = w * 0.05;
      const gy = h * 0.33;
      const cell = (w * 0.9) / cols;
      for (let i = 0; i < cols * rows; i++) {
        const on = i < lit;
        ctx.fillStyle = on ? '#f3aa1c' : '#30333a';
        ctx.beginPath();
        ctx.arc(gx + (i % cols) * cell + cell / 2, gy + Math.floor(i / cols) * cell * 0.95 + cell / 2, cell * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      text(ctx, `${Math.round(lit)} agencies`, w * 0.95, h * 0.16, { cap: h * 0.06, color: '#f3aa1c', align: 'right' });
    },
  });
  refs.agencies.mesh.position.set(35.12, 5.4, -16);
  refs.agencies.mesh.rotation.y = -Math.PI / 2;
  scene.add(refs.agencies.mesh);

  // data migration: crates leave the old systems and ride a belt into the building
  const beltLen = 15.4;
  const belt = box(1.7, 0.7, beltLen, rubber, 40, 0.35, 4 - beltLen / 2);
  scene.add(belt);
  for (const side of [-1, 1]) scene.add(box(0.1, 0.25, beltLen, steel, 40 + side * 0.9, 0.78, 4 - beltLen / 2));
  world.box({ x0: 38.9, x1: 41.1, z0: 4 - beltLen, z1: 4 });
  const legacy = [
    { name: 'ORACLE', x: 32, color: '#b8a898' },
    { name: 'MYSQL', x: 40, color: '#9fb2bd' },
    { name: 'SQL SERVER', x: 48, color: '#a9b49c' },
  ];
  const crateLabels = legacy.map(({ name }) => label(name, { height: 0.5, color: '#1b1d21', bg: '#f4f0e6', tracking: 0.04, pad: 0.12 }));
  for (const shed of legacy) {
    const mat = new MeshStandardMaterial({ color: shed.color, roughness: 0.9 });
    scene.add(box(5, 3.4, 4, mat, shed.x, 1.7, 10.5));
    scene.add(box(5.6, 0.3, 4.6, rubber, shed.x, 3.55, 10.5));
    world.box({ x0: shed.x - 2.5, x1: shed.x + 2.5, z0: 8.5, z1: 12.5 });
    const sign = label(shed.name, { height: 0.8, color: '#f4f0e6', bg: '#1f2226', tracking: 0.08 });
    sign.mesh.position.set(shed.x, 2.6, 8.44);
    sign.mesh.rotation.y = Math.PI;
    scene.add(sign.mesh);
  }
  // the yard the crates cross is railed off, so nobody walks into their path
  const railMat = new MeshStandardMaterial({ color: '#f3c21c', roughness: 0.6 });
  const postMat = new MeshStandardMaterial({ color: '#2d3036', roughness: 0.6 });
  const yard = { x0: 29, x1: 51, z0: 3.2, z1: 8.6 };
  const rails = [
    [yard.x0, yard.z0, 39.1, yard.z0], [40.9, yard.z0, yard.x1, yard.z0],
    [yard.x0, yard.z0, yard.x0, yard.z1], [yard.x1, yard.z0, yard.x1, yard.z1],
  ];
  for (const [ax, az, bx, bz] of rails) {
    const len = Math.hypot(bx - ax, bz - az);
    const rail = box(ax === bx ? 0.1 : len, 0.1, ax === bx ? len : 0.1, railMat, (ax + bx) / 2, 0.95, (az + bz) / 2);
    const mid = box(ax === bx ? 0.08 : len, 0.08, ax === bx ? len : 0.08, railMat, (ax + bx) / 2, 0.5, (az + bz) / 2);
    scene.add(rail, mid);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const px = ax + ((bx - ax) * i) / n;
      const pz = az + ((bz - az) * i) / n;
      scene.add(box(0.12, 1.05, 0.12, postMat, px, 0.52, pz));
    }
  }
  world.box({ x0: yard.x0 - 0.15, x1: yard.x1 + 0.15, z0: yard.z0 - 0.15, z1: yard.z1 });
  const crates = [];
  for (let i = 0; i < 9; i++) {
    const source = i % 3;
    const crate = place(M.box, { scale: 1.45 });
    const tag = crateLabels[source].mesh.clone();
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(0, 0.73, 0);
    tag.scale.setScalar(1 / 1.45);
    crate.add(tag);
    scene.add(crate);
    crates.push({ crate, source, offset: i / 9 });
  }
  refs.migration = { running: false, progress: 0 };
  const cratePath = (source, u) => {
    // 0–0.3: from the shed door to the belt; 0.3–1: along the belt into the building
    const sx = legacy[source].x;
    if (u < 0.3) {
      const k = u / 0.3;
      return [sx + (40 - sx) * k, 7.4 - 3.4 * k, 0.12];
    }
    const k = (u - 0.3) / 0.7;
    return [40, 4 - k * (beltLen - 0.6), 0.72];
  };
  world.onUpdate((t, dt) => {
    if (refs.migration.running) refs.migration.progress += dt / 9;
    for (const c of crates) {
      const u = (refs.migration.progress + c.offset) % 1;
      const [x, z, y] = cratePath(c.source, u);
      c.crate.position.set(x, y, z);
      c.crate.visible = u < 0.985;
    }
  });
  refs.migrationBoard = createFlapBoard({ glyphs, cols: 8, rows: 1, title: 'MIGRATION', scale: 0.34 });
  const mb = refs.migrationBoard.group;
  mb.position.set(31.5, 2.9, -3);
  faceToward(mb, 24, -12);
  scene.add(mb);
  for (const dx of [-1.2, 1.2]) {
    const post = new Mesh(new CylinderGeometry(0.06, 0.06, 2.9, 8), rubber);
    const off = new Vector3(dx, 0, -0.15).applyAxisAngle(new Vector3(0, 1, 0), mb.rotation.y);
    post.position.set(mb.position.x + off.x, 1.45, mb.position.z + off.z);
    scene.add(post);
  }
  world.circle(31.5, -3, 1.4);
  refs.worker = new Actor(M.worker, clips, { x: 30.3, z: 4.4, rot: Math.PI / 2 });
  scene.add(refs.worker.root);
  refs.worker.play('idle');
  world.circle(30.3, 4.4, 0.5);
  addSign(scene, world, 'nucore', {
    number: 4, title: 'Nucore, 2022–2025', sub: 'nuTRAACS: an ERP for 240 travel agencies',
  });

  /* ------------------------------------------------ 05 projects plaza */
  const plaza = new Mesh(new CylinderGeometry(8.5, 8.5, 0.06, 40), stone);
  plaza.position.set(PLACES.projects.x, 0.03, PLACES.projects.z);
  plaza.receiveShadow = true;
  scene.add(plaza);
  // WhatsApp support desk: a giant phone with a live chat
  const phone = new Group();
  phone.add(new Mesh(new RoundedBoxGeometry(3.4, 6.6, 0.45, 4, 0.35), phoneBody));
  phone.children[0].position.y = 3.7;
  phone.children[0].castShadow = true;
  refs.chat = new Panel({ width: 3.05, height: 6.1, lit: false, paint: paintChat });
  refs.chat.mesh.position.set(0, 3.7, 0.24);
  phone.add(refs.chat.mesh);
  phone.position.set(-47, 0, -31);
  faceToward(phone, -30, -38);
  scene.add(phone);
  world.circle(-47, -31, 1.9);
  // RAG: shelves of PDFs and an answer with its citation
  const shelves = new Group();
  for (const dx of [-0.75, 0.75]) {
    const b = centered(M.bookcase, 3.2);
    b.position.x = dx;
    shelves.add(b);
  }
  shelves.position.set(-51, 0, -41);
  faceToward(shelves, -30, -38);
  scene.add(shelves);
  world.circle(-51, -41, 1.8);
  refs.ragAnswer = new Panel({ width: 3.6, height: 2.5, lit: false, paint: paintAnswer });
  refs.ragAnswer.mesh.position.set(-46.5, 2.4, -45.5);
  faceToward(refs.ragAnswer.mesh, -30, -38);
  scene.add(refs.ragAnswer.mesh);
  for (const dx of [-1.4, 1.4]) {
    const post = new Mesh(new CylinderGeometry(0.06, 0.06, 2.4, 8), rubber);
    const off = new Vector3(dx, 0, -0.1).applyAxisAngle(new Vector3(0, 1, 0), refs.ragAnswer.mesh.rotation.y);
    post.position.set(-46.5 + off.x, 1.2, -45.5 + off.z);
    scene.add(post);
  }
  world.circle(-46.5, -45.5, 1.7);
  const pageMat = new MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.9, side: 2 });
  refs.pages = Array.from({ length: 6 }, (_, i) => {
    const page = new Mesh(new PlaneGeometry(0.55, 0.75), pageMat);
    page.visible = false;
    scene.add(page);
    return { page, delay: i * 0.35 };
  });
  refs.pageFrom = new Vector3(-51, 2, -41);
  refs.pageTo = new Vector3(-46.5, 2.4, -45.5);
  // Diet tracker: an Android phone
  const small = new Group();
  const smallBody = new Mesh(new RoundedBoxGeometry(1.8, 3.5, 0.3, 4, 0.2), phoneBody);
  smallBody.position.y = 2.2;
  small.add(smallBody);
  const dietScreen = new Panel({ width: 1.6, height: 3.2, lit: false, paint: paintDiet });
  dietScreen.mesh.position.set(0, 2.2, 0.16);
  small.add(dietScreen.mesh);
  small.add(box(0.6, 0.5, 0.6, rubber, 0, 0.25, 0));
  small.position.set(-38, 0, -48);
  faceToward(small, -30, -38);
  scene.add(small);
  world.circle(-38, -48, 1.1);
  addBenches(scene, world, M, [{ x: -33, z: -45, rot: -0.6 }, { x: -44, z: -30, rot: 2.6 }]);
  addSign(scene, world, 'projects', {
    number: 5, title: 'Side projects', sub: 'WhatsApp AI desk · PDF Q&A · Android',
  });

  /* ------------------------------------------------ 06 airport and 07 gate */
  const terminal = createTerminal({ ...PLACES.terminal, name: 'KOZHIKODE  ·  CCJ', front: 1 });
  scene.add(terminal.group);
  terminal.colliders.forEach((c) => world.box(c));
  refs.departures = createFlapBoard({
    glyphs,
    cols: 24,
    rows: 4,
    title: 'DEPARTURES',
    icon: 'depart',
    status: { words: [' ', 'ON TIME', 'BOARDING', 'DEPARTED', 'CANCELLED'], span: 6, row: 0 },
    scale: 0.28,
  });
  refs.departures.group.position.copy(terminal.boardAnchor);
  scene.add(refs.departures.group);
  const tower = createControlTower(PLACES.tower.x, PLACES.tower.z);
  scene.add(tower.group);
  world.box(tower.collider);
  refs.redis = createRedisCabinet(PLACES.redis.x, PLACES.redis.z, 0);
  scene.add(refs.redis.group);
  world.box(refs.redis.collider);
  refs.sabre = createSabreMast(PLACES.sabre.x, PLACES.sabre.z);
  scene.add(refs.sabre.group);
  world.onUpdate((t) => refs.sabre.blink(t));
  refs.boardFace = terminal.boardAnchor.clone().add(new Vector3(0, -0.4, 0.6));

  const { plane, body, gear, height } = createPlane();
  plane.position.set(PLACES.plane.x, 0, PLACES.plane.z);
  scene.add(plane);
  refs.plane = { plane, body, gear, height };
  // the plane is solid wherever it is parked (Kozhikode, or Dubai after the flight)
  world.dynamic.push({
    nav: true,
    hits(x, z, r) {
      if (plane.position.y > 0.5) return false;
      const yaw = plane.rotation.y;
      const rx = x - plane.position.x;
      const rz = z - plane.position.z;
      const along = rx * Math.cos(yaw) - rz * Math.sin(yaw);
      const side = rx * Math.sin(yaw) + rz * Math.cos(yaw);
      if (Math.abs(along + 2) < 18 + r && Math.abs(side) < 2.1 + r) return true; // fuselage
      if (Math.abs(along - 2.2) < 2 + r && Math.abs(Math.abs(side) - 5.4) < 1 + r) return true; // engines
      return false;
    },
  });
  const stairs = createStairs();
  stairs.position.set(PLACES.plane.x + 9, 0, PLACES.plane.z + 5.4);
  scene.add(stairs);
  refs.stairs = stairs;
  const sx = stairs.position.x;
  const sz = stairs.position.z;
  world.dynamic.push({
    nav: true,
    hits: (x, z, r) => stairs.visible && x > sx - 0.9 - r && x < sx + 0.9 + r && z > sz - 3.4 - r && z < sz + 0.8 + r,
  });
  refs.luggage = place(M.luggage, { x: -46.6, z: -99.5, rot: -0.4, scale: 2.4 });
  scene.add(refs.luggage);
  world.dynamic.push({ nav: true, hits: (x, z, r) => refs.luggage.visible && Math.hypot(x + 46.6, z + 99.5) < 0.45 + r });
  scene.add(scatter(M.cone, [
    { x: -63, z: -102.5, scale: 1.2 }, { x: -40, z: -102.5, scale: 1.2 }, { x: -36, z: -113, scale: 1.2 },
  ]));
  const gateSign = new Panel({
    width: 4.4,
    height: 1.3,
    paint(ctx, w, h) {
      ctx.fillStyle = '#f3aa1c';
      roundRect(ctx, 0, 0, w, h, h * 0.08);
      ctx.fill();
      text(ctx, 'GATE 1', w * 0.07, h * 0.62, { cap: h * 0.3, color: '#1b1d21' });
      text(ctx, 'DXB · DUBAI', w * 0.93, h * 0.62, { cap: h * 0.2, color: '#1b1d21', align: 'right', maxW: w * 0.46 });
    },
  });
  gateSign.mesh.position.set(-43, 2.8, -100.8);
  faceToward(gateSign.mesh, -50, -90);
  scene.add(gateSign.mesh);
  const gatePost = new Mesh(new CylinderGeometry(0.07, 0.07, 2.8, 8), rubber);
  gatePost.position.set(-43, 1.4, -100.9);
  scene.add(gatePost);
  world.circle(-43, -100.9, 0.5);
  addSign(scene, world, 'airport', {
    number: 6, title: 'SNC, 2025–now', sub: 'Flight booking for a UAE travel company',
  });
  addSign(scene, world, 'gate', {
    number: 7, title: 'Gate 1 to Dubai', sub: 'Kozhikode → Dubai, 5 December 2026',
  });

  /* ------------------------------------------------ vegetation */
  const keepOut = [
    ...Object.values(STOPS).map((s) => ({ x: s.x, z: s.z, r: 7 })),
    { x: PLACES.projects.x, z: PLACES.projects.z, r: 12 },
    { x: 40, z: 2, r: 13 }, // migration yard
    { x: -42, z: 44, r: 5 },
    // parking: the car at home and the taxi stand
    { x: VEHICLES.carKerala.x, z: VEHICLES.carKerala.z, r: 5.5 },
    { x: VEHICLES.taxiKerala.x, z: VEHICLES.taxiKerala.z, r: 6 },
  ];
  // keep the arrival camera's line of sight clear at every stop
  const camOut = Object.values(STOPS).flatMap((s) => [
    { x: s.x + Math.sin(s.view) * 15, z: s.z + Math.cos(s.view) * 15, r: 8 },
    { x: s.x + Math.sin(s.view) * 7, z: s.z + Math.cos(s.view) * 7, r: 6 },
  ]);
  keepOut.push(...camOut);
  const kerala = (x, z) => inside(KERALA, x, z) && z > -64;
  const palms = [];
  const palmModels = ['palm', 'palmTall', 'palmBend', 'palmShort', 'palmDetailedTall', 'palmDetailedShort'];
  const buckets = Object.fromEntries(palmModels.map((k) => [k, []]));
  for (let i = 0; i < 900 && palms.length < 150; i++) {
    const x = -88 + R() * 176;
    const z = -64 + R() * 186;
    if (!kerala(x, z) || !world.free(x, z, { road: 1.6, keepOut, gap: 1.2 })) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 4.2)) continue;
    palms.push({ x, z });
    const k = palmModels[Math.floor(R() * palmModels.length)];
    buckets[k].push({ x, z, rot: R() * 6.28, scale: 5.6 + R() * 2.2 });
  }
  // a few palms along the airport's landside
  for (const [x, z] of [[-30, -66], [-20, -66], [12, -66], [20, -66], [34, -70], [-44, -72]]) {
    buckets.palmTall.push({ x, z, rot: R() * 6.28, scale: 6 });
    palms.push({ x, z });
  }
  for (const k of palmModels) scene.add(scatter(M[k], buckets[k], { patch: windPatch }));
  for (const p of palms) world.circle(p.x, p.z, 0.5);

  const decor = { bush: [], bushLarge: [], bushDetailed: [], plantTall: [], grass: [], grassLarge: [], grassLeafs: [], flowerYellow: [], flowerRed: [], flowerPurple: [] };
  const decorKeys = Object.keys(decor);
  for (let i = 0; i < 700; i++) {
    const x = -88 + R() * 176;
    const z = -64 + R() * 186;
    const k = decorKeys[Math.floor(R() * decorKeys.length)];
    const big = k.startsWith('bush') || k === 'plantTall';
    const gapToRoad = big ? 2.8 : 0.3;
    if (!kerala(x, z) || !world.free(x, z, { road: gapToRoad, keepOut: keepOut.map((o) => ({ ...o, r: camOut.includes(o) ? o.r : o.r * 0.6 })), gap: 0.3 })) continue;
    decor[k].push({ x, z, rot: R() * 6.28, scale: big ? 2.2 + R() * 1.2 : 2 + R() * 1.2 });
  }
  for (const k of decorKeys) {
    const sway = k.startsWith('grass') || k === 'plantTall';
    scene.add(scatter(M[k], decor[k], { cast: k.startsWith('bush'), patch: sway ? windPatch : stillPatch }));
  }
  // bamboo along the lagoon banks
  const bamboo = [];
  for (let i = 0; i < LAGOON.length; i++) {
    const [ax, az] = LAGOON[i];
    const [bx, bz] = LAGOON[(i + 1) % LAGOON.length];
    for (let k = 0; k < 2; k++) {
      const u = R();
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      const out = z < 18 ? -2.2 : 2.2;
      const px = x;
      const pz = z + out;
      if (px > BRIDGE.x0 - 4 && px < BRIDGE.x1 + 4) continue;
      if (!world.free(px, pz, { road: 0.6, keepOut, gap: 0.2 })) continue;
      bamboo.push({ x: px, z: pz, rot: R() * 6.28, scale: 3 + R() * 1.5 });
    }
  }
  scene.add(scatter(M.bamboo, bamboo, { patch: windPatch }));
  const rocks = [];
  for (let i = 0; i < 300 && rocks.length < 14; i++) {
    const x = -88 + R() * 176;
    const z = -64 + R() * 186;
    if (!kerala(x, z) || !world.free(x, z, { road: 2, keepOut, gap: 2 })) continue;
    rocks.push({ x, z, rot: R() * 6.28, scale: 2.5 + R() * 2 });
  }
  scene.add(scatter(M.rockA, rocks.filter((_, i) => i % 2)));
  scene.add(scatter(M.rockB, rocks.filter((_, i) => !(i % 2))));
  for (const r of rocks) world.circle(r.x, r.z, r.scale * 0.45);

  /* ------------------------------------------------ the sea around Kerala */
  const fishing = [
    place(M.fishingBoat, { x: -112, z: -6, rot: 1.2, scale: 2.2 }),
    place(M.fishingBoat, { x: -104, z: 48, rot: 2.4, scale: 2.2 }),
    place(M.fishingBoat, { x: 104, z: 30, rot: -0.8, scale: 2.2 }),
  ];
  fishing.forEach((b) => scene.add(b));
  const buoys = [[-30, -140], [10, -142], [50, -138]].map(([x, z]) => {
    const b = place(M.buoy, { x, z, scale: 1.6 });
    scene.add(b);
    return b;
  });
  world.onUpdate((t) => {
    fishing.forEach((b, i) => {
      b.position.y = SEA_LEVEL - 0.25 + Math.sin(t * 1.2 + i) * 0.12;
      b.rotation.z = Math.sin(t * 0.9 + i) * 0.05;
    });
    buoys.forEach((b, i) => {
      b.position.y = SEA_LEVEL - 0.1 + Math.sin(t * 1.6 + i * 2) * 0.15;
    });
  });
}

/* ------------------------------------------------ screen painters */

// Customer messages in the four languages the assistant handles.
const CHAT = [
  { who: 'them', text: 'Hi! Is the blue kurta in stock?', lang: 'EN' },
  { who: 'bot', text: 'Yes, in M and L. Shall I hold one for you?' },
  { who: 'them', text: 'नमस्ते, मेरा ऑर्डर कहाँ है?', lang: 'HI' },
  { who: 'bot', text: 'आपका ऑर्डर आज शाम तक पहुँच जाएगा।' },
  { who: 'them', text: 'എന്റെ ഓർഡർ എവിടെയാണ്?', lang: 'ML' },
  { who: 'bot', text: 'ഇന്ന് വൈകിട്ട് എത്തും.' },
  { who: 'them', text: 'مرحبا، هل يمكنني تغيير العنوان؟', lang: 'AR', rtl: true },
  { who: 'bot', text: 'نعم، أرسل العنوان الجديد هنا.', rtl: true },
];

function paintChat(ctx, w, h, shown = CHAT.length) {
  ctx.fillStyle = '#efe7dc';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1f6f5c';
  ctx.fillRect(0, 0, w, h * 0.1);
  text(ctx, 'Support desk', w * 0.07, h * 0.065, { cap: h * 0.026, color: '#ffffff' });
  text(ctx, 'AI assistant · hands off to staff', w * 0.07, h * 0.088, {
    cap: h * 0.014, font: FONTS.sans, weight: 500, color: '#d6efe6',
  });
  let y = h * 0.13;
  const visible = CHAT.slice(0, Math.floor(shown)).slice(-8);
  for (const msg of visible) {
    const mine = msg.who === 'bot';
    const fontPx = h * 0.03;
    ctx.font = `500 ${fontPx}px ${FONTS.sans}`;
    const maxW = w * 0.72;
    const words = msg.text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW - w * 0.08 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + w * 0.08);
    const bh = lines.length * fontPx * 1.35 + h * 0.025;
    const bx = mine ? w - bw - w * 0.05 : w * 0.05;
    ctx.fillStyle = mine ? '#d8f6c9' : '#ffffff';
    roundRect(ctx, bx, y, bw, bh, h * 0.012);
    ctx.fill();
    ctx.fillStyle = '#1b1d21';
    ctx.textAlign = msg.rtl ? 'right' : 'left';
    ctx.direction = msg.rtl ? 'rtl' : 'ltr';
    lines.forEach((l, i) => {
      ctx.fillText(l, msg.rtl ? bx + bw - w * 0.04 : bx + w * 0.04, y + h * 0.012 + fontPx * (1.05 + i * 1.35));
    });
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    if (msg.lang) {
      text(ctx, msg.lang, bx + bw + w * 0.02, y + bh * 0.6, { cap: h * 0.012, font: FONTS.mono, weight: 700, color: '#8a8d93' });
    }
    y += bh + h * 0.018;
  }
}

function paintAnswer(ctx, w, h, stage = 2) {
  ctx.fillStyle = '#f7f4ec';
  roundRect(ctx, 0, 0, w, h, h * 0.05);
  ctx.fill();
  text(ctx, 'Q: What was Q3 revenue?', w * 0.06, h * 0.17, { cap: h * 0.06, color: '#1b1d21' });
  if (stage < 1) {
    text(ctx, 'searching 6 PDFs…', w * 0.06, h * 0.34, { cap: h * 0.05, font: FONTS.sans, weight: 500, color: '#8a8d93' });
    return;
  }
  text(ctx, 'A: 4.2 million, up 8% on Q2.', w * 0.06, h * 0.36, { cap: h * 0.06, font: FONTS.sans, weight: 600, color: '#1b1d21' });
  ctx.fillStyle = '#e6ecfb';
  roundRect(ctx, w * 0.06, h * 0.46, w * 0.5, h * 0.14, h * 0.03);
  ctx.fill();
  text(ctx, 'report.pdf · page 12', w * 0.09, h * 0.555, { cap: h * 0.045, font: FONTS.sans, weight: 600, color: '#2448c9' });
  if (stage < 2) return;
  ctx.fillStyle = '#e3f3e6';
  roundRect(ctx, w * 0.06, h * 0.66, w * 0.82, h * 0.14, h * 0.03);
  ctx.fill();
  text(ctx, '✓ both figures found in the cited page', w * 0.09, h * 0.755, {
    cap: h * 0.045, font: FONTS.sans, weight: 600, color: '#1f7a3d', maxW: w * 0.76,
  });
  text(ctx, 'hybrid search · ChromaDB · Ollama / Bedrock', w * 0.06, h * 0.93, {
    cap: h * 0.035, font: FONTS.sans, weight: 500, color: '#8a8d93', maxW: w * 0.88,
  });
}

function paintDiet(ctx, w, h) {
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2448c9';
  ctx.fillRect(0, 0, w, h * 0.12);
  text(ctx, 'Diet Tracker', w * 0.08, h * 0.08, { cap: h * 0.03, color: '#ffffff' });
  text(ctx, 'Today', w * 0.08, h * 0.2, { cap: h * 0.03, color: '#1b1d21' });
  ctx.strokeStyle = '#e2ddd2';
  ctx.lineWidth = w * 0.06;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.38, w * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#f3aa1c';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.38, w * 0.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.35);
  ctx.stroke();
  text(ctx, '1,420', w / 2, h * 0.39, { cap: h * 0.035, color: '#1b1d21', align: 'center' });
  text(ctx, 'of 2,100 kcal', w / 2, h * 0.43, { cap: h * 0.016, font: FONTS.sans, weight: 500, color: '#8a8d93', align: 'center' });
  ['Breakfast · 420', 'Lunch · 640', 'Snack · 360'].forEach((row, i) => {
    ctx.fillStyle = '#f0ece3';
    roundRect(ctx, w * 0.08, h * (0.55 + i * 0.1), w * 0.84, h * 0.08, h * 0.015);
    ctx.fill();
    text(ctx, row, w * 0.13, h * (0.6 + i * 0.1), { cap: h * 0.022, font: FONTS.sans, weight: 600, color: '#1b1d21' });
  });
  text(ctx, 'Kotlin · multi-module Gradle', w / 2, h * 0.93, { cap: h * 0.018, font: FONTS.sans, weight: 500, color: '#8a8d93', align: 'center' });
}

// Park benches you can sit on. Kenney's bench has its origin at a back corner
// (1.2 × 0.6 m at this scale, backrest along local −z), so work out its middle,
// make it solid there, and note where Hadi sits and where he stands up to.
export const BENCH_SCALE = 3;
export function addBenches(scene, world, M, list) {
  scene.add(scatter(M.bench, list.map((b) => ({ ...b, scale: BENCH_SCALE }))));
  for (const { x, z, rot } of list) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    // local (lx, lz) → world, for a rotation of rot about y
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [cx, cz] = at(0.6, -0.3);
    for (const k of [-0.32, 0.32]) {
      const [px, pz] = at(0.6 + k, -0.3);
      world.circle(px, pz, 0.42);
    }
    const [sx, sz] = at(0.6, -0.26);
    const [ux, uz] = at(0.6, 0.75);
    world.refs.benches.push({ x: cx, z: cz, face: rot, seat: [sx, sz], up: [ux, uz] });
  }
}
