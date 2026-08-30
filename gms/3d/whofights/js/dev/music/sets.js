// Sets are what a level or a doorway names. Editing one edits data/music.json through the store,
// so undo, dirty state and the save indicator all come for free.
//
// "Preview" runs the *real* js/game/music.js scheduler over the set rather than a copy of it —
// including the cross-fade — which is the only way to hear that a fadeMs is wrong before shipping.

import { el, clock, field, num } from './ui.js';
import { MusicRuntime } from '../../game/music.js';

export function sets(host, C) {
  const wrap = el('div', 'split');
  const side = el('div', 'side');
  const main = el('div', 'main');
  wrap.append(side, main);
  host.append(wrap);

  let selected = null;
  let preview = null;
  let armedDelete = 0;

  function doc() { return C.doc(); }
  function current() { return (doc().sets || []).find(s => s.id === selected) || null; }

  function paintSide() {
    side.innerHTML = '';
    side.append(el('div', 'grouphead', 'Sets'));
    const list = doc().sets || [];
    if (!list.length) side.append(el('div', 'dim', 'none yet'));
    for (const s of list) {
      const b = el('button', s.id === selected ? 'active' : '', `${s.label || s.id}  (${(s.tracks || []).length})`);
      b.onclick = () => { selected = s.id; paint(); };
      side.append(b);
    }
    const add = el('button', 'primary', '+ New set');
    add.style.marginTop = '10px';
    add.onclick = newSet;
    side.append(add);
  }

  function newSet() {
    const taken = new Set((doc().sets || []).map(s => s.id));
    let id = 'set_1';
    for (let i = 1; taken.has(id); i++) id = `set_${i + 1}`;
    C.mutate(d => { (d.sets ||= []).push({ id, label: 'New set', tracks: [], shuffle: true, fadeMs: 1500, volume: 0.6 }); }, 'new music set');
    selected = id;
    paint();
  }

  function edit(fn, label) { C.mutate(d => { const s = (d.sets || []).find(x => x.id === selected); if (s) fn(s, d); }, label); }

  function paintMain() {
    main.innerHTML = '';
    const s = current();
    if (!s) {
      main.append(el('div', 'empty', (doc().sets || []).length ? 'pick a set on the left' : 'no sets yet — make one'));
      return;
    }

    const head = el('div', 'row');
    const idIn = input('text', s.id);
    idIn.onchange = () => {
      const want = idIn.value.trim().replace(/[^A-Za-z0-9_.-]/g, '_');
      if (!want || want === s.id) return paint();
      if ((doc().sets || []).some(x => x.id === want)) { C.ctx.toast(`there is already a set called ${want}`, 'bad'); return paint(); }
      const from = s.id;
      C.mutate(d => { const t = d.sets.find(x => x.id === from); if (t) t.id = want; }, 'rename set');
      selected = want;
      C.renamed(from, want);
      paint();
    };
    const labIn = input('text', s.label || '');
    labIn.oninput = () => edit(x => { x.label = labIn.value; }, 'set label');

    const shuffle = input('checkbox');
    shuffle.checked = s.shuffle !== false;
    shuffle.onchange = () => edit(x => { x.shuffle = shuffle.checked; }, 'set shuffle');
    const shufWrap = el('label', 'mus-field');
    shufWrap.append(el('span', null, 'Shuffle'), shuffle,
      el('small', 'dim', shuffle.checked ? 'pick at random, never the same track twice running' : 'play the list in order'));

    const fade = input('number', String(num(s.fadeMs, 1500)));
    fade.min = 0; fade.max = 20000; fade.step = 100;
    fade.oninput = () => edit(x => { x.fadeMs = Math.max(0, num(fade.value, 1500)); }, 'set fade');

    const vol = input('range', String(num(s.volume, 0.7)));
    vol.min = 0; vol.max = 1; vol.step = 0.05;
    const volOut = el('small', 'dim', `${Math.round(num(s.volume, 0.7) * 100)}%`);
    vol.oninput = () => { volOut.textContent = `${Math.round(+vol.value * 100)}%`; edit(x => { x.volume = +vol.value; }, 'set volume'); };

    const grid = el('div', 'mus-two');
    const left = el('div');
    left.append(field('Set id', idIn, 'what a hotspot action and a level’s "music" field name'),
      field('Label', labIn), shufWrap);
    const right = el('div');
    right.append(field('Cross-fade (ms)', fade, 'how long the outgoing bed takes to go, on every change into this set'),
      field('Volume', vol, null));
    right.lastChild.append(volOut);
    grid.append(left, right);
    main.append(el('h2', null, 'Set'), grid);

    main.append(el('h2', null, `Tracks in ${s.id}`), inSet(s), el('h2', null, 'Add tracks'), picker(s));

    const acts = el('div', 'row');
    const prev = el('button', 'primary', preview ? '■ Stop preview' : '▶ Preview set');
    prev.onclick = () => (preview ? stopPreview() : startPreview(s.id));
    const skip = el('button', null, '⇥ Jump to the cross-fade');
    skip.disabled = !preview;
    skip.onclick = () => jumpToFade();
    const del = el('button', 'danger', 'Delete set');
    del.onclick = () => {
      const now = Date.now();
      if (now - armedDelete > 3000) { armedDelete = now; C.ctx.toast('press again to delete this set', 'warn'); return; }
      armedDelete = 0;
      const gone = s.id;
      C.mutate(d => { d.sets = d.sets.filter(x => x.id !== gone); }, 'delete set');
      selected = null;
      paint();
    };
    acts.append(prev, skip, del);
    main.append(el('h2', null, 'Hear it'), acts, previewBox());
  }

  function inSet(s) {
    const list = el('div', 'mus-list');
    const ids = s.tracks || [];
    if (!ids.length) list.append(el('div', 'empty', 'no tracks — tick some below'));
    ids.forEach((id, i) => {
      const t = C.track(id);
      const r = el('div', 'mus-row mus-drag');
      r.draggable = true;
      r.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; };
      r.ondragover = e => { e.preventDefault(); r.classList.add('mus-over'); };
      r.ondragleave = () => r.classList.remove('mus-over');
      r.ondrop = e => {
        e.preventDefault();
        r.classList.remove('mus-over');
        const from = +e.dataTransfer.getData('text/plain');
        if (!Number.isFinite(from) || from === i) return;
        edit(x => { const [m] = x.tracks.splice(from, 1); x.tracks.splice(i, 0, m); }, 'reorder set');
        paint();
      };
      const play = el('button', 'mus-play', '▶');
      play.disabled = !t;
      play.onclick = () => t && C.aud.toggle(t);
      r.append(el('span', 'dim', '⠿'), play, el('div', 'mus-id', id),
        el('div', 'mus-title', t ? (t.title || t.id) : 'MISSING from data/music.json'));
      if (!t) r.querySelector('.mus-title').className = 'mus-title bad';
      else r.append(el('span', `mus-tag ${t.kind === 'song' ? 'song' : ''}`, t.kind === 'song' ? 'song' : 'instr'),
        el('span', 'mus-t', clock(t.seconds)));
      const up = el('button', null, '↑'); up.disabled = i === 0;
      up.onclick = () => { edit(x => { const [m] = x.tracks.splice(i, 1); x.tracks.splice(i - 1, 0, m); }, 'reorder set'); paint(); };
      const dn = el('button', null, '↓'); dn.disabled = i === ids.length - 1;
      dn.onclick = () => { edit(x => { const [m] = x.tracks.splice(i, 1); x.tracks.splice(i + 1, 0, m); }, 'reorder set'); paint(); };
      const rm = el('button', null, '✕');
      rm.onclick = () => { edit(x => { x.tracks = x.tracks.filter(v => v !== id); }, 'remove from set'); paint(); };
      r.append(up, dn, rm);
      list.append(r);
    });
    return list;
  }

  function picker(s) {
    const list = el('div', 'mus-list mus-pick');
    const have = new Set(s.tracks || []);
    const all = doc().tracks || [];
    if (!all.length) list.append(el('div', 'empty', 'no tracks in the library yet'));
    for (const t of all) {
      const r = el('div', 'mus-row');
      const tick = input('checkbox');
      tick.checked = have.has(t.id);
      tick.onchange = () => {
        edit(x => { x.tracks = tick.checked ? [...new Set([...(x.tracks || []), t.id])] : (x.tracks || []).filter(v => v !== t.id); },
          tick.checked ? 'add to set' : 'remove from set');
        paint();
      };
      const play = el('button', 'mus-play', '▶');
      play.onclick = () => C.aud.toggle(t);
      r.append(tick, play, el('div', 'mus-id', t.id), el('div', 'mus-title', t.title || t.id),
        el('span', `mus-tag ${t.kind === 'song' ? 'song' : ''}`, t.kind === 'song' ? 'song' : 'instr'),
        el('span', 'mus-tag', t.mood || '—'), el('span', 'mus-t', clock(t.seconds)));
      list.append(r);
    }
    return list;
  }

  const readout = el('pre', 'dim');
  readout.style.cssText = 'font:11px/1.5 ui-monospace,Menlo,monospace;margin:8px 0 0';
  function previewBox() {
    readout.textContent = preview ? 'starting…' : 'the preview drives js/game/music.js — the same scheduler the game uses';
    return readout;
  }

  function startPreview(id) {
    C.aud.stop();
    preview = new MusicRuntime({ base: C.base });
    preview.load(doc());
    preview.playSet(id);
    preview.start();
    preview.paintTimer = setInterval(() => {
      const st = preview.state();
      readout.textContent = `set ${st.setId}\n` + (st.blocked ? 'BLOCKED — click the page once, browsers need a gesture\n' : '') +
        st.voices.map(v => `  ${v.trackId.padEnd(26)} gain ${v.gain.toFixed(3)}  ${clock(v.head)} / ${clock(v.seconds)}${v.out ? '  (fading out)' : ''}`).join('\n');
    }, 200);
    paint();
  }

  function jumpToFade() {
    if (!preview) return;
    for (const [, e] of preview.els) if (e.duration) e.currentTime = Math.max(0, e.duration - (num(current()?.fadeMs, 1500) / 1000) - 1.5);
  }

  function stopPreview() {
    clearInterval(preview?.paintTimer);
    preview?.dispose();
    preview = null;
    paint();
  }

  // The picker is long: repainting it must not throw the author back to the top of the list.
  function paint() {
    const at = main.querySelector('.mus-pick')?.scrollTop || 0;
    paintSide();
    paintMain();
    const pick = main.querySelector('.mus-pick');
    if (pick) pick.scrollTop = at;
  }
  paint();
  return { paint, dispose: stopPreview, select: id => { selected = id; paint(); } };
}

function input(type, value) {
  const i = document.createElement('input');
  i.type = type;
  if (value !== undefined) i.value = value;
  return i;
}
