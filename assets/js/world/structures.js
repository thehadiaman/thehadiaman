// Buildings made from primitives: airport terminals, control tower, the Sabre
// GDS mast out at sea, the Redis cabinet, a Dubai supertall and street lamps.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, Vector3, Sprite, SpriteMaterial,
  CanvasTexture, AdditiveBlending, RepeatWrapping, SRGBColorSpace, mergeGeometries,
} from '../../vendor/three.min.js';
import { label, Panel, text, FONTS, roundRect } from './canvasart.js';

const concrete = new MeshStandardMaterial({ color: '#ebe5d9', roughness: 0.85 });
const sandstone = new MeshStandardMaterial({ color: '#e4d2ae', roughness: 0.9 });
const glass = new MeshStandardMaterial({ color: '#5f7f97', roughness: 0.15, metalness: 0.5 });
const darkGlass = new MeshStandardMaterial({ color: '#2b3a48', roughness: 0.15, metalness: 0.6 });
const steel = new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.45, metalness: 0.5 });
const roofMat = new MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.7 });
const redPaint = new MeshStandardMaterial({ color: '#c8372d', roughness: 0.5 });
const whitePaint = new MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.5 });

function box(w, h, d, material, x, y, z) {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Terminal: two blocks with a walk-through hall between them, under one canopy.
 * front: which side faces the landside road (+1 = south/+z, −1 = north/−z).
 * Returns the group, its collision boxes and the point where a board hangs.
 */
export function createTerminal({ x0, x1, z0, z1, gap0, gap1, name, material = concrete, front = 1 }) {
  const group = new Group();
  const height = 8.5;
  const depth = z1 - z0;
  const cz = (z0 + z1) / 2;
  const frontZ = front > 0 ? z1 : z0;
  const colliders = [];
  for (const [a, b] of [[x0, gap0], [gap1, x1]]) {
    group.add(box(b - a, height, depth, material, (a + b) / 2, height / 2, cz));
    // glass band across the facade, on both sides
    for (const side of [-1, 1]) {
      const g = box(b - a - 1.6, 5.2, 0.3, glass, (a + b) / 2, 3.6, cz + side * (depth / 2 + 0.05));
      group.add(g);
    }
    colliders.push({ x0: a, x1: b, z0, z1, top: height });
  }
  // canopy over everything, reaching out over the front
  const reach = 7;
  const cz0 = front > 0 ? z0 - 1 : z0 - reach;
  const cz1 = front > 0 ? z1 + reach : z1 + 1;
  group.add(box(x1 - x0 + 8, 0.8, cz1 - cz0, roofMat, (x0 + x1) / 2, height + 1.1, (cz0 + cz1) / 2));
  // the canopy only stops the camera (you walk under it)
  colliders.push({ x0: x0 - 4, x1: x1 + 4, z0: cz0, z1: cz1, bottom: height + 0.7, top: height + 1.5, walk: false });
  // columns along the canopy's front edge
  const colZ = front > 0 ? cz1 - 1 : cz0 + 1;
  for (let x = x0 + 2; x <= x1 - 2; x += 8) {
    if (x > gap0 - 1 && x < gap1 + 1) continue;
    const col = new Mesh(new CylinderGeometry(0.28, 0.28, height + 1, 10), steel);
    col.position.set(x, (height + 1) / 2, colZ);
    col.castShadow = true;
    group.add(col);
    colliders.push({ x0: x - 0.4, x1: x + 0.4, z0: colZ - 0.4, z1: colZ + 0.4 });
  }
  // the name along the canopy fascia
  const fascia = label(name, { height: 1.1, color: '#1b1d21', tracking: 0.12 });
  fascia.mesh.position.set((x0 + x1) / 2, height + 1.1, front > 0 ? cz1 + 0.42 : cz0 - 0.42);
  if (front < 0) fascia.mesh.rotation.y = Math.PI;
  group.add(fascia.mesh);
  return {
    group,
    colliders,
    boardAnchor: new Vector3((gap0 + gap1) / 2, 6.2, frontZ + front * 0.6),
    frontZ,
  };
}

export function createControlTower(x, z) {
  const group = new Group();
  const shaft = new Mesh(new CylinderGeometry(1.5, 2.2, 22, 12), concrete);
  shaft.position.y = 11;
  const cab = new Mesh(new CylinderGeometry(3.4, 2.6, 3.6, 8), darkGlass);
  cab.position.y = 23.8;
  const roof = new Mesh(new CylinderGeometry(3.8, 3.6, 0.6, 8), roofMat);
  roof.position.y = 25.9;
  const mast = new Mesh(new CylinderGeometry(0.08, 0.08, 4, 6), steel);
  mast.position.y = 28;
  group.add(shaft, cab, roof, mast);
  group.traverse((o) => o.isMesh && (o.castShadow = true));
  group.position.set(x, 0, z);
  return { group, collider: { x0: x - 2.4, x1: x + 2.4, z0: z - 2.4, z1: z + 2.4, top: 28 } };
}

// A red-and-white mast on a rock, out at sea: where Sabre's servers "are".
export function createSabreMast(x, z) {
  const group = new Group();
  const rockMat = new MeshStandardMaterial({ color: '#8b8072', roughness: 1, flatShading: true });
  const rock = new Mesh(new IcosahedronGeometry(9, 1), rockMat);
  rock.scale.set(1.3, 0.45, 1);
  rock.position.y = -1;
  rock.receiveShadow = true;
  group.add(rock);
  const bands = 7;
  const h = 6;
  for (let i = 0; i < bands; i++) {
    const r0 = 1.9 - i * 0.22;
    const seg = new Mesh(new CylinderGeometry(r0 - 0.22, r0, h, 8), i % 2 ? whitePaint : redPaint);
    seg.position.y = 2.5 + h / 2 + i * h;
    seg.castShadow = true;
    group.add(seg);
  }
  const top = 2.5 + bands * h;
  const lamp = new Mesh(
    new SphereGeometry(0.6, 12, 8),
    new MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff3b2f', emissiveIntensity: 2 }),
  );
  lamp.position.y = top + 0.4;
  group.add(lamp);
  const sign = new Panel({
    width: 9,
    height: 2.6,
    paint(ctx, w, hh) {
      ctx.fillStyle = '#1f2226';
      roundRect(ctx, 0, 0, w, hh, hh * 0.08);
      ctx.fill();
      text(ctx, 'SABRE GDS', w / 2, hh * 0.52, { cap: hh * 0.28, color: '#f4f0e6', align: 'center', tracking: 0.1 });
      text(ctx, 'airline search and booking', w / 2, hh * 0.82, {
        cap: hh * 0.12, font: FONTS.sans, weight: 500, color: '#b9b4a8', align: 'center',
      });
    },
  });
  sign.mesh.position.set(0, 4.6, 7.6);
  sign.mesh.rotation.y = -0.6;
  group.add(sign.mesh);
  group.position.set(x, 0, z);
  return {
    group,
    top: new Vector3(x, top + 1, z),
    blink(t) {
      lamp.material.emissiveIntensity = Math.sin(t * 3) > 0.2 ? 2.4 : 0.2;
    },
  };
}

// The cache: a red cabinet beside the terminal door, with LEDs that light up on a hit.
export function createRedisCabinet(x, z, rot = 0) {
  const group = new Group();
  const red = new MeshStandardMaterial({ color: '#c8372d', roughness: 0.55, metalness: 0.2 });
  group.add(box(1.8, 2.2, 1, red, 0, 1.1, 0));
  const face = new Panel({
    width: 1.5,
    height: 1.9,
    lit: false,
    paint(ctx, w, h, lit = 0) {
      ctx.fillStyle = '#26282d';
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'REDIS', w / 2, h * 0.2, { cap: h * 0.09, color: '#f4f0e6', align: 'center', tracking: 0.14 });
      text(ctx, 'fare cache · 15 min', w / 2, h * 0.31, {
        cap: h * 0.045, font: FONTS.sans, weight: 500, color: '#b9b4a8', align: 'center',
      });
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          const on = lit > 0 && (r * 4 + c) % 3 !== Math.floor(lit * 3) % 3;
          ctx.fillStyle = on ? '#6cff9a' : '#3a3d43';
          ctx.beginPath();
          ctx.arc(w * (0.25 + c * 0.17), h * (0.45 + r * 0.085), w * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  });
  face.mesh.position.set(0, 1.15, 0.51);
  group.add(face.mesh);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  return {
    group,
    collider: { x0: x - 1.1, x1: x + 1.1, z0: z - 0.8, z1: z + 0.8 },
    top: new Vector3(x, 2.6, z),
    flash(level) {
      face.refresh(level);
    },
  };
}

// Office windows for the supertall: a few floors' worth, some left on late.
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 256);
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 16; row++) {
    // whole floors tend to be on or off together, as in a real office tower
    const floor = rand();
    for (let col = 0; col < 6; col++) {
      if (rand() > (floor > 0.45 ? 0.82 : 0.12)) continue;
      const warm = 70 + rand() * 40;
      ctx.fillStyle = `hsl(${36 + rand() * 10}, 90%, ${warm}%)`;
      ctx.fillRect(5 + col * 20.5, row * 16 + 4, 15, 9);
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// A generic stepped supertall for the Dubai skyline. Its windows light up at
// night, and a red light blinks on the spire.
export function createSupertall(x, z) {
  const group = new Group();
  const tiers = [
    [9, 46], [7.4, 40], [5.8, 34], [4.3, 26], [3, 20], [1.8, 14],
  ];
  const windows = windowTexture();
  const lit = [glass, darkGlass].map((m) => {
    const mat = m.clone();
    mat.emissive.set('#ffffff');
    mat.emissiveMap = windows;
    mat.emissiveIntensity = 0;
    return mat;
  });
  let y = 0;
  tiers.forEach(([r, h], i) => {
    const geo = new CylinderGeometry(r * 0.86, r, h, 6);
    // one window tile per face, floors about 3 m apart
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 6, (uv.getY(k) * h) / 48 + i * 0.37);
    const t = new Mesh(geo, lit[i % 2]);
    t.position.y = y + h / 2;
    t.rotation.y = i * 0.18;
    t.castShadow = true;
    group.add(t);
    y += h;
  });
  const spire = new Mesh(new CylinderGeometry(0.15, 1.2, 26, 6), steel);
  spire.position.y = y + 13;
  group.add(spire);
  const beaconMat = new MeshBasicMaterial({ color: '#ff3b2f', fog: false });
  const beacon = new Mesh(new SphereGeometry(0.7, 10, 8), beaconMat);
  beacon.position.y = y + 26.4;
  beacon.visible = false;
  group.add(beacon);
  group.position.set(x, 0, z);
  let level = 0;
  return {
    group,
    collider: { x0: x - 9, x1: x + 9, z0: z - 9, z1: z + 9, top: 210 },
    night(l) {
      level = l;
      for (const m of lit) m.emissiveIntensity = l * 1.4;
    },
    update(t) {
      beacon.visible = level > 0.3 && t % 1.6 < 0.25;
    },
  };
}

let glowTexture = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,226,150,1)');
  g.addColorStop(0.3, 'rgba(255,200,110,0.45)');
  g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(c);
  return glowTexture;
}

// Street lamp. Its bulb is lit by whichever asks for more: the story (the
// college lamps switch on as you arrive) or the night.
const lampPost = new MeshStandardMaterial({ color: '#33363c', roughness: 0.6 });
let postGeometry = null;
let poolTexture = null;
function lampPool() {
  if (poolTexture) return poolTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,140,0.9)');
  g.addColorStop(0.45, 'rgba(255,196,110,0.35)');
  g.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  poolTexture = new CanvasTexture(c);
  return poolTexture;
}

export function createLamp(x, z) {
  const group = new Group();
  if (!postGeometry) {
    const pole = new CylinderGeometry(0.08, 0.11, 4.6, 8).translate(0, 2.3, 0);
    const arm = new BoxGeometry(0.9, 0.08, 0.08).translate(0.4, 4.55, 0);
    postGeometry = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()]);
  }
  const post = new Mesh(postGeometry, lampPost);
  post.castShadow = true;
  const bulbMat = new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0 });
  const bulb = new Mesh(new SphereGeometry(0.22, 12, 8), bulbMat);
  bulb.position.set(0.8, 4.4, 0);
  const halo = new Sprite(new SpriteMaterial({
    map: glow(), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false,
  }));
  halo.position.copy(bulb.position);
  halo.scale.setScalar(2.6);
  // the warm circle it throws on the ground
  const pool = new Mesh(new PlaneGeometry(9, 9), new MeshBasicMaterial({
    map: lampPool(), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.8, 0.05, 0);
  pool.renderOrder = 1;
  halo.visible = false;
  pool.visible = false;
  group.add(post, bulb, halo, pool);
  group.position.set(x, 0, z);
  let story = 0;
  let night = 0;
  const show = () => {
    const level = Math.max(story, night);
    bulbMat.emissiveIntensity = level * 3;
    halo.material.opacity = level * 0.9;
    halo.visible = level > 0.01;
    // the pool only shows once it's dark enough to see it
    pool.material.opacity = night * 0.55;
    pool.visible = night > 0.01;
  };
  return {
    group,
    bulb,
    collider: { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 },
    get level() {
      return Math.max(story, night);
    },
    set(level) {
      story = level;
      show();
    },
    night(level) {
      if (Math.abs(level - night) < 0.004) return;
      night = level;
      show();
    },
  };
}

export { box, concrete, sandstone, glass, steel };
