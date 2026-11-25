// Model loading and placement helpers. Every model is CC0 from Kenney
// (kenney.nl): Mini Characters, Nature Kit, City Kits, Car Kit, Watercraft Kit,
// Furniture Kit. See assets/models/CREDITS.md.
import {
  GLTFLoader, InstancedMesh, Group, Matrix4, Quaternion, Vector3, Euler, Box3,
  CanvasTexture, SRGBColorSpace, NearestFilter, cloneSkinned,
} from '../../vendor/three.min.js';

const BASE = 'assets/models/';

export const MODELS = {
  avatar: 'characters/character-male-f.glb',
  recruiter: 'characters/character-female-b.glb',
  worker: 'characters/character-worker.glb',
  luggage: 'characters/item-luggage-upright.glb',

  houseA: 'suburban/building-type-c.glb',
  houseB: 'suburban/building-type-h.glb',
  planter: 'suburban/planter.glb',
  fence: 'suburban/fence-1x3.glb',

  officeA: 'city/building-a.glb',
  officeC: 'city/building-c.glb',
  officeE: 'city/building-e.glb',
  officeH: 'city/building-h.glb',
  skyA: 'city/building-skyscraper-a.glb',
  skyB: 'city/building-skyscraper-b.glb',
  skyC: 'city/building-skyscraper-c.glb',
  skyE: 'city/building-skyscraper-e.glb',
  parasol: 'city/detail-parasol-a.glb',

  taxi: 'cars/taxi.glb',
  sedan: 'cars/sedan.glb',
  box: 'cars/box.glb',
  cone: 'cars/cone.glb',

  houseboatA: 'boats/boat-house-a.glb',
  houseboatB: 'boats/boat-house-b.glb',
  rowboat: 'boats/boat-row-small.glb',
  fishingBoat: 'boats/boat-fishing-small.glb',
  cargoShip: 'boats/ship-cargo-b.glb',
  buoy: 'boats/buoy.glb',

  palm: 'nature/tree_palm.glb',
  palmTall: 'nature/tree_palmTall.glb',
  palmBend: 'nature/tree_palmBend.glb',
  palmShort: 'nature/tree_palmShort.glb',
  palmDetailedTall: 'nature/tree_palmDetailedTall.glb',
  palmDetailedShort: 'nature/tree_palmDetailedShort.glb',
  tree: 'nature/tree_default.glb',
  oak: 'nature/tree_oak.glb',
  bush: 'nature/plant_bush.glb',
  bushLarge: 'nature/plant_bushLarge.glb',
  bushDetailed: 'nature/plant_bushDetailed.glb',
  plantTall: 'nature/plant_flatTall.glb',
  flowerYellow: 'nature/flower_yellowA.glb',
  flowerRed: 'nature/flower_redA.glb',
  flowerPurple: 'nature/flower_purpleA.glb',
  grass: 'nature/grass.glb',
  grassLarge: 'nature/grass_large.glb',
  grassLeafs: 'nature/grass_leafs.glb',
  rockA: 'nature/rock_largeA.glb',
  rockB: 'nature/rock_largeB.glb',
  rockSmallA: 'nature/rock_smallA.glb',
  rockSmallC: 'nature/rock_smallC.glb',
  lilyLarge: 'nature/lily_large.glb',
  lilySmall: 'nature/lily_small.glb',
  log: 'nature/log.glb',
  bamboo: 'nature/crops_bambooStageB.glb',
  pot: 'nature/pot_large.glb',

  desk: 'furniture/desk.glb',
  chairDesk: 'furniture/chairDesk.glb',
  laptop: 'furniture/laptop.glb',
  screen: 'furniture/computerScreen.glb',
  bookcase: 'furniture/bookcaseOpen.glb',
  pottedPlant: 'furniture/pottedPlant.glb',
  bench: 'furniture/bench.glb',
  lamp: 'furniture/lampRoundFloor.glb',
  books: 'furniture/books.glb',
};

export async function loadModels(manager) {
  const loader = new GLTFLoader(manager);
  const entries = await Promise.all(
    Object.entries(MODELS).map(async ([key, path]) => {
      const gltf = await loader.loadAsync(BASE + path);
      tidy(gltf.scene);
      return [key, gltf];
    }),
  );
  return Object.fromEntries(entries);
}

// Kenney colour maps are palettes: sample them crisply and let meshes cast shadows.
function tidy(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) {
        m.map.minFilter = NearestFilter;
        m.map.magFilter = NearestFilter;
        m.map.generateMipmaps = false;
      }
      if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.7);
      if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.1);
    }
  });
}

// A positioned copy of a model. Geometry and materials are shared.
export function place(gltf, { x = 0, y = 0, z = 0, rot = 0, scale = 1, skinned = false } = {}) {
  const obj = skinned ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
  obj.position.set(x, y, z);
  obj.rotation.y = rot;
  obj.scale.setScalar(scale);
  return obj;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const v = new Vector3();
const s = new Vector3();

// Many copies of one model as instanced meshes (one draw call per material).
// placements: [{ x, y?, z, rot?, scale? }]
export function scatter(gltf, placements, { cast = true, receive = true, patch } = {}) {
  const group = new Group();
  if (!placements.length) return group;
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
  for (const mesh of meshes) {
    const material = patch ? patch(mesh.material) : mesh.material;
    const inst = new InstancedMesh(mesh.geometry, material, placements.length);
    placements.forEach((p, i) => {
      q.setFromEuler(e.set(0, p.rot ?? 0, 0));
      const k = p.scale ?? 1;
      m4.compose(v.set(p.x, p.y ?? 0, p.z), q, s.set(k, k, k)).multiply(mesh.matrixWorld);
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = cast;
    inst.receiveShadow = receive;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

// A copy of a model centred on the origin in x/z with its base at y = 0
// (Kenney furniture has its origin in a corner).
export function centered(gltf, scale = 1) {
  const inner = gltf.scene.clone(true);
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  const box = new Box3().setFromObject(inner);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const group = new Group();
  group.add(inner);
  return group;
}

// Axis-aligned footprint of an object on the ground, for collisions.
export function footprint(obj, shrink = 0) {
  obj.updateMatrixWorld(true);
  const box = new Box3().setFromObject(obj);
  return {
    x0: box.min.x + shrink, x1: box.max.x - shrink,
    z0: box.min.z + shrink, z1: box.max.z - shrink,
    top: box.max.y,
  };
}

// Kerala houses have terracotta roofs, not green ones: swap the green swatches
// in the suburban palette for terracotta, keeping their lightness.
export function terracottaRoofs(gltfs) {
  const first = gltfs[0];
  let source = null;
  first.scene.traverse((o) => {
    if (o.isMesh && o.material.map && !source) source = o.material.map;
  });
  if (!source?.image) return;
  const img = source.image;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.12 || g !== max) continue; // not a clear green
    const light = (max + min) / 2;
    // terracotta: hue ~14°, lightness from the original
    const tr = Math.min(1, light * 1.42 + 0.06);
    const tg = Math.min(1, light * 0.78);
    const tb = Math.min(1, light * 0.55);
    px[i] = tr * 255;
    px[i + 1] = tg * 255;
    px[i + 2] = tb * 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.flipY = source.flipY;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  for (const gltf of gltfs) {
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.material.map) return;
      o.material = o.material.clone();
      o.material.map = tex;
    });
  }
}
