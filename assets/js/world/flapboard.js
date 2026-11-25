// Split-flap boards that live in the world (on the airport terminals).
import { Group, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial } from '../../vendor/three.min.js';
import {
  DRUM, DIGITS, PITCH_X, PITCH_Y, CARD_W, CARD_H, wordAtlas, labelTexture, atlasTexture,
  Bank, makeUnit, rest, setTarget, stepUnits,
} from '../flaps.js';

const FRAME = 0.5;
const HEADER = 1.2;
const CLOCK_SCALE = 0.56;
const housing = new MeshStandardMaterial({ color: '#1c1e22', roughness: 0.45, metalness: 0.4 });
const windowMat = new MeshStandardMaterial({ color: '#08090b', roughness: 0.9 });

/**
 * cols × rows of character cells, a painted title, an optional remarks flap
 * (status: { words, span, row }) and an optional clock in the header.
 * The board is built in board units (1 per column) and scaled down by `scale`.
 */
export function createFlapBoard({ glyphs, cols, rows, title, icon, status, clock = false, scale = 0.25 }) {
  const group = new Group();
  const inner = new Group();
  inner.scale.setScalar(scale);
  group.add(inner);

  const gridW = cols * PITCH_X - (PITCH_X - CARD_W);
  const gridH = rows * PITCH_Y - (PITCH_Y - CARD_H);
  const W = gridW + 2 * FRAME;
  const H = gridH + HEADER + 2 * FRAME;
  const yTop = H / 2 - FRAME;
  const yGrid = yTop - HEADER;
  const left = -gridW / 2;

  const body = new Mesh(new BoxGeometry(W, H, 0.7), housing);
  body.position.z = -0.37;
  const win = new Mesh(new PlaneGeometry(gridW + 0.3, HEADER + gridH + 0.2), windowMat);
  win.position.set(0, yTop + 0.1 - (HEADER + gridH + 0.2) / 2, -0.01);
  inner.add(body, win);
  body.castShadow = true;

  const statusFrom = status ? cols - status.span : cols;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (status && r === status.row && c >= statusFrom) continue;
      cells.push({ r, c });
    }
  }
  const clockCount = clock ? 5 : 0;
  const bank = new Bank(glyphs.texture, glyphs.grid, cells.length + clockCount, CARD_W);
  const identity = [...DRUM].map((_, k) => k);
  const charUnits = cells.map((cell, i) => {
    const x = left + CARD_W / 2 + cell.c * PITCH_X;
    const y = yGrid - CARD_H / 2 - cell.r * PITCH_Y;
    bank.place(i, x, y, 1, 0.96 + Math.random() * 0.07);
    const u = makeUnit(bank, i, DRUM, identity, x, y);
    u.row = cell.r;
    u.col = cell.c;
    return u;
  });

  const headerY = yTop - HEADER / 2;
  const clockUnits = [];
  const s = CLOCK_SCALE;
  const clockRight = gridW / 2 - (CARD_W * s) / 2;
  for (let k = 0; k < clockCount; k++) {
    const i = cells.length + k;
    const x = clockRight - (4 - k) * PITCH_X * s;
    bank.place(i, x, headerY, s, 1);
    const chars = k === 2 ? ':' : DIGITS;
    clockUnits.push(makeUnit(bank, i, chars, [...chars].map((c) => DRUM.indexOf(c)), x, headerY));
  }
  bank.addTo(inner);
  const banks = [bank];

  let statusUnit = null;
  if (status) {
    const statusW = status.span * PITCH_X - (PITCH_X - CARD_W);
    const words = wordAtlas(statusW, status.words);
    const sBank = new Bank(atlasTexture(words.canvas, glyphs.anisotropy), words.grid, 1, statusW);
    const sx = left + statusFrom * PITCH_X + statusW / 2;
    const sy = yGrid - CARD_H / 2 - status.row * PITCH_Y;
    sBank.place(0, sx, sy, 1, 1);
    sBank.addTo(inner);
    statusUnit = makeUnit(sBank, 0, status.words, status.words.map((_, k) => k), sx, sy);
    banks.push(sBank);
  }

  const titleTex = labelTexture(title, { cap: 0.32, height: 0.7, icon });
  const titleMesh = new Mesh(
    new PlaneGeometry(titleTex.width, titleTex.height),
    new MeshBasicMaterial({ map: titleTex.tex, transparent: true, toneMapped: false }),
  );
  titleMesh.position.set(left + titleTex.width / 2, headerY, 0.002);
  inner.add(titleMesh);
  if (clock) {
    const city = labelTexture('DUBAI', { cap: 0.22, height: 0.6 });
    const cityMesh = new Mesh(
      new PlaneGeometry(city.width, city.height),
      new MeshBasicMaterial({ map: city.tex, transparent: true, toneMapped: false }),
    );
    const clockLeft = clockRight - 4 * PITCH_X * s - (CARD_W * s) / 2;
    cityMesh.position.set(clockLeft - 0.28 - city.width / 2, headerY, 0.002);
    inner.add(cityMesh);
  }

  const units = [...charUnits, ...clockUnits, ...(statusUnit ? [statusUnit] : [])];
  units.forEach(rest);
  banks.forEach((b) => b.flush());

  return {
    group,
    width: W * scale,
    height: H * scale,
    // lines: array of strings, one per row; flips start at `at` in a wave from the left
    setLines(lines, at = performance.now()) {
      for (const u of charUnits) {
        const ch = (lines[u.row] ?? '')[u.col] ?? ' ';
        setTarget(u, ch, at + u.col * 14 + u.row * 50 + Math.random() * 120);
      }
    },
    setStatus(word, at = performance.now()) {
      if (statusUnit) setTarget(statusUnit, word, at);
    },
    setClock(hhmm, at = performance.now()) {
      clockUnits.forEach((u, k) => setTarget(u, hhmm[k], at));
    },
    update(now) {
      const { busy, flips } = stepUnits(units, now);
      if (busy || flips) banks.forEach((b) => b.flush());
      return busy;
    },
  };
}

export function sharedGlyphs(atlas, anisotropy) {
  return { texture: atlasTexture(atlas.canvas, anisotropy), grid: atlas.grid, anisotropy };
}
