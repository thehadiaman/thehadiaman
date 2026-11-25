/*
 * The departure board in the CV page's hero: one split-flap board in its own
 * WebGL canvas. The flap mechanics live in flaps.js.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, PlaneGeometry,
  MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, NeutralToneMapping,
  Vector2, Vector3, Plane, Raycaster, DirectionalLight, PMREMGenerator, MathUtils,
  RoomEnvironment, RoundedBoxGeometry,
} from '../vendor/three.min.js';
import {
  DRUM, DIGITS, PITCH_X, PITCH_Y, CARD_W, CARD_H,
  glyphAtlas, wordAtlas, labelTexture, atlasTexture,
  Bank, makeUnit, rest, setTarget, snap, isResting, stepUnits, Clatter, fontsReady,
} from './flaps.js';
import {
  STATUS_WORDS, LAYOUTS, layoutFor, dubaiClock, flightStatus, boardTitle,
} from './content.js';

const FRAME = 0.55; // housing border around the display window
const HEADER = 1.2; // strip above the flaps: board title and clock
const CLOCK_SCALE = 0.56;
const SHADOW_DEPTH = 2.5; // shadow plane sits this far behind the board
const MARGINS = {
  wide: { x: 0.9, top: 0.5, bottom: 1.3 },
  narrow: { x: 0.55, top: 0.35, bottom: 1.0 },
};

// A soft rectangle of shadow, cast onto the page behind the board.
function shadowTexture(w, h, blur) {
  const scale = 40;
  const pad = blur * 1.8;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((w + pad * 2) * scale);
  canvas.height = Math.ceil((h + pad * 2) * scale);
  const ctx = canvas.getContext('2d');
  // Canvas shadows only render next to a shape, so draw the shape off-canvas.
  ctx.shadowColor = '#000';
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetX = canvas.width;
  ctx.fillStyle = '#000';
  ctx.fillRect(pad * scale - canvas.width, pad * scale, w * scale, h * scale);
  return { tex: new CanvasTexture(canvas), w: w + pad * 2, h: h + pad * 2 };
}

/* ------------------------------------------------------------ the board */

/**
 * Mounts the board into `host` and returns a small API, or null when WebGL is
 * unavailable. `onLost` runs if the GPU context goes away later.
 */
export async function mountBoard(host, { reducedMotion = false, onLost } = {}) {
  await fontsReady();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;

  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(-5, 9, 12);
  scene.add(key);

  const camera = new PerspectiveCamera(20, 1, 1, 200);
  const rig = new Group(); // tilts toward the pointer
  scene.add(rig);

  const glyphs = glyphAtlas();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const glyphTexture = atlasTexture(glyphs.canvas, anisotropy);
  const housingMaterial = new MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.44, metalness: 0.5 });
  const windowMaterial = new MeshStandardMaterial({ color: 0x08090b, roughness: 0.92, metalness: 0 });

  const clatter = new Clatter();
  let board = null;
  let layoutKey = null;
  let units = [];
  let raf = 0;
  let lastFrame = 0;
  let visible = true;
  let shown = false;
  let disposed = false;
  let clockTimer = 0;

  const canTilt = !reducedMotion && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  function invalidate() {
    if (!raf && visible && !disposed) raf = requestAnimationFrame(frame);
  }

  function disposeBoard() {
    if (!board) return;
    rig.remove(board.group);
    scene.remove(board.shadow);
    board.banks.forEach((b) => b.dispose());
    board.disposables.forEach((d) => d.dispose());
    board = null;
    units = [];
  }

  function build(keyName) {
    disposeBoard();
    layoutKey = keyName;
    const L = LAYOUTS[keyName];
    const margin = MARGINS[keyName];
    const rows = L.lines.length;
    const gridW = L.cols * PITCH_X - (PITCH_X - CARD_W);
    const gridH = rows * PITCH_Y - (PITCH_Y - CARD_H);
    const W = gridW + 2 * FRAME;
    const H = gridH + HEADER + 2 * FRAME;
    const yTop = H / 2 - FRAME;
    const yGrid = yTop - HEADER;
    const left = -gridW / 2;
    const status = flightStatus();
    const group = new Group();
    const disposables = [];

    // housing and the dark window the cards sit in
    const bodyGeo = new RoundedBoxGeometry(W, H, 0.8, 4, 0.22);
    const body = new Mesh(bodyGeo, housingMaterial);
    body.position.z = -0.42;
    const winH = HEADER + gridH + 0.24;
    const winGeo = new PlaneGeometry(gridW + 0.36, winH);
    const win = new Mesh(winGeo, windowMaterial);
    win.position.set(0, yTop + 0.12 - winH / 2, -0.01);
    group.add(body, win);
    disposables.push(bodyGeo, winGeo);

    // character cells
    const statusFrom = L.cols - L.status.span;
    const cells = [];
    L.lines.forEach((line, r) => {
      for (let c = 0; c < L.cols; c++) {
        if (r === L.status.row && c >= statusFrom) continue;
        cells.push({ r, c, ch: line[c] ?? ' ' });
      }
    });
    const bank = new Bank(glyphTexture, glyphs.grid, cells.length + 5, CARD_W);
    const charUnits = cells.map((cell, i) => {
      const x = left + CARD_W / 2 + cell.c * PITCH_X;
      const y = yGrid - CARD_H / 2 - cell.r * PITCH_Y;
      bank.place(i, x, y, 1, 0.96 + Math.random() * 0.07);
      const u = makeUnit(bank, i, DRUM, [...DRUM].map((_, k) => k), x, y);
      u.value = cell.ch;
      u.row = cell.r;
      u.col = cell.c;
      return u;
    });

    // Dubai clock in the header: small cells with digit-only drums
    const s = CLOCK_SCALE;
    const headerY = yTop - HEADER / 2;
    const clockRight = gridW / 2 - (CARD_W * s) / 2;
    const clockUnits = [];
    for (let k = 0; k < 5; k++) {
      const i = cells.length + k;
      const x = clockRight - (4 - k) * PITCH_X * s;
      bank.place(i, x, headerY, s, 1);
      const chars = k === 2 ? ':' : DIGITS;
      clockUnits.push(makeUnit(bank, i, chars, [...chars].map((c) => DRUM.indexOf(c)), x, headerY));
    }
    bank.addTo(group);

    // remarks flap
    const statusW = L.status.span * PITCH_X - (PITCH_X - CARD_W);
    const words = wordAtlas(statusW, STATUS_WORDS);
    const wordTexture = atlasTexture(words.canvas, anisotropy);
    const statusBank = new Bank(wordTexture, words.grid, 1, statusW);
    const sx = left + statusFrom * PITCH_X + statusW / 2;
    const sy = yGrid - CARD_H / 2 - L.status.row * PITCH_Y;
    statusBank.place(0, sx, sy, 1, 1);
    statusBank.addTo(group);
    const statusUnit = makeUnit(statusBank, 0, STATUS_WORDS, STATUS_WORDS.map((_, k) => k), sx, sy);
    disposables.push(wordTexture);

    // painted labels: board title (left) and the clock's city (right)
    const title = labelTexture(boardTitle(status), {
      cap: 0.3, height: 0.7, icon: status === 'LANDED' ? 'arrive' : 'depart',
    });
    const titleGeo = new PlaneGeometry(title.width, title.height);
    const titleMat = new MeshBasicMaterial({ map: title.tex, transparent: true, toneMapped: false });
    const titleMesh = new Mesh(titleGeo, titleMat);
    titleMesh.position.set(left + title.width / 2, headerY, 0.002);
    const city = labelTexture('DUBAI', { cap: 0.22, height: 0.6 });
    const cityGeo = new PlaneGeometry(city.width, city.height);
    const cityMat = new MeshBasicMaterial({ map: city.tex, transparent: true, toneMapped: false });
    const cityMesh = new Mesh(cityGeo, cityMat);
    const clockLeft = clockRight - 4 * PITCH_X * s - (CARD_W * s) / 2;
    cityMesh.position.set(clockLeft - 0.28 - city.width / 2, headerY, 0.002);
    group.add(titleMesh, cityMesh);
    disposables.push(title.tex, titleGeo, titleMat, city.tex, cityGeo, cityMat);

    rig.add(group);

    // soft shadow on the page, outside the rig so the board moves in front of it
    const sh = shadowTexture(W, H, keyName === 'wide' ? 0.5 : 0.4);
    const shadowGeo = new PlaneGeometry(sh.w, sh.h);
    const shadowMat = new MeshBasicMaterial({
      map: sh.tex, color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
    });
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.position.z = -SHADOW_DEPTH;
    scene.add(shadow);
    disposables.push(sh.tex, shadowGeo, shadowMat);

    const view = { w: W + 2 * margin.x, h: H + margin.top + margin.bottom, cy: (margin.top - margin.bottom) / 2 };
    host.style.aspectRatio = `${view.w.toFixed(3)} / ${view.h.toFixed(3)}`;

    board = {
      group, shadow, view, W, H,
      banks: [bank, statusBank],
      charUnits, clockUnits, statusUnit, disposables,
    };
    units = [...charUnits, ...clockUnits, statusUnit];
    units.forEach(rest);

    // opening sequence: a wave from the left, the remarks flap drops in last
    const start = performance.now() + 200;
    for (const u of charUnits) setTarget(u, u.value, start + u.col * 11 + u.row * 45 + Math.random() * 140);
    setTarget(statusUnit, status, start + 1500);
    setClock(dubaiClock(), start + 500);
    if (reducedMotion) units.forEach(snap);
    board.banks.forEach((b) => b.flush());
  }

  function setClock(hhmm, wait = performance.now()) {
    if (!board) return;
    board.clockUnits.forEach((u, k) => {
      setTarget(u, hhmm[k], wait);
      if (reducedMotion) snap(u);
    });
    board.banks.forEach((b) => b.flush());
    invalidate();
  }

  function scheduleClock() {
    clearTimeout(clockTimer);
    clockTimer = setTimeout(tickClock, 60000 - (Date.now() % 60000) + 50);
  }

  function tickClock() {
    setClock(dubaiClock());
    const status = flightStatus();
    if (board && board.statusUnit.chars[board.statusUnit.target] !== status) {
      setTarget(board.statusUnit, status, performance.now());
      if (reducedMotion) snap(board.statusUnit);
    }
    scheduleClock();
  }

  function fit() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h || !board) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const { view } = board;
    const d = Math.max(view.h / (2 * t), view.w / (2 * t * camera.aspect));
    camera.position.set(0, view.cy, d);
    camera.near = d * 0.5;
    camera.far = d * 2;
    camera.lookAt(0, view.cy, 0);
    camera.updateProjectionMatrix();
    // the shadow sits further back, so scale it up to keep its apparent size
    const k = (d + SHADOW_DEPTH) / d;
    board.shadow.scale.setScalar(k);
    board.shadow.position.y = view.cy + (-0.32 - view.cy) * k;
  }

  function stepFlaps(now) {
    const { busy, flips } = stepUnits(units, now);
    if (busy || flips) board.banks.forEach((b) => b.flush());
    clatter.play(flips);
    return busy;
  }

  function stepTilt(dt) {
    if (!canTilt) return false;
    const k = 1 - Math.exp(-dt / 160);
    tilt.x += (tilt.tx - tilt.x) * k;
    tilt.y += (tilt.ty - tilt.y) * k;
    rig.rotation.set(tilt.x, tilt.y, 0);
    return Math.abs(tilt.tx - tilt.x) > 1e-4 || Math.abs(tilt.ty - tilt.y) > 1e-4;
  }

  function frame(now) {
    raf = 0;
    if (!board) return;
    const dt = lastFrame ? Math.min(now - lastFrame, 100) : 16;
    lastFrame = now;
    let busy = stepFlaps(now);
    busy = stepTilt(dt) || busy;
    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      host.classList.add('is-ready');
    }
    if (busy) invalidate();
    else lastFrame = 0;
  }

  // Every resting cell turns one full lap, starting nearest the given point.
  function ripple(px = null, py = 0) {
    if (reducedMotion || !board) return;
    const ox = px ?? -board.W / 2;
    const now = performance.now();
    for (const u of [...board.charUnits, board.statusUnit]) {
      if (!isResting(u)) continue;
      const d = Math.hypot(u.x - ox, (u.y - py) * 1.2);
      u.laps = 1;
      u.fast = true;
      u.wait = now + d * 24;
    }
    invalidate();
  }

  // pointer: tilt toward the cursor, click to ripple from where you clicked
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const plane = new Plane();
  const normal = new Vector3();

  function onPointerMove(e) {
    tilt.ty = (e.clientX / window.innerWidth - 0.5) * 0.09;
    tilt.tx = (e.clientY / window.innerHeight - 0.5) * 0.05;
    invalidate();
  }

  function onClick(e) {
    if (!board) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    board.group.updateMatrixWorld();
    normal.set(0, 0, 1).transformDirection(board.group.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, board.group.getWorldPosition(hit));
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    board.group.worldToLocal(hit);
    ripple(hit.x, hit.y);
  }

  if (canTilt) window.addEventListener('pointermove', onPointerMove, { passive: true });
  if (!reducedMotion) canvas.addEventListener('click', onClick);

  const resizeObserver = new ResizeObserver(() => {
    const next = layoutFor(host.clientWidth);
    if (next !== layoutKey) build(next);
    fit();
    invalidate();
  });

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate();
  });

  function onVisibility() {
    if (document.hidden) return;
    tickClock();
    invalidate();
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    destroy();
    onLost?.();
  });

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(clockTimer);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibility);
    disposeBoard();
    glyphTexture.dispose();
    envMap.dispose();
    housingMaterial.dispose();
    windowMaterial.dispose();
    renderer.dispose();
    canvas.remove();
    host.classList.remove('is-ready');
  }

  host.prepend(canvas);
  build(layoutFor(host.clientWidth));
  fit();
  resizeObserver.observe(host);
  visibilityObserver.observe(host);
  document.addEventListener('visibilitychange', onVisibility);
  scheduleClock();
  invalidate();

  return {
    ripple: () => ripple(),
    setSound(on) {
      if (!on) {
        clatter.disable();
        return false;
      }
      const ok = clatter.enable();
      if (ok) ripple();
      return ok;
    },
    destroy,
  };
}
