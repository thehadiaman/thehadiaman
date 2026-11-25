// Sky, light, sea and land.
import {
  Mesh, Group, Color, Vector3, Shape, Path, ExtrudeGeometry, PlaneGeometry,
  SphereGeometry, IcosahedronGeometry, ShaderMaterial, MeshStandardMaterial,
  BackSide, HemisphereLight, DirectionalLight, Fog, CanvasTexture, RepeatWrapping,
  SRGBColorSpace, CatmullRomCurve3, BufferGeometry, Float32BufferAttribute, mergeGeometries,
} from '../../vendor/three.min.js';
import {
  KERALA, LAGOON, DUBAI, BRIDGE,
  RUNWAY_KERALA, RUNWAY_DUBAI,
} from './layout.js';
import { ROADS } from './roads.js';

export const SEA_LEVEL = -0.7;
const HORIZON = new Color('#f2e3c6');
const ZENITH = new Color('#7fb2e6');

/* ------------------------------------------------------------ sky & light */

export function createSky(scene) {
  scene.fog = new Fog(HORIZON.clone(), 160, 820);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: ZENITH.clone() },
      uHorizon: { value: HORIZON.clone() },
      uBelow: { value: new Color('#9fc7c9') },
      uSunDir: { value: new Vector3(-0.45, 0.62, 0.64).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBelow, uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
        col = mix(col, uBelow, smoothstep(0.0, -0.2, h));
        float sun = max(dot(normalize(vDir), uSunDir), 0.0);
        col += vec3(1.0, 0.93, 0.78) * (pow(sun, 900.0) * 1.6 + pow(sun, 10.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(new SphereGeometry(1500, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  return {
    update(camera) {
      sky.position.copy(camera.position);
    },
  };
}

export function createLights(scene, { shadowSize = 2048 } = {}) {
  const hemi = new HemisphereLight('#dceaff', '#c9b28a', 1.15);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff0d8', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const cam = sun.shadow.camera;
  cam.left = -55;
  cam.right = 55;
  cam.top = 55;
  cam.bottom = -55;
  cam.near = 1;
  cam.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const offset = new Vector3(-70, 110, 80);
  return {
    sun,
    // Keep the shadow box centred on whatever the camera is looking at.
    follow(focus) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).add(offset);
    },
  };
}

/* ------------------------------------------------------------ sea */

export function createSea(scene) {
  const geo = new PlaneGeometry(2600, 2600, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({
    color: '#2f8f9f', roughness: 0.22, metalness: 0.05, flatShading: true,
  });
  const uniforms = { uTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        float wave(vec2 p) {
          return sin(p.x * 0.07 + uTime * 0.9) * 0.2
               + sin(p.y * 0.09 - uTime * 0.7) * 0.16
               + sin((p.x + p.y) * 0.15 + uTime * 1.4) * 0.07;
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        transformed.y += wave(wp.xz);`);
  };
  const sea = new Mesh(geo, material);
  sea.position.set(0, SEA_LEVEL, -200);
  sea.receiveShadow = true;
  scene.add(sea);
  return {
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}

/* ------------------------------------------------------------ land */

// A soft mottled texture for the ground. UVs on the island caps are world metres.
function groundTexture(base, spots, metres) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [color, count, radius] of spots) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = radius * (0.5 + rand());
      // draw wrapped so the tile repeats without seams
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, r * 1.4, r, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1 / metres, 1 / metres);
  tex.anisotropy = 8;
  return tex;
}

function centroid(points) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of points) {
    x += px;
    z += pz;
  }
  return [x / points.length, z / points.length];
}

function scaled(points, k) {
  const [cx, cz] = centroid(points);
  return points.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
}

function shapeFrom(points, holes = []) {
  const shape = new Shape(points.map(([x, z]) => ({ x, y: z })));
  for (const hole of holes) shape.holes.push(new Path(hole.map(([x, z]) => ({ x, y: z }))));
  return shape;
}

// Extrude a polygon downwards from `top`. Caps get world-metre UVs.
function slab(points, holes, top, depth, materials) {
  const geo = new ExtrudeGeometry(shapeFrom(points, holes), {
    depth, bevelEnabled: false, curveSegments: 6,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, top, 0);
  const mesh = new Mesh(geo, materials);
  mesh.receiveShadow = true;
  return mesh;
}

export function inside(points, x, z) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDistance(points, x, z) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

export function createLand(scene) {
  const grass = new MeshStandardMaterial({
    map: groundTexture('#93b866', [['#88ae5c', 90, 9], ['#9dc070', 60, 7], ['#7fa556', 30, 5]], 40),
    roughness: 1,
  });
  const laterite = new MeshStandardMaterial({ color: '#a4583a', roughness: 1 });
  const sand = new MeshStandardMaterial({
    map: groundTexture('#ead6a8', [['#e2cb98', 70, 8], ['#f1dfb7', 50, 6]], 36),
    roughness: 1,
  });
  const sandSide = new MeshStandardMaterial({ color: '#cdb183', roughness: 1 });
  const desert = new MeshStandardMaterial({
    map: groundTexture('#e7cf9c', [['#dfc38d', 90, 10], ['#eed9ad', 60, 8], ['#d8b97f', 20, 6]], 48),
    roughness: 1,
  });
  const group = new Group();

  // Kerala: grass on red laterite, a sandy beach below, the lagoon cut through both.
  const lagoonRim = scaled(LAGOON, 0.9);
  group.add(slab(KERALA, [LAGOON], 0, 4, [grass, laterite]));
  group.add(slab(scaled(KERALA, 1.07), [lagoonRim], -0.32, 4, [sand, sandSide]));

  // Dubai: desert sand with a paler beach.
  group.add(slab(DUBAI, [], 0, 4, [desert, sandSide]));
  group.add(slab(scaled(DUBAI, 1.06), [], -0.3, 4, [sand, sandSide]));

  scene.add(group);

  return {
    // Can a person stand here? Land, not lagoon (except on the bridge), not at the very edge.
    walkable(x, z) {
      if (inside(KERALA, x, z)) {
        if (x > BRIDGE.x0 && x < BRIDGE.x1 && z > BRIDGE.z0 && z < BRIDGE.z1) return true;
        if (inside(LAGOON, x, z) || edgeDistance(LAGOON, x, z) < 0.9) return false;
        return edgeDistance(KERALA, x, z) > 2;
      }
      if (inside(DUBAI, x, z)) return edgeDistance(DUBAI, x, z) > 2;
      return false;
    },
  };
}

/* ------------------------------------------------------------ roads */

// A flat ribbon following a smooth curve through the given points.
function ribbon(curve, width, y) {
  const steps = Math.max(8, Math.round(curve.getLength() / 1.2));
  const pos = [];
  const index = [];
  const tangent = new Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    const nx = -tangent.z;
    const nz = tangent.x;
    const len = Math.hypot(nx, nz) || 1;
    const hw = width / 2;
    pos.push(p.x + (nx / len) * hw, y, p.z + (nz / len) * hw);
    pos.push(p.x - (nx / len) * hw, y, p.z - (nz / len) * hw);
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return { geo, curve };
}

function decal(color, level) {
  return new MeshStandardMaterial({
    color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -level, polygonOffsetUnits: -level,
  });
}

export function createRoads(scene) {
  const group = new Group();
  // Kerala footpath: laterite with a darker edge.
  const edge = ribbon(ROADS.kerala.curve, ROADS.kerala.width, 0.02);
  const path = ribbon(ROADS.kerala.curve, ROADS.kerala.width - 1, 0.03);
  group.add(new Mesh(edge.geo, decal('#9c5236', 1)), new Mesh(path.geo, decal('#c47048', 2)));

  // Dubai: ring road and the road from arrivals.
  const asphalt = decal('#5a5e66', 1);
  const marking = decal('#f3efe6', 3);
  group.add(new Mesh(ribbon(ROADS.loop.curve, ROADS.loop.width, 0.02).geo, asphalt));
  group.add(new Mesh(ribbon(ROADS.dubaiWalk.curve, ROADS.dubaiWalk.width, 0.025).geo, decal('#d9cdb4', 2)));
  // dashed centre line on the ring road
  const loop = ROADS.loop.curve;
  const dashes = [];
  const len = loop.getLength();
  for (let d = 0; d < len; d += 6) {
    const p = loop.getPointAt(d / len);
    const t = loop.getTangentAt(d / len);
    const dash = new PlaneGeometry(0.25, 2.6);
    dash.rotateX(-Math.PI / 2);
    dash.rotateY(Math.atan2(t.x, t.z));
    dash.translate(p.x, 0.04, p.z);
    dashes.push(dash);
  }
  group.add(new Mesh(mergeGeometries(dashes), marking));
  // a zebra crossing where the walk from arrivals crosses the ring road
  const crossing = crossingPoint(ROADS.dubaiWalk.curve, ROADS.loop.curve);
  if (crossing) {
    const { point, tangent } = crossing;
    const along = Math.atan2(tangent.x, tangent.z);
    const nx = -tangent.z;
    const nz = tangent.x;
    const bars = [];
    for (let k = -3.25; k <= 3.26; k += 1.3) {
      const bar = new PlaneGeometry(0.65, 3.2);
      bar.rotateX(-Math.PI / 2);
      bar.rotateY(along);
      bar.translate(point.x + nx * k, 0.045, point.z + nz * k);
      bars.push(bar);
    }
    group.add(new Mesh(mergeGeometries(bars), decal('#f3efe6', 4)));
  }

  // Runways with centre-line dashes and threshold bars.
  for (const rw of [RUNWAY_KERALA, RUNWAY_DUBAI]) {
    const length = rw.x1 - rw.x0;
    const strip = new PlaneGeometry(length, rw.width);
    strip.rotateX(-Math.PI / 2);
    strip.translate((rw.x0 + rw.x1) / 2, 0.02, rw.z);
    group.add(new Mesh(strip, decal('#474a51', 1)));
    const marks = [];
    for (let x = rw.x0 + 16; x < rw.x1 - 16; x += 10) {
      const m = new PlaneGeometry(5, 0.35);
      m.rotateX(-Math.PI / 2);
      m.translate(x, 0.04, rw.z);
      marks.push(m);
    }
    for (const end of [rw.x0 + 3, rw.x1 - 3]) {
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const m = new PlaneGeometry(4, 0.55);
        m.rotateX(-Math.PI / 2);
        m.translate(end, 0.04, rw.z + k * 1.2);
        marks.push(m);
      }
    }
    group.add(new Mesh(mergeGeometries(marks), marking));
  }
  group.traverse((o) => o.isMesh && (o.receiveShadow = true));
  scene.add(group);
  return { keralaPath: path.curve };
}

// Where curve a crosses curve b: the point on b, with b's direction there.
function crossingPoint(a, b) {
  const pa = a.getSpacedPoints(300);
  const pb = b.getSpacedPoints(600);
  let best = -1;
  let bestD = 1.5;
  for (const p of pa) {
    pb.forEach((q, j) => {
      const d = p.distanceTo(q);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
  }
  return best < 0 ? null : { point: pb[best], tangent: b.getTangentAt(best / 600) };
}

/* ------------------------------------------------------------ clouds */

export function createClouds(scene) {
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const parts = [];
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const r = 4 + rand() * 5;
      const g = new IcosahedronGeometry(r, 1);
      g.scale(1.4, 0.75, 1);
      g.translate((k - n / 2) * r * 1.1, rand() * 2, (rand() - 0.5) * 5);
      parts.push(g);
    }
    const mesh = new Mesh(mergeGeometries(parts), material);
    // stay clear of the Dubai skyline, which reaches above the cloud layer
    let cz = 100 - rand() * 640;
    if (cz < -385 && cz > -530) cz += 160;
    mesh.position.set(-300 + rand() * 600, 55 + rand() * 30, cz);
    mesh.castShadow = false;
    const speed = 1.5 + rand() * 2;
    clouds.push({ mesh, speed });
    scene.add(mesh);
  }
  return {
    update(dt) {
      for (const c of clouds) {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > 320) c.mesh.position.x = -320;
      }
    },
  };
}

export { ribbon };
