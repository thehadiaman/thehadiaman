// The welcome at Dubai arrivals: people waiting behind the barriers either side
// of the exit, who cheer when Hadi walks out. Kenney's characters share one rig,
// so they borrow the avatar's clips; the cheering itself is done on the arm
// bones, since there is no cheer clip.
import {
  Group, Mesh, CylinderGeometry, BoxGeometry, MeshStandardMaterial,
} from '../../vendor/three.min.js';
import { Actor } from './actors.js';
import { Panel, text, roundRect } from './canvasart.js';

const STYLES = ['both', 'wave', 'clap', 'both', 'wave'];

// A barrier line: steel posts with a navy belt between them, along z at x.
function barrier(x, z0, z1) {
  const group = new Group();
  const steel = new MeshStandardMaterial({ color: '#b9bdc4', roughness: 0.35, metalness: 0.6 });
  const belt = new MeshStandardMaterial({ color: '#1f3f8f', roughness: 0.6 });
  const n = Math.round((z1 - z0) / 2.2);
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const post = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 8), steel);
    post.position.set(x, 0.5, z);
    const foot = new Mesh(new CylinderGeometry(0.2, 0.22, 0.05, 14), steel);
    foot.position.set(x, 0.025, z);
    post.castShadow = true;
    group.add(post, foot);
  }
  const tape = new Mesh(new BoxGeometry(0.02, 0.07, z1 - z0), belt);
  tape.position.set(x, 0.93, (z0 + z1) / 2);
  group.add(tape);
  return group;
}

function welcomeSign() {
  const sign = new Panel({
    width: 1.5,
    height: 0.66,
    paint(ctx, w, h, scared = false) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 0, 0, w, h, h * 0.06);
      ctx.fill();
      if (scared) {
        // flipped over and scrawled on the back
        text(ctx, 'HELP!', w / 2, h * 0.72, { cap: h * 0.42, color: '#c8372d', align: 'center', tracking: 0.08 });
        return;
      }
      text(ctx, 'WELCOME', w / 2, h * 0.4, { cap: h * 0.2, color: '#1f3f8f', align: 'center', tracking: 0.1 });
      text(ctx, 'HADI!', w / 2, h * 0.8, { cap: h * 0.3, color: '#1b1d21', align: 'center', tracking: 0.06 });
    },
  });
  sign.mesh.material.side = 2;
  return sign;
}

const SHOUTS = ['RUN, HADI!', 'behind you!', 'not the TypeScript guy!', 'we’ll… wait here…', 'is this… the interview?', 'mind the… zombies…'];

export class Crowd {
  // sides: [{ x0, x1, z0, z1, face }] — the pens either side of the walk.
  constructor({ scene, world, sides }) {
    this.scene = scene;
    this.world = world;
    this.sides = sides;
    this.people = [];
    this.cheering = 0; // seconds of full cheering left
    this.scared = false; // zombie mode: hands up, trembling
    this.bubbles = null;
    this.shout = 0;
    this.time = 0;
    for (const s of sides) {
      const edge = s.face > 0 ? s.x1 : s.x0; // the barrier runs along the side facing the walk
      scene.add(barrier(edge, s.z0, s.z1));
      world.box({ x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 });
    }
  }

  // Fill the pens, once the people's models have loaded.
  populate(models, clips, { few = false } = {}) {
    let seed = 17;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let k = 0;
    for (const s of this.sides) {
      const front = s.face > 0 ? s.x1 - 0.9 : s.x0 + 0.9;
      const rows = few ? 1 : s.rows;
      for (let row = 0; row < rows; row++) {
        const x = front - s.face * row * 1.5;
        const count = Math.floor((s.z1 - s.z0 - 0.6) / 1.75);
        for (let i = 0; i < count; i++) {
          // stagger the back row so faces show between the front row's heads
          const z = s.z0 + 1.1 + i * 1.75 + (row % 2) * 0.85;
          if (z > s.z1 - 0.6) continue;
          const model = models[k++ % models.length];
          const actor = new Actor(model, clips, {
            x: x + (rand() - 0.5) * 0.3,
            z,
            // facing the walk, turned a little towards the city: the way he comes
            rot: s.face * (Math.PI / 2 + 0.45) + (rand() - 0.5) * 0.35,
          });
          this.scene.add(actor.root);
          actor.play('idle');
          if (actor.current) actor.current.time = rand() * actor.current.getClip().duration;
          this.people.push({
            actor,
            base: actor.root.rotation.y,
            style: STYLES[(k + row) % STYLES.length],
            phase: rand() * Math.PI * 2,
            speed: 0.85 + rand() * 0.35,
            arms: { l: actor.bone('arm-left'), r: actor.bone('arm-right') },
            lift: 0, // how far into the cheer this person is, 0…1
          });
        }
      }
    }
    // someone in the front row on the near side holds a sign
    const holder = this.people.find((p) => p.style !== 'clap') ?? this.people[0];
    const torso = holder?.actor.bone('torso');
    if (torso) {
      holder.style = 'sign';
      this.sign = welcomeSign();
      const sign = this.sign.mesh;
      // bone space is in the model's unscaled units
      sign.scale.setScalar(1 / 2.4);
      sign.position.set(0, 0.16, 0.22);
      torso.add(sign);
    }
  }

  // Hadi is here: everybody cheers for a while, then calms down.
  cheer(seconds = 7) {
    this.cheering = Math.max(this.cheering, seconds);
    this.sfx?.cheerFor(seconds);
    for (const p of this.people) {
      if (p.style !== 'sign' && Math.random() < 0.4) p.actor.play('emote-yes', { once: true, then: 'idle' });
    }
  }

  // Zombie mode on or off.
  scare(on, bubbles) {
    this.scared = on;
    this.bubbles = bubbles;
    this.sign?.refresh(on);
  }

  update(dt, hadi) {
    this.time += dt;
    if (!this.people.length) return;
    // scared: now and then someone shouts a warning as he passes
    if (this.scared && this.bubbles) {
      this.shout -= dt;
      const p0 = this.people[0].actor.root.position;
      if (this.shout <= 0 && Math.hypot(hadi.x - p0.x, hadi.z - p0.z) < 26) {
        this.shout = 3 + Math.random() * 2.5;
        const who = this.people[Math.floor(Math.random() * this.people.length)];
        this.bubbles.say(who.actor.root, SHOUTS[Math.floor(Math.random() * SHOUTS.length)], { seconds: 2.4 });
      }
    }
    this.cheering = Math.max(0, this.cheering - dt);
    const t = this.time;
    for (const p of this.people) {
      const { actor } = p;
      const root = actor.root;
      const dx = hadi.x - root.position.x;
      const dz = hadi.z - root.position.z;
      const near = dx * dx + dz * dz < 30 * 30;
      if (!near && p.lift === 0) continue; // far away and calm: nothing to do
      actor.update(dt);
      // the cheer swells in and dies away; after it, the odd wave as he passes
      const wave = near && Math.sin(t * 0.7 + p.phase * 3) > 0.93;
      const want = this.scared || this.cheering > 0 || wave ? 1 : 0;
      p.lift += (want - p.lift) * Math.min(1, dt * (want ? 5 : 2));
      if (p.lift < 0.001) p.lift = 0;
      // turn a little towards him (never so far they turn their back on the walk)
      const look = Math.atan2(dx, dz);
      const turn = Math.max(-0.7, Math.min(0.7, ((look - p.base + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      if (near) root.rotation.y += ((p.base + turn) - root.rotation.y) * Math.min(1, dt * 2.5);
      this.pose(p, t, p.lift);
    }
  }

  // Arms up, waving, clapping, a hop. In this rig an arm with no rotation
  // points straight out sideways: +z on the left arm (−z on the right) raises
  // it, and turning it about y swings it forward. Each pose is blended in from
  // whatever the idle clip has the arm doing, by k.
  pose(p, t, k) {
    const { l, r } = p.arms;
    const root = p.actor.root;
    const s = t * p.speed;
    root.position.y = 0;
    if (!l || !r || k <= 0) return;
    const set = (bone, x, y, z) => {
      bone.rotation.set(
        bone.rotation.x + (x - bone.rotation.x) * k,
        bone.rotation.y + (y - bone.rotation.y) * k,
        bone.rotation.z + (z - bone.rotation.z) * k,
      );
    };
    if (this.scared) {
      // hands up, shaking like a leaf
      const shake = Math.sin(s * 47 + p.phase) * 0.07;
      set(l, 0, 0, 1.45 + shake);
      set(r, 0, 0, -1.45 + shake);
      root.position.y = 0;
      root.rotation.z = Math.sin(s * 39 + p.phase) * 0.035 * k;
      return;
    }
    root.rotation.z = 0;
    if (p.style === 'both') {
      set(l, 0, 0, 1.25 + Math.sin(s * 9 + p.phase) * 0.2);
      set(r, 0, 0, -1.25 - Math.sin(s * 9 + p.phase + 1.3) * 0.2);
      root.position.y = k * Math.max(0, Math.sin(s * 6.5 + p.phase)) * 0.3;
    } else if (p.style === 'wave') {
      set(l, 0, 0, 1.3 + Math.sin(s * 10 + p.phase) * 0.35);
      root.position.y = k * Math.max(0, Math.sin(s * 5 + p.phase)) * 0.1;
    } else if (p.style === 'clap') {
      const open = 1.1 + Math.max(0, Math.sin(s * 15 + p.phase)) * 0.4;
      set(l, 0, -open, 0.1);
      set(r, 0, open, -0.1);
    } else if (p.style === 'sign') {
      // hold the sign up and bounce it
      root.position.y = k * Math.max(0, Math.sin(s * 6 + p.phase)) * 0.22;
    }
  }
}
