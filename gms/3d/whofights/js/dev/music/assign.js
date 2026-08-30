// Where a set actually gets used: a level's default, and every hotspot that switches it.
//
// Hotspots themselves belong to the level editor — this view derives what already exists (the
// contract's rule for reverse links: derived, never stored) and only writes the level's own
// "music" field.

import { el } from './ui.js';

export function assign(host, C) {
  const wrap = el('div');
  host.append(wrap);
  let levels = [];

  async function loadAll() {
    const ids = await C.ctx.data.levelIds();
    levels = [];
    for (const id of ids) levels.push({ id, doc: await C.ctx.data.load('levels', id) });
    paint();
  }

  function setNames() { return (C.doc().sets || []).map(s => s.id); }

  function paint() {
    wrap.innerHTML = '';
    wrap.append(el('h2', null, 'Level defaults'));
    if (!levels.length) { wrap.append(el('div', 'empty', 'no levels found')); return; }

    const table = document.createElement('table');
    table.innerHTML = '<tr><th>level</th><th>name</th><th>default set</th><th class="wide">plays</th></tr>';
    for (const L of levels) {
      const tr = document.createElement('tr');
      const pick = document.createElement('select');
      for (const [v, label] of [['', '— none —'], ...setNames().map(s => [s, s])]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        pick.append(o);
      }
      pick.value = typeof L.doc?.music === 'string' ? L.doc.music : '';
      pick.onchange = () => {
        C.ctx.data.mutate('levels', L.id, d => { d.music = pick.value || null; }, { label: 'level music' });
        paint();
      };
      const set = (C.doc().sets || []).find(s => s.id === pick.value);
      const td = (html, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.innerHTML = html; return c; };
      tr.append(td(`<code>${L.id}</code>`), td(L.doc?.name || ''), (() => { const c = document.createElement('td'); c.append(pick); return c; })(),
        td(set ? `${set.tracks?.length || 0} tracks · ${set.shuffle === false ? 'in order' : 'shuffled'} · fade ${set.fadeMs ?? 1500}ms`
          : pick.value ? '<span class="bad">that set no longer exists</span>' : '<span class="dim">silent until a hotspot says otherwise</span>', 'wide'));
      table.append(tr);
    }
    wrap.append(table);

    const save = el('button', 'primary', 'Save changed levels');
    save.style.marginTop = '10px';
    save.onclick = async () => {
      const dirty = levels.filter(L => C.ctx.data.dirty('levels', L.id));
      if (!dirty.length) return C.ctx.toast('no level changed');
      for (const L of dirty) await C.ctx.data.save('levels', L.id);
    };
    wrap.append(save);

    wrap.append(el('h2', null, 'Hotspots that change the music'));
    const rows = [];
    for (const L of levels) {
      for (const h of L.doc?.hotspots || []) {
        for (const a of h.actions || []) {
          if (a?.k === 'music') rows.push({ level: L.id, h, a });
        }
      }
    }
    if (!rows.length) {
      wrap.append(el('div', 'empty', 'no hotspot names a music set yet'));
    } else {
      const t2 = document.createElement('table');
      t2.innerHTML = '<tr><th>level</th><th>hotspot</th><th>trigger</th><th>action</th><th class="wide">set</th></tr>';
      for (const r of rows) {
        const known = r.a.stop === true || (C.doc().sets || []).some(s => s.id === r.a.set);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><code>${r.level}</code></td><td>${r.h.name || r.h.id}</td>
          <td>${r.h.trigger || 'enter'}</td>
          <td>${r.a.stop === true ? 'stop' : r.a.sting ? 'sting' : 'play'}</td>
          <td class="wide ${known ? '' : 'bad'}">${r.a.stop === true ? '—' : (r.a.set || '(none)')}${known ? '' : ' — no such set'}</td>`;
        t2.append(tr);
      }
      wrap.append(t2);
    }
    wrap.append(el('p', 'dim', 'Hotspots are edited in the Level editor tab; it reads the sets from here. ' +
      'The action shape is {"k":"music","set":"…"} — add "stop": true to fade out, or "sting": true to play over the top.'));
  }

  loadAll();
  return { paint: loadAll };
}
