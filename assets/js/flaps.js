/*
 * Split-flap display parts, shared by the CV page's hero board and the boards
 * inside the 3D world.
 *
 * Each character cell is a drum of cards, drawn as four instanced quads:
 *   top     static upper half, already showing the next card
 *   bottom  static lower half, still showing the current card
 *   flap    front of the falling card (upper half of the current card)
 *   back    back of that same card (lower half of the next card)
 * The flap swings 0 → π about the hinge. Drums only turn forward, so going
 * from a blank to "Z" passes every letter in between. That is why the cells
 * settle at different times, the way a real board does.
 */
import {
  PlaneGeometry, InstancedMesh, InstancedBufferAttribute, DynamicDrawUsage,
  MeshStandardMaterial, CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter,
  Matrix4, Vector2,
} from '../vendor/three.min.js';

// Character drum, in the order the cards turn. '>' is printed as an arrow.
export const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ>0123456789.,:-/@&';
export const DIGITS = '0123456789';

// Geometry, in board units. One column is 1 unit wide.
export const PITCH_X = 1;
export const PITCH_Y = 1.5;
export const CARD_W = 0.88;
export const CARD_H = 1.34;
export const HINGE_GAP = 0.03;
const FLAP_LIFT = 0.012; // the swinging card sits just in front of the static halves

// Timing, in milliseconds per card.
const STEP_MS = 48;
const LAP_MS = 26;
const LAST_MS = 150;

// Printed colours.
export const CARD = '#222428';
const CARD_EDGE = '#0b0c0e';
const PRINT = '#efe9dc';
export const LABEL = '#bdb6a7';
export const STATUS_CARD = '#2448c9';
export const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

const HALF_PI = Math.PI / 2;
const PARTS = ['top', 'bottom', 'flap', 'back'];

/* ------------------------------------------------------------ textures */

const ATLAS_COLS = 8;
const TEX_W = 160;
const TEX_H = Math.round((TEX_W * CARD_H) / CARD_W);

function capRatio(ctx) {
  ctx.font = `600 100px ${FONT}`;
  return ctx.measureText('H').actualBoundingBoxAscent / 100 || 0.7;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A blank card: base colour, a faint sheen on the upper half, shade at the hinge.
function paintCard(ctx, x, y, w, h, color) {
  ctx.fillStyle = CARD_EDGE;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  roundRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.min(w, h) * 0.045);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  const mid = y + h / 2;
  let g = ctx.createLinearGradient(0, y, 0, mid);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.75, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h / 2);
  g = ctx.createLinearGradient(0, mid, 0, y + h);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.16, 'rgba(0,0,0,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(x, mid, w, h / 2);
  ctx.restore();
}

function fitText(ctx, text, cx, baseline, maxW) {
  const w = ctx.measureText(text).width;
  if (w <= maxW) {
    ctx.fillText(text, cx, baseline);
    return;
  }
  ctx.save();
  ctx.translate(cx, baseline);
  ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function trackedText(ctx, text, x, baseline, gap, align = 'center') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let cursor = align === 'center' ? x - total / 2 : x;
  ctx.save();
  ctx.textAlign = 'left';
  chars.forEach((c, k) => {
    ctx.fillText(c, cursor, baseline);
    cursor += widths[k] + gap;
  });
  ctx.restore();
  return total;
}

// Arrow drawn with the font's stem weight, centred on the hinge like the letters.
function drawArrow(ctx, cx, cy, width, height, stem) {
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const h = height / 2;
  ctx.save();
  ctx.lineWidth = stem;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, cy);
  ctx.lineTo(x1 - stem * 0.6, cy);
  ctx.moveTo(x1 - h, cy - h);
  ctx.lineTo(x1 - stem * 0.35, cy);
  ctx.lineTo(x1 - h, cy + h);
  ctx.stroke();
  ctx.restore();
}

// Airport pictogram: a plane seen from above, pointing up in a 100 × 100 box.
const PLANE_PATH =
  'M50 4C54 4 56 9 56 14V38L94 58V66L56 56V80L68 88V94L50 89L32 94V88L44 80V56L6 66V58L44 38V14C44 9 46 4 50 4Z';

export function drawPlane(ctx, cx, cy, size, degrees) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(size / 100, size / 100);
  ctx.translate(-50, -50);
  ctx.fill(new Path2D(PLANE_PATH));
  ctx.restore();
}

export function glyphAtlas() {
  const rows = Math.ceil(DRUM.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TEX_W;
  canvas.height = rows * TEX_H;
  const ctx = canvas.getContext('2d');
  const px = (TEX_H * 0.6) / capRatio(ctx);
  ctx.font = `600 ${px}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cap = ctx.measureText('H').actualBoundingBoxAscent;
  const I = ctx.measureText('I');
  const stem = I.actualBoundingBoxLeft + I.actualBoundingBoxRight || px * 0.11;

  [...DRUM].forEach((ch, i) => {
    const x = (i % ATLAS_COLS) * TEX_W;
    const y = Math.floor(i / ATLAS_COLS) * TEX_H;
    paintCard(ctx, x, y, TEX_W, TEX_H, CARD);
    ctx.fillStyle = PRINT;
    ctx.strokeStyle = PRINT;
    const cx = x + TEX_W / 2;
    const cy = y + TEX_H / 2;
    if (ch === '>') drawArrow(ctx, cx, cy, TEX_W * 0.64, cap * 0.62, stem);
    else if (ch !== ' ') fitText(ctx, ch, cx, cy + cap / 2, TEX_W * 0.84);
  });
  return { canvas, grid: [ATLAS_COLS, rows] };
}

// A remarks flap: one wide card per word. Blank words get a plain card.
export function wordAtlas(cardW, words) {
  const w = Math.round((TEX_H * cardW) / CARD_H);
  const h = TEX_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h * words.length;
  const ctx = canvas.getContext('2d');
  const px = (h * 0.34) / capRatio(ctx);
  ctx.font = `600 ${px}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const cap = ctx.measureText('H').actualBoundingBoxAscent;

  words.forEach((word, i) => {
    const y = i * h;
    const blank = !word.trim();
    paintCard(ctx, 0, y, w, h, blank ? CARD : STATUS_CARD);
    if (blank) return;
    ctx.fillStyle = '#ffffff';
    trackedText(ctx, word, w / 2, y + h / 2 + cap / 2, px * 0.12);
  });
  return { canvas, grid: [1, words.length] };
}

// Painted text on a housing, e.g. a board title. Returns size in board units.
export function labelTexture(text, { cap, height, icon, color = LABEL }) {
  const scale = 220; // texture pixels per board unit
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const px = (cap * scale) / capRatio(ctx);
  const font = `600 ${px}px ${FONT}`;
  ctx.font = font;
  const capPx = ctx.measureText('H').actualBoundingBoxAscent;
  const gap = px * 0.14;
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const textW = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  const iconW = icon ? capPx * 1.7 : 0;
  const iconGap = icon ? capPx * 0.55 : 0;

  canvas.width = Math.ceil(iconW + iconGap + textW + 4);
  canvas.height = Math.round(height * scale);
  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = color;
  const mid = canvas.height / 2;
  if (icon) drawPlane(ctx, 2 + iconW / 2, mid, iconW, icon === 'arrive' ? 135 : 45);
  trackedText(ctx, text, 2 + iconW + iconGap, mid + capPx / 2, gap, 'left');

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, width: canvas.width / scale, height };
}

export function atlasTexture(canvas, anisotropy = 8) {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = anisotropy;
  return tex;
}

/* ------------------------------------------------------------ flap meshes */

// Half a card. UVs cover the matching half of the card's texture, minus the hinge gap.
function halfGeometry(cardW, which) {
  const hh = CARD_H / 2 - HINGE_GAP / 2;
  const g = HINGE_GAP / 2 / CARD_H;
  const geo = new PlaneGeometry(cardW, hh);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const v = uv.getY(i);
    if (which === 'top') {
      pos.setY(i, pos.getY(i) + HINGE_GAP / 2 + hh / 2);
      uv.setY(i, 0.5 + g + v * (0.5 - g));
    } else {
      pos.setY(i, pos.getY(i) - HINGE_GAP / 2 - hh / 2);
      uv.setY(i, v * (0.5 - g));
    }
  }
  return geo;
}

// Standard material plus four per-instance attributes:
// aGlyph picks the card from the atlas, aAngle swings the quad about the hinge,
// aShade darkens a half while a falling card covers it, aTint varies each card a little.
function flapMaterial(map, grid, lift) {
  const material = new MeshStandardMaterial({ map, roughness: 0.6, metalness: 0 });
  const uniforms = {
    uGrid: { value: new Vector2(grid[0], grid[1]) },
    uLift: { value: lift },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aGlyph;
        attribute float aAngle;
        attribute float aShade;
        attribute float aTint;
        uniform vec2 uGrid;
        uniform float uLift;
        varying float vShade;
        varying float vTint;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          float gCol = mod(aGlyph, uGrid.x);
          float gRow = floor(aGlyph / uGrid.x + 0.001);
          vMapUv = vec2((gCol + uv.x) / uGrid.x, 1.0 - (gRow + 1.0 - uv.y) / uGrid.y);
        #endif
        vShade = aShade;
        vTint = aTint;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float fc = cos(aAngle);
        float fs = sin(aAngle);
        objectNormal = vec3(objectNormal.x, objectNormal.y * fc - objectNormal.z * fs, objectNormal.y * fs + objectNormal.z * fc);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = vec3(transformed.x, transformed.y * fc - transformed.z * fs, transformed.y * fs + transformed.z * fc);
        transformed.z += uLift;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vShade;
        varying float vTint;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= vTint * (1.0 - vShade);`,
      );
  };
  return material;
}

const tmpMatrix = new Matrix4();

// Four instanced meshes that share one texture: every cell of one kind.
export class Bank {
  constructor(texture, grid, count, cardW) {
    const top = halfGeometry(cardW, 'top');
    const bottom = halfGeometry(cardW, 'bottom');
    const geometries = {
      top,
      bottom,
      flap: top.clone(),
      back: bottom.clone().rotateX(Math.PI),
    };
    this.meshes = {};
    this.attrs = {};
    for (const part of PARTS) {
      const geo = geometries[part];
      const attrs = {};
      for (const name of ['aGlyph', 'aAngle', 'aShade', 'aTint']) {
        const attr = new InstancedBufferAttribute(new Float32Array(count), 1);
        attr.setUsage(DynamicDrawUsage);
        geo.setAttribute(name, attr);
        attrs[name] = attr;
      }
      const lift = part === 'flap' || part === 'back' ? FLAP_LIFT : 0;
      const mesh = new InstancedMesh(geo, flapMaterial(texture, grid, lift), count);
      mesh.frustumCulled = false;
      this.meshes[part] = mesh;
      this.attrs[part] = attrs;
    }
  }

  place(i, x, y, scale, tint) {
    tmpMatrix.makeScale(scale, scale, 1).setPosition(x, y, 0);
    for (const part of PARTS) {
      this.meshes[part].setMatrixAt(i, tmpMatrix);
      // lower halves hang slightly away from the light
      this.attrs[part].aTint.array[i] = part === 'top' || part === 'flap' ? tint : tint * 0.9;
    }
  }

  flush() {
    for (const part of PARTS) {
      const a = this.attrs[part];
      a.aGlyph.needsUpdate = true;
      a.aAngle.needsUpdate = true;
      a.aShade.needsUpdate = true;
    }
  }

  addTo(group) {
    for (const part of PARTS) group.add(this.meshes[part]);
  }

  setShadows(cast, receive) {
    for (const part of PARTS) {
      this.meshes[part].castShadow = cast;
      this.meshes[part].receiveShadow = receive;
    }
  }

  dispose() {
    for (const part of PARTS) {
      this.meshes[part].geometry.dispose();
      this.meshes[part].material.dispose();
      this.meshes[part].dispose();
    }
  }
}

/* ------------------------------------------------------------ drum logic */

// chars: the characters (or words) on this drum, in order.
// drum: the atlas index for each of those, same order.
export function makeUnit(bank, i, chars, drum, x, y) {
  return {
    bank, i, chars, drum, x, y,
    len: drum.length,
    cur: 0,
    target: 0,
    laps: 0, // extra full turns still to do (the click ripple)
    t0: -1, // start of the current flip, -1 when resting
    dur: 0,
    wait: 0,
    last: false,
    fast: false,
    speed: 0.92 + Math.random() * 0.18,
  };
}

function setGlyphs(u, top, bottom, flap, back) {
  const a = u.bank.attrs;
  a.top.aGlyph.array[u.i] = u.drum[top];
  a.bottom.aGlyph.array[u.i] = u.drum[bottom];
  a.flap.aGlyph.array[u.i] = u.drum[flap];
  a.back.aGlyph.array[u.i] = u.drum[back];
}

function setAngle(u, angle) {
  const a = u.bank.attrs;
  a.flap.aAngle.array[u.i] = angle;
  a.back.aAngle.array[u.i] = angle;
  // the newly revealed top half starts in the falling card's shadow;
  // the bottom half darkens as the card comes down over it
  a.top.aShade.array[u.i] = angle > 0 && angle < HALF_PI ? 0.3 * Math.cos(angle) : 0;
  a.bottom.aShade.array[u.i] = angle > HALF_PI ? (0.36 * (angle - HALF_PI)) / HALF_PI : 0;
}

export function rest(u) {
  setGlyphs(u, u.cur, u.cur, u.cur, u.cur);
  setAngle(u, 0);
}

function beginFlip(u, t) {
  if (u.cur === u.target && u.laps > 0) u.laps -= 1;
  const next = (u.cur + 1) % u.len;
  setGlyphs(u, next, u.cur, u.cur, next);
  u.last = next === u.target && u.laps === 0;
  u.t0 = t;
  u.dur = (u.last ? LAST_MS : u.fast ? LAP_MS : STEP_MS) * u.speed;
}

function finishFlip(u) {
  u.cur = (u.cur + 1) % u.len;
  rest(u);
}

// Gravity pulls the card down slowly at first; the last card bounces off the stop.
function swing(p, last) {
  if (!last) return Math.PI * p * p;
  const fall = 0.7;
  if (p < fall) {
    const q = p / fall;
    return Math.PI * q * q;
  }
  const q = (p - fall) / (1 - fall);
  return Math.PI - 0.14 * Math.sin(Math.PI * q) * (1 - q);
}

export function setTarget(u, value, wait) {
  const k = u.chars.indexOf(value);
  u.target = k < 0 ? 0 : k;
  u.wait = wait;
}

export function snap(u) {
  u.cur = u.target;
  u.laps = 0;
  u.t0 = -1;
  rest(u);
}

export function isResting(u) {
  return u.t0 < 0 && u.cur === u.target && u.laps === 0;
}

// Advances every unit to time `now`. Returns whether anything is still moving
// and how many cards fell this frame (for the clatter).
export function stepUnits(units, now) {
  let busy = false;
  let flips = 0;
  for (const u of units) {
    if (u.t0 < 0) {
      if (u.cur === u.target && u.laps === 0) continue;
      busy = true;
      if (now < u.wait) continue;
      beginFlip(u, Math.max(u.wait, now - 200));
    }
    busy = true;
    let p = (now - u.t0) / u.dur;
    for (let guard = 0; p >= 1 && guard < 80; guard++) {
      const end = u.t0 + u.dur;
      finishFlip(u);
      flips += 1;
      if (u.cur === u.target && u.laps === 0) {
        u.t0 = -1;
        u.fast = false;
        break;
      }
      beginFlip(u, end);
      p = (now - u.t0) / u.dur;
    }
    if (u.t0 >= 0) setAngle(u, swing(Math.max(0, p), u.last));
  }
  return { busy, flips };
}

/* ------------------------------------------------------------ sound */

// Opt-in clatter: short noise bursts with a plastic "tick", one per few flips.
export class Clatter {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.buffers = [];
  }

  enable() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 700;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.55;
      this.out.connect(filter).connect(this.ctx.destination);
      for (let k = 0; k < 6; k++) this.buffers.push(this.tick());
    }
    this.ctx.resume();
    this.on = true;
    return true;
  }

  disable() {
    this.on = false;
  }

  tick() {
    const rate = this.ctx.sampleRate;
    const length = Math.round(rate * 0.024);
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const freq = 1700 + Math.random() * 1500;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-t * 280) * Math.min(1, i / 6);
      data[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * freq * t) * 0.4) * envelope;
    }
    return buffer;
  }

  play(flips) {
    if (!this.on || !flips || this.ctx.state !== 'running') return;
    const count = Math.min(flips, 5);
    const level = 0.8 / Math.sqrt(count);
    const now = this.ctx.currentTime;
    for (let k = 0; k < count; k++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[(Math.random() * this.buffers.length) | 0];
      src.playbackRate.value = 0.8 + Math.random() * 0.45;
      const gain = this.ctx.createGain();
      gain.gain.value = level * (0.4 + Math.random() * 0.6);
      src.connect(gain).connect(this.out);
      src.start(now + Math.random() * 0.016);
    }
  }
}

export async function fontsReady() {
  if (!document.fonts?.load) return;
  const load = document.fonts.load(`600 100px "Barlow Condensed"`).catch(() => {});
  await Promise.race([load, new Promise((resolve) => setTimeout(resolve, 2500))]);
}
