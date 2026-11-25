// Speech bubbles over people's heads, and comic-book hit words ("BONK!").
// Each is a sprite with its own little canvas; they're few and short-lived.
import { Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, Vector3 } from '../../vendor/three.min.js';

const H = 120; // canvas height in px; the sprite is drawn 0.62 m tall per 100 px

function bubbleTexture(text, { fill = '#fbf8f1', ink = '#1b1d21', accent = null } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `italic 600 46px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 56;
  c.width = w;
  c.height = H;
  const r = 30;
  const body = H - 26;
  ctx.fillStyle = fill;
  ctx.strokeStyle = accent ?? ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r, 3);
  ctx.lineTo(w - r, 3);
  ctx.arcTo(w - 3, 3, w - 3, r, r - 3);
  ctx.lineTo(w - 3, body - r);
  ctx.arcTo(w - 3, body, w - r, body, r - 3);
  // the tail points down at the speaker
  ctx.lineTo(w / 2 + 16, body);
  ctx.lineTo(w / 2 - 4, H - 4);
  ctx.lineTo(w / 2 - 6, body);
  ctx.lineTo(r, body);
  ctx.arcTo(3, body, 3, body - r, r - 3);
  ctx.lineTo(3, r);
  ctx.arcTo(3, 3, r, 3, r - 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, body / 2 + 3);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return { tex, w };
}

function wordTexture(word, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `800 84px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(word).width) + 40;
  c.width = w;
  c.height = 120;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#16181d';
  ctx.strokeText(word, w / 2, 62);
  ctx.fillStyle = color;
  ctx.fillText(word, w / 2, 62);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return { tex, w };
}

export class Bubbles {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
  }

  // `who` is an Object3D to follow; the bubble floats `above` metres over it.
  say(who, text, { seconds = 2.6, above = 2.55, style } = {}) {
    // one bubble per speaker
    this.live.filter((b) => b.who === who && b.kind === 'say').forEach((b) => (b.t = b.seconds));
    const { tex, w } = bubbleTexture(text, style);
    // the same size on screen however near or far the speaker is
    const sprite = new Sprite(new SpriteMaterial({
      map: tex, transparent: true, depthTest: false, fog: false, sizeAttenuation: false,
    }));
    sprite.renderOrder = 20;
    const k = 0.058 / H;
    sprite.scale.set(w * k, H * k, 1);
    sprite.center.set(0.5, 0);
    this.scene.add(sprite);
    this.live.push({ kind: 'say', sprite, who, above, t: 0, seconds });
  }

  // A comic hit word that jumps out and fades, at a point in the world.
  pop(at, word, color = '#f3aa1c') {
    const { tex, w } = wordTexture(word, color);
    const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sprite.renderOrder = 21;
    sprite.material.rotation = (Math.random() - 0.5) * 0.5;
    const k = 0.0105;
    sprite.userData.size = [w * k, 120 * k];
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.live.push({ kind: 'pop', sprite, from: at.clone(), t: 0, seconds: 0.9 });
  }

  // Is this speaker talking right now?
  talking(who) {
    return this.live.some((b) => b.who === who && b.kind === 'say');
  }

  get count() {
    return this.live.filter((b) => b.kind === 'say').length;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      const { sprite } = b;
      if (b.kind === 'say') {
        b.who.getWorldPosition(sprite.position);
        sprite.position.y += b.above;
        // pop in, hold, fade out
        const inK = Math.min(1, b.t / 0.15);
        sprite.material.opacity = Math.min(inK, Math.max(0, (b.seconds - b.t) / 0.35));
      } else {
        const k = b.t / b.seconds;
        sprite.position.copy(b.from).add(_up.set(0, 0.6 + k * 1.4, 0));
        const s = k < 0.15 ? 0.5 + (k / 0.15) * 0.7 : 1.2 - (k - 0.15) * 0.3;
        sprite.scale.set(sprite.userData.size[0] * s, sprite.userData.size[1] * s, 1);
        sprite.material.opacity = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
      }
      if (b.t >= b.seconds) {
        this.scene.remove(sprite);
        sprite.material.map.dispose();
        sprite.material.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.live) {
      this.scene.remove(b.sprite);
      b.sprite.material.map.dispose();
      b.sprite.material.dispose();
    }
    this.live.length = 0;
  }
}

const _up = new Vector3();
