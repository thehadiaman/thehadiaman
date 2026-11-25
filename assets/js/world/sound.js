// Sound, all synthesised with Web Audio: no files to download, and every sound
// can follow what's happening (engine pitch with speed, footsteps by surface).
// Browsers only allow audio after a click or key press, so nothing plays until
// then; the speaker button (or M) mutes it, and the choice is remembered.

import { Vector3 } from '../../vendor/three.min.js';

const STORE = 'hadi-world-muted';

function stored() {
  try {
    return localStorage.getItem(STORE) === '1';
  } catch {
    return false;
  }
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = stored();
    this.listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.stepTimer = 0;
    this.chirpTimer = 2;
    this.groanTimer = 3;
    this.cheer = 0; // crowd cheering bed, 0…1
    this.lastBolt = 0;
  }

  get ready() {
    return Boolean(this.ctx) && this.ctx.state === 'running';
  }

  // Call from a click or key press: starts the audio (once).
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.build();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.ctx.suspend();
        else if (!this.muted) this.ctx.resume();
      });
    }
    if (!this.muted && this.ctx.state !== 'running') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORE, muted ? '1' : '0');
    } catch {
      /* private mode: fine, just not remembered */
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.8, now, 0.05);
    if (!muted) this.ctx.resume();
  }

  /* ------------------------------------------------ the graph */

  build() {
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.bed = c.createGain(); // ambience
    this.bed.gain.value = 0.6;
    this.bed.connect(this.master);

    // white noise, shared by everything
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // continuous voices; their levels are set every frame in update()
    this.surf = this.loopNoise({ type: 'lowpass', freq: 420, q: 0.4, out: this.bed });
    this.wind = this.loopNoise({ type: 'bandpass', freq: 700, q: 0.6, out: this.bed });
    this.city = this.loopNoise({ type: 'lowpass', freq: 160, q: 0.7, out: this.bed });
    this.crowdBed = this.loopNoise({ type: 'bandpass', freq: 1100, q: 0.8, out: this.sfx });
    this.jet = this.loopNoise({ type: 'lowpass', freq: 600, q: 0.9, out: this.sfx });
    this.jetpack = this.loopNoise({ type: 'bandpass', freq: 1800, q: 1.2, out: this.sfx });
    this.hiss = this.loopNoise({ type: 'highpass', freq: 2500, q: 0.5, out: this.sfx });
    this.engine = this.makeEngine();
    this.drone = this.makeDrone();
  }

  loopNoise({ type, freq, q, out }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.3;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    src.start();
    return { filter, gain };
  }

  // A small four-cylinder: a saw and a square an octave apart, muffled.
  makeEngine() {
    const c = this.ctx;
    const a = c.createOscillator();
    a.type = 'sawtooth';
    const b = c.createOscillator();
    b.type = 'square';
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    const gain = c.createGain();
    gain.gain.value = 0;
    const mixB = c.createGain();
    mixB.gain.value = 0.5;
    a.connect(filter);
    b.connect(mixB).connect(filter);
    filter.connect(gain).connect(this.sfx);
    a.frequency.value = 40;
    b.frequency.value = 20;
    a.start();
    b.start();
    return { a, b, filter, gain };
  }

  // The zombie-mode drone: two low saws beating against each other.
  makeDrone() {
    const c = this.ctx;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    const gain = c.createGain();
    gain.gain.value = 0;
    for (const f of [55, 55.7, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
    }
    filter.connect(gain).connect(this.bed);
    return { gain, filter };
  }

  /* ------------------------------------------------ helpers */

  // Volume and stereo position for a sound at (x, z), from the camera.
  where(x, z, reach = 40) {
    const L = this.listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    const level = Math.max(0, 1 - d / reach) ** 2;
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * L.rx + dz * L.rz) / d)) * 0.8 : 0;
    return { level, pan };
  }

  // A routed output for one sound: gain → (panner) → sfx.
  out(level, pan = 0, bus = this.sfx) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = level;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(bus);
    } else {
      g.connect(bus);
    }
    return g;
  }

  burst({ at = 0, dur = 0.05, type = 'lowpass', freq = 1000, q = 0.7, level = 0.2, pan = 0, attack = 0.002, sweep = null, bus }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(1, pan, bus));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ at = 0, dur = 0.2, type = 'sine', from, to = from, level = 0.2, pan = 0, attack = 0.005, bus }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(1, pan, bus));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ------------------------------------------------ one-shots */

  step(surface, run) {
    if (!this.ready) return;
    const v = (run ? 1 : 0.75) * 2.2;
    if (surface === 'paved') {
      this.burst({ dur: 0.045, type: 'bandpass', freq: 2400, q: 1.2, level: 0.06 * v });
      this.tone({ dur: 0.05, from: 140, to: 80, level: 0.05 * v });
    } else if (surface === 'path') {
      this.burst({ dur: 0.07, type: 'bandpass', freq: 1300, q: 0.9, level: 0.07 * v });
    } else {
      // grass: a soft brush
      this.burst({ dur: 0.09, type: 'lowpass', freq: 900, level: 0.05 * v, attack: 0.012 });
    }
  }

  jump() {
    if (!this.ready) return;
    this.burst({ dur: 0.16, type: 'bandpass', freq: 500, sweep: 1400, q: 1.5, level: 0.06, attack: 0.03 });
  }

  sit() {
    if (!this.ready) return;
    this.tone({ dur: 0.12, from: 110, to: 60, level: 0.12 });
    this.burst({ dur: 0.06, type: 'lowpass', freq: 700, level: 0.05 });
  }

  // a car hitting something
  thud(speed = 4) {
    if (!this.ready) return;
    const k = Math.min(1, Math.abs(speed) / 12);
    this.tone({ dur: 0.25, from: 90, to: 40, level: 0.15 + 0.25 * k });
    this.burst({ dur: 0.12, type: 'lowpass', freq: 900, level: 0.08 + 0.15 * k });
  }

  nitroStart() {
    if (!this.ready) return;
    this.burst({ dur: 0.45, type: 'bandpass', freq: 600, sweep: 3200, q: 1.1, level: 0.12, attack: 0.04 });
  }

  // the switch between day and night
  whoosh() {
    if (!this.ready) return;
    this.burst({ dur: 0.9, type: 'bandpass', freq: 300, sweep: 1500, q: 0.8, level: 0.07, attack: 0.3, bus: this.bed });
  }

  punch() {
    if (!this.ready) return;
    this.burst({ dur: 0.12, type: 'bandpass', freq: 700, sweep: 2600, q: 1.4, level: 0.08, attack: 0.04 });
  }

  // the punch (or the bumper) landing: a cartoon bonk
  bonk(x, z) {
    if (!this.ready) return;
    const { level, pan } = this.where(x, z, 30);
    if (level < 0.02) return;
    this.tone({ dur: 0.18, type: 'triangle', from: 720, to: 170, level: 0.22 * level, pan });
    this.tone({ dur: 0.14, from: 110, to: 50, level: 0.25 * level, pan });
  }

  bite() {
    if (!this.ready) return;
    for (let i = 0; i < 4; i++) {
      this.burst({ at: i * 0.035, dur: 0.03, type: 'highpass', freq: 1800 + Math.random() * 1500, level: 0.12 });
    }
    this.tone({ dur: 0.22, from: 120, to: 55, level: 0.22 });
  }

  // "uuurgh": a low saw through two vowel formants, sliding down
  groan(x, z) {
    if (!this.ready) return;
    const { level, pan } = this.where(x, z, 26);
    if (level < 0.03) return;
    const c = this.ctx;
    const t = c.currentTime;
    const dur = 1 + Math.random() * 0.8;
    const f0 = 95 + Math.random() * 45;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.72, t + dur);
    const vib = c.createOscillator();
    vib.frequency.value = 5 + Math.random() * 2;
    const vibAmt = c.createGain();
    vibAmt.gain.value = 3;
    vib.connect(vibAmt).connect(o.frequency);
    const out = this.out(1, pan);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    for (const [freq, q, amt] of [[520, 6, 1], [880, 8, 0.6]]) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, t);
      f.frequency.linearRampToValueAtTime(freq * 0.8, t + dur);
      f.Q.value = q;
      const m = c.createGain();
      m.gain.value = amt;
      o.connect(f).connect(m).connect(g);
    }
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }

  thunder() {
    if (!this.ready) return;
    const at = 0.35 + Math.random() * 0.8;
    this.burst({ at, dur: 0.25, type: 'highpass', freq: 1500, level: 0.06, bus: this.bed });
    this.burst({ at: at + 0.05, dur: 3.2, type: 'lowpass', freq: 220, sweep: 70, q: 0.5, level: 0.85, attack: 0.15, bus: this.bed });
  }

  // zombie mode starts: a low, wrong chord; ends: a bright sunrise chord
  sting(on) {
    if (!this.ready) return;
    if (on) {
      for (const [f, k] of [[73.4, 1], [77.8, 0.8], [110, 0.6], [155.6, 0.4]]) {
        this.tone({ dur: 2.6, type: 'sawtooth', from: f, to: f * 0.97, level: 0.06 * k, attack: 0.08 });
      }
      this.burst({ dur: 1.6, type: 'lowpass', freq: 300, level: 0.12, attack: 0.05 });
    } else {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
        this.tone({ at: i * 0.09, dur: 1.6, type: 'triangle', from: f, level: 0.06, attack: 0.02 });
      });
    }
  }

  // the arrivals crowd: a cheer swells, with claps on top
  cheerFor(seconds) {
    this.cheer = Math.max(this.cheer, seconds);
  }

  // split-flap boards rattling as they change
  flaps(count, x, z) {
    if (!this.ready || !count) return;
    const { level, pan } = this.where(x, z, 45);
    if (level < 0.03) return;
    const n = Math.min(count, 4);
    for (let i = 0; i < n; i++) {
      this.burst({
        at: Math.random() * 0.03, dur: 0.022, type: 'highpass', freq: 1800 + Math.random() * 1400,
        level: (0.09 / Math.sqrt(n)) * level, pan,
      });
    }
  }

  /* ------------------------------------------------ every frame */

  // s: { camera, mode, walking, running, surface, car, boosting, plane, jetpack,
  //      night, mood, bolt, kerala, crowd: { x, z }, zombies: [{x,z}], altitude }
  update(dt, s) {
    if (!this.ctx) return;
    const cam = s.camera;
    this.listener.x = cam.position.x;
    this.listener.z = cam.position.z;
    cam.matrixWorld.extractBasis(_right, _up, _back);
    this.listener.rx = _right.x;
    this.listener.rz = _right.z;
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const set = (param, value, tc = 0.08) => param.setTargetAtTime(value, now, tc);

    // footsteps, to the rhythm of the walk
    if (s.walking) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = s.running ? 0.27 : 0.42;
        this.step(s.surface, s.running);
      }
    } else {
      this.stepTimer = 0.05;
    }

    // the car
    const car = s.car;
    const speed = car ? Math.abs(car.v) : 0;
    set(this.engine.gain.gain, car ? 0.032 + Math.min(0.06, speed * 0.003) + (s.boosting ? 0.025 : 0) : 0, 0.1);
    const rpm = 34 + speed * 2.1 + (s.boosting ? 18 : 0);
    set(this.engine.a.frequency, rpm, 0.12);
    set(this.engine.b.frequency, rpm / 2, 0.12);
    set(this.engine.filter.frequency, 240 + speed * 32 + (s.boosting ? 700 : 0), 0.1);
    if (s.boosting && !this.wasBoosting) this.nitroStart();
    this.wasBoosting = s.boosting;
    set(this.hiss.gain.gain, s.boosting ? 0.05 : 0, 0.06);

    // the plane: a roar that opens up with speed; the robot's jetpack hiss
    const jet = s.plane;
    set(this.jet.gain.gain, jet ? 0.06 + Math.min(0.12, jet.speed * 0.0016) : 0, 0.3);
    set(this.jet.filter.frequency, jet ? 350 + jet.speed * 9 : 400, 0.3);
    set(this.jetpack.gain.gain, s.jetpack ? 0.07 : 0, 0.15);

    // ambience: surf always, wind higher up, the city's hum in Dubai,
    // birds by day in Kerala, crickets at night
    const t = this.ctx.currentTime;
    set(this.surf.gain.gain, (0.03 + 0.02 * Math.sin(t * 0.8) * Math.sin(t * 0.31)) * (s.altitude > 30 ? 0.3 : 1), 0.4);
    set(this.wind.gain.gain, Math.min(0.08, Math.max(0, (s.altitude - 10) * 0.0012)) + 0.008, 0.4);
    set(this.city.gain.gain, s.kerala ? 0 : 0.05, 1);
    this.chirpTimer -= dt;
    if (this.chirpTimer <= 0 && s.altitude < 20) {
      if (s.night > 0.6) {
        this.chirpTimer = 0.5 + Math.random() * 0.9;
        const pan = Math.random() * 1.6 - 0.8;
        const f = 4100 + Math.random() * 500;
        for (let i = 0; i < 3; i++) this.tone({ at: i * 0.045, dur: 0.03, from: f, level: 0.012, pan, bus: this.bed });
      } else if (s.night < 0.2 && s.kerala && !s.mood) {
        this.chirpTimer = 2.5 + Math.random() * 5;
        const pan = Math.random() * 1.6 - 0.8;
        const f = 2600 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone({ at: i * 0.13, dur: 0.09, from: f, to: f * 1.35, level: 0.018, pan, bus: this.bed });
      } else {
        this.chirpTimer = 1;
      }
    }

    // zombie mode: a drone, groans, thunder after each flash
    set(this.drone.gain.gain, (s.mood ?? 0) * 0.05, 0.6);
    if (s.bolt > 0.95 && this.lastBolt < 0.5) this.thunder();
    this.lastBolt = s.bolt;
    if (s.zombies?.length) {
      this.groanTimer -= dt;
      if (this.groanTimer <= 0) {
        this.groanTimer = 1.6 + Math.random() * 2.2;
        const z = s.zombies[Math.floor(Math.random() * s.zombies.length)];
        this.groan(z.x, z.z);
      }
    }

    // the crowd at arrivals
    this.cheer = Math.max(0, this.cheer - dt);
    let crowdLevel = 0;
    let crowdPan = 0;
    if (s.crowd) {
      const { level, pan } = this.where(s.crowd.x, s.crowd.z, 45);
      crowdPan = pan;
      crowdLevel = level * (this.cheer > 0 ? Math.min(1, this.cheer / 1.5) : s.crowd.scared ? 0.25 : 0.05);
    }
    set(this.crowdBed.gain.gain, crowdLevel * 0.22, 0.25);
    if (this.cheer > 0 && crowdLevel > 0.05 && Math.random() < dt * 18) {
      this.burst({ dur: 0.02, type: 'highpass', freq: 1200 + Math.random() * 1600, level: 0.1 * crowdLevel, pan: crowdPan + (Math.random() - 0.5) * 0.4 });
    }
  }
}

const _right = new Vector3();
const _up = new Vector3();
const _back = new Vector3();
