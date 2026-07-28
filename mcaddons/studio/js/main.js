// Boot: build the nav, lazy-load tools, keep the URL hash in sync, open the last project.
import { bus } from './core/bus.js';
import { settings, flag, applyBodyFlags } from './core/store.js';
import { project } from './core/project.js';
import { fs } from './core/fs.js';
import { el, toast, busy } from './core/ui.js';
import { tour, say } from './core/coach.js';
import { sfx } from './core/sfx.js';

const TOOLS = [
  { id: 'home',     title: 'Home',    icon: '🏠', load: () => import('./tools/home.js') },
  { id: 'build',    title: 'Build',   icon: '✨', load: () => import('./tools/build.js'), needsProject: true },
  { id: 'paint',    title: 'Paint',   icon: '🎨', load: () => import('./tools/paint.js'), needsProject: true },
  { id: 'model',    title: 'Model',   icon: '🧱', load: () => import('./tools/model.js'), needsProject: true },
  { id: 'anim',     title: 'Animate', icon: '🤸', load: () => import('./tools/anim.js'), needsProject: true },
  { id: 'test',     title: 'Play',    icon: '🎮', load: () => import('./tools/test.js'), needsProject: true },
  { id: 'files',    title: 'Files',   icon: '📁', load: () => import('./tools/files.js'), needsProject: true },
  { id: 'packer',   title: 'Export',  icon: '📦', load: () => import('./tools/packer.js'), needsProject: true },
  { id: 'settings', title: 'Settings', icon: '⚙️', load: () => import('./tools/settings.js') }
];

const loaded = new Map();     // id -> module.default
const panes = new Map();      // id -> HTMLElement
let currentTool = null;

const $panes = document.getElementById('panes');
const $rail = document.getElementById('railBtns');
const $mob = document.getElementById('mobileNav');

// ------------------------------------------------------------------- nav ---
function buildNav() {
  for (const t of TOOLS) {
    for (const [host, cls] of [[$rail, 'rail-btn'], [$mob, 'rail-btn']]) {
      const b = el('button.' + cls, {
        type: 'button', dataset: { tool: t.id },
        on: { click: () => openTool(t.id) }
      }, [el('span.ico', { text: t.icon }), el('span', { text: t.title })]);
      host.appendChild(b);
    }
    if (t.id === 'home' || t.id === 'test') $rail.appendChild(el('div.rail-sep'));
  }
}

function syncNav() {
  for (const b of document.querySelectorAll('[data-tool]')) {
    const t = TOOLS.find(x => x.id === b.dataset.tool);
    b.classList.toggle('on', b.dataset.tool === currentTool);
    b.disabled = !!(t && t.needsProject && !project.isOpen);
  }
}

export async function openTool(id, args) {
  const t = TOOLS.find(x => x.id === id);
  if (!t) return;
  if (t.needsProject && !project.isOpen) {
    toast('Open or make an add-on first.', 'warn');
    id = 'home';
  }
  if (currentTool && currentTool !== id) {
    const prev = loaded.get(currentTool);
    if (prev && prev.hide) { try { prev.hide(); } catch (e) { console.error(e); } }
    panes.get(currentTool) && panes.get(currentTool).classList.remove('on');
  }
  currentTool = id;
  syncNav();

  let mod = loaded.get(id);
  if (!mod) {
    const b = busy('Opening ' + (TOOLS.find(x => x.id === id) || {}).title + '…');
    try {
      const m = await (TOOLS.find(x => x.id === id)).load();
      mod = m.default;
      loaded.set(id, mod);
      const pane = el('div.pane', { id: 'pane-' + id });
      $panes.appendChild(pane);
      panes.set(id, pane);
      if (mod.mount) await mod.mount(pane);
    } catch (e) {
      console.error(e);
      toast('That tool failed to load: ' + e.message, 'bad', 6000);
      b.done();
      return;
    }
    b.done();
  }
  const pane = panes.get(id);
  pane.classList.add('on');
  if (mod.show) { try { await mod.show(args); } catch (e) { console.error(e); } }
  if (location.hash.slice(1).split('/')[0] !== id) history.replaceState(null, '', '#' + id);
  bus.emit('tool:show', { id, args });
}
window.openTool = openTool;

// --------------------------------------------------------------- top bar ---
function syncTop() {
  const p = project.current;
  document.getElementById('projName').textContent = p ? p.name : 'No add-on open';
  document.getElementById('projNs').textContent = p ? p.namespace + ':' : '';
  document.getElementById('btnCheck').disabled = !p;
  document.getElementById('btnExport').disabled = !p;
}

const dot = () => document.getElementById('saveDot');
bus.on('project:change', () => { dot().classList.add('dirty'); dot().title = 'Saving…'; });
bus.on('project:saved', () => { dot().classList.remove('dirty'); dot().title = 'Saved'; });
bus.on('project:open', syncTop);
bus.on('project:meta', syncTop);
bus.on('project:open', syncNav);

document.getElementById('btnProjects').addEventListener('click', () => openTool('home'));
document.getElementById('btnCheck').addEventListener('click', async () => {
  const m = await import('./tools/files.js');
  openTool('files');
  setTimeout(() => m.default.runCheck && m.default.runCheck(), 60);
});
document.getElementById('btnExport').addEventListener('click', () => openTool('packer'));

// ------------------------------------------------------------- shortcuts ---
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); project.save(); toast('Saved', 'good', 1200); return; }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const map = { '1': 'home', '2': 'build', '3': 'paint', '4': 'model', '5': 'anim', '6': 'test', '7': 'files', '8': 'packer' };
  if (map[e.key]) { openTool(map[e.key]); e.preventDefault(); }
});

// ------------------------------------------------------------------ boot ---
async function boot() {
  applyBodyFlags();
  buildNav();
  syncTop();
  syncNav();

  const wanted = location.hash.slice(1).split('/')[0];
  const last = flag.get('lastProject');
  if (last) {
    try { await project.open(last); } catch (e) { flag.del('lastProject'); }
  }
  await openTool(project.isOpen && wanted && TOOLS.some(t => t.id === wanted) ? wanted : 'home');

  if (!flag.get('welcomed')) {
    flag.set('welcomed', 1);
    setTimeout(() => {
      tour('welcome', [
        { title: 'Hi, I am Blocky!', text: 'This is <b>Addon Studio</b>. Everything you need to make a Minecraft add-on is here — no other apps to install.' },
        { el: '#railBtns', title: 'Your tools', text: 'Paint pictures, build models, make them move, then <b>Play</b> to test it — all down this side.' },
        { el: '#btnExport', title: 'When you are done', text: 'Export gives you a real <b>.mcaddon</b> file. Tap it on your device and Minecraft installs it.' },
        { title: 'One more thing', text: 'These popups can be turned off any time in <b>Settings</b>. Have fun!' }
      ]);
    }, 700);
  }
}

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1).split('/')[0];
  if (id && id !== currentTool && TOOLS.some(t => t.id === id)) openTool(id);
});

window.addEventListener('error', e => {
  console.error(e.error || e.message);
});

boot();

export { TOOLS };
