// The 3D world: loads models, builds both coasts, and runs the loop.
// Hadi is always in one of four modes: walking, driving, riding a taxi, or flying.
import {
  WebGLRenderer, Scene, PerspectiveCamera, LoadingManager, PCFShadowMap, NeutralToneMapping,
  Vector2, Vector3, Plane, Raycaster, MathUtils, MeshStandardMaterial, Mesh, TorusGeometry,
} from '../../vendor/three.min.js';
import { glyphAtlas, fontsReady } from '../flaps.js';
import { loadModels, loadLater, loadOne } from './assets.js';
import { createSky, createLights, createSea, createLand, createRoads, createClouds } from './terrain.js';
import { World } from './world.js';
import { buildKerala, wind, focus as foliageFocus } from './kerala.js';
import { buildDubai } from './dubai.js';
import { sharedGlyphs } from './flapboard.js';
import { Actor } from './actors.js';
import { Player } from './player.js';
import { Keys, CameraRig, Stick } from './controls.js';
import { Stations, onDubaiSide } from './stations.js';
import { Aircraft } from './aircraft.js';
import { Rescuer } from './rescuer.js';
import { Car } from './vehicles.js';
import { UI } from './ui.js';
import { NavGrid } from './nav.js';
import { DayNight, lineRoads } from './daynight.js';
import { Apocalypse } from './zombies.js';
import { CHAPTERS } from './story.js';
import { STOPS, VEHICLES, DUBAI_PLACES, RUNWAY_KERALA, RUNWAY_DUBAI } from './layout.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const FOV = 48;
// where the glasses sit, in the head bone's (unscaled) space
const GLASSES = { y: 0.085, z: 0.098, scale: 1.12 };
const debug = location.search.includes('debug');
document.body.classList.toggle('is-touch', coarse);

const wrap = (a) => MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;

// Kenney's glasses come with grey lenses you can't see through: split the
// lenses off (they use the light swatch at the right of the palette) and make
// them clear glass, with dark frames.
function eyeglasses(gltf) {
  const root = gltf.scene.clone(true);
  const frameMaterial = new MeshStandardMaterial({ color: '#202329', roughness: 0.45 });
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    const uv = geo.attributes.uv;
    const index = geo.index ? Array.from(geo.index.array) : [...Array(geo.attributes.position.count).keys()];
    const frame = [];
    const lens = [];
    for (let i = 0; i < index.length; i += 3) {
      (uv.getX(index[i]) > 0.9 ? lens : frame).push(index[i], index[i + 1], index[i + 2]);
    }
    geo.setIndex([...frame, ...lens]);
    geo.clearGroups();
    geo.addGroup(0, frame.length, 0);
    geo.addGroup(frame.length, lens.length, 1);
    o.geometry = geo;
    // the lenses have no rims of their own: ring each one in the frame colour
    const pos = geo.attributes.position;
    for (const side of [-1, 1]) {
      const pts = [...new Set(lens)].filter((i) => Math.sign(pos.getX(i)) === side);
      if (!pts.length) continue;
      const c = new Vector3();
      for (const i of pts) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      c.divideScalar(pts.length);
      let radius = 0;
      let front = -Infinity;
      for (const i of pts) {
        radius = Math.max(radius, Math.hypot(pos.getX(i) - c.x, pos.getY(i) - c.y));
        front = Math.max(front, pos.getZ(i));
      }
      const rim = new Mesh(new TorusGeometry(radius, 0.0095, 4, 8), frameMaterial);
      rim.rotation.z = Math.PI / 8;
      rim.position.set(c.x, c.y, front);
      o.add(rim);
    }
    o.material = [
      frameMaterial,
      new MeshStandardMaterial({
        color: '#d9ecff', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false,
      }),
    ];
    o.castShadow = false;
  });
  return root;
}

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

  const keys = new Keys();
  const ui = new UI({
    onChapter: (i) => jumpTo(i),
    onNext: (i, fromLabel) => goNext(i, fromLabel),
    onAction: (action) => {
      if (action === 'race') stations.startRace();
      if (action === 'board') board();
    },
    onFly: (action) => {
      if (action === 'control') aircraft.takeControl();
      if (action === 'auto-dubai') aircraft.engageAutopilot('dubai');
      if (action === 'auto-kerala') aircraft.engageAutopilot('kerala');
      if (action === 'skip') aircraft.skip();
    },
    onHold: (name, on) => (on ? keys.held.add(name) : keys.held.delete(name)),
    onExit: () => leaveVehicle(),
    onTime: () => dayNight.toggle(),
    onZombie: (action) => (action === 'punch' ? apocalypse.punch() : toggleZombies()),
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
  // street lamps all along the roads, clear of parking spots and the stops
  lineRoads(scene, world, [
    ...Object.values(VEHICLES).map((v) => ({ x: v.x, z: v.z, r: 5 })),
    ...Object.values(STOPS).map((s) => ({ x: s.x, z: s.z, r: 4 })),
  ]);
  // ?t=21 starts the clock at 9 pm
  const startHour = Number(new URLSearchParams(location.search).get('t'));
  const dayNight = new DayNight({
    scene, sky, lights, renderer, lamps: refs.streetLamps, glows: [refs.supertall], clouds: clouds.material, reducedMotion,
    hour: Number.isFinite(startHour) && startHour > 0 ? startHour : 9.5,
    pool: coarse ? 2 : 4,
    onTick: (hour, night) => ui.clock(hour, night),
  });

  /* ------------------------------------------------ Hadi */
  const home = STOPS.home;
  const actor = new Actor(M.avatar, clips);
  scene.add(actor.root);
  // his glasses (Kenney's, made for these characters), on the head bone
  const head = actor.bone('head');
  if (head) {
    const glasses = eyeglasses(M.glasses);
    glasses.position.set(0, GLASSES.y, GLASSES.z);
    glasses.scale.setScalar(GLASSES.scale);
    head.add(glasses);
  }
  const player = new Player(actor, world, { x: home.x, z: home.z, face: home.face });
  world.dynamic.push(player.body);
  refs.player = player.position; // cars brake for him (and for his car)
  refs.playerRadius = 0.45;
  const nav = new NavGrid(world);

  /* ------------------------------------------------ cars */
  const spot = (key) => ({ x: VEHICLES[key].x, z: VEHICLES[key].z, heading: VEHICLES[key].h });
  const carKerala = new Car({ scene, world, model: M.sedan, ...spot('carKerala'), kind: 'car' });
  const carDubai = new Car({ scene, world, model: M.sedan, ...spot('carDubai'), kind: 'car' });
  const taxiKerala = new Car({ scene, world, model: M.taxi, ...spot('taxiKerala'), kind: 'taxi', home: VEHICLES.taxiKerala });
  const taxiDubai = new Car({ scene, world, model: M.taxi, ...spot('taxiDubai'), kind: 'taxi', home: VEHICLES.taxiDubai });
  const ownCars = [carKerala, carDubai, taxiKerala, taxiDubai];
  ownCars.forEach((c) => world.dynamic.push(c));
  refs.vehicles = [...refs.traffic, ...ownCars];
  // a second planner with car-sized clearance, built once the world is idle
  let carNav = null;
  const vehicleNav = () => (carNav ??= new NavGrid(world, { radius: 1.35, costs: { foot: 0.8, car: 0.45, grass: 1.7 } }));
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => vehicleNav(), { timeout: 4000 });

  /* ------------------------------------------------ the plane */
  const rescuer = new Rescuer(M.robot, scene);

  let mode = 'walk'; // walk | drive | taxi | fly
  let vehicle = null;

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

  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const ray = new Raycaster();
  const ndc = new Vector2();
  const rig = new CameraRig(camera, canvas, {
    reducedMotion,
    onTap(e) {
      if (mode !== 'walk') return;
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // clicking Hadi himself (five times calls up the zombies)
      if (ray.intersectObject(player.root, true).length) {
        knock();
        return;
      }
      const hit = new Vector3();
      if (!ray.ray.intersectPlane(ground, hit)) return;
      if (onDubaiSide(hit.z) !== onDubaiSide(player.position.z)) {
        ui.toast(onDubaiSide(player.position.z) ? 'Kerala is back across the sea: use the 01–07 buttons or fly back.' : 'That’s across the sea. Board the flight at Gate 1.');
        return;
      }
      // tapping a bench: go and sit on it
      const bench = refs.benches.find((b) => Math.hypot(b.x - hit.x, b.z - hit.z) < 1.3);
      if (bench) {
        sitOn(bench);
        return;
      }
      // tapping a building or the water walks you to the nearest spot you can reach
      const plan = walkTo(hit.x, hit.z);
      if (plan) marker(new Vector3(plan.end[0], world.heightAt(plan.end[0], plan.end[1]), plan.end[1]));
    },
  });
  rig.yaw = home.view;
  rig.blocked = (x, y, z) => world.solidAt(x, y, z);
  const stick = new Stick(document.querySelector('[data-stick]'), keys);

  const stations = new Stations({ scene, world, player, ui, reducedMotion });
  stations.onBoard = board;

  /* ------------------------------------------------ the secret: zombies */
  // Press H five times (or click Hadi five times) to start it, and again to end it.
  const apocalypse = new Apocalypse({ scene, world, nav, player, ui, dayNight });
  let zombieModel = null;
  async function toggleZombies() {
    if (apocalypse.active) {
      apocalypse.stop();
      ui.toast('The sun comes up. The dead go back to sleep.');
      return;
    }
    try {
      zombieModel ??= await loadOne('characters/character-zombie.glb');
    } catch (error) {
      console.warn('Zombie model failed to load', error);
      return;
    }
    if (player.sitting) player.stand();
    apocalypse.start(zombieModel, clips);
    ui.card(null);
    ui.toast(coarse ? 'Zombie apocalypse. Run!' : 'Zombie apocalypse. Run (Shift), punch (F), or find a car.');
  }
  // they got him: wake up at the last stop
  apocalypse.onCaught = async () => {
    if (mode !== 'walk') return;
    player.locked = true;
    await ui.fade(true);
    const stop = stations.stops[stations.current] ?? stations.stops[0];
    player.teleport(stop.x, stop.z, stop.face);
    rig.snap(player.position.clone().add(new Vector3(0, 1.5, 0)));
    player.locked = false;
    await ui.fade(false);
    ui.toast('Bitten three times. You wake up back at the stop.');
  };
  // five presses (or clicks on him) within three seconds
  const knocks = [];
  function knock() {
    const now = performance.now();
    knocks.push(now);
    while (knocks.length && now - knocks[0] > 3000) knocks.shift();
    if (knocks.length >= 5) {
      knocks.length = 0;
      toggleZombies();
    }
  }

  // the plane's stand changed: re-read both runways and aprons for the planners
  function refreshPlane() {
    for (const rw of [RUNWAY_KERALA, RUNWAY_DUBAI]) {
      const area = { x0: rw.x0 - 24, x1: rw.x1 + 4, z0: rw.z - 14, z1: rw.z + 14 };
      nav.refresh(area);
      carNav?.refresh(area);
    }
  }

  const aircraft = new Aircraft({
    refs, world, rig, camera, player, ui, rescuer, reducedMotion,
    onMoved: refreshPlane,
    onDisembark(airport) {
      mode = 'walk';
      stick.show(false);
      const stop = airport === 'dubai' ? STOPS.dubai : STOPS.gate;
      player.teleport(stop.x, stop.z + (airport === 'dubai' ? 6 : 0), stop.face);
      rig.yaw = stop.view;
      rig.snap(player.position.clone().add(new Vector3(0, 1.5, 0)));
      if (airport === 'dubai') {
        stations.landed = true;
        stations.startArrivals();
        refs.crowd.cheer(9);
      }
    },
  });

  function board() {
    if (aircraft.busy || mode !== 'walk') return;
    mode = 'fly';
    ui.prompt(null);
    ui.card(null);
    stick.show(coarse);
    aircraft.board();
  }

  /* ------------------------------------------------ driving and taxis */

  function enterCar(car) {
    mode = 'drive';
    vehicle = car;
    car.mode = 'manual';
    car.v = 0;
    player.stop();
    player.locked = true;
    player.root.visible = false;
    refs.playerRadius = 2.2;
    ui.prompt(null);
    ui.drive({ kind: 'drive', speed: 0 });
    stick.show(coarse);
  }

  function leaveVehicle() {
    const car = vehicle;
    if (!car) return;
    ui.cancelPick?.();
    const out = car.exitSpot();
    if (car.mode === 'manual') car.mode = 'parked';
    if (car.kind === 'taxi') {
      car.path = null;
      car.v = 0;
    }
    car.v = Math.abs(car.v) < 0.5 ? 0 : car.v;
    mode = 'walk';
    vehicle = null;
    player.locked = false;
    player.root.visible = true;
    player.teleport(out.x, out.z, car.h);
    refs.playerRadius = 0.45;
    ui.drive(null);
    stick.show(false);
    if (car.kind === 'taxi') setTimeout(() => sendTaxiBack(car), 1400);
  }

  async function takeTaxi(taxi) {
    mode = 'taxi';
    vehicle = taxi;
    taxi.fromLoop = taxi.mode === 'loop';
    if (taxi.fromLoop) taxi.loopCruise = taxi.cruise;
    taxi.mode = 'auto';
    taxi.path = null; // brake to a stop and wait
    player.stop();
    player.locked = true;
    player.root.visible = false;
    refs.playerRadius = 2.2;
    ui.prompt(null);
    ui.drive({ kind: 'taxi' });
    const inDubai = onDubaiSide(taxi.z);
    const places = inDubai
      ? DUBAI_PLACES.filter((p) => !p.plane || aircraft.at === 'dubai')
      : CHAPTERS.slice(0, 7).map((c, i) => ({ name: `${String(i + 1).padStart(2, '0')} · ${c.short}`, x: stations.stops[i].x, z: stations.stops[i].z }));
    const choice = await ui.pick('Where to?', places.map((p) => p.name));
    if (vehicle !== taxi) return;
    if (choice === null) {
      leaveVehicle();
      return;
    }
    rideTo(taxi, places[choice]);
  }

  // A taxi on Dubai's one-way ring road doesn't U-turn: it follows the ring and
  // turns off where that makes the whole trip shortest without a hairpin.
  function ringRoute(taxi, place) {
    const loop = refs.loop;
    const planner = vehicleNav();
    const s0 = loop.nearestS(taxi.x, taxi.z);
    let best = null;
    for (let ds = 6; ds < loop.length; ds += 10) {
      if (best && ds > best.cost) break;
      const at = loop.lane(s0 + ds);
      const plan = planner.find(at.x, at.z, place.x, place.z);
      if (!plan) continue;
      const first = plan.points.find(([x, z]) => Math.hypot(x - at.x, z - at.z) > 4) ?? plan.points[0];
      if (Math.abs(wrap(Math.atan2(first[0] - at.x, first[1] - at.z) - at.h)) > 1.9) continue;
      let length = 0;
      let px = at.x;
      let pz = at.z;
      for (const [x, z] of plan.points) {
        length += Math.hypot(x - px, z - pz);
        px = x;
        pz = z;
      }
      if (!best || ds + length < best.cost) best = { cost: ds + length, ds, plan };
    }
    if (!best) return null;
    const along = [];
    for (let d = 6; d <= best.ds; d += 6) {
      const q = loop.lane(s0 + d);
      along.push([q.x, q.z]);
    }
    return { points: [...along, ...best.plan.points] };
  }

  function rideTo(taxi, place) {
    const onRing = taxi.fromLoop && Math.hypot(...(() => {
      const q = refs.loop.lane(refs.loop.nearestS(taxi.x, taxi.z));
      return [q.x - taxi.x, q.z - taxi.z];
    })()) < 2;
    const plan = onRing ? ringRoute(taxi, place) : vehicleNav().find(taxi.x, taxi.z, place.x, place.z);
    if (!plan) {
      ui.toast('The taxi can’t get there. Try another stop.');
      leaveVehicle();
      return;
    }
    taxi.cruise = 13;
    ui.drive({ kind: 'taxi', dest: place.name.replace(/^\d+ · /, '') });
    taxi.drivePath(plan.points, () => {
      if (vehicle !== taxi) return;
      leaveVehicle();
      player.turnTo(Math.atan2(place.x - player.position.x, place.z - player.position.z));
      ui.toast(`Here you are: ${place.name.replace(/^\d+ · /, '')}.`);
    });
  }

  // After a ride, a taxi goes back to its stand, or back into Dubai's traffic.
  function sendTaxiBack(taxi) {
    if (vehicle === taxi) return;
    const carPlanner = vehicleNav();
    if (taxi.fromLoop) {
      const loop = refs.loop;
      const s = loop.nearestS(taxi.x, taxi.z) + 12;
      const join = loop.lane(s);
      const plan = carPlanner.find(taxi.x, taxi.z, join.x, join.z);
      taxi.cruise = 11;
      taxi.drivePath([...(plan?.points ?? []), [join.x, join.z]], () => {
        taxi.mode = 'loop';
        taxi.s = loop.nearestS(taxi.x, taxi.z);
        taxi.cruise = taxi.loopCruise ?? 9;
        taxi.fromLoop = false;
      });
      return;
    }
    const stand = taxi.home;
    const before = { x: stand.x - Math.sin(stand.h) * 7, z: stand.z - Math.cos(stand.h) * 7 };
    const plan = carPlanner.find(taxi.x, taxi.z, before.x, before.z);
    taxi.cruise = 10;
    taxi.drivePath([...(plan?.points ?? []), [before.x, before.z], [stand.x, stand.z]], () => {
      taxi.mode = 'parked';
      taxi.x = stand.x;
      taxi.z = stand.z;
      taxi.h = stand.h;
      taxi.sync();
    });
  }

  /* ------------------------------------------------ what you can do here */

  // The one prompt to show right now (E or the button), nearest first.
  function updatePrompt() {
    if (mode !== 'walk' || aircraft.busy || !ui.pickerEl.hidden) {
      ui.prompt(null);
      return;
    }
    const p = player.position;
    const near = [];
    const d = (x, z) => Math.hypot(x - p.x, z - p.z);
    if (player.sitting) near.push({ d: 0, label: 'Stand up', act: () => player.stand() });
    for (const car of [carKerala, carDubai]) {
      if (car.mode === 'parked' && d(car.x, car.z) < 3.8) near.push({ d: d(car.x, car.z), label: 'Drive the car', act: () => enterCar(car) });
    }
    for (const taxi of [taxiKerala, taxiDubai, ...refs.traffic.filter((c) => c.kind === 'taxi')]) {
      const free = taxi.mode === 'parked' || taxi.mode === 'loop';
      if (free && d(taxi.x, taxi.z) < (taxi.mode === 'loop' ? 5 : 4.2)) near.push({ d: d(taxi.x, taxi.z), label: 'Take a taxi', act: () => takeTaxi(taxi) });
    }
    if (aircraft.at === 'kerala' && stations.active?.id === 'gate') near.push({ d: 1, label: 'Board the flight to Dubai', act: board });
    if (aircraft.at === 'dubai') {
      const pl = refs.plane.plane.position;
      if (d(pl.x, pl.z) < 18) near.push({ d: d(pl.x, pl.z), label: 'Fly back to Kozhikode', act: board });
    }
    if (!player.sitting) {
      for (const bench of refs.benches) {
        const bd = d(bench.x, bench.z);
        if (bd < 2.6) near.push({ d: bd, label: 'Sit on the bench', act: () => sitOn(bench) });
      }
    }
    if (stations.active?.id === 'freelance' && !player.sitting) {
      const desk = refs.desk;
      near.push({ d: 2, label: 'Sit at the desk', act: () => player.sit(desk.x, desk.z, desk.rot) });
    }
    near.sort((a, b) => a.d - b.d);
    ui.prompt(near[0]?.label ?? null, near[0]?.act);
  }

  // Walk round to the front of a bench, then sit down on it.
  const BENCH_LIFT = 0.3;
  function sitOn(bench) {
    const sit = () => player.sit(bench.seat[0], bench.seat[1], bench.face, { lift: BENCH_LIFT, up: bench.up });
    const p = player.position;
    if (Math.hypot(bench.up[0] - p.x, bench.up[1] - p.z) < 0.6) return sit();
    walkTo(bench.up[0], bench.up[1], { arrive: sit });
  }

  /* ------------------------------------------------ moving between stops */

  // walk to the next stop; in a taxi, go there; across the sea, take the plane
  function goNext(i, fromLabel = false) {
    if (mode === 'fly') return;
    const target = i + 1 >= CHAPTERS.length ? 0 : i + 1;
    const stop = stations.stops[target];
    if (target === 0 && !fromLabel) return jumpTo(0);
    if (mode === 'taxi' && vehicle && onDubaiSide(stop.z) === onDubaiSide(vehicle.z)) {
      rideTo(vehicle, { name: stop.short, x: stop.x, z: stop.z });
      return;
    }
    if (mode === 'drive') leaveVehicle();
    if (onDubaiSide(stop.z) !== onDubaiSide(player.position.z)) {
      if (stop.id === 'dubai' && stations.active?.id === 'gate') return board();
      return jumpTo(target);
    }
    walkTo(stop.x, stop.z, { face: stop.face });
  }

  async function jumpTo(i) {
    if (mode === 'fly') return;
    if (mode !== 'walk') leaveVehicle();
    const stop = stations.stops[i];
    await ui.fade(true);
    if (!onDubaiSide(stop.z)) aircraft.reset();
    player.root.visible = true;
    player.teleport(stop.x, stop.z, stop.face);
    rig.yaw = stop.view;
    rig.snap(player.position.clone().add(new Vector3(0, 1.5, 0)));
    await ui.fade(false);
  }

  keys.on('KeyE', () => (mode === 'drive' || mode === 'taxi' ? leaveVehicle() : ui.triggerPrompt()));
  keys.on('Enter', () => mode === 'walk' && ui.triggerPrompt());
  keys.on('Space', () => mode === 'walk' && player.jump());
  keys.on('KeyN', () => goNext(stations.current));
  keys.on('KeyT', () => dayNight.toggle());
  keys.on('KeyH', knock);
  keys.on('KeyF', () => mode === 'walk' && apocalypse.punch());

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

  /* ------------------------------------------------ camera */

  const focus = new Vector3();
  // while at a stop, the camera drifts towards what matters there
  const look = new Vector3();
  let lookWeight = 0;
  let shift = 0;
  let lift = 0;
  function frameCamera(dt) {
    const active = mode === 'walk' ? stations.active : null;
    if (active?.look) look.set(...active.look);
    lookWeight += ((active?.look ? 0.42 : 0) - lookWeight) * Math.min(1, dt * 1.6);
    focus.copy(player.position).y += 1.5;
    if (lookWeight > 0.002) focus.lerp(look, lookWeight);
    // in a car, swing round behind it unless you've just looked around yourself
    if (vehicle && performance.now() - rig.lastDrag > 2500) {
      const behind = vehicle.h + Math.PI;
      rig.yaw += wrap(behind - rig.yaw) * Math.min(1, dt * (Math.abs(vehicle.v) > 1 ? 2.2 : 0.5));
    }
    // keep the scene's centre clear of the card: shift left on wide screens,
    // up on phones (where the card is a bottom sheet)
    const W = window.innerWidth;
    const H = window.innerHeight;
    const open = !ui.cardEl.hidden && mode !== 'fly';
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

  /* ------------------------------------------------ the loop */

  let last = performance.now();
  let t = 0;
  let hudTick = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    wind.value = t;
    sea.update(t);
    clouds.update(dt);
    refs.supertall.update(t);
    world.update(t, dt);
    if (mode === 'drive') vehicle.drive(dt, keys);
    for (const car of ownCars) car.update(dt);
    for (const car of refs.traffic) if (car.mode === 'auto') car.update(dt);
    if (vehicle) {
      // Hadi rides along (hidden), so stops and cards still notice him
      player.root.position.set(vehicle.x, world.heightAt(vehicle.x, vehicle.z), vehicle.z);
      hudTick += dt;
      if (hudTick > 0.12) {
        hudTick = 0;
        if (mode === 'drive') ui.drive({ kind: 'drive', speed: vehicle.v });
      }
    }
    player.update(dt, keys, rig);
    refs.worker.update(dt);
    refs.crowd.update(dt, player.position);
    apocalypse.update(dt, { mode, vehicle });
    aircraft.update(dt, keys);
    if (mode === 'fly') player.root.position.copy(aircraft.position).y = 0;
    stations.update(t, dt);
    updatePrompt();
    refs.departures.update(now);
    refs.arrivals.update(now);
    refs.migrationBoard.update(now);
    frameCamera(dt);
    rig.update(dt, focus);
    const subject = mode === 'fly' ? aircraft.position : player.position;
    foliageFocus.value.copy(subject).y += 1.2;
    sky.update(camera);
    dayNight.update(dt, camera, subject);
    lights.follow(subject);
    ui.place(camera, stations.stops, player.position, mode === 'fly');
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (debug) {
    window.__w = {
      rig, player, camera, stations, aircraft, jumpTo, renderer, scene, world, nav, walkTo,
      vehicleNav, carKerala, carDubai, taxiKerala, taxiDubai, takeTaxi, enterCar, leaveVehicle, rideTo,
      board, keys, dayNight, sitOn, apocalypse, toggleZombies, get mode() { return mode; }, get vehicle() { return vehicle; },
    };
  }
  ui.ready();
  ui.card(stations.stops[0]);
  if (new URLSearchParams(location.search).has('zombies')) toggleZombies();
  // the Dubai crowd's models come down in the background
  loadLater()
    .then((L) => refs.crowd.populate([L.maleA, L.femaleA, M.femaleB, L.maleG, L.femaleC, L.maleB, M.worker, L.maleE], clips, { few: coarse }))
    .catch((error) => console.warn('Crowd models failed to load', error));
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
