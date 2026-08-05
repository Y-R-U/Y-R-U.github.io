// One registry for everything that can be looked at: scenarios, camera moves, panels, stories,
// fx and fleets. Reached by ?showroom=1, the corner button, or tools/shot.mjs --all.

const GROUPS = ['scene', 'camera', 'fleet', 'fx', 'panel', 'story', 'misc'];

const entries = new Map();
const expected = new Set();
const hooks = new Set();
const after = new Set();
let ctx = null;
let current = null;
let ui = null;
let tab = 'scene';

export const showroom = {
  register(e) {
    if (!GROUPS.includes(e.group)) e.group = 'misc';
    entries.set(e.id, e);
    ui?.rebuild();
    return e;
  },

  // Anything that should have an entry declares itself here; missing() is the completeness report.
  expect(kind, id) { expected.add(`${kind}:${id}`); },

  list() { return [...entries.values()]; },
  ids(group) { return this.list().filter(e => !group || e.group === group).map(e => e.id); },
  get(id) { return entries.get(id); },
  missing() { return [...expected].filter(k => !entries.has(k.split(':').slice(1).join(':'))); },
  get current() { return current; },

  // Fires before an entry runs, so a component can stand down whatever it left on screen when
  // the sweep moves to somebody else's entry.
  onRun(fn) { hooks.add(fn); return () => hooks.delete(fn); },
  // After the entry has placed its camera — that is when "this framing is home" is true.
  onAfterRun(fn) { after.add(fn); return () => after.delete(fn); },

  run(id) {
    const e = entries.get(id);
    if (!e || !ctx) return false;
    for (const fn of hooks) fn(e);
    current = id;
    e.run(ctx);
    for (const fn of after) fn(e);
    const u = new URL(location.href);
    u.searchParams.set('sr', id);
    history.replaceState(null, '', u);
    ui?.sync();
    if (ui && narrowScreen()) ui.mini();
    return true;
  },

  // Stepping stays inside the tab you are standing in — sweeping thirty stories is the point of
  // the tabs, and falling out of them into the fleet entries halfway through is not.
  step(dir) {
    const within = this.list().filter(e => e.group === (entries.get(current)?.group || tab));
    const ids = (within.length ? within : this.list()).map(e => e.id);
    if (!ids.length) return;
    const i = ids.indexOf(current);
    this.run(ids[(i + dir + ids.length) % ids.length]);
  },

  get tab() { return tab; },
  setTab(g) { tab = g; ui?.rebuild(); },

  open() { ui?.open(); },
  close() { ui?.close(); },
};

// Desktop keeps the list beside the scene; a phone has to hand the screen over to the entry.
const narrowScreen = () => matchMedia('(max-width: 759px)').matches;

export function buildShowroom(app) {
  ctx = { app, showroom };

  const root = document.getElementById('showroom');
  const list = document.getElementById('showroom-list');
  const title = document.getElementById('sr-title');

  const rebuild = () => {
    const byGroup = new Map();
    for (const e of entries.values()) {
      if (!byGroup.has(e.group)) byGroup.set(e.group, []);
      byGroup.get(e.group).push(e);
    }
    if (!byGroup.size) { list.innerHTML = `<div class="empty">Nothing registered yet.</div>`; return; }
    const live = GROUPS.filter(g => byGroup.has(g));
    if (!byGroup.has(tab)) tab = live[0];
    const es = byGroup.get(tab) || [];
    list.innerHTML = `
<div class="sr-tabs">${live.map(g =>
      `<button data-tab="${g}" class="${g === tab ? 'on' : ''}">${g}<s>${byGroup.get(g).length}</s></button>`).join('')}</div>
<div class="sr-items">${es.map(e =>
      `<button data-sr="${e.id}" class="${e.id === current ? 'on' : ''}">${e.label}${e.note ? `<i>${e.note}</i>` : ''}</button>`).join('')}</div>`;
    list.querySelector('.sr-tabs button.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  };

  const sync = () => {
    const e = current && entries.get(current);
    title.textContent = e ? e.label : 'Showroom';
    // following the entry into its own tab is what makes ← → readable after a jump
    if (e && e.group !== tab) { tab = e.group; rebuild(); }
    list.querySelectorAll('[data-sr]').forEach(b => b.classList.toggle('on', b.dataset.sr === current));
  };

  ui = {
    rebuild: () => { rebuild(); sync(); },
    sync,
    open() { root.classList.add('open'); root.classList.remove('mini'); rebuild(); sync(); },
    close() { root.classList.remove('open', 'mini'); },
    mini() { root.classList.add('mini'); },
    showList() {
      root.classList.remove('mini');
      rebuild();
      list.querySelector(`[data-sr="${current}"]`)?.scrollIntoView({ block: 'center' });
    },
  };

  list.addEventListener('click', e => {
    const g = e.target.closest('[data-tab]')?.dataset.tab;
    if (g) { tab = g; rebuild(); return; }
    const id = e.target.closest('[data-sr]')?.dataset.sr;
    if (id) showroom.run(id);
  });
  document.getElementById('sr-close').onclick = () => ui.close();
  document.getElementById('sr-prev').onclick = () => showroom.step(-1);
  document.getElementById('sr-next').onclick = () => showroom.step(1);
  document.getElementById('sr-list').onclick = () => ui.showList();
  title.onclick = () => ui.showList();
  document.getElementById('showroom-btn').onclick = () => ui.open();
  addEventListener('keydown', e => {
    if (!root.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') showroom.step(-1);
    if (e.key === 'ArrowRight') showroom.step(1);
    if (e.key === 'Escape') root.classList.contains('mini') ? ui.showList() : ui.close();
  });

  ui.rebuild();
  return showroom;
}
