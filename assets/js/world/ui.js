// Everything drawn in HTML on top of the world.
import { Vector3 } from '../../vendor/three.min.js';
import { CHAPTERS, EMAIL } from './story.js';

const $ = (sel) => document.querySelector(sel);
const v = new Vector3();

export class UI {
  constructor({ onChapter, onNext, onAction, onFly, onHold, onExit, onTime, onZombie }) {
    this.cardEl = $('[data-card]');
    this.promptEl = $('[data-prompt]');
    this.fadeEl = $('[data-fade]');
    this.labelsEl = $('[data-labels]');
    this.flightEl = $('[data-flight]');
    this.toastEl = $('[data-toast]');
    this.onAction = onAction;
    this.current = -1;
    this.floats = new Set();

    // flight panel
    this.flightEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fly]');
      if (b) onFly(b.dataset.fly);
    });
    for (const b of this.flightEl.querySelectorAll('[data-hold]')) {
      const set = (on) => () => onHold(b.dataset.hold, on);
      b.addEventListener('pointerdown', set(true));
      b.addEventListener('pointerup', set(false));
      b.addEventListener('pointerleave', set(false));
      b.addEventListener('pointercancel', set(false));
    }
    // driving panel
    this.driveEl = $('[data-drive]');
    this.driveEl.querySelector('[data-exit]').addEventListener('click', () => onExit());
    // destination picker
    this.pickerEl = $('[data-picker]');
    // zombie mode
    this.zombieEl = $('[data-zombie]');
    this.zombieEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-zact]');
      if (b) onZombie?.(b.dataset.zact);
    });
    this.biteEl = $('[data-bite]');
    // the clock: shows the world's time, and swaps day for night
    this.timeEl = $('[data-time]');
    this.timeText = this.timeEl.querySelector('[data-time-text]');
    this.timeLabel = this.timeEl.querySelector('[data-time-label]');
    this.timeEl.addEventListener('click', () => onTime?.());
    this.shownTime = '';

    // chapter bar
    const list = $('[data-chapters]');
    this.chapterButtons = CHAPTERS.map((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span> ${c.short}`;
      b.addEventListener('click', () => onChapter(i));
      li.append(b);
      list.append(li);
      return b;
    });

    // card actions
    this.cardEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'close') this.card(null);
      else if (action === 'next') onNext(this.current);
      else if (action === 'prev') onChapter(Math.max(0, this.current - 1));
      else if (action === 'copy') this.copy();
      else onAction(action);
    });

    // help panel
    const help = $('[data-help]');
    const helpPanel = $('[data-help-panel]');
    help.addEventListener('click', () => {
      const open = helpPanel.hidden;
      helpPanel.hidden = !open;
      help.setAttribute('aria-expanded', String(open));
    });
    helpPanel.querySelector('button').addEventListener('click', () => {
      helpPanel.hidden = true;
      help.setAttribute('aria-expanded', 'false');
    });

    // floating labels over each stop
    this.labels = CHAPTERS.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stop-label';
      b.tabIndex = -1;
      b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${c.short}`;
      b.addEventListener('click', () => onNext(i - 1, true));
      this.labelsEl.append(b);
      return b;
    });
  }

  progress(k) {
    const bar = $('[data-progress]');
    if (bar) bar.style.transform = `scaleX(${k})`;
    const pct = $('[data-progress-text]');
    if (pct) pct.textContent = `${Math.round(k * 100)}%`;
  }

  ready() {
    const loader = $('[data-loader]');
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 700);
    document.body.classList.add('is-ready');
  }

  fail(message) {
    const loader = $('[data-loader]');
    loader.classList.add('is-failed');
    loader.querySelector('[data-loader-status]').textContent = message;
  }

  fade(on) {
    this.fadeEl.classList.toggle('is-on', on);
    return new Promise((resolve) => setTimeout(resolve, on ? 380 : 50));
  }

  chapter(i) {
    this.chapterButtons.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'step' : 'false'));
  }

  card(chapter) {
    if (!chapter) {
      this.cardEl.hidden = true;
      return;
    }
    this.current = chapter.index;
    const last = chapter.index === CHAPTERS.length - 1;
    const nextLabel = chapter.id === 'gate' ? 'Fly to Dubai' : last ? 'Back to the start' : `Next: ${CHAPTERS[chapter.index + 1].short}`;
    this.cardEl.innerHTML = `
      <button type="button" class="card__close" data-action="close" aria-label="Close">×</button>
      <p class="card__kicker">${chapter.kicker}</p>
      <h2 class="card__title">${chapter.title}</h2>
      <div class="card__body">${chapter.html}</div>
      <div class="card__nav">
        ${chapter.index > 0 ? '<button type="button" class="card__link" data-action="prev">← Previous</button>' : '<span></span>'}
        <button type="button" class="card__btn card__btn--go" data-action="next">${nextLabel} →</button>
      </div>`;
    this.cardEl.hidden = false;
    this.cardEl.scrollTop = 0;
  }

  prompt(textValue, fn) {
    if (textValue === this.promptText) {
      this.promptFn = fn;
      return;
    }
    this.promptText = textValue;
    if (!textValue) {
      this.promptEl.hidden = true;
      this.promptFn = null;
      return;
    }
    this.promptFn = fn;
    this.promptEl.hidden = false;
    this.promptEl.innerHTML = `<button type="button"><kbd>E</kbd> ${textValue}</button>`;
    this.promptEl.querySelector('button').addEventListener('click', () => this.promptFn?.());
  }

  triggerPrompt() {
    this.promptFn?.();
  }

  // The flight panel. state: { mode, dest, alt, speed, onGround, banner } or null to hide.
  // The zombie panel: lives and knock-downs. null hides it.
  zombie(state) {
    this.zombieEl.hidden = !state;
    if (!state) return;
    const hearts = this.zombieEl.querySelector('[data-zhearts]');
    if (hearts.childElementCount !== state.max) hearts.replaceChildren(...Array.from({ length: state.max }, () => document.createElement('i')));
    [...hearts.children].forEach((h, i) => h.classList.toggle('is-lost', i >= state.hearts));
    hearts.setAttribute('aria-label', `${state.hearts} of ${state.max} lives`);
    this.zombieEl.querySelector('[data-zdowned]').textContent = String(state.downed);
  }

  // A red pulse round the edges: bitten.
  flash() {
    this.biteEl.classList.add('is-on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.biteEl.classList.remove('is-on')));
  }

  // Shown to the nearest ten minutes, so it ticks over calmly.
  clock(hour, night) {
    const total = Math.floor((hour * 60) / 10) * 10;
    const text = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    if (text + night === this.shownTime) return;
    this.shownTime = text + night;
    this.timeText.textContent = text;
    this.timeEl.classList.toggle('is-night', night);
    this.timeLabel.textContent = night ? ', switch to day' : ', switch to night';
  }

  flight(state) {
    const el = this.flightEl;
    el.hidden = !state;
    document.body.classList.toggle('is-flying', Boolean(state));
    if (!state) return;
    const q = (sel) => el.querySelector(sel);
    const labels = { auto: 'Autopilot', manual: 'Manual', rescue: 'Rescue', rollout: 'Landed' };
    q('[data-fmode]').textContent = labels[state.mode] ?? state.mode;
    q('[data-fmode]').dataset.mode = state.mode;
    q('[data-froute]').textContent = state.mode === 'manual' ? 'you have the controls' : `to ${state.dest}`;
    q('[data-falt]').textContent = state.alt;
    q('[data-fspd]').textContent = state.speed;
    const show = (sel, on) => (q(sel).hidden = !on);
    show('[data-fly="control"]', state.mode === 'auto');
    q('[data-fly="control"]').disabled = Boolean(state.onGround);
    show('[data-fly="auto-dubai"]', state.mode === 'manual');
    show('[data-fly="auto-kerala"]', state.mode === 'manual');
    show('[data-fly="skip"]', state.mode === 'auto');
    for (const b of el.querySelectorAll('[data-hold]')) b.hidden = state.mode !== 'manual';
    const touch = document.body.classList.contains('is-touch');
    q('[data-fhelp]').textContent = state.mode === 'manual'
      ? (touch ? 'Stick: climb, dive, bank. Land gently on a runway, or hand back to autopilot.' : '↑ ↓ climb and dive · ← → bank · Shift faster · Space slower · land gently on a runway')
      : state.mode === 'auto' ? (touch ? 'Use the stick to fly it yourself.' : 'Press any arrow key to fly it yourself.') : '';
    if (state.banner) {
      const b = q('[data-fbanner]');
      b.textContent = state.banner;
      b.hidden = false;
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => (b.hidden = true), 2600);
    }
  }

  // The driving panel. state: { kind: 'drive' | 'taxi', speed, dest } or null.
  drive(state) {
    const el = this.driveEl;
    el.hidden = !state;
    document.body.classList.toggle('is-driving', Boolean(state));
    if (!state) return;
    el.querySelector('[data-dwhat]').textContent = state.kind === 'taxi'
      ? (state.dest ? `Taxi to ${state.dest}` : 'Taxi')
      : 'Driving';
    el.querySelector('[data-dspeed]').textContent = Math.round(Math.abs(state.speed ?? 0) * 3.6);
    el.querySelector('[data-dhelp]').hidden = state.kind !== 'drive' || document.body.classList.contains('is-touch');
  }

  // Ask where to go. Resolves with the chosen index, or null.
  pick(title, options) {
    const el = this.pickerEl;
    el.querySelector('[data-ptitle]').textContent = title;
    const list = el.querySelector('[data-plist]');
    list.replaceChildren();
    el.hidden = false;
    return new Promise((resolve) => {
      const done = (value) => {
        el.hidden = true;
        window.removeEventListener('keydown', onKey);
        this.cancelPick = null;
        resolve(value);
      };
      const onKey = (e) => e.key === 'Escape' && done(null);
      window.addEventListener('keydown', onKey);
      options.forEach((name, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.addEventListener('click', () => done(i));
        li.append(b);
        list.append(li);
      });
      el.querySelector('[data-pcancel]').onclick = () => done(null);
      list.querySelector('button')?.focus();
      this.cancelPick = () => done(null);
    });
  }

  toast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('is-on'), 1800);
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(EMAIL);
      this.toast('Email address copied');
    } catch {
      this.toast(EMAIL);
    }
  }

  // A small label that follows a point in the world (the search race).
  floating(textValue, kind) {
    const el = document.createElement('div');
    el.className = `float-label float-label--${kind}`;
    el.textContent = textValue;
    this.labelsEl.append(el);
    const item = { el, pos: new Vector3() };
    this.floats.add(item);
    return {
      text: (t) => (el.textContent = t),
      at: (p) => item.pos.copy(p),
      done: () => el.classList.add('is-done'),
      remove: () => {
        el.remove();
        this.floats.delete(item);
      },
    };
  }

  // Place labels: stop names over the map, and the race labels.
  place(camera, stops, playerPos, hidden) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    stops.forEach((s, i) => {
      const el = this.labels[i];
      const d = Math.hypot(playerPos.x - s.x, playerPos.z - s.z);
      v.set(s.x, 7.5, s.z).project(camera);
      const show = !hidden && d > s.radius + 4 && d < 230 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.classList.toggle('is-on', show);
      if (show) {
        el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
        el.style.opacity = String(Math.max(0.35, 1 - d / 260));
      }
    });
    for (const item of this.floats) {
      v.copy(item.pos).project(camera);
      const show = v.z < 1;
      item.el.style.visibility = show ? 'visible' : 'hidden';
      item.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -140%)`;
    }
  }
}
