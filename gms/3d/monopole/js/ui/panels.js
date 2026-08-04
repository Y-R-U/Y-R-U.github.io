// Bottom sheets. One sheet visible at a time, on a back stack, over a live 3D scene that keeps
// running and keeps taking gestures. Nothing here ever blocks the game.

import { showroom } from '../showroom/index.js';
import content from '../sim/content.js';
import { esc } from './format.js';
import { fixtureView, fixtureProps } from './fixture.js';

const registry = new Map();
const stack = [];
let host = { sim: null, root: null };
let live = null;             // the real sim view, kept while a fixture is on screen
let onStackChange = null;
let onSimChange = null;

export function definePanel(def) {
  if (!def || !def.id) throw new Error('definePanel: needs an id');
  registry.set(def.id, def);
  showroom.expect('panel', def.id);
  showroom.register({
    id: def.id,
    group: 'panel',
    label: def.title || def.id,
    note: def.group || '',
    run: () => panels.showFixture(def.id),
  });
  return def;
}

export function getPanel(id) { return registry.get(id); }
export function allPanels() { return [...registry.values()]; }

export const panels = {
  attach({ sim, root = document.getElementById('sheet'), onChange = null } = {}) {
    host = { sim, root };
    live = sim;
    onStackChange = onChange;
    if (root && !root.__wired) wireRoot(root);
    return panels;
  },

  get sim() { return host.sim; },

  // The HUD follows the panels between the live company and the showroom fixture, and lights
  // the dock button for whatever is on top.
  onSim(fn) { onSimChange = fn; return panels; },
  onStack(fn) { onStackChange = fn; return panels; },

  open(id, props = {}) {
    if (!registry.has(id)) return false;
    const i = stack.findIndex(s => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    stack.push({ id, props });
    draw();
    return true;
  },

  // Replace the top of the stack instead of deepening it — for sibling navigation.
  swap(id, props = {}) {
    if (!registry.has(id)) return false;
    if (stack.length) stack.pop();
    return panels.open(id, props);
  },

  close(id) {
    if (!stack.length) return false;
    if (id && stack[stack.length - 1].id !== id) {
      const i = stack.findIndex(s => s.id === id);
      if (i < 0) return false;
      stack.splice(i, 1);
      draw();
      return true;
    }
    stack.pop();
    draw();
    return true;
  },

  closeAll() { stack.length = 0; draw(); },

  isOpen(id) { return id ? stack.some(s => s.id === id) : stack.length > 0; },
  top() { return stack.length ? stack[stack.length - 1] : null; },
  depth() { return stack.length; },

  // Re-render the visible sheet in place. Cheap enough to call on every tick.
  refresh() { if (stack.length) draw(); },

  // Showroom: swap in the canned week-11 fixture, open one panel against it.
  showFixture(id, override = null) {
    const def = registry.get(id);
    if (!def) return false;
    host.sim = fixtureView();
    stack.length = 0;
    stack.push({ id, props: override || (def.fixture ? def.fixture(host.sim, content) : fixtureProps(id, host.sim)) });
    document.body.classList.add('fixture');
    onSimChange?.(host.sim);
    draw();
    return true;
  },

  useLive() {
    host.sim = live;
    document.body.classList.remove('fixture');
    onSimChange?.(live);
    draw();
  },
};

function api(entry) {
  return {
    props: entry.props,
    sim: host.sim,
    content,
    close: () => panels.close(entry.id),
    open: (id, props) => panels.open(id, props),
    swap: (id, props) => panels.swap(id, props),
    back: () => panels.close(),
    rerender: () => draw(),
    isOpen: id => panels.isOpen(id),
  };
}

function draw() {
  const root = host.root;
  if (!root) return;
  const entry = stack[stack.length - 1];
  document.body.classList.toggle('sheet-open', !!entry);
  // whatever is on top is on the body, so a panel can restyle the shell around it (the end card
  // takes the whole screen) and get it back on every dismissal path for free
  document.body.dataset.panel = entry ? entry.id : '';
  onStackChange?.(entry ? entry.id : null, stack.length);

  if (!entry) { root.innerHTML = ''; return; }
  const def = registry.get(entry.id);
  const a = api(entry);
  let body = '';
  try {
    body = def.render(entry.props, a);
  } catch (err) {
    body = `<div class="pad"><p class="warn">This panel threw while rendering.</p><pre class="tiny">${esc(err.message)}</pre></div>`;
    console.error(`panel ${entry.id}:`, err);
  }

  const wasOpen = root.querySelector('.sheet')?.dataset.panel === entry.id;
  root.innerHTML = `
    <div class="sheet ${wasOpen ? 'settled' : ''}" data-panel="${esc(entry.id)}" role="dialog" aria-label="${esc(def.title || entry.id)}">
      <div class="sheet-grab"><span></span></div>
      <header class="sheet-head">
        ${stack.length > 1 ? '<button class="sheet-nav" data-sheet-back aria-label="Back">‹</button>' : '<span class="sheet-nav ghost"></span>'}
        <div class="sheet-title">
          <b>${esc(def.title || entry.id)}</b>
          ${def.group ? `<i>${esc(def.group)}</i>` : ''}
        </div>
        <button class="sheet-nav" data-sheet-close aria-label="Close">✕</button>
      </header>
      <div class="sheet-body">${typeof body === 'string' ? body : ''}</div>
    </div>`;

  const sheet = root.querySelector('.sheet');
  const bodyEl = sheet.querySelector('.sheet-body');
  if (body && typeof body !== 'string') bodyEl.appendChild(body);
  // The CTA row is written inside the panel's markup but it is a footer, not content: left in the
  // scroll area a `position: sticky` row floats over the last lines of text and clips them. Lift
  // it out so the body scrolls above it and nothing is ever hidden.
  for (const cta of bodyEl.querySelectorAll('.sheet-cta')) sheet.appendChild(cta);
  def.mount?.(sheet, entry.props, a);
  requestAnimationFrame(() => sheet.classList.add('settled'));
}

function wireRoot(root) {
  root.__wired = true;

  root.addEventListener('click', e => {
    if (e.target.closest('[data-sheet-close]')) return panels.closeAll();
    if (e.target.closest('[data-sheet-back]')) return panels.close();
    const t = e.target.closest('[data-open]');
    if (t) {
      const props = t.dataset.props ? JSON.parse(t.dataset.props) : {};
      return t.hasAttribute('data-swap') ? panels.swap(t.dataset.open, props) : panels.open(t.dataset.open, props);
    }
  });

  addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) panels.close(); });

  // Drag the grab bar down to dismiss. Only the header area starts a drag, so a scroll inside the
  // body is never stolen by it.
  let id = null, y0 = 0, t0 = 0, dy = 0, sheet = null;
  root.addEventListener('pointerdown', e => {
    const head = e.target.closest('.sheet-grab, .sheet-head');
    if (!head || e.target.closest('button')) return;
    sheet = head.closest('.sheet');
    id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0;
    sheet.style.transition = 'none';
    head.setPointerCapture?.(id);
  });
  root.addEventListener('pointermove', e => {
    if (e.pointerId !== id || !sheet) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!sheet) return;
    const v = dy / Math.max(1, performance.now() - t0);
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 96 || v > 0.6) panels.close();
    id = null; sheet = null; dy = 0;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}

export default panels;
