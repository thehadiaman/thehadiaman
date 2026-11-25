// Everything drawn in HTML on top of the world.
import { Vector3 } from '../../vendor/three.min.js';
import { CHAPTERS, EMAIL } from './story.js';

const $ = (sel) => document.querySelector(sel);
const v = new Vector3();

export class UI {
  constructor({ onChapter, onNext, onAction }) {
    this.cardEl = $('[data-card]');
    this.promptEl = $('[data-prompt]');
    this.fadeEl = $('[data-fade]');
    this.labelsEl = $('[data-labels]');
    this.flightEl = $('[data-flight]');
    this.toastEl = $('[data-toast]');
    this.onAction = onAction;
    this.current = -1;
    this.floats = new Set();

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
    if (!textValue) {
      this.promptEl.hidden = true;
      this.promptFn = null;
      return;
    }
    this.promptFn = fn;
    this.promptEl.hidden = false;
    this.promptEl.innerHTML = `<button type="button"><kbd>E</kbd> ${textValue}</button>`;
    this.promptEl.querySelector('button').addEventListener('click', () => fn());
  }

  triggerPrompt() {
    this.promptFn?.();
  }

  flightBanner(on, onSkip) {
    this.flightEl.hidden = !on;
    document.body.classList.toggle('is-flying', on);
    if (on) {
      const skip = this.flightEl.querySelector('button');
      skip.onclick = () => onSkip();
    }
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
