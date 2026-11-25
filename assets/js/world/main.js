// The 3D world: loads models, builds both coasts, and runs the loop.
import {
  WebGLRenderer, Scene, PerspectiveCamera, LoadingManager, PCFShadowMap, NeutralToneMapping,
  Vector2, Vector3, Plane, Raycaster,
} from '../../vendor/three.min.js';
import { glyphAtlas, fontsReady } from '../flaps.js';
import { loadModels } from './assets.js';
import { createSky, createLights, createSea, createLand, createRoads, createClouds } from './terrain.js';
import { World } from './world.js';
import { buildKerala, wind, focus as foliageFocus } from './kerala.js';
import { buildDubai } from './dubai.js';
import { sharedGlyphs } from './flapboard.js';
import { Actor } from './actors.js';
import { Player } from './player.js';
import { Keys, CameraRig } from './controls.js';
import { Stations, onDubaiSide } from './stations.js';
import { Flight } from './flight.js';
import { UI } from './ui.js';
import { NavGrid } from './nav.js';
import { CHAPTERS } from './story.js';
import { STOPS } from './layout.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const FOV = 48;
document.body.classList.toggle('is-touch', coarse);

async function start() {
  const canvas = document.querySelector('[data-world]');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return 'This world needs WebGL, which this browser has turned off.';
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.5, 2400);

  const ui = new UI({
    onChapter: (i) => jumpTo(i),
    onNext: (i, fromLabel) => goNext(i, fromLabel),
    onAction: (action) => {
      if (action === 'race') stations.startRace();
      if (action === 'board') board();
    },
  });

  await fontsReady();
  const manager = new LoadingManager();
  manager.onProgress = (_, loaded, total) => ui.progress(loaded / total);
  const M = await loadModels(manager);
  const clips = M.avatar.animations;

  const sky = createSky(scene);
  const lights = createLights(scene, { shadowSize: coarse ? 1024 : 2048 });
  const sea = createSea(scene);
  const land = createLand(scene);
  createRoads(scene);
  const clouds = createClouds(scene);
  const world = new World(land);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const glyphs = sharedGlyphs(glyphAtlas(), anisotropy);
  buildKerala({ scene, M, world, glyphs, clips });
  buildDubai({ scene, M, world, glyphs, clips });
  const refs = world.refs;

  const home = STOPS.home;
  const actor = new Actor(M.avatar, clips);
  scene.add(actor.root);
  const player = new Player(actor, world, { x: home.x, z: home.z, face: home.face });
  world.refs.player = player.position; // cars brake for him
  const navStart = performance.now();
  const nav = new NavGrid(world);
  if (location.search.includes('debug')) console.info(`nav grid built in ${Math.round(performance.now() - navStart)} ms`);

  // Walk to a point along a planned path. If something (a car) blocks the way
  // for a moment, plan again from wherever he is; after a few tries, stop.
  function walkTo(x, z, { face = null, arrive = null } = {}) {
    let tries = 0;
    const go = () => {
      const pos = player.position;
      // first plan ignores traffic (cars move on); a re-plan goes around them
      const plan = nav.find(pos.x, pos.z, x, z, { avoidTraffic: tries > 0 });
      if (!plan) {
        player.stop();
        return null;
      }
      player.follow(plan.points, () => {
        if (face !== null) player.turnTo(face);
        arrive?.();
      }, () => {
        if (++tries <= 3) go();
        else player.stop();
      });
      return plan;
    };
    return go();
  }

  const keys = new Keys();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const ray = new Raycaster();
  const ndc = new Vector2();
  const rig = new CameraRig(camera, canvas, {
    reducedMotion,
    onTap(e) {
      if (flight.busy) return;
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = new Vector3();
      if (!ray.ray.intersectPlane(ground, hit)) return;
      if (onDubaiSide(hit.z) !== onDubaiSide(player.position.z)) {
        ui.toast(onDubaiSide(player.position.z) ? 'Kerala is back across the sea: use the 01–07 buttons.' : 'That’s across the sea. Board the flight at Gate 1.');
        return;
      }
      // tapping a building or the water walks you to the nearest spot you can reach
      const plan = walkTo(hit.x, hit.z);
      if (plan) marker(new Vector3(plan.end[0], world.heightAt(plan.end[0], plan.end[1]), plan.end[1]));
    },
  });
  rig.yaw = home.view;
  rig.blocked = (x, y, z) => world.solidAt(x, y, z);

  const stations = new Stations({ scene, world, player, ui, reducedMotion });
  const flight = new Flight({ refs, rig, camera, player, ui, reducedMotion });
  stations.onBoard = board;

  function board() {
    if (flight.busy) return;
    ui.prompt(null);
    ui.card(null);
    flight.start(() => {
      stations.landed = true;
      stations.startArrivals();
      refreshPlane();
    });
  }

  // walk to the next stop along the road; across the sea, take the plane
  function goNext(i, fromLabel = false) {
    if (flight.busy) return;
    const target = i + 1 >= CHAPTERS.length ? 0 : i + 1;
    const stop = stations.stops[target];
    if (target === 0 && !fromLabel) return jumpTo(0);
    if (onDubaiSide(stop.z) !== onDubaiSide(player.position.z)) {
      if (stop.id === 'dubai' && stations.active?.id === 'gate') return board();
      return jumpTo(target);
    }
    walkTo(stop.x, stop.z, { face: stop.face });
  }

  // the plane's stand changed: re-read both aprons for the path planner
  function refreshPlane() {
    nav.refresh({ x0: -82, x1: -36, z0: -118, z1: -96 });
    nav.refresh({ x0: -70, x1: 0, z0: -356, z1: -334 });
  }

  async function jumpTo(i) {
    if (flight.busy) return;
    const stop = stations.stops[i];
    await ui.fade(true);
    if (!onDubaiSide(stop.z) && flight.atDubai) {
      flight.reset();
      refreshPlane();
    }
    player.root.visible = true;
    player.teleport(stop.x, stop.z, stop.face);
    rig.yaw = stop.view;
    rig.snap(player.position.clone().add(new Vector3(0, 1.5, 0)));
    await ui.fade(false);
  }

  keys.on('KeyE', () => ui.triggerPrompt());
  keys.on('Enter', () => ui.triggerPrompt());
  keys.on('Space', () => player.jump());
  keys.on('KeyN', () => goNext(stations.current));

  // a small ring where you tapped
  const ping = document.querySelector('[data-ping]');
  function marker(p) {
    const s = p.clone().project(camera);
    ping.style.left = `${((s.x + 1) / 2) * window.innerWidth}px`;
    ping.style.top = `${((1 - s.y) / 2) * window.innerHeight}px`;
    ping.classList.remove('is-on');
    void ping.offsetWidth;
    ping.classList.add('is-on');
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const focus = new Vector3();
  // while at a stop, the camera drifts towards what matters there
  const look = new Vector3();
  let lookWeight = 0;
  let shift = 0;
  let lift = 0;
  function frameCamera(dt) {
    const active = stations.active;
    if (active?.look) look.set(...active.look);
    lookWeight += ((active?.look ? 0.42 : 0) - lookWeight) * Math.min(1, dt * 1.6);
    focus.copy(player.position).y += 1.5;
    if (lookWeight > 0.002) focus.lerp(look, lookWeight);
    // keep the scene's centre clear of the card: shift left on wide screens,
    // up on phones (where the card is a bottom sheet)
    const W = window.innerWidth;
    const H = window.innerHeight;
    const open = !ui.cardEl.hidden && !flight.busy;
    shift += ((open && W > 900 ? 210 : 0) - shift) * Math.min(1, dt * 4);
    lift += ((open && W <= 720 ? H * 0.2 : 0) - lift) * Math.min(1, dt * 4);
    if (shift > 0.5 || lift > 0.5) {
      const fw = W + 2 * shift;
      const fh = H + 2 * lift;
      camera.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (fh / H)) * 180) / Math.PI;
      camera.aspect = fw / fh;
      camera.setViewOffset(fw, fh, 2 * shift, 2 * lift, W, H);
    } else if (camera.view?.enabled) {
      camera.clearViewOffset();
      camera.fov = FOV;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
  }

  rig.snap(player.position.clone().add(new Vector3(0, 1.5, 0)));
  renderer.compile(scene, camera);

  let last = performance.now();
  let t = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    wind.value = t;
    sea.update(t);
    clouds.update(dt);
    world.update(t, dt);
    player.update(dt, keys, rig);
    refs.worker.update(dt);
    refs.recruiter.update(dt);
    flight.update(dt);
    stations.update(t, dt);
    refs.departures.update(now);
    refs.arrivals.update(now);
    refs.migrationBoard.update(now);
    frameCamera(dt);
    rig.update(dt, focus);
    foliageFocus.value.copy(flight.busy ? refs.plane.plane.position : player.position).y += 1.2;
    lights.follow(flight.busy ? refs.plane.plane.position : player.position);
    sky.update(camera);
    ui.place(camera, stations.stops, player.position, flight.busy);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (location.search.includes('debug')) window.__w = { rig, player, camera, stations, flight, jumpTo, renderer, scene, world, nav, walkTo };
  ui.ready();
  ui.card(stations.stops[0]);
  return null;
}

start()
  .then((problem) => {
    if (!problem) return;
    document.body.classList.add('no-webgl');
    document.querySelector('[data-loader]').classList.add('is-failed');
    document.querySelector('[data-loader-status]').textContent = problem;
  })
  .catch((error) => {
    console.error(error);
    const status = document.querySelector('[data-loader-status]');
    if (status) status.textContent = 'The 3D world could not load in this browser.';
    document.body.classList.add('no-webgl');
  });
