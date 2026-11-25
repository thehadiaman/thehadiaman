// Keyboard, pointer and touch input, and the camera that follows the player.
import { Vector3 } from '../../vendor/three.min.js';

const MOVE = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

const _look = new Vector3();

export class Keys {
  constructor() {
    this.held = new Set();
    this.handlers = new Map();
    this.enabled = true;
    this.stick = { x: 0, y: 0 }; // on-screen joystick, −1…1
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
      if (e.code === 'Space') this.held.add('brake');
      const fn = this.handlers.get(e.code);
      if (fn && this.enabled && !e.repeat) {
        e.preventDefault();
        fn();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (MOVE[e.code]) this.held.delete(MOVE[e.code]);
      if (e.code.startsWith('Shift')) this.held.delete('run');
      if (e.code === 'Space') this.held.delete('brake');
    });
    window.addEventListener('blur', () => this.held.clear());
  }

  on(code, fn) {
    this.handlers.set(code, fn);
  }

  get forward() {
    const k = (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
    return k || (Math.abs(this.stick.y) > 0.15 ? -this.stick.y : 0);
  }

  get strafe() {
    const k = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    return k || (Math.abs(this.stick.x) > 0.15 ? this.stick.x : 0);
  }

  get run() {
    return this.held.has('run');
  }

  get brake() {
    return this.held.has('brake');
  }

  // Is any steering input being given right now?
  get steering() {
    return Boolean(this.forward || this.strafe);
  }
}

// Third-person camera. Drag to orbit, wheel or pinch to zoom, tap to walk.
// Dragging down past LOW brings the camera in behind his shoulder and tilts the
// view up, all the way to looking at the sky at LOOK_UP.
const LOW = 0.1;
const LOOK_UP = -1.05;
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
    this.lastDrag = 0;
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
      if (this.dragged) this.lastDrag = performance.now();
      if (this.dragged && !this.override) {
        this.yaw -= dx * 0.0055;
        this.pitch = Math.min(1.25, Math.max(LOOK_UP, this.pitch + dy * 0.004));
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

  // How far below LOW the view is tilted: 0 (normal) … 1 (straight at the sky).
  get upness() {
    return Math.min(1, Math.max(0, (LOW - this.pitch) / (LOW - LOOK_UP)));
  }

  // The arm never dips below LOW; it shortens as you look up.
  get arm() {
    const up = this.upness;
    return { pitch: Math.max(LOW, this.pitch), length: this.distance * (1 - 0.62 * Math.sqrt(up)) };
  }

  // Walk out along the camera arm; stop short of the first building in the way.
  clearance() {
    const { pitch, length } = this.arm;
    if (!this.blocked) return length;
    const dx = Math.sin(this.yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = Math.cos(this.yaw) * Math.cos(pitch);
    for (let d = 1.5; d <= length; d += 0.5) {
      if (this.blocked(this.focus.x + dx * d, this.focus.y + dy * d, this.focus.z + dz * d)) return Math.max(2.5, d - 0.8);
    }
    return length;
  }

  apply(dt = 1) {
    const want = this.clearance();
    // pull in quickly, ease back out slowly
    const k = want < this.reach ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 2.5);
    this.reach += (want - this.reach) * (dt >= 1 ? 1 : k);
    const { pitch } = this.arm;
    const h = this.reach * Math.cos(pitch);
    const v = this.reach * Math.sin(pitch);
    const cam = this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * h,
      this.focus.y + v,
      this.focus.z + Math.cos(this.yaw) * h,
    );
    const up = this.upness;
    if (up <= 0) {
      this.camera.lookAt(this.focus);
      return;
    }
    // looking up: aim past him, raising the gaze from "at him" towards the zenith
    const fx = this.focus.x - cam.x;
    const fz = this.focus.z - cam.z;
    const flat = Math.hypot(fx, fz) || 1;
    const base = Math.atan2(this.focus.y - cam.y, flat);
    const tilt = base + (1.32 - base) * up;
    _look.set(
      cam.x + (fx / flat) * Math.cos(tilt),
      cam.y + Math.sin(tilt),
      cam.z + (fz / flat) * Math.cos(tilt),
    );
    this.camera.lookAt(_look);
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

// A thumb stick for phones: drag inside the ring; writes −1…1 into keys.stick.
export class Stick {
  constructor(el, keys) {
    this.el = el;
    this.knob = el.querySelector('span');
    this.keys = keys;
    this.id = null;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = (e.clientX - cx) / max;
      let dy = (e.clientY - cy) / max;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      keys.stick.x = dx;
      keys.stick.y = dy;
      this.knob.style.transform = `translate(${dx * max * 0.6}px, ${dy * max * 0.6}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      this.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener('pointermove', (e) => e.pointerId === this.id && move(e));
    const end = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      keys.stick.x = 0;
      keys.stick.y = 0;
      this.knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  show(on) {
    this.el.hidden = !on;
    if (!on) {
      this.keys.stick.x = 0;
      this.keys.stick.y = 0;
      this.knob.style.transform = '';
    }
  }
}
