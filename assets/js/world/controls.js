// Keyboard, pointer and touch input, and the camera that follows the player.
import { Vector3 } from '../../vendor/three.min.js';

const MOVE = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

export class Keys {
  constructor() {
    this.held = new Set();
    this.handlers = new Map();
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable]')) return;
      const onControl = t.closest?.('button, a');
      if (onControl && (e.code === 'Space' || e.code === 'Enter')) return;
      if (MOVE[e.code] || e.code.startsWith('Shift')) {
        if (!this.enabled) return;
        this.held.add(MOVE[e.code] || 'run');
        if (e.code.startsWith('Arrow')) e.preventDefault();
        return;
      }
      const fn = this.handlers.get(e.code);
      if (fn && this.enabled && !e.repeat) {
        e.preventDefault();
        fn();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (MOVE[e.code]) this.held.delete(MOVE[e.code]);
      if (e.code.startsWith('Shift')) this.held.delete('run');
    });
    window.addEventListener('blur', () => this.held.clear());
  }

  on(code, fn) {
    this.handlers.set(code, fn);
  }

  get forward() {
    return (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
  }

  get strafe() {
    return (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
  }

  get run() {
    return this.held.has('run');
  }
}

// Third-person camera. Drag to orbit, wheel or pinch to zoom, tap to walk.
export class CameraRig {
  constructor(camera, dom, { onTap, reducedMotion = false } = {}) {
    this.camera = camera;
    this.yaw = 0; // 0 = camera south of the player, looking north
    this.pitch = 0.46;
    this.distance = 17;
    this.reach = 17; // distance after pulling in for walls
    this.blocked = null; // (x, y, z) => is there a building here?
    this.focus = new Vector3();
    this.override = null;
    this.reducedMotion = reducedMotion;
    this.pointers = new Map();
    this.dragged = false;
    this.pinch = 0;

    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (this.pointers.size === 1) this.dragged = false;
      if (this.pointers.size === 2) this.pinch = this.spread();
    });
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const spread = this.spread();
        if (this.pinch) this.zoom(this.pinch / spread);
        this.pinch = spread;
        this.dragged = true;
        return;
      }
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) this.dragged = true;
      if (this.dragged && !this.override) {
        this.yaw -= dx * 0.0055;
        this.pitch = Math.min(1.25, Math.max(0.12, this.pitch + dy * 0.004));
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (p && !this.dragged && e.type === 'pointerup' && !this.override) onTap?.(e);
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  zoom(k) {
    this.distance = Math.min(34, Math.max(5, this.distance * k));
  }

  forward() {
    return new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right() {
    return new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  snap(target) {
    this.focus.copy(target);
    this.apply();
  }

  // Walk out along the camera arm; stop short of the first building in the way.
  clearance() {
    if (!this.blocked) return this.distance;
    const dx = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * Math.cos(this.pitch);
    for (let d = 1.5; d <= this.distance; d += 0.5) {
      if (this.blocked(this.focus.x + dx * d, this.focus.y + dy * d, this.focus.z + dz * d)) return Math.max(2.5, d - 0.8);
    }
    return this.distance;
  }

  apply(dt = 1) {
    const want = this.clearance();
    // pull in quickly, ease back out slowly
    const k = want < this.reach ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 2.5);
    this.reach += (want - this.reach) * (dt >= 1 ? 1 : k);
    const h = this.reach * Math.cos(this.pitch);
    const v = this.reach * Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * h,
      this.focus.y + v,
      this.focus.z + Math.cos(this.yaw) * h,
    );
    this.camera.lookAt(this.focus);
  }

  update(dt, target) {
    if (this.override) {
      this.override(dt);
      return;
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.focus.lerp(target, k);
    this.apply(dt);
  }
}
