// Day and night. One clock drives the sun and moon across the sky, the sky and
// fog colours, the two lights, the stars, and the street lamps (which come on
// at dusk). A handful of real lights follow you between the lamps; the rest
// get by on a glowing bulb and a pool of light on the ground.
import {
  Mesh, Points, Sprite, Color, Vector3, BufferGeometry, Float32BufferAttribute,
  IcosahedronGeometry, SphereGeometry, MeshBasicMaterial, PointsMaterial, SpriteMaterial,
  CanvasTexture, AdditiveBlending, PointLight, MathUtils,
} from '../../vendor/three.min.js';
import { createLamp } from './structures.js';
import { ROADS, alongRoad } from './roads.js';

const DAY_SECONDS_PER_HOUR = 40; // a daytime hour passes in 40 s
const NIGHT_SECONDS_PER_HOUR = 22; // nights go quicker
const FAR = 1100; // how far away the sun, moon and stars are drawn

const smooth = (a, b, x) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Where the sun is at a given hour: up in the east (+x) at 6, high in the
// south-ish sky at noon, down in the west at 18. The moon runs the same arc,
// half a day later.
function arc(hour, tilt, out) {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(Math.cos(a), Math.sin(a) * 0.86, Math.sin(a) * tilt + 0.08).normalize();
}

// Sky, fog and light colours by how high the sun is.
const PALETTE = [
  { e: -0.3, top: '#050a1a', horizon: '#121c38', below: '#08131f', sky: '#4a6496', ground: '#17181f', hemi: 0.8, glow: '#000000' },
  { e: -0.1, top: '#14214a', horizon: '#3a3c64', below: '#12243a', sky: '#56679a', ground: '#211f29', hemi: 0.85, glow: '#3a2c55' },
  { e: 0.0, top: '#3b5c9a', horizon: '#ee9c64', below: '#325b6b', sky: '#b9a8bb', ground: '#6b5644', hemi: 0.95, glow: '#ff8f45' },
  { e: 0.13, top: '#6496d3', horizon: '#f5cf9c', below: '#7fb0b8', sky: '#d6dcef', ground: '#b39a77', hemi: 1.05, glow: '#ffc788' },
  { e: 0.35, top: '#7fb2e6', horizon: '#f2e3c6', below: '#9fc7c9', sky: '#dceaff', ground: '#c9b28a', hemi: 1.15, glow: '#ffeed0' },
].map((k) => ({
  ...k,
  top: new Color(k.top), horizon: new Color(k.horizon), below: new Color(k.below),
  sky: new Color(k.sky), ground: new Color(k.ground), glow: new Color(k.glow),
}));

function blend(e, key, out) {
  const first = PALETTE[0][key];
  if (e <= PALETTE[0].e) return typeof first === 'number' ? first : out.copy(first);
  for (let i = 1; i < PALETTE.length; i++) {
    const b = PALETTE[i];
    if (e <= b.e) {
      const a = PALETTE[i - 1];
      const t = (e - a.e) / (b.e - a.e);
      return typeof a[key] === 'number' ? a[key] + (b[key] - a[key]) * t : out.copy(a[key]).lerp(b[key], t);
    }
  }
  const last = PALETTE[PALETTE.length - 1][key];
  return typeof last === 'number' ? last : out.copy(last);
}

function radial(stops) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

// A faceted moon: pale grey, with a few darker seas so it reads as the moon.
function moonMesh() {
  const geo = new IcosahedronGeometry(40, 2);
  const pos = geo.attributes.position;
  const colors = [];
  const seas = [[0.4, 0.5, 0.75, 0.55], [-0.35, 0.2, 0.9, 0.45], [0.1, -0.45, 0.88, 0.4], [-0.6, -0.3, 0.7, 0.35]]
    .map(([x, y, z, r]) => ({ d: new Vector3(x, y, z).normalize(), r }));
  const n = new Vector3();
  const base = new Color('#c3c9d6');
  const sea = new Color('#7d8699');
  const c = new Color();
  for (let i = 0; i < pos.count; i += 3) {
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) n.x += pos.getX(i + k), n.y += pos.getY(i + k), n.z += pos.getZ(i + k);
    n.normalize();
    let dark = 0;
    for (const s of seas) dark = Math.max(dark, 1 - n.distanceTo(s.d) / s.r);
    c.copy(base).lerp(sea, MathUtils.clamp(dark * 1.6, 0, 1));
    // a little face-to-face variation keeps the facets visible
    const jitter = 0.94 + (((i * 7919) % 97) / 97) * 0.08;
    c.multiplyScalar(jitter);
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
}

function starField(count, size, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const positions = [];
  const colors = [];
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const y = 0.02 + rand() * 0.98;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions.push(Math.cos(a) * r * FAR, y * FAR, Math.sin(a) * r * FAR);
    c.setHSL(0.58 + rand() * 0.12, 0.35, 0.8 + rand() * 0.2);
    colors.push(c.r, c.g, c.b);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const points = new Points(geo, new PointsMaterial({
    size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

// Line the roads with lamps, so the walk from home to the gate and Dubai's
// streets are lit at night. Runs once everything else is built, so it can keep
// clear of whatever is already there.
export function lineRoads(scene, world, avoid = []) {
  const refs = world.refs;
  // the Kerala path, on the same side as the college's lamps
  const spots = alongRoad(ROADS.kerala, { step: 21, offset: 0.9, side: -1 });
  for (const p of alongRoad(ROADS.dubaiWalk, { u0: 0.2, step: 13, offset: 0.9, side: 1 })) spots.push(p);
  // the ring road: lamps on its outer edge
  const centre = new Vector3();
  const pts = ROADS.loop.curve.getSpacedPoints(60);
  pts.forEach((p) => centre.add(p));
  centre.divideScalar(pts.length);
  for (const side of [1, -1]) {
    const ring = alongRoad(ROADS.loop, { step: 27, offset: 1.2, side });
    const outer = ring.filter((p) => Math.hypot(p.x - centre.x, p.z - centre.z) > Math.hypot(p.x + p.towardX * 6 - centre.x, p.z + p.towardZ * 6 - centre.z));
    if (outer.length > ring.length / 2) {
      spots.push(...outer);
      break;
    }
  }
  // not too close to the lamps already standing (the college's, the plaza's),
  // nor where cars park or wait
  const keepOut = [
    ...refs.streetLamps.map((l) => ({ x: l.group.position.x, z: l.group.position.z, r: 10 })),
    ...avoid,
  ];
  for (const { x, z, towardX, towardZ } of spots) {
    if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    if (!world.free(x, z, { road: 0.5, gap: 0.8 })) continue;
    const lamp = createLamp(x, z);
    lamp.group.rotation.y = Math.atan2(-towardZ, towardX); // the arm reaches over the road
    scene.add(lamp.group);
    world.box(lamp.collider);
    refs.streetLamps.push(lamp);
    keepOut.push({ x, z, r: 9 });
  }
}

export class DayNight {
  constructor({ scene, sky, lights, renderer, lamps, glows = [], clouds = null, hour = 9.5, pool = 4, reducedMotion = false, onTick = null }) {
    this.sky = sky;
    this.lights = lights;
    this.renderer = renderer;
    this.lamps = lamps;
    this.clouds = clouds;
    this.glows = glows; // anything else with a night(level): lit windows
    this.hour = hour;
    this.reducedMotion = reducedMotion;
    this.onTick = onTick;
    this.sunDir = new Vector3();
    this.moonDir = new Vector3();
    this.rush = null; // a fast-forward to another time of day

    this.sun = new Mesh(new SphereGeometry(34, 24, 12), new MeshBasicMaterial({ color: '#fff4dc', fog: false, depthWrite: false }));
    this.sunHalo = new Sprite(new SpriteMaterial({
      map: radial([[0, 'rgba(255,240,205,0.9)'], [0.2, 'rgba(255,214,150,0.35)'], [1, 'rgba(255,200,120,0)']]),
      blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    }));
    this.sunHalo.scale.setScalar(300);
    this.moon = moonMesh();
    this.moonHalo = new Sprite(new SpriteMaterial({
      map: radial([[0, 'rgba(200,215,255,0.7)'], [0.25, 'rgba(170,190,255,0.18)'], [1, 'rgba(150,170,255,0)']]),
      blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    }));
    this.moonHalo.scale.setScalar(190);
    this.stars = [starField(900, 1.5, 7), starField(140, 2.6, 31)];
    for (const o of [this.sun, this.sunHalo, this.moon, this.moonHalo]) {
      o.renderOrder = -1;
      o.frustumCulled = false;
    }
    scene.add(this.sun, this.sunHalo, this.moon, this.moonHalo, ...this.stars);

    // real lights for the few lamps nearest to you
    this.pool = Array.from({ length: pool }, () => {
      const light = new PointLight('#ffc87e', 0, 17, 1.7);
      light.castShadow = false;
      scene.add(light);
      return light;
    });
    this.poolTimer = 0;
    this.tmp = new Color();
    this.tmp2 = new Color();
    this.night = 0;
    this.apply();
  }

  get isNight() {
    return this.sunDir.y < 0.02;
  }

  // Fast-forward to morning if it's night, to evening if it's day.
  toggle() {
    const target = this.isNight ? 7.6 : 20.4;
    const ahead = (target - this.hour + 24) % 24;
    if (this.reducedMotion) {
      this.hour = target;
      this.apply();
      return;
    }
    // timed by the wall clock, so a slow device doesn't drag it out
    this.rush = { from: this.hour, ahead, start: performance.now(), seconds: 3.2 };
  }

  setHour(hour) {
    this.rush = null;
    this.hour = ((hour % 24) + 24) % 24;
    this.apply();
  }

  update(dt, camera, focus) {
    if (this.rush) {
      const r = this.rush;
      const t = Math.min(1, (performance.now() - r.start) / 1000 / r.seconds);
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.hour = (r.from + r.ahead * k) % 24;
      if (t >= 1) this.rush = null;
    } else {
      this.hour = (this.hour + dt / (this.isNight ? NIGHT_SECONDS_PER_HOUR : DAY_SECONDS_PER_HOUR)) % 24;
    }
    this.apply();
    // sun, moon and stars ride along with the camera, so they stay at the horizon
    const c = camera.position;
    this.sun.position.copy(c).addScaledVector(this.sunDir, FAR);
    this.sunHalo.position.copy(this.sun.position);
    this.moon.position.copy(c).addScaledVector(this.moonDir, FAR);
    this.moonHalo.position.copy(this.moon.position);
    for (const s of this.stars) s.position.copy(c);
    this.placePool(dt, focus);
    this.onTick?.(this.hour, this.isNight);
  }

  apply() {
    const sun = arc(this.hour, 0.5, this.sunDir);
    const moon = arc(this.hour + 12.4, 0.62, this.moonDir);
    const e = sun.y;
    const u = this.sky.uniforms;
    blend(e, 'top', u.uTop.value);
    blend(e, 'horizon', u.uHorizon.value);
    blend(e, 'below', u.uBelow.value);
    blend(e, 'glow', u.uGlow.value);
    u.uGlow.value.multiplyScalar(smooth(-0.12, 0.0, e));
    u.uGlowSize.value = 4 + 8 * smooth(0.0, 0.3, e);
    u.uSunDir.value.copy(sun);
    this.sky.fog.color.copy(u.uHorizon.value);
    // clouds take their colour from the sky round them, so their undersides
    // glow at sunset and go navy at night instead of turning muddy
    if (this.clouds) this.clouds.emissive.copy(u.uHorizon.value).multiplyScalar(0.55);

    const { hemi, sun: key } = this.lights;
    blend(e, 'sky', hemi.color);
    blend(e, 'ground', hemi.groundColor);
    hemi.intensity = blend(e, 'hemi');

    // one light: the sun while it's up, the moon after it sets
    const sunUp = smooth(-0.03, 0.2, e);
    const moonUp = smooth(-0.03, 0.22, moon.y) * smooth(0.04, -0.1, e);
    if (sunUp >= moonUp) {
      key.color.set('#ff9450').lerp(this.tmp.set('#fff0d8'), smooth(0.02, 0.3, e));
      key.intensity = 2.6 * sunUp;
      this.lights.setDirection(sun);
    } else {
      key.color.set('#a8bcff');
      key.intensity = 0.75 * moonUp;
      this.lights.setDirection(moon);
    }

    this.night = smooth(0.08, -0.05, e);
    this.renderer.toneMappingExposure = 1.05 + 0.2 * this.night;
    for (const lamp of this.lamps) lamp.night(this.night);
    for (const g of this.glows) g.night(this.night);

    // the sun turns orange and swells a little as it sets
    this.sun.material.color.set('#ffb36b').lerp(this.tmp2.set('#fff4dc'), smooth(0.0, 0.25, e));
    this.sun.visible = e > -0.12;
    this.sunHalo.visible = this.sun.visible;
    this.sunHalo.material.opacity = 0.55 + 0.45 * smooth(0.15, 0.0, e);
    this.moon.visible = moon.y > -0.12;
    this.moonHalo.visible = this.moon.visible;
    this.moonHalo.material.opacity = 0.25 + 0.6 * this.night;
    // in daylight the moon is a pale ghost
    this.moon.material.opacity = 0.35 + 0.65 * this.night;
    this.moon.material.transparent = true;
    const starOpacity = smooth(-0.02, -0.22, e);
    for (const s of this.stars) {
      s.material.opacity = starOpacity;
      s.visible = starOpacity > 0.01;
      s.rotation.y = this.hour * 0.02;
    }
  }

  placePool(dt, focus) {
    this.poolTimer -= dt;
    if (this.night <= 0.01) {
      for (const light of this.pool) light.intensity = 0;
      return;
    }
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.25;
      const fx = focus.x;
      const fz = focus.z;
      this.nearest = this.lamps
        .map((lamp) => ({ lamp, d: (lamp.group.position.x - fx) ** 2 + (lamp.group.position.z - fz) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length)
        .map((n) => n.lamp);
    }
    this.pool.forEach((light, i) => {
      const lamp = this.nearest?.[i];
      if (!lamp) {
        light.intensity = 0;
        return;
      }
      lamp.bulb.getWorldPosition(light.position);
      light.position.y -= 0.35;
      light.intensity = 30 * lamp.level;
    });
  }
}
