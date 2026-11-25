// The story stops: when you walk up to one, its card opens and something happens there.
import {
  Mesh, SphereGeometry, MeshBasicMaterial, Vector3, BufferGeometry, Line, LineBasicMaterial,
  Float32BufferAttribute,
} from '../../vendor/three.min.js';
import { STOPS } from './layout.js';
import { CHAPTERS } from './story.js';
import { flightStatus, dubaiClock } from '../content.js';

export const onDubaiSide = (z) => z < -200;

const DEPARTURES = ['DXB  DUBAI  05 DEC', 'SEARCH  14.0S > 1.5S', 'REDIS FARE CACHE 15 MIN', 'BUILDMYTRAVEL.AE'];
const ARRIVALS = ['CCJ  KOZHIKODE', 'HADI AMAN', 'AVAILABLE FROM 05 DEC'];

// A glowing ball with a fading trail, for the search race.
class Orb {
  constructor(scene, color) {
    this.mesh = new Mesh(new SphereGeometry(0.45, 16, 12), new MeshBasicMaterial({ color, fog: false }));
    this.count = 40;
    this.trail = new Float32Array(this.count * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.trail, 3));
    this.line = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.7, fog: false }));
    this.line.frustumCulled = false;
    this.mesh.visible = false;
    this.line.visible = false;
    scene.add(this.mesh, this.line);
  }

  set(p) {
    this.trail.copyWithin(3, 0, (this.count - 1) * 3);
    this.trail[0] = p.x;
    this.trail[1] = p.y;
    this.trail[2] = p.z;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.mesh.position.copy(p);
  }

  show(on, from) {
    this.mesh.visible = on;
    this.line.visible = on;
    if (on && from) for (let i = 0; i < this.count; i++) this.trail.set([from.x, from.y, from.z], i * 3);
  }
}

export class Stations {
  constructor({ scene, world, player, ui, reducedMotion }) {
    this.world = world;
    this.refs = world.refs;
    this.player = player;
    this.ui = ui;
    this.reducedMotion = reducedMotion;
    this.stops = CHAPTERS.map((c, index) => ({
      ...c, index, ...STOPS[c.id], radius: c.id === 'dubai' ? 14 : 11, visits: 0,
    }));
    this.active = null;
    this.current = 0;
    this.tasks = [];
    this.time = 0;
    this.landed = false; // arrived in Dubai by plane
    this.boardsStarted = { departures: false, arrivals: false };
    this.race = null;
    this.raceOrbs = [new Orb(scene, '#2f6bff'), new Orb(scene, '#f3aa1c')];
    this.workerNext = 0;
    this.clockTimer = 0;
  }

  // run fn(k) for k from 0 to 1 over `seconds`, after `delay`
  tween(seconds, fn, delay = 0) {
    this.tasks.push({ start: this.time + delay, dur: seconds, fn });
  }

  after(seconds, fn) {
    this.tasks.push({ start: this.time + seconds, dur: 0, fn });
  }

  enter(stop) {
    stop.visits += 1;
    const r = this.refs;
    const first = stop.visits === 1;
    switch (stop.id) {
      case 'home':
        if (first) this.after(0.8, () => this.player.gesture('emote-yes', 1.4));
        break;
      case 'college':
        r.lamps.forEach((lamp, i) => this.tween(0.5, (k) => lamp.set(k), i * 0.28));
        break;
      case 'freelance': {
        const screen = r.freelanceScreen;
        screen.mesh.visible = true;
        this.tween(0.6, (k) => screen.mesh.scale.setScalar(Math.max(0.01, 1 - (1 - k) ** 3)));
        this.tween(1.8, (k) => screen.refresh(k), 0.3);
        this.ui.prompt('Sit at the desk', () => this.sitAtDesk());
        break;
      }
      case 'nucore':
        r.migration.running = true;
        r.migrationBoard.setLines(['1 WEEK'], performance.now());
        this.after(3.2, () => r.migrationBoard.setLines(['4 HOURS'], performance.now()));
        this.tween(3, (k) => r.agencies.refresh(Math.round(240 * k)));
        this.workerNext = this.time + 1;
        break;
      case 'projects': {
        let shown = 0;
        this.tween(9, (k) => {
          const n = 1 + Math.floor(k * 7.99);
          if (n !== shown) {
            shown = n;
            r.chat.refresh(n);
          }
        });
        r.ragAnswer.refresh(0);
        r.pages.forEach(({ page, delay }) => {
          this.tween(1.3, (k) => {
            page.visible = k > 0 && k < 1;
            page.position.lerpVectors(r.pageFrom, r.pageTo, k);
            page.position.y += Math.sin(Math.PI * k) * 2.2;
            page.rotation.set(k * 4, k * 6 + delay, 0);
          }, 0.4 + delay);
        });
        this.after(3, () => r.ragAnswer.refresh(1));
        this.after(4.2, () => r.ragAnswer.refresh(2));
        break;
      }
      case 'airport':
        this.startDepartures();
        this.after(1.2, () => this.startRace());
        break;
      case 'gate':
        this.ui.prompt('Board the flight to Dubai', () => this.onBoard?.());
        break;
      case 'dubai':
        this.startArrivals();
        this.after(0.6, () => {
          r.recruiter.play('emote-yes', { once: true, then: 'idle' });
          this.player.gesture('emote-yes', 1.4);
        });
        break;
      default:
    }
  }

  leave(stop) {
    if (stop.id === 'freelance' || stop.id === 'gate') this.ui.prompt(null);
    this.ui.card(null);
  }

  sitAtDesk() {
    const d = this.refs.desk;
    this.player.sit(d.x, d.z, d.rot);
    this.ui.prompt(null);
  }

  startDepartures(at = performance.now()) {
    const board = this.refs.departures;
    board.setLines(DEPARTURES, at);
    const status = flightStatus();
    board.setStatus(status === 'LANDED' ? 'DEPARTED' : status, at + 1600);
    this.boardsStarted.departures = true;
  }

  startArrivals(at = performance.now()) {
    const board = this.refs.arrivals;
    board.setLines(ARRIVALS, at);
    const status = this.landed || flightStatus() === 'LANDED' ? 'LANDED' : 'EXPECTED';
    board.setStatus(status, at + 1600);
    board.setClock(dubaiClock(), at + 400);
    this.boardsStarted.arrivals = true;
  }

  // Two searches leave the board together: one to the Redis cabinet next door,
  // one all the way out to the Sabre mast at sea. Real durations: 1.5 s and 14 s.
  startRace() {
    const r = this.refs;
    const from = r.boardFace.clone();
    this.race = {
      start: this.time,
      from,
      legs: [
        { orb: this.raceOrbs[0], to: r.redis.top.clone(), secs: 1.5, height: 3, name: 'Redis', done: false },
        { orb: this.raceOrbs[1], to: r.sabre.top.clone(), secs: 14, height: 46, name: 'Sabre', done: false },
      ],
    };
    for (const leg of this.race.legs) {
      leg.orb.show(true, from);
      leg.label = this.ui.floating(`${leg.name} 0.0 s`, leg.name === 'Redis' ? 'cache' : 'gds');
    }
  }

  stepRace() {
    const race = this.race;
    if (!race) return;
    const elapsed = this.time - race.start;
    const p = new Vector3();
    let running = false;
    for (const leg of race.legs) {
      const u = Math.min(1, elapsed / leg.secs);
      // out and back
      const k = u < 0.5 ? u * 2 : 2 - u * 2;
      p.lerpVectors(race.from, leg.to, k);
      p.y += Math.sin(Math.PI * k) * leg.height;
      if (!leg.done) {
        leg.orb.set(p);
        leg.label.text(`${leg.name} ${(u * leg.secs).toFixed(1)} s`);
        leg.label.at(p);
      }
      if (leg.name === 'Redis' && u >= 0.5 && u < 0.62) this.refs.redis.flash(1 + Math.floor(elapsed * 10));
      if (u >= 1 && !leg.done) {
        leg.done = true;
        leg.orb.show(false);
        leg.label.text(`${leg.name} ${leg.secs.toFixed(1)} s ✓`);
        leg.label.at(race.from.clone().add(new Vector3(leg.name === 'Redis' ? 2.6 : -2.6, 1.6, 0)));
        leg.label.done();
        if (leg.name === 'Redis') this.refs.redis.flash(0);
      }
      if (!leg.done) running = true;
    }
    if (!running && elapsed > 20) {
      race.legs.forEach((l) => l.label.remove());
      this.race = null;
    }
  }

  stopNearest(pos) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.stops) {
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return { stop: best, distance: bestD };
  }

  update(t, dt) {
    this.time = t;
    // timed tasks
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (t < task.start) continue;
      const k = task.dur ? Math.min(1, (t - task.start) / task.dur) : 1;
      task.fn(k);
      if (k >= 1) this.tasks.splice(i, 1);
    }
    this.stepRace();

    const pos = this.player.position;
    // the boards wake up as you approach them
    if (!this.boardsStarted.departures && Math.hypot(pos.x + 5, pos.z + 72) < 80) this.startDepartures();
    if (!this.boardsStarted.arrivals && Math.hypot(pos.x, pos.z + 372) < 80) this.startArrivals();

    const { stop, distance } = this.stopNearest(pos);
    const inside = distance < stop.radius ? stop : null;
    if (inside !== this.active) {
      if (this.active) this.leave(this.active);
      this.active = inside;
      if (inside) {
        this.current = inside.index;
        this.ui.card(inside);
        this.ui.chapter(inside.index);
        this.enter(inside);
      }
    }
    // the worker turns to look at Hadi as he comes near (the recruiter keeps her
    // name sign facing the plaza, so it stays readable)
    for (const npc of [this.refs.worker]) {
      const root = npc.root;
      const dx = pos.x - root.position.x;
      const dz = pos.z - root.position.z;
      if (dx * dx + dz * dz > 14 * 14) continue;
      const want = Math.atan2(dx, dz);
      let diff = ((want - root.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      root.rotation.y += diff * Math.min(1, dt * 3);
    }
    if (this.active?.id === 'nucore' && t > this.workerNext) {
      this.refs.worker.play('pick-up', { once: true, then: 'idle' });
      this.workerNext = t + 4 + Math.random() * 2;
    }
    // the arrivals clock
    if (this.boardsStarted.arrivals && t > this.clockTimer) {
      this.refs.arrivals.setClock(dubaiClock());
      this.clockTimer = t + 5;
    }
  }
}
