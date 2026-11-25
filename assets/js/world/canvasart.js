// Text painted onto planes: signs, screens and labels inside the world.
import {
  CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter, Mesh, PlaneGeometry,
  MeshStandardMaterial, MeshBasicMaterial, Group, BoxGeometry, CylinderGeometry, DoubleSide,
} from '../../vendor/three.min.js';

export const FONTS = {
  cond: '"Barlow Condensed", "Arial Narrow", sans-serif',
  sans: '"Barlow", system-ui, sans-serif',
  mono: '"B612 Mono", ui-monospace, monospace',
};

export const INK = '#1b1d21';
export const PAPER = '#f2efe8';
export const COBALT = '#2448c9';
export const MARIGOLD = '#f3aa1c';
export const SIGN = '#1f2226';

const ratios = new Map();
function capRatio(ctx, font, weight) {
  const key = `${weight} ${font}`;
  if (!ratios.has(key)) {
    ctx.font = `${weight} 100px ${font}`;
    ratios.set(key, ctx.measureText('H').actualBoundingBoxAscent / 100 || 0.7);
  }
  return ratios.get(key);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Text with its cap height set in pixels, optionally tracked, optionally squeezed to maxW.
export function text(ctx, str, x, baseline, { cap, font = FONTS.cond, weight = 600, color = INK, align = 'left', tracking = 0, maxW } = {}) {
  const px = cap / capRatio(ctx, font, weight);
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillStyle = color;
  const chars = [...str];
  const gap = tracking * px;
  const widths = gap ? chars.map((c) => ctx.measureText(c).width) : null;
  let w = gap ? widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1) : ctx.measureText(str).width;
  let squeeze = 1;
  if (maxW && w > maxW) {
    squeeze = maxW / w;
    w = maxW;
  }
  let start = x;
  if (align === 'center') start = x - w / 2;
  else if (align === 'right') start = x - w;
  ctx.save();
  ctx.translate(start, baseline);
  ctx.scale(squeeze, 1);
  ctx.textAlign = 'left';
  if (gap) {
    let cursor = 0;
    chars.forEach((c, k) => {
      ctx.fillText(c, cursor, 0);
      cursor += widths[k] + gap;
    });
  } else {
    ctx.fillText(str, 0, 0);
  }
  ctx.restore();
  return w;
}

export function wrapLines(ctx, str, maxW, { cap, font = FONTS.sans, weight = 400 }) {
  const px = cap / capRatio(ctx, font, weight);
  ctx.font = `${weight} ${px}px ${font}`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A canvas-backed plane. `paint(ctx, w, h)` draws it; call `refresh()` to redraw.
 * lit: false makes it glow like a screen.
 */
export class Panel {
  constructor({ width, height, ppm = 110, lit = true, paint, doubleSided = false, transparent = false }) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * ppm);
    this.canvas.height = Math.round(height * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.paint = paint;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 8;
    const material = lit
      ? new MeshStandardMaterial({ map: this.texture, roughness: 0.85, transparent })
      : new MeshBasicMaterial({ map: this.texture, toneMapped: false, transparent });
    if (doubleSided) material.side = DoubleSide;
    this.mesh = new Mesh(new PlaneGeometry(width, height), material);
    this.refresh();
  }

  refresh(...args) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.paint?.(ctx, canvas.width, canvas.height, ...args);
    this.texture.needsUpdate = true;
  }
}

const postMaterial = new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.3 });
const backMaterial = new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 });

/**
 * Wayfinding sign for a story stop: dark panel, cobalt number, white text, on two posts.
 * Faces +z; rotate the returned group to aim it.
 */
export function stopSign({ number, title, sub, width = 5.2, height = 1.9, elevation = 1.4 }) {
  const panel = new Panel({
    width,
    height,
    paint(ctx, w, h) {
      ctx.fillStyle = SIGN;
      roundRect(ctx, 0, 0, w, h, h * 0.06);
      ctx.fill();
      const pad = h * 0.16;
      const badge = h * 0.46;
      ctx.fillStyle = COBALT;
      roundRect(ctx, pad, pad, badge, badge, badge * 0.12);
      ctx.fill();
      text(ctx, String(number).padStart(2, '0'), pad + badge / 2, pad + badge * 0.72, {
        cap: badge * 0.44, color: '#fff', align: 'center',
      });
      const tx = pad * 2 + badge;
      text(ctx, title.toUpperCase(), tx, pad + badge * 0.62, {
        cap: h * 0.17, color: '#f4f0e6', tracking: 0.04, maxW: w - tx - pad,
      });
      if (sub) {
        text(ctx, sub, tx, h - pad * 1.1, {
          cap: h * 0.11, font: FONTS.sans, weight: 500, color: '#b9b4a8', maxW: w - tx - pad,
        });
      }
    },
  });
  const group = new Group();
  panel.mesh.position.y = elevation + height / 2;
  panel.mesh.castShadow = true;
  const back = new Mesh(new BoxGeometry(width + 0.08, height + 0.08, 0.06), backMaterial);
  back.position.set(0, panel.mesh.position.y, -0.04);
  back.castShadow = true;
  group.add(panel.mesh, back);
  for (const side of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.07, 0.07, elevation + height, 8), postMaterial);
    post.position.set(side * (width / 2 - 0.35), (elevation + height) / 2, -0.1);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

// A painted label on a plain plane (e.g. a building name).
export function label(str, { height = 1, color = '#f4f0e6', bg = null, font = FONTS.cond, weight = 600, tracking = 0.06, pad = 0.25, lit = true } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  const ppm = 120;
  const cap = height * ppm * 0.56;
  const px = cap / capRatio(probe, font, weight);
  probe.font = `${weight} ${px}px ${font}`;
  const textW = probe.measureText(str).width + tracking * px * (str.length - 1);
  const width = textW / ppm + pad * 2;
  return new Panel({
    width,
    height,
    ppm,
    lit,
    transparent: !bg,
    paint(ctx, w, h) {
      if (bg) {
        ctx.fillStyle = bg;
        roundRect(ctx, 0, 0, w, h, h * 0.08);
        ctx.fill();
      }
      text(ctx, str, w / 2, h / 2 + cap / 2, { cap, font, weight, color, align: 'center', tracking });
    },
  });
}
