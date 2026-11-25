// Animated people. All Kenney mini characters share one rig, so the NPCs reuse
// the avatar's animation clips.
import { AnimationMixer, LoopOnce, LoopRepeat, cloneSkinned } from '../../vendor/three.min.js';

export const PERSON_SCALE = 2.4; // Kenney mini characters are 0.7 tall; this makes ~1.7 m

export class Actor {
  constructor(gltf, clips, { x = 0, z = 0, rot = 0, scale = PERSON_SCALE } = {}) {
    this.root = cloneSkinned(gltf.scene);
    this.root.scale.setScalar(scale);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = rot;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false; // skinned bounds don't follow animation
      }
    });
    this.mixer = new AnimationMixer(this.root);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.currentName = '';
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this.after) {
        const next = this.after;
        this.after = null;
        this.play(next);
      }
    });
  }

  bone(name) {
    return this.root.getObjectByName(name);
  }

  // Cross-fade to an animation. `once` plays it a single time, then `then`.
  play(name, { fade = 0.22, once = false, then = 'idle', speed = 1 } = {}) {
    const action = this.actions[name];
    if (!action) return;
    if (this.currentName === name && !once) {
      action.timeScale = speed;
      return;
    }
    action.reset();
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.timeScale = speed;
    action.enabled = true;
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, fade, false);
    }
    action.play();
    this.current = action;
    this.currentName = name;
    this.after = once ? then : null;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
