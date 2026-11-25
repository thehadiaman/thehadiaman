// Buildings made from primitives: airport terminals, control tower, the Sabre
// GDS mast out at sea, the Redis cabinet, a Dubai supertall and street lamps.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  MeshStandardMaterial, Vector3, Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending,
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

// A generic stepped supertall for the Dubai skyline.
export function createSupertall(x, z) {
  const group = new Group();
  const tiers = [
    [9, 46], [7.4, 40], [5.8, 34], [4.3, 26], [3, 20], [1.8, 14],
  ];
  let y = 0;
  tiers.forEach(([r, h], i) => {
    const t = new Mesh(new CylinderGeometry(r * 0.86, r, h, 6), i % 2 ? glass : darkGlass);
    t.position.y = y + h / 2;
    t.rotation.y = i * 0.18;
    t.castShadow = true;
    group.add(t);
    y += h;
  });
  const spire = new Mesh(new CylinderGeometry(0.15, 1.2, 26, 6), steel);
  spire.position.y = y + 13;
  group.add(spire);
  group.position.set(x, 0, z);
  return { group, collider: { x0: x - 9, x1: x + 9, z0: z - 9, z1: z + 9, top: 210 } };
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

// Street lamp whose bulb can be switched on.
export function createLamp(x, z) {
  const group = new Group();
  const pole = new Mesh(new CylinderGeometry(0.08, 0.11, 4.6, 8), new MeshStandardMaterial({ color: '#33363c', roughness: 0.6 }));
  pole.position.y = 2.3;
  const arm = box(0.9, 0.08, 0.08, pole.material, 0.4, 4.55, 0);
  const bulbMat = new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0 });
  const bulb = new Mesh(new SphereGeometry(0.22, 12, 8), bulbMat);
  bulb.position.set(0.8, 4.4, 0);
  const halo = new Sprite(new SpriteMaterial({
    map: glow(), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  halo.position.copy(bulb.position);
  halo.scale.setScalar(2.6);
  group.add(pole, arm, bulb, halo);
  group.position.set(x, 0, z);
  pole.castShadow = true;
  return {
    group,
    collider: { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 },
    set(level) {
      bulbMat.emissiveIntensity = level * 3;
      halo.material.opacity = level * 0.9;
    },
  };
}

export { box, concrete, sandstone, glass, steel };
