import { LAYOUTS, layoutFor, flightStatus, boardTitle, dubaiClock } from './content.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ departure board */

// Plain HTML version of the board, used when WebGL is unavailable.
function flatBoard(host) {
  const L = LAYOUTS[layoutFor(host.clientWidth || window.innerWidth)];
  const status = flightStatus();
  const statusFrom = L.cols - L.status.span;
  const board = document.createElement('div');
  board.className = 'flat-board';
  board.style.setProperty('--cols', L.cols);

  const head = document.createElement('div');
  head.className = 'flat-board__head';
  const title = document.createElement('span');
  title.textContent = boardTitle(status);
  const clock = document.createElement('span');
  clock.textContent = `Dubai ${dubaiClock()}`;
  head.append(title, clock);
  board.append(head);

  L.lines.forEach((line, r) => {
    for (let c = 0; c < L.cols; c++) {
      if (r === L.status.row && c === statusFrom) {
        const remark = document.createElement('span');
        remark.className = 'flat-board__status';
        remark.style.gridColumn = `span ${L.status.span}`;
        remark.textContent = status;
        board.append(remark);
      }
      if (r === L.status.row && c >= statusFrom) continue;
      const cell = document.createElement('span');
      cell.className = 'flat-board__cell';
      const ch = line[c] ?? ' ';
      cell.textContent = ch === '>' ? '→' : ch;
      board.append(cell);
    }
  });

  host.replaceChildren(board);
  host.style.aspectRatio = 'auto';
  host.classList.add('is-flat', 'is-ready');
}

const host = document.querySelector('[data-board]');
const caption = document.querySelector('[data-board-caption]');

function wireSound(board) {
  if (!caption || reducedMotion) return;
  caption.hidden = false;
  const button = caption.querySelector('[data-sound]');
  const label = button.querySelector('[data-sound-label]');
  button.addEventListener('click', () => {
    const wanted = button.getAttribute('aria-pressed') !== 'true';
    const on = board.setSound(wanted) === true;
    button.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Sound on' : 'Sound off';
  });
}

if (host) {
  import('./board.js')
    .then(({ mountBoard }) =>
      mountBoard(host, {
        reducedMotion,
        onLost: () => {
          if (caption) caption.hidden = true;
          flatBoard(host);
        },
      }),
    )
    .then((board) => (board ? wireSound(board) : flatBoard(host)))
    .catch((error) => {
      console.warn('Departure board: using the plain HTML version.', error);
      flatBoard(host);
    });
}

/* ------------------------------------------------------------ search race */

// Runs both lanes in real time: 14 s straight to Sabre against 1.5 s from Redis.
const race = document.querySelector('[data-race]');
if (race) {
  const run = race.querySelector('[data-race-run]');
  const lanes = [...race.querySelectorAll('[data-lane]')].map((el) => ({
    el,
    secs: Number(el.dataset.lane),
    fill: el.querySelector('.lane__fill'),
    time: el.querySelector('.lane__time'),
  }));
  const total = Math.max(...lanes.map((l) => l.secs));
  let raf = 0;

  run.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    const start = performance.now();
    race.classList.add('is-running');
    run.textContent = 'Restart';
    lanes.forEach((l) => l.el.classList.remove('is-done'));

    const step = (now) => {
      const t = Math.min((now - start) / 1000, total);
      for (const l of lanes) {
        const lt = Math.min(t, l.secs);
        l.fill.style.width = `${(lt / total) * 100}%`;
        l.time.textContent = `${lt.toFixed(1)} s`;
        if (t >= l.secs) l.el.classList.add('is-done');
      }
      if (t < total) {
        raf = requestAnimationFrame(step);
      } else {
        race.classList.remove('is-running');
        run.textContent = 'Run it again';
      }
    };
    raf = requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------ copy email */

const copyStatus = document.querySelector('[data-copy-status]');
document.querySelectorAll('[data-copy]').forEach((button) => {
  const label = button.textContent;
  let timer = 0;
  button.addEventListener('click', async () => {
    let message = 'Copied';
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch {
      message = 'Copy failed';
    }
    button.textContent = message;
    if (copyStatus) copyStatus.textContent = message === 'Copied' ? 'Email address copied' : message;
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.textContent = label;
    }, 1800);
  });
});
