// Files — the file tree, the code editor and the Problems panel.
// This is the VS Code replacement: it shows the real files, highlights them, and explains
// mistakes in words a child can act on.
import { fs, extOf, baseName, dirName } from '../core/fs.js';
import { el, clear, button, toast, confirmBox, promptBox, pickBox, busy } from '../core/ui.js';
import { bus } from '../core/bus.js';
import { settings, flag } from '../core/store.js';
import { tour, say } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { parseFriendly, lintProject, tidy } from '../core/validate.js';
import { project } from '../core/project.js';

const CSS = `
.fl-wrap { display:flex; flex:1; min-height:0; }
.fl-tree { width:270px; flex:none; background:var(--panel); border-right:2px solid #000;
  box-shadow: inset -1px 0 0 var(--edge); overflow:auto; padding-bottom:20px; }
.fl-main { flex:1; min-width:0; display:flex; flex-direction:column; }
.fl-row { display:flex; align-items:center; gap:6px; padding:5px 8px; cursor:pointer;
  font-size:.9em; border-left:3px solid transparent; white-space:nowrap; }
.fl-row:hover { background:var(--panel2); }
.fl-row.on { background:var(--panel3); border-left-color:var(--grass); color:#fff; }
.fl-row .ic { width:18px; text-align:center; flex:none; }
.fl-row .nm { overflow:hidden; text-overflow:ellipsis; }
.fl-row .bad { color:var(--red); font-weight:800; }
.fl-row .more { margin-left:auto; opacity:0; padding:0 4px; border-radius:4px; }
.fl-row:hover .more, .fl-row.on .more { opacity:.7; }
.fl-row .more:hover { opacity:1; background:var(--panel3); }
.fl-dir > .fl-row .ic { color:var(--gold); }
.fl-kids { }
.fl-kids.hid { display:none; }

.fl-head { display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--panel);
  border-bottom:2px solid #000; box-shadow: inset 0 -1px 0 var(--edge); flex-wrap:wrap; }
.fl-path { font-family:var(--mono); font-size:.84em; color:var(--dim); flex:1; min-width:120px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.ed { position:relative; flex:1; min-height:0; display:flex; overflow:hidden; background:#0b0d12; }
.ed-gutter { flex:none; padding:12px 8px 12px 12px; text-align:right; color:var(--dim2);
  font-family:var(--mono); font-size:13.5px; line-height:20px; user-select:none; background:#0a0c10;
  border-right:1px solid var(--edge); overflow:hidden; }
.ed-gutter i { display:block; font-style:normal; }
.ed-gutter i.err { color:var(--red); font-weight:800; }
.ed-scroll { position:relative; flex:1; overflow:auto; }
.ed-hi, .ed-ta { font-family:var(--mono); font-size:13.5px; line-height:20px; padding:12px;
  white-space:pre; tab-size:2; border:0; margin:0; }
.ed-hi { position:absolute; inset:0; pointer-events:none; color:#dfe3ee; min-width:100%; }
.ed-ta { position:absolute; inset:0; width:100%; height:100%; background:transparent; color:transparent;
  caret-color:var(--grass); resize:none; outline:none; overflow:hidden; }
.ed-ta::selection { background:rgba(108,195,73,.28); }
.ed-band { position:absolute; left:0; right:0; height:20px; background:rgba(255,90,73,.13);
  border-left:3px solid var(--red); pointer-events:none; }
.tk-key { color:#7ca8ff; }
.tk-str { color:#a8e06b; }
.tk-num { color:#ffc83c; }
.tk-lit { color:#c08cff; }
.tk-pun { color:#7a8092; }
.tk-com { color:#5d6577; font-style:italic; }

.fl-err { padding:10px 14px; background:rgba(255,90,73,.12); border-top:2px solid var(--red);
  display:flex; gap:10px; align-items:flex-start; }
.fl-err.ok { background:rgba(108,195,73,.10); border-top-color:var(--grass); }
.fl-err .big { font-size:1.3em; }
.fl-err b { display:block; margin-bottom:2px; }
.fl-err small { color:var(--dim); }

.fl-img { flex:1; display:grid; place-items:center; background:
  repeating-conic-gradient(#20232c 0 25%, #171a21 0 50%) 0 0/22px 22px; padding:20px; }
.fl-img img { max-width:min(70vw,520px); max-height:60vh; image-rendering:pixelated;
  border:2px solid #000; box-shadow:0 8px 30px rgba(0,0,0,.6); }

.fl-probs { max-height:38%; overflow:auto; background:var(--panel); border-top:2px solid #000; }
.fl-probs.hid { display:none; }
.fl-prob { display:flex; gap:10px; padding:10px 14px; border-bottom:1px solid var(--edge); cursor:pointer; }
.fl-prob:hover { background:var(--panel2); }
.fl-prob .lv { flex:none; width:22px; height:22px; border-radius:6px; display:grid; place-items:center;
  font-size:.75em; font-weight:800; }
.fl-prob.error .lv { background:rgba(255,90,73,.2); color:#ff8f82; }
.fl-prob.warn .lv { background:rgba(255,200,60,.18); color:var(--gold); }
.fl-prob.tip .lv { background:rgba(124,168,255,.18); color:var(--sky); }
.fl-prob b { font-size:.95em; }
.fl-prob p { font-size:.87em; color:#c3c7d3; margin:2px 0; }
.fl-prob small { font-size:.83em; color:var(--dim); }
.fl-prob .where { font-family:var(--mono); font-size:.78em; color:var(--dim2); }
@media (max-width:900px){ .fl-tree{ width:190px; } }
@media (max-width:620px){ .fl-wrap{ flex-direction:column; } .fl-tree{ width:auto; max-height:170px;
  border-right:none; border-bottom:2px solid #000; } }
`;

let root, treeEl, mainEl, pathEl, edWrap, gutter, hi, ta, bandHost, errBar, imgWrap, probsEl, probsBtn;
let openPath = null, dirty = false, saveTimer = null, problems = [], collapsed = new Set();

function injectCSS() {
  if (document.getElementById('files-css')) return;
  document.head.appendChild(el('style#files-css', { text: CSS }));
}

// ------------------------------------------------------------ highlighting --
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function highlight(text, lang) {
  if (lang === 'lang' || lang === 'txt') {
    return esc(text).replace(/^([^=#\n]+)(=)(.*)$/gm, '<span class="tk-key">$1</span><span class="tk-pun">$2</span><span class="tk-str">$3</span>')
      .replace(/^(#.*)$/gm, '<span class="tk-com">$1</span>');
  }
  // JSON / JS
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === '"' || text[j] === '\n') break; j++; }
      const str = text.slice(i, Math.min(j + 1, text.length));
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      out.push(`<span class="${text[k] === ':' ? 'tk-key' : 'tk-str'}">${esc(str)}</span>`);
      i = j + 1; continue;
    }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      let j;
      if (text[i + 1] === '/') { j = text.indexOf('\n', i); if (j < 0) j = text.length; }
      else { j = text.indexOf('*/', i + 2); j = j < 0 ? text.length : j + 2; }
      out.push(`<span class="tk-com">${esc(text.slice(i, j))}</span>`);
      i = j; continue;
    }
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (num && !/[\w"]/.test(text[i - 1] || '')) { out.push(`<span class="tk-num">${num[0]}</span>`); i += num[0].length; continue; }
    const lit = /^(true|false|null)\b/.exec(text.slice(i));
    if (lit) { out.push(`<span class="tk-lit">${lit[0]}</span>`); i += lit[0].length; continue; }
    if ('{}[],:'.includes(c)) { out.push(`<span class="tk-pun">${esc(c)}</span>`); i++; continue; }
    out.push(esc(c)); i++;
  }
  return out.join('');
}

function syncEditor() {
  const text = ta.value;
  hi.innerHTML = highlight(text, extOf(openPath)) + '\n';
  const lines = text.split('\n').length;
  clear(gutter);
  for (let n = 1; n <= lines; n++) gutter.appendChild(el('i', { text: String(n), dataset: { line: n } }));
  gutter.scrollTop = ta.parentElement.scrollTop;
}

function markErrorLine(line) {
  bandHost.querySelectorAll('.ed-band').forEach(b => b.remove());
  gutter.querySelectorAll('i.err').forEach(i => i.classList.remove('err'));
  if (!line) return;
  const g = gutter.querySelector(`i[data-line="${line}"]`);
  if (g) g.classList.add('err');
  const band = el('div.ed-band');
  band.style.top = (12 + (line - 1) * 20) + 'px';
  bandHost.appendChild(band);
}

// ------------------------------------------------------------------ tree ----
function iconFor(p, isDir) {
  if (isDir) {
    const n = baseName(p);
    if (n === 'BP') return '🧠'; if (n === 'RP') return '🎨';
    if (n === 'entities' || n === 'entity') return '👾';
    if (n === 'items') return '🍎'; if (n === 'blocks') return '🟫';
    if (n === 'models') return '🧱'; if (n === 'animations') return '🤸';
    if (n === 'textures') return '🖼️'; if (n === 'scripts') return '📜';
    return '📁';
  }
  const e = extOf(p);
  if (e === 'png' || e === 'jpg') return '🖼️';
  if (e === 'lang') return '💬';
  if (e === 'js' || e === 'ts') return '📜';
  if (p.endsWith('.geo.json')) return '🧱';
  if (p.endsWith('.animation.json')) return '🤸';
  if (p.endsWith('manifest.json')) return '📋';
  return '📄';
}

function renderTree() {
  clear(treeEl);
  const t = fs.tree();
  if (!t.children.length) {
    treeEl.appendChild(el('div.empty', {}, [el('div.big', { text: '📂' }), el('p', { text: 'No files yet.' })]));
    return;
  }
  const errPaths = new Set(problems.filter(p => p.level === 'error').map(p => p.path));
  const walk = (node, depth, host) => {
    for (const c of node.children) {
      if (c.dir) {
        const wrap = el('div.fl-dir');
        const isCollapsed = collapsed.has(c.path);
        const row = el('div.fl-row', {
          style: { paddingLeft: (8 + depth * 12) + 'px' },
          on: { click: () => { collapsed.has(c.path) ? collapsed.delete(c.path) : collapsed.add(c.path); renderTree(); } }
        }, [
          el('span.ic', { text: isCollapsed ? '▸' : '▾' }),
          el('span.ic', { text: iconFor(c.path, true) }),
          el('span.nm', { text: c.name })
        ]);
        const kids = el('div.fl-kids' + (isCollapsed ? '.hid' : ''));
        walk(c, depth + 1, kids);
        wrap.append(row, kids);
        host.appendChild(wrap);
      } else {
        const bad = errPaths.has(c.path);
        host.appendChild(el('div.fl-row' + (c.path === openPath ? '.on' : ''), {
          style: { paddingLeft: (8 + depth * 12 + 18) + 'px' },
          on: { click: () => openFile(c.path) }
        }, [
          el('span.ic', { text: iconFor(c.path, false) }),
          el('span.nm', { text: c.name }),
          bad ? el('span.bad', { text: '!' }) : null,
          el('span.more', {
            text: '⋯', on: { click: (e) => { e.stopPropagation(); fileMenu(c.path); } }
          })
        ]));
      }
    }
  };
  walk(t, 0, treeEl);
}

async function fileMenu(path) {
  const what = await pickBox({
    title: baseName(path), icon: iconFor(path, false), items: [
      { icon: '✏️', label: 'Rename', value: 'rename' },
      { icon: '📑', label: 'Make a copy', value: 'dup' },
      { icon: '⬇️', label: 'Save to my device', value: 'down' },
      { icon: '🗑️', label: 'Delete', desc: 'This cannot be undone', value: 'del' }
    ]
  });
  if (what === 'rename') {
    const n = await promptBox({ title: 'New name', label: 'File name', value: baseName(path), hint: 'Lowercase letters, numbers and _ only.' });
    if (n) { fs.rename(path, dirName(path) + '/' + n); if (openPath === path) openFile(dirName(path) + '/' + n); renderTree(); }
  } else if (what === 'dup') {
    const n = baseName(path).replace(/(\.\w+)?$/, '_copy$&');
    fs.write(dirName(path) + '/' + n, fs.read(path));
    renderTree(); toast('Copied', 'good');
  } else if (what === 'down') {
    const blob = new Blob([fs.bytes(path)]);
    const a = el('a', { href: URL.createObjectURL(blob), download: baseName(path) });
    document.body.appendChild(a); a.click(); a.remove();
  } else if (what === 'del') {
    if (await confirmBox({ title: 'Delete ' + baseName(path) + '?', body: 'Minecraft may stop working if something else needs this file.', ok: 'Delete', danger: true, icon: '🗑️' })) {
      fs.delete(path);
      if (openPath === path) { openPath = null; showEmpty(); }
      renderTree();
    }
  }
}

// ---------------------------------------------------------------- opening ---
function showEmpty() {
  edWrap.style.display = 'none';
  imgWrap.style.display = 'none';
  pathEl.textContent = 'Pick a file on the left';
}

async function openFile(path) {
  if (dirty && openPath) saveFile(true);
  openPath = path;
  pathEl.textContent = path;
  flag.set('files:last', path);
  renderTree();

  if (fs.isBinary(path)) {
    edWrap.style.display = 'none';
    imgWrap.style.display = 'flex';
    clear(imgWrap);
    const url = fs.dataURL(path);
    if (url) {
      const img = el('img', { src: url, alt: path });
      imgWrap.append(img, el('div', { style: { marginTop: '14px' } }, [
        button('Paint this picture', { icon: '🎨', kind: 'good', onClick: () => window.openTool('paint', { path }) })
      ]));
    } else imgWrap.appendChild(el('p', { text: 'This file is not a picture.' }));
    errBar.style.display = 'none';
    return;
  }

  imgWrap.style.display = 'none';
  edWrap.style.display = 'flex';
  ta.value = fs.readText(path) || '';
  dirty = false;
  syncEditor();
  checkCurrent();
  ta.scrollTop = 0;
}

// ---------------------------------------------------------------- editing ---
function onInput() {
  dirty = true;
  syncEditor();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { checkCurrent(); saveFile(); }, 600);
}

function saveFile(silent) {
  if (!openPath || !dirty || fs.isBinary(openPath)) return;
  fs.write(openPath, ta.value);
  dirty = false;
  if (!silent) { /* the save dot in the top bar already tells them */ }
}

function checkCurrent() {
  if (!openPath || extOf(openPath) !== 'json') { errBar.style.display = 'none'; markErrorLine(0); return; }
  const r = parseFriendly(ta.value);
  errBar.style.display = 'flex';
  clear(errBar);
  if (r.ok) {
    errBar.className = 'fl-err ok';
    errBar.append(el('span.big', { text: '✅' }), el('div', {}, [
      el('b', { text: 'This file is good.' }),
      el('small', { text: 'Minecraft will be able to read it.' })
    ]));
    markErrorLine(0);
  } else {
    errBar.className = 'fl-err';
    errBar.append(el('span.big', { text: '🤔' }), el('div', {}, [
      el('b', { text: r.message }),
      el('small', { text: r.fix })
    ]), el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } }, [
      button('Go to line ' + r.line, { kind: 'ghost', onClick: () => gotoLine(r.line) })
    ]));
    markErrorLine(r.line);
  }
}

function gotoLine(line) {
  const pos = ta.value.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
  ta.focus();
  ta.setSelectionRange(pos, pos);
  ta.parentElement.scrollTop = Math.max(0, (line - 6) * 20);
}

function handleKeys(e) {
  const t = e.target;
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = t.selectionStart, en = t.selectionEnd;
    t.setRangeText('  ', s, en, 'end');
    onInput();
    return;
  }
  if (e.key === 'Enter') {
    const s = t.selectionStart;
    const lineStart = t.value.lastIndexOf('\n', s - 1) + 1;
    const line = t.value.slice(lineStart, s);
    const indent = (/^[ \t]*/.exec(line) || [''])[0];
    const extra = /[{[]\s*$/.test(line) ? '  ' : '';
    const closing = /^[ \t]*[}\]]/.test(t.value.slice(s)) && extra;
    e.preventDefault();
    if (closing) t.setRangeText('\n' + indent + extra + '\n' + indent, s, s, 'end'), t.setSelectionRange(s + 1 + indent.length + extra.length, s + 1 + indent.length + extra.length);
    else t.setRangeText('\n' + indent + extra, s, s, 'end');
    onInput();
    return;
  }
  const pairs = { '{': '}', '[': ']', '"': '"' };
  if (pairs[e.key] && t.selectionStart === t.selectionEnd) {
    const next = t.value[t.selectionStart];
    if (e.key === '"' && next === '"') { e.preventDefault(); t.setSelectionRange(t.selectionStart + 1, t.selectionStart + 1); return; }
    e.preventDefault();
    const s = t.selectionStart;
    t.setRangeText(e.key + pairs[e.key], s, s, 'end');
    t.setSelectionRange(s + 1, s + 1);
    onInput();
    return;
  }
  if ((e.key === '}' || e.key === ']') && t.value[t.selectionStart] === e.key) {
    e.preventDefault(); t.setSelectionRange(t.selectionStart + 1, t.selectionStart + 1);
  }
}

// --------------------------------------------------------------- problems ---
function runCheck(quiet) {
  problems = lintProject();
  renderProblems();
  renderTree();
  const errs = problems.filter(p => p.level === 'error').length;
  const warns = problems.filter(p => p.level === 'warn').length;
  probsBtn.innerHTML = '';
  probsBtn.append(el('span', { text: '🔍 Problems' }),
    el('span.pill' + (errs ? '.err' : warns ? '.warn' : '.ok'), { text: errs ? String(errs) : warns ? String(warns) : 'none' }));
  if (!quiet) {
    probsEl.classList.remove('hid');
    if (!problems.length) { sfx.play('win'); say('Nothing wrong anywhere. Your add-on is tidy! 🎉'); }
    else if (errs) sfx.play('bad');
  }
  return problems;
}

function renderProblems() {
  clear(probsEl);
  probsEl.appendChild(el('div.fl-head', {}, [
    el('b', { text: problems.length ? `${problems.length} thing${problems.length > 1 ? 's' : ''} to look at` : 'Everything checks out 🎉' }),
    el('div', { style: { flex: '1' } }),
    button('Check again', { kind: 'ghost', icon: '🔄', onClick: () => runCheck() }),
    button('Hide', { kind: 'ghost', onClick: () => probsEl.classList.add('hid') })
  ]));
  if (!problems.length) {
    probsEl.appendChild(el('div', { style: { padding: '16px', color: 'var(--dim)' }, text: 'No mistakes found. Nice work!' }));
    return;
  }
  for (const p of problems) {
    probsEl.appendChild(el('div.fl-prob.' + p.level, {
      on: { click: () => { openFile(p.path); if (p.line) setTimeout(() => gotoLine(p.line), 80); } }
    }, [
      el('span.lv', { text: p.level === 'error' ? '✕' : p.level === 'warn' ? '!' : 'i' }),
      el('div', {}, [
        el('b', { text: p.title }),
        el('p', { text: p.detail }),
        el('small', { text: '👉 ' + p.fix }),
        el('div.where', { text: p.path + (p.line ? ':' + p.line : '') })
      ])
    ]));
  }
}

// ------------------------------------------------------------------ mount ---
export default {
  id: 'files', title: 'Files', icon: '📁',

  mount(pane) {
    injectCSS();
    root = pane;

    const head = el('div.fl-head', {}, [
      el('span.fl-path#flPath', { text: 'Pick a file on the left' }),
      button('Tidy up', {
        kind: 'ghost', icon: '🧹', hint: 'Lines everything up neatly so the brackets are easy to see.',
        onClick: () => {
          if (!openPath || extOf(openPath) !== 'json') return toast('Tidy only works on .json files.', 'warn');
          const t = tidy(ta.value);
          if (!t) return toast('Fix the mistake first, then I can tidy it.', 'warn');
          ta.value = t; onInput(); toast('Tidied', 'good');
        }
      }),
      button('New file', {
        kind: 'ghost', icon: '➕', onClick: newFile
      }),
      button('Check everything', { kind: 'primary', icon: '🔍', onClick: () => runCheck() })
    ]);
    pathEl = head.querySelector('#flPath');

    treeEl = el('div.fl-tree');
    gutter = el('div.ed-gutter');
    hi = el('div.ed-hi');
    ta = el('textarea.ed-ta', { spellcheck: false, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off' });
    bandHost = el('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    const scroll = el('div.ed-scroll', {}, [hi, bandHost, ta]);
    scroll.addEventListener('scroll', () => { gutter.scrollTop = scroll.scrollTop; });
    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', handleKeys);
    ta.addEventListener('scroll', () => { scroll.scrollTop = ta.scrollTop; });

    edWrap = el('div.ed', { style: { display: 'none' } }, [gutter, scroll]);
    imgWrap = el('div.fl-img', { style: { display: 'none' } });
    errBar = el('div.fl-err', { style: { display: 'none' } });
    probsEl = el('div.fl-probs.hid');

    probsBtn = el('button.btn.tiny.ghost', { type: 'button', on: { click: () => probsEl.classList.toggle('hid') } }, [el('span', { text: '🔍 Problems' })]);
    const foot = el('div.fl-head', {}, [probsBtn, el('div', { style: { flex: '1' } }),
      el('span', { style: { fontSize: '.8em', color: 'var(--dim)' }, text: 'Changes save on their own' })]);

    mainEl = el('div.fl-main', {}, [head, edWrap, imgWrap, errBar, foot, probsEl]);
    pane.appendChild(el('div.fl-wrap', {}, [treeEl, mainEl]));

    bus.on('file:change', ({ path }) => {
      if (path === '*') { renderTree(); return; }
      renderTree();
      if (path === openPath && !dirty && !fs.isBinary(path)) { ta.value = fs.readText(path) || ''; syncEditor(); checkCurrent(); }
    });
    bus.on('project:open', () => { openPath = null; problems = []; renderTree(); showEmpty(); });
  },

  show() {
    renderTree();
    runCheck(true);
    const last = flag.get('files:last');
    if (!openPath) {
      if (last && fs.exists(last)) openFile(last);
      else {
        const first = fs.find('BP/entities/*.json') || fs.find('BP/manifest.json') || fs.list()[0];
        if (first) openFile(first); else showEmpty();
      }
    }
    tour('files-intro', [
      { title: 'These are your real files', text: 'This is exactly what Minecraft reads. Nothing here is pretend.' },
      { el: '.fl-tree', title: 'BP and RP', text: '<b>BP</b> is the brain — how things behave. <b>RP</b> is the look — models, pictures and animations.' },
      { el: '.ed-ta', title: 'You can type here', text: 'If you break something, I will tell you which line and how to fix it. You cannot break Minecraft from here.' },
      { el: '.fl-head .btn.primary', title: 'Check everything', text: 'This looks through every file and lists anything that would go wrong in game.' }
    ]);
  },

  hide() { saveFile(true); },

  runCheck
};

async function newFile() {
  const kind = await pickBox({
    title: 'What kind of file?', icon: '➕', items: [
      { icon: '📄', label: 'Empty JSON file', value: 'json' },
      { icon: '📜', label: 'Script file (.js)', desc: 'Needs a script module in the manifest', value: 'js' },
      { icon: '💬', label: 'Language file (.lang)', value: 'lang' }
    ]
  });
  if (!kind) return;
  const p = await promptBox({
    title: 'Where should it go?', label: 'Full path',
    value: kind === 'js' ? 'BP/scripts/main.js' : kind === 'lang' ? 'RP/texts/en_US.lang' : 'BP/entities/new_thing.json',
    hint: 'Start with BP/ or RP/.',
    validate: v => (/^(BP|RP)\//.test(v) ? (fs.exists(v) ? 'That file already exists.' : null) : 'It must start with BP/ or RP/.')
  });
  if (!p) return;
  fs.write(p, kind === 'json' ? '{\n  \n}\n' : kind === 'js' ? '// Your script\n' : '## key=value\n');
  renderTree();
  openFile(p);
  sfx.play('good');
}
