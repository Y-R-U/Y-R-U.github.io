// Packer — export/import .mcaddon (the NanaZip replacement). One big friendly button,
// pack details, install instructions and a "what's inside" summary a child can learn from.
import { fs } from '../core/fs.js';
import { project } from '../core/project.js';
import { bus } from '../core/bus.js';
import { el, clear, button, toast, modal, confirmBox, busy, pickFile, row, textField } from '../core/ui.js';
import { tour, award } from '../core/coach.js';
import { lintProject } from '../core/validate.js';
import { download, zipSupport } from '../core/pack.js';
import { FORMAT } from '../lib/bedrock.js';

const CSS = `
.pk-root { flex:1; overflow:auto; padding:20px; }
.pk-wrap { max-width:760px; margin:0 auto; display:flex; flex-direction:column; gap:18px; }
.pk-hero { display:flex; flex-direction:column; align-items:center; gap:10px; padding:26px 16px; text-align:center; }
.pk-hero-icon { font-size:3.6em; }
.pk-hero p { max-width:440px; }
.pk-hero .btn.big { min-width:240px; min-height:52px; font-size:1.1em; }
.pk-warn { display:flex; gap:10px; align-items:center; background:rgba(255,200,60,.12);
  border:2px solid var(--gold); border-radius:10px; padding:12px 14px; color:#e9d38a; }
.pk-form-grid { display:flex; flex-direction:column; gap:4px; }
.pk-num-row { display:flex; gap:8px; }
.pk-num-row input { width:70px; text-align:center; }
.pk-icons-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
.pk-icon-box { text-align:center; }
.pk-icon-box .lbl { font-size:.78em; color:var(--dim); margin-bottom:4px; }
.pk-icon-box img, .pk-icon-box .none { width:64px; height:64px; border:2px solid #000; border-radius:8px; display:block; }
.pk-icon-box .none { background:var(--panel2); display:grid; place-items:center; color:var(--dim); font-size:.75em; }
.pk-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.pk-tab { display:flex; align-items:center; gap:6px; padding:9px 14px; min-height:40px; border-radius:8px;
  border:2px solid var(--edge); background:var(--panel2); color:var(--text); cursor:pointer; font-family:var(--ui); font-size:.92em; }
.pk-tab.on { border-color:var(--grass); background:var(--panel3); }
.pk-tab-content { display:flex; flex-direction:column; gap:8px; }
.pk-step { background:var(--panel2); border:2px solid var(--edge); border-radius:8px; padding:10px 12px; font-size:.94em; }
.pk-import-counts { display:flex; gap:10px; flex-wrap:wrap; margin:10px 0; }
.pk-chip { display:flex; align-items:center; gap:6px; background:var(--panel2); border:2px solid var(--edge);
  border-radius:999px; padding:8px 14px; }
.pk-chip b { color:var(--gold); }
.pk-biggest { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
.pk-biggest-row { display:flex; justify-content:space-between; gap:10px; font-family:var(--mono); font-size:.82em;
  color:var(--dim); background:var(--panel2); border-radius:6px; padding:5px 9px; }
.pk-biggest-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pk-problem { border-bottom:1px solid var(--edge); padding:10px 0; }
.pk-problem:last-child { border-bottom:none; }
.pk-problem-file { font-family:var(--mono); font-size:.8em; color:var(--dim); }
.pk-problem p { margin:3px 0; }
.pk-problem small { color:var(--dim); }

@media (max-width:900px) {
  .pk-root { padding:14px; }
  .pk-hero .btn.big { width:100%; }
}
`;

function injectCSS() {
  if (!document.getElementById('packer-css')) document.head.appendChild(el('style#packer-css', { text: CSS }));
}

let root;

// ================================================================ helpers ====
function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function computeSummary() {
  const paths = fs.list();
  const sizes = paths.map(p => ({ path: p, size: (fs.bytes(p) || []).length }));
  const total = sizes.reduce((a, b) => a + b.size, 0);
  const biggest = [...sizes].sort((a, b) => b.size - a.size).slice(0, 6);
  return {
    mobs: fs.findAll('BP/entities/*.json').length,
    items: fs.findAll('BP/items/*.json').length,
    blocks: fs.findAll('BP/blocks/*.json').length,
    textures: paths.filter(p => p.endsWith('.png')).length,
    files: paths.length,
    total, biggest
  };
}

function countChip(icon, n, label) { return el('div.pk-chip', {}, [el('span', { text: icon }), el('b', { text: String(n) }), el('span', { text: label })]); }

function updateManifests(patch) {
  for (const kind of ['BP', 'RP']) {
    const path = `${kind}/manifest.json`;
    const m = fs.readJSON(path); if (!m) continue;
    m.header = m.header || {};
    if (patch.name !== undefined) {
      m.header.name = patch.name + ' ' + kind;
      if (!patch.description) m.header.description = kind === 'BP' ? 'Behaviour pack for ' + patch.name : 'Resource pack for ' + patch.name;
    }
    if (patch.description) m.header.description = patch.description;
    if (patch.author !== undefined) m.metadata = { ...(m.metadata || {}), authors: [patch.author] };
    if (patch.version) {
      m.header.version = patch.version;
      if (m.modules && m.modules[0]) m.modules[0].version = patch.version;
      if (m.dependencies && m.dependencies[0]) m.dependencies[0].version = patch.version;
    }
    if (patch.minEngine) m.header.min_engine_version = patch.minEngine;
    fs.writeJSON(path, m);
  }
}

// ============================================================ export flow ====
async function doExport() {
  const problems = lintProject();
  const errors = problems.filter(p => p.level === 'error');
  if (errors.length) { showProblemsModal(errors); return; }
  award('clean-pack');
  await runExport();
}

function showProblemsModal(errors) {
  const body = el('div', {}, [
    el('p', { text: `Fix these ${errors.length} thing${errors.length === 1 ? '' : 's'} so Minecraft can read your pack properly — or export anyway and fix them later.` }),
    ...errors.slice(0, 20).map(p => el('div.pk-problem', {}, [
      el('div.pk-problem-file', { text: p.path }),
      el('b', { text: p.title }),
      el('p', { text: p.detail }),
      el('small', { text: p.fix })
    ])),
    errors.length > 20 ? el('p', { style: { color: 'var(--dim)' }, text: `…and ${errors.length - 20} more.` }) : null
  ]);
  modal({
    title: `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix first`, icon: '🚧', wide: true, body,
    buttons: [
      { label: 'Export anyway', kind: 'ghost', onClick: () => runExport() },
      { label: 'Fix these first', kind: 'primary', onClick: () => window.openTool('files') }
    ]
  });
}

async function runExport() {
  const b = busy('Packing your add-on…');
  try {
    const { blob, filename } = await project.exportBlob();
    download(blob, filename);
    award('first-export');
    b.done();
    toast('Exported ' + filename + ' (' + humanSize(blob.size) + ')', 'good', 4000);
    modal({
      title: 'Packed! 🎉', icon: '📦',
      body: el('div', {}, [
        el('p', {}, [el('b', { text: filename })]),
        el('p', { text: humanSize(blob.size) }),
        el('p', { style: { color: 'var(--dim)' }, text: 'Tap the file on your device (or check your Downloads folder) and Minecraft will install it.' })
      ]),
      buttons: [{ label: 'Nice!', kind: 'good' }]
    });
  } catch (e) {
    b.done();
    console.error(e);
    toast('Could not export: ' + e.message, 'bad', 5000);
  }
}

// ============================================================ panel: hero ====
function renderExportButton(wrap) {
  const box = el('div.pk-hero');
  box.appendChild(el('div.pk-hero-icon', { text: '📦' }));
  box.appendChild(el('h1.panel-title', { text: 'MAKE MY .MCADDON' }));
  box.appendChild(el('p', { style: { color: 'var(--dim)' }, text: 'This checks your add-on for mistakes, then builds the real file you tap to install into Minecraft.' }));
  const bigBtn = button('📦 Make my .mcaddon', { kind: 'good', onClick: doExport, hint: 'Builds the .mcaddon file you tap to install into Minecraft.' });
  bigBtn.classList.add('big');
  box.appendChild(bigBtn);
  wrap.appendChild(box);
}

function renderZipWarning(wrap) {
  if (zipSupport.compress) return;
  wrap.appendChild(el('div.pk-warn', {}, [
    el('span', { text: '⚠️' }),
    el('span', { text: 'Your browser cannot shrink files, so the download will be a little bigger than usual. It will still work perfectly!' })
  ]));
}

// ========================================================= panel: details ====
function renderDetails(wrap) {
  const p = project.current;
  const bpM = fs.readJSON('BP/manifest.json') || {};
  const header = bpM.header || {};
  const box = el('div.panel');
  box.appendChild(el('div.panel-title', { text: 'PACK DETAILS' }));

  const nameInput = textField(p.name || '', { placeholder: 'My Add-On' });
  const descInput = textField(p.description ?? header.description ?? '', { placeholder: 'What does your add-on do?' });
  const authorInput = textField(p.author || '', { placeholder: 'Your name' });
  const commitBasics = () => {
    const name = nameInput.value.trim() || 'My Add-On';
    const description = descInput.value.trim();
    const author = authorInput.value.trim() || 'Me';
    project.setMeta({ name, description, author });
    updateManifests({ name, description, author });
    toast('Saved', 'good', 1000);
  };
  nameInput.addEventListener('change', commitBasics);
  descInput.addEventListener('change', commitBasics);
  authorInput.addEventListener('change', commitBasics);

  const grid = el('div.pk-form-grid', {}, [
    row('Add-on name', nameInput),
    row('What does it do?', descInput),
    row('Made by', authorInput)
  ]);
  box.appendChild(grid);

  const ver = header.version && header.version.length === 3 ? header.version : [1, 0, 0];
  const verBoxes = [0, 1, 2].map(i => el('input.field', { type: 'number', min: 0, max: 999, value: ver[i] ?? 0 }));
  const commitVersion = () => {
    const v = verBoxes.map(b => Math.max(0, parseInt(b.value, 10) || 0));
    updateManifests({ version: v });
    toast('Version saved', 'good', 1000);
  };
  verBoxes.forEach(b => b.addEventListener('change', commitVersion));
  box.appendChild(row('Version', el('div.pk-num-row', {}, verBoxes)));

  const eng = header.min_engine_version && header.min_engine_version.length === 3 ? header.min_engine_version : FORMAT.engine;
  const engBoxes = [0, 1, 2].map(i => el('input.field', { type: 'number', min: 0, max: 999, value: eng[i] ?? 0 }));
  const commitEngine = () => {
    const v = engBoxes.map(b => Math.max(0, parseInt(b.value, 10) || 0));
    updateManifests({ minEngine: v });
    toast('Saved', 'good', 1000);
  };
  engBoxes.forEach(b => b.addEventListener('change', commitEngine));
  box.appendChild(row('Minimum Minecraft version', el('div.pk-num-row', {}, engBoxes), 'Leave this unless you know what it means.'));

  const iconsRow = el('div.pk-icons-row');
  for (const kind of ['BP', 'RP']) {
    const path = `${kind}/pack_icon.png`;
    const preview = fs.exists(path) ? el('img', { src: fs.dataURL(path) }) : el('div.none', { text: 'none' });
    iconsRow.appendChild(el('div.pk-icon-box', {}, [el('div.lbl', { text: kind + ' icon' }), preview]));
  }
  const paintIconBtn = button('Paint the icon 🎨', { kind: 'primary', onClick: () => window.openTool('paint') });
  iconsRow.appendChild(paintIconBtn);
  box.appendChild(row('Pack icon', iconsRow));

  wrap.appendChild(box);
}

// ====================================================== panel: install ====
const INSTALL_TABS = [
  {
    id: 'windows', label: 'Windows', icon: '🪟', steps: [
      '📥 Save the .mcaddon file anywhere you like.',
      '🖱️ Double-click it.',
      '🎮 Minecraft opens and installs it for you.',
      '✅ Turn it on when you make or edit a world.'
    ]
  },
  {
    id: 'android', label: 'Android', icon: '🤖', steps: [
      '📥 Download the .mcaddon file.',
      '📂 Open it from Downloads or your Files app.',
      '🎮 Choose "Open with Minecraft".',
      '✅ Turn it on in your world settings.'
    ]
  },
  {
    id: 'ios', label: 'iPhone / iPad', icon: '📱', steps: [
      '📥 Download the .mcaddon file in Safari.',
      '📤 Tap it, then pick Minecraft from the share sheet.',
      '🎮 Minecraft opens and installs it.',
      '✅ Turn it on when you make or edit a world.'
    ]
  },
  {
    id: 'console', label: 'Xbox / Switch', icon: '🎮', steps: [
      '🚫 Consoles cannot install add-ons you made yourself — only ones from the Marketplace.',
      '🧪 You can still try your whole add-on right here in the Play tool!',
      '💡 Share the .mcaddon file so friends on PC, phone or tablet can use it.'
    ]
  }
];

function renderInstall(wrap) {
  const box = el('div.panel');
  box.appendChild(el('div.panel-title', { text: 'HOW TO INSTALL IT' }));
  const tabs = el('div.pk-tabs');
  const content = el('div.pk-tab-content');
  let activeId = INSTALL_TABS[0].id;
  function paint() {
    clear(tabs); clear(content);
    for (const t of INSTALL_TABS) {
      tabs.appendChild(el('button.pk-tab' + (t.id === activeId ? '.on' : ''), {
        type: 'button', on: { click: () => { activeId = t.id; paint(); } }
      }, [el('span', { text: t.icon }), el('span', { text: t.label })]));
    }
    const active = INSTALL_TABS.find(t => t.id === activeId);
    for (const s of active.steps) content.appendChild(el('div.pk-step', { text: s }));
    if (active.id === 'console') content.appendChild(button('Try it in Play', { kind: 'good', onClick: () => window.openTool('test') }));
  }
  paint();
  box.append(tabs, content);
  wrap.appendChild(box);
}

// ======================================================= panel: summary ====
function renderSummary(wrap) {
  const c = computeSummary();
  const box = el('div.panel');
  box.appendChild(el('div.panel-title', { text: 'WHAT IS IN YOUR PACK' }));
  box.appendChild(el('div.pk-import-counts', {}, [
    countChip('👾', c.mobs, 'mobs'), countChip('💎', c.items, 'items'), countChip('🟫', c.blocks, 'blocks'),
    countChip('🖼️', c.textures, 'pictures'), countChip('📄', c.files, 'files total')
  ]));
  box.appendChild(el('p', {}, [el('b', { text: 'Total size: ' }), el('span', { text: humanSize(c.total) })]));
  if (c.biggest.length) {
    box.appendChild(el('div.field-label', { text: 'Biggest files' }));
    const list = el('div.pk-biggest');
    for (const f of c.biggest) list.appendChild(el('div.pk-biggest-row', {}, [el('span.pk-biggest-path', { text: f.path }), el('span', { text: humanSize(f.size) })]));
    box.appendChild(list);
  }
  wrap.appendChild(box);
}

// ======================================================== panel: import ====
function renderImport(wrap) {
  const box = el('div.panel');
  box.appendChild(el('div.panel-title', { text: 'OPEN AN ADD-ON SOMEONE SENT ME' }));
  box.appendChild(el('p', { style: { color: 'var(--dim)' }, text: 'This makes a brand new add-on project from that file — it will not touch what you have open right now.' }));
  box.appendChild(button('Choose a file…', { icon: '📥', kind: 'primary', onClick: doImport }));
  wrap.appendChild(box);
}

async function doImport() {
  const ok = await confirmBox({
    title: 'Open a new add-on?',
    body: 'This makes a NEW project out of that file. What you have open now stays completely safe.',
    ok: 'Choose file', cancel: 'Never mind', icon: '📥'
  });
  if (!ok) return;
  const file = await pickFile('.mcaddon,.mcpack,.zip');
  if (!file) return;
  const b = busy('Opening ' + file.name + '…');
  try {
    await project.importFile(file);
    b.done();
    const c = computeSummary();
    modal({
      title: 'Opened!', icon: '📦',
      body: el('div', {}, [
        el('p', { text: 'Here is what came in:' }),
        el('div.pk-import-counts', {}, [
          countChip('👾', c.mobs, 'mobs'), countChip('💎', c.items, 'items'), countChip('🟫', c.blocks, 'blocks'), countChip('🖼️', c.textures, 'pictures')
        ])
      ]),
      buttons: [{ label: 'Great!', kind: 'good' }]
    });
    render();
  } catch (e) {
    b.done();
    toast(e.message || 'That file could not be opened.', 'bad', 5000);
  }
}

// ================================================================= render ====
function render() {
  if (!root || !project.isOpen) return;
  clear(root);
  root.classList.add('pk-root');
  const wrap = el('div.pk-wrap');
  renderExportButton(wrap);
  renderZipWarning(wrap);
  renderDetails(wrap);
  renderInstall(wrap);
  renderSummary(wrap);
  renderImport(wrap);
  root.appendChild(wrap);
}

// =================================================================== module ==
function mount(rootEl) {
  root = rootEl;
  injectCSS();
  bus.on('project:open', () => { if (root) render(); });
}
function show() {
  render();
  tour('export-intro', [
    { title: 'Ready to ship it?', text: 'This tool checks your add-on, builds the real <b>.mcaddon</b> file, and tells you how to install it.' },
    { el: '.pk-hero .btn.big', title: 'One big button', text: 'Tap this when you are ready. It fixes nothing for you — but it will tell you exactly what to fix.' },
    { el: '.pk-tabs', title: 'Installing it', text: 'Pick your device here for short steps.' }
  ], { tool: 'packer' });
}
function hide() {}
function onFileChange() { /* summary refreshes next time this tool is shown */ }

export default { id: 'packer', title: 'Export', icon: '📦', mount, show, hide, onFileChange };
