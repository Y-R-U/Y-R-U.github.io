// One registry for everything that can be looked at: scenarios, camera moves, panels, stories,
// fx and fleets. Reached by ?showroom=1, the corner button, or tools/shot.mjs --all.

const GROUPS = ['scene', 'camera', 'fleet', 'fx', 'panel', 'story', 'misc'];

const entries = new Map();
const expected = new Set();
const hooks = new Set();
let ctx = null;
let current = null;
let ui = null;

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

  run(id) {
    const e = entries.get(id);
    if (!e || !ctx) return false;
    for (const fn of hooks) fn(e);
    current = id;
    e.run(ctx);
    const u = new URL(location.href);
    u.searchParams.set('sr', id);
    history.replaceState(null, '', u);
    ui?.sync();
    return true;
  },

  step(dir) {
    const ids = this.list().map(e => e.id);
    if (!ids.length) return;
    const i = ids.indexOf(current);
    this.run(ids[(i + dir + ids.length) % ids.length]);
  },

  open() { ui?.open(); },
  close() { ui?.close(); },
};

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
    let html = '';
    for (const g of GROUPS) {
      const es = byGroup.get(g);
      if (!es) continue;
      html += `<h5>${g}</h5>` + es.map(e =>
        `<button data-sr="${e.id}" class="${e.id === current ? 'on' : ''}">${e.label}${e.note ? `<i>${e.note}</i>` : ''}</button>`).join('');
    }
    list.innerHTML = html;
  };

  const sync = () => {
    const e = current && entries.get(current);
    title.textContent = e ? e.label : 'Showroom';
    list.querySelectorAll('[data-sr]').forEach(b => b.classList.toggle('on', b.dataset.sr === current));
    document.body.classList.toggle('sr-live', !!current);
  };

  ui = {
    rebuild: () => { rebuild(); sync(); },
    sync,
    open() { root.classList.add('open'); rebuild(); sync(); },
    close() { root.classList.remove('open'); document.body.classList.remove('sr-live'); },
  };

  list.addEventListener('click', e => {
    const id = e.target.closest('[data-sr]')?.dataset.sr;
    if (id) showroom.run(id);
  });
  document.getElementById('sr-close').onclick = () => ui.close();
  document.getElementById('sr-prev').onclick = () => showroom.step(-1);
  document.getElementById('sr-next').onclick = () => showroom.step(1);
  // once an entry is live the list hides itself, so the title bar has to get it back
  title.onclick = () => { current = null; document.body.classList.remove('sr-live'); sync(); };
  document.getElementById('showroom-btn').onclick = () => ui.open();
  addEventListener('keydown', e => {
    if (!root.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') showroom.step(-1);
    if (e.key === 'ArrowRight') showroom.step(1);
    if (e.key === 'Escape') ui.close();
  });

  ui.rebuild();
  return showroom;
}
