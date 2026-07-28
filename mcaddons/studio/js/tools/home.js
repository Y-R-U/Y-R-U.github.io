// Home — pick an add-on to work on, or start a new one. Also the "what should I do next?" screen.
import { project, templateList } from '../core/project.js';
import { fs } from '../core/fs.js';
import { el, clear, button, toast, confirmBox, promptBox, busy, pickFile, row, textField } from '../core/ui.js';
import { bus } from '../core/bus.js';
import { flag } from '../core/store.js';
import { say, badgesEarned, BADGES, award } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { safeName, ID_RE } from '../lib/bedrock.js';

const CSS = `
.hm { padding:22px; overflow:auto; flex:1; }
.hm-wrap { max-width:960px; margin:0 auto; }
.hm-hero { text-align:center; padding:26px 16px 30px; }
.hm-hero h1 { font-family:var(--pixel); font-size:clamp(15px,3.4vw,26px); color:var(--grass);
  text-shadow:3px 3px 0 #1d3a12; line-height:1.7; margin-bottom:14px; }
.hm-hero p { color:var(--dim); max-width:520px; margin:0 auto; }
.hm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; margin:18px 0; }
.hm-card { text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:6px;
  background:linear-gradient(var(--panel2),var(--panel)); border:2px solid #000;
  box-shadow: inset 0 0 0 1px var(--edge), 0 3px 0 rgba(0,0,0,.45); border-radius:12px; padding:16px;
  color:var(--text); font-family:var(--ui); font-size:1em; transition:transform .1s, box-shadow .1s; }
.hm-card:hover { transform:translateY(-2px); box-shadow: inset 0 0 0 1px var(--grass), 0 6px 0 rgba(0,0,0,.45); }
.hm-card .ico { font-size:2.1em; }
.hm-card b { font-size:1.05em; }
.hm-card small { color:var(--dim); line-height:1.4; }
.hm-projs { display:flex; flex-direction:column; gap:9px; }
.hm-proj { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:10px;
  background:var(--panel2); border:2px solid var(--edge); cursor:pointer; }
.hm-proj:hover { border-color:var(--grass); }
.hm-proj .ico { font-size:1.7em; }
.hm-proj .meta { flex:1; min-width:0; }
.hm-proj .meta b { display:block; }
.hm-proj .meta small { color:var(--dim); font-family:var(--mono); font-size:.8em; }
.hm-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; }
.hm-stat { background:var(--panel2); border:2px solid var(--edge); border-radius:10px; padding:12px; text-align:center; }
.hm-stat b { display:block; font-size:1.7em; color:var(--gold); font-family:var(--pixel); font-size:17px; }
.hm-stat small { color:var(--dim); font-size:.82em; }
.hm-badges { display:flex; flex-wrap:wrap; gap:9px; }
.hm-badge { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px;
  background:var(--panel2); border:2px solid var(--edge); font-size:.86em; }
.hm-badge.locked { opacity:.32; filter:grayscale(1); }
.hm-next { display:flex; align-items:center; gap:14px; padding:16px; border-radius:12px;
  background:linear-gradient(90deg, rgba(108,195,73,.14), transparent); border:2px solid var(--grass-d); }
.hm-next .ico { font-size:2.2em; }
.hm-next .grow { flex:1; }
`;

let pane;

function injectCSS() {
  if (!document.getElementById('home-css')) document.head.appendChild(el('style#home-css', { text: CSS }));
}

function countThings() {
  return {
    mobs: fs.findAll('BP/entities/*.json').length,
    items: fs.findAll('BP/items/*.json').length,
    blocks: fs.findAll('BP/blocks/*.json').length,
    pics: fs.list().filter(p => p.endsWith('.png')).length,
    models: fs.findAll('RP/models/**/*.json').length,
    anims: fs.findAll('RP/animations/*.json').length,
    files: fs.count()
  };
}

function nextStep(c) {
  if (!c.mobs && !c.items && !c.blocks) return { icon: '✨', title: 'Make your first thing', text: 'A mob, an item or a block — the Build tool asks a few easy questions and writes all the files.', tool: 'build', label: 'Open Build' };
  if (c.mobs && !c.pics) return { icon: '🎨', title: 'Give it a colour', text: 'Your mob is grey until you paint its picture.', tool: 'paint', label: 'Paint it' };
  if (c.mobs && !c.anims) return { icon: '🤸', title: 'Make it move', text: 'A walk cycle takes about a minute with the preset buttons.', tool: 'anim', label: 'Animate it' };
  if (!flag.get('badges', []).includes('first-test')) return { icon: '🎮', title: 'Try it out', text: 'Drop into the practice world and see your creation walking around.', tool: 'test', label: 'Play' };
  return { icon: '📦', title: 'Put it in Minecraft', text: 'Export a .mcaddon file, then tap it on your device.', tool: 'packer', label: 'Export' };
}

function render() {
  clear(pane);
  const wrap = el('div.hm-wrap');
  pane.appendChild(el('div.hm', {}, [wrap]));

  if (project.isOpen) renderOpen(wrap);
  else renderChooser(wrap);
}

// --------------------------------------------------------------- open view --
function renderOpen(wrap) {
  const p = project.current;
  const c = countThings();
  const n = nextStep(c);

  wrap.appendChild(el('div.hm-hero', {}, [
    el('h1', { text: p.name }),
    el('p', { text: 'Everything you make goes in here. Your work saves by itself.' })
  ]));

  wrap.appendChild(el('div.hm-next', {}, [
    el('span.ico', { text: n.icon }),
    el('div.grow', {}, [el('b', { text: n.title }), el('div', { style: { color: 'var(--dim)', fontSize: '.92em' }, text: n.text })]),
    button(n.label, { kind: 'good', onClick: () => window.openTool(n.tool) })
  ]));

  wrap.appendChild(el('div.hm-grid', {}, [
    card('✨', 'Build something', 'Mobs, items, food, weapons and blocks — with questions, not code.', () => window.openTool('build')),
    card('🎨', 'Paint', 'Draw the pictures that go on your mobs, items and blocks.', () => window.openTool('paint')),
    card('🧱', 'Model', 'Build the 3D shape out of boxes.', () => window.openTool('model')),
    card('🤸', 'Animate', 'Make it walk, jump, attack or dance.', () => window.openTool('anim')),
    card('🎮', 'Play', 'Test everything in a practice world.', () => window.openTool('test')),
    card('📦', 'Export', 'Make the .mcaddon file for Minecraft.', () => window.openTool('packer'))
  ]));

  wrap.appendChild(el('h2.panel-title', { text: "WHAT'S INSIDE" }));
  wrap.appendChild(el('div.hm-stats', {}, [
    stat(c.mobs, 'mobs'), stat(c.items, 'items'), stat(c.blocks, 'blocks'),
    stat(c.pics, 'pictures'), stat(c.models, 'models'), stat(c.files, 'files')
  ]));

  const got = badgesEarned();
  wrap.appendChild(el('h2.panel-title', { text: 'BADGES · ' + got.length + '/' + Object.keys(BADGES).length }));
  wrap.appendChild(el('div.hm-badges', {}, Object.entries(BADGES).map(([id, b]) =>
    el('div.hm-badge' + (got.includes(id) ? '' : '.locked'), { title: b.desc }, [
      el('span', { text: b.icon }), el('span', { text: b.title })
    ])
  )));

  wrap.appendChild(el('div.hr'));
  wrap.appendChild(el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
    button('Rename add-on', { kind: 'ghost', icon: '✏️', onClick: renameProject }),
    button('All my add-ons', { kind: 'ghost', icon: '📚', onClick: async () => { await project.close(); render(); } }),
    button('Export .mcaddon', { kind: 'good', icon: '📦', onClick: () => window.openTool('packer') })
  ]));
}

function card(icon, title, desc, onClick) {
  return el('button.hm-card', { type: 'button', on: { click: () => { sfx.play('click'); onClick(); } } }, [
    el('span.ico', { text: icon }), el('b', { text: title }), el('small', { text: desc })
  ]);
}
function stat(n, label) {
  return el('div.hm-stat', {}, [el('b', { text: String(n) }), el('small', { text: label })]);
}

async function renameProject() {
  const name = await promptBox({ title: 'Rename', label: 'What is this add-on called?', value: project.current.name });
  if (!name) return;
  await project.setMeta({ name });
  render();
  toast('Renamed', 'good');
}

// ------------------------------------------------------------ chooser view --
async function renderChooser(wrap) {
  wrap.appendChild(el('div.hm-hero', {}, [
    el('h1', { text: 'ADDON STUDIO' }),
    el('p', { text: 'Make a Minecraft add-on right here. Build it, paint it, test it, then put it in the game. No other apps needed.' })
  ]));

  wrap.appendChild(el('h2.panel-title', { text: 'START SOMETHING NEW' }));
  wrap.appendChild(el('div.hm-grid', {}, templateList().map(t =>
    card(t.icon, t.title, t.desc, () => startNew(t.value))
  )));

  wrap.appendChild(el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap', margin: '4px 0 20px' } }, [
    button('Open one I was sent', { kind: 'ghost', icon: '📥', onClick: importAddon }),
    button('Settings', { kind: 'ghost', icon: '⚙️', onClick: () => window.openTool('settings') })
  ]));

  const list = await project.list();
  wrap.appendChild(el('h2.panel-title', { text: 'MY ADD-ONS' }));
  if (!list.length) {
    wrap.appendChild(el('div.card', { text: 'Nothing here yet — pick one of the boxes above to begin.' }));
    return;
  }
  wrap.appendChild(el('div.hm-projs', {}, list.map(p => el('div.hm-proj', {
    on: { click: () => openProject(p.id) }
  }, [
    el('span.ico', { text: p.template === 'item' ? '🍎' : p.template === 'block' ? '🟫' : p.template === 'blank' ? '📄' : '👾' }),
    el('div.meta', {}, [
      el('b', { text: p.name }),
      el('small', { text: p.namespace + ':  ·  ' + new Date(p.modified).toLocaleDateString() })
    ]),
    button('Open', { kind: 'good', onClick: () => openProject(p.id) }),
    el('button.iconbtn', {
      type: 'button', text: '⋯', title: 'More',
      on: { click: async (e) => { e.stopPropagation(); await projectMenu(p); } }
    })
  ]))));
}

async function openProject(id) {
  const b = busy('Opening…');
  try { await project.open(id); render(); window.openTool('home'); }
  catch (e) { toast(e.message, 'bad'); }
  b.done();
}

async function projectMenu(p) {
  const { pickBox } = await import('../core/ui.js');
  const what = await pickBox({
    title: p.name, icon: '📦', items: [
      { icon: '📑', label: 'Make a copy', value: 'dup' },
      { icon: '✏️', label: 'Rename', value: 'ren' },
      { icon: '🗑️', label: 'Delete for ever', value: 'del' }
    ]
  });
  if (what === 'dup') { await project.duplicate(p.id); toast('Copied', 'good'); render(); }
  else if (what === 'ren') {
    const name = await promptBox({ title: 'Rename', label: 'New name', value: p.name });
    if (!name) return;
    const rec = await (await import('../core/db.js')).idb.get('proj:' + p.id);
    if (rec) { rec.meta.name = name; await (await import('../core/db.js')).idb.set('proj:' + p.id, rec); }
    const list = (await project.list()).map(x => x.id === p.id ? { ...x, name } : x);
    await (await import('../core/db.js')).idb.set('projects', list);
    render();
  } else if (what === 'del') {
    if (await confirmBox({ title: 'Delete "' + p.name + '"?', body: 'Everything in it goes. This cannot be undone.', ok: 'Delete', danger: true, icon: '🗑️' })) {
      await project.remove(p.id); toast('Deleted'); render();
    }
  }
}

async function startNew(template) {
  const nameInput = textField('', { placeholder: 'Frost Pack' });
  const nsOut = el('div.field-hint', { text: 'Your things will be called mypack:something' });
  const authorInput = textField(flag.get('author', 'Me'), { placeholder: 'Your name' });
  nameInput.addEventListener('input', () => {
    const ns = safeName(nameInput.value || 'mypack');
    nsOut.textContent = 'Your things will be called ' + ns + ':something';
  });

  const { modal } = await import('../core/ui.js');
  const body = el('div', {}, [
    row('What is your add-on called?', nameInput, 'You can change this later.'),
    row('Who is making it?', authorInput),
    nsOut
  ]);
  const m = modal({
    title: 'New add-on', icon: '🎁', body,
    buttons: [
      { label: 'Cancel', kind: 'ghost', value: null },
      {
        label: "Let's go!", kind: 'good', close: false, onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) { toast('Give it a name first.', 'warn'); return; }
          flag.set('author', authorInput.value.trim() || 'Me');
          m.close(true);
          const b = busy('Building your add-on…');
          try {
            await project.create({ name, namespace: safeName(name), author: authorInput.value.trim() || 'Me', template });
            award('first-project');
            render();
            say('I made the files for you. Have a look in <b>Build</b>, or jump straight to <b>Play</b> to see it working.', { ms: 9000 });
          } catch (e) { toast('Could not make that: ' + e.message, 'bad'); }
          b.done();
        }
      }
    ]
  });
  setTimeout(() => nameInput.focus(), 80);
}

async function importAddon() {
  const file = await pickFile('.mcaddon,.mcpack,.zip');
  if (!file) return;
  const b = busy('Opening ' + file.name + '…');
  try {
    await project.importFile(file);
    toast('Opened! It is now one of your add-ons.', 'good');
    render();
  } catch (e) {
    toast(e.message || 'That file could not be opened.', 'bad', 5000);
  }
  b.done();
}

export default {
  id: 'home', title: 'Home', icon: '🏠',
  mount(root) { injectCSS(); pane = root; bus.on('project:open', () => { if (pane) render(); }); },
  show() { render(); },
  hide() {},
  onFileChange() { }
};
