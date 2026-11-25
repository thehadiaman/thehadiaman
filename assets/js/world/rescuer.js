// The rescue unit: Kenney's CC0 robot with a jetpack. It only appears when a
// plane under manual control is about to hit something.
import {
  Group, Mesh, CylinderGeometry, ConeGeometry, BoxGeometry, SphereGeometry, MeshStandardMaterial,
  MeshBasicMaterial, AdditiveBlending, AnimationMixer, LoopRepeat, cloneSkinned,
} from '../../vendor/three.min.js';

const SCALE = 5; // a 3.5 m robot: small next to an airliner, big enough to see

export class Rescuer {
  constructor(gltf, scene) {
    this.root = new Group();
    this.body = cloneSkinned(gltf.scene);
    this.body.scale.setScalar(SCALE);
    this.body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    this.root.add(this.body);

    // jetpack on the back, with two flame jets pointing down
    const pack = new Group();
    const shell = new MeshStandardMaterial({ color: '#2448c9', roughness: 0.4, metalness: 0.4 });
    const trim = new MeshStandardMaterial({ color: '#f3aa1c', roughness: 0.5 });
    pack.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.08), shell));
    this.flames = [];
    const flameMat = new MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    const coreMat = new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    for (const side of [-1, 1]) {
      const tank = new Mesh(new CylinderGeometry(0.045, 0.045, 0.22, 10), shell);
      tank.position.set(side * 0.06, 0, -0.03);
      const nozzle = new Mesh(new CylinderGeometry(0.035, 0.045, 0.05, 10), trim);
      nozzle.position.set(side * 0.06, -0.13, -0.03);
      const flame = new Mesh(new ConeGeometry(0.04, 0.3, 10), flameMat);
      flame.rotation.x = Math.PI;
      flame.position.set(side * 0.06, -0.3, -0.03);
      const core = new Mesh(new ConeGeometry(0.02, 0.16, 8), coreMat);
      core.rotation.x = Math.PI;
      core.position.set(side * 0.06, -0.22, -0.03);
      pack.add(tank, nozzle, flame, core);
      this.flames.push(flame, core);
    }
    const glow = new Mesh(new SphereGeometry(0.09, 10, 8), new MeshBasicMaterial({
      color: '#ff9a3c', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(0, -0.3, -0.03);
    pack.add(glow);
    this.flames.push(glow);
    const torso = this.body.getObjectByName('torso');
    pack.position.set(0, 0.12, -0.14);
    (torso || this.body).add(pack);

    this.mixer = new AnimationMixer(this.body);
    this.actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    this.current = null;
    this.root.visible = false;
    scene.add(this.root);
  }

  pose(name) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setLoop(LoopRepeat, Infinity).play();
    if (this.current) next.crossFadeFrom(this.current, 0.25, false);
    this.current = next;
  }

  // lean: 0 upright (carrying), ~1.2 flying flat out
  lean(angle) {
    this.body.rotation.x = angle;
  }

  update(dt, t) {
    if (!this.root.visible) return;
    this.mixer.update(dt);
    const f = 0.8 + Math.sin(t * 47) * 0.15 + Math.sin(t * 31) * 0.1;
    this.flames.forEach((m, i) => m.scale.set(1, i % 3 === 2 ? 1 : f * (1 + (i % 2) * 0.2), 1));
  }
}
