// Every track in data/music.json: audition it, see what it was made from, see which sets use it.
// This is the view Aaron decides from, so the prompt and the lyrics are one click away.

import { el, clock, esc } from './ui.js';

export function library(host, C) {
  const wrap = el('div');
  const bar = el('div', 'row');
  const find = el('input');
  find.type = 'text';
  find.placeholder = 'filter by id, title, mood or words in the prompt';
  find.style.flex = '1 1 260px';
  const kind = sel(['', 'instrumental', 'song'], ['any kind', 'instrumental', 'song']);
  const source = sel(['', 'acestep', 'suno'], ['any source', 'ACE-Step', 'Suno']);
  const count = el('span', 'dim');
  bar.append(find, kind, source, count);
  const list = el('div', 'mus-list');
  wrap.append(bar, list);
  host.append(wrap);

  const open = new Set();
  find.oninput = kind.onchange = source.onchange = paint;

  function paint() {
    const doc = C.doc();
    const q = find.value.trim().toLowerCase();
    const tracks = (doc.tracks || []).filter(t => {
      if (kind.value && t.kind !== kind.value) return false;
      if (source.value && (t.source || 'acestep') !== source.value) return false;
      if (!q) return true;
      return [t.id, t.title, t.mood, t.prompt, t.lyrics].some(v => String(v || '').toLowerCase().includes(q));
    });
    count.textContent = `${tracks.length} of ${(doc.tracks || []).length} tracks`;
    list.innerHTML = '';
    if (!tracks.length) {
      list.append(el('div', 'empty', (doc.tracks || []).length
        ? 'nothing matches that filter'
        : 'data/music.json has no tracks yet — the generation run writes them'));
      return;
    }
    for (const t of tracks) list.append(row(t, doc));
  }

  function row(t, doc) {
    const r = el('div', 'mus-row' + (C.aud.track?.id === t.id ? ' on' : ''));
    const play = el('button', 'mus-play', C.aud.playing && C.aud.track?.id === t.id ? '❚❚' : '▶');
    play.onclick = () => C.aud.toggle(t);
    const inSets = (doc.sets || []).filter(s => (s.tracks || []).includes(t.id)).map(s => s.id);
    r.append(play, el('div', 'mus-id', t.id), el('div', 'mus-title', t.title || t.id),
      el('span', `mus-tag ${t.kind === 'song' ? 'song' : ''}`, t.kind === 'song' ? 'song' : 'instr'),
      el('span', 'mus-tag', t.mood || '—'),
      el('span', 'mus-tag', (t.source || 'acestep') === 'suno' ? 'Suno' : 'ACE'),
      el('span', 'mus-t', clock(t.seconds)));
    const sets = el('span', 'dim');
    sets.style.cssText = 'flex:0 0 auto;font-size:11px';
    sets.textContent = inSets.length ? `in ${inSets.join(', ')}` : 'in no set';
    if (!inSets.length) sets.className = 'warnc';
    r.append(sets);
    const more = el('button', null, open.has(t.id) ? 'hide' : 'why');
    more.onclick = () => { open.has(t.id) ? open.delete(t.id) : open.add(t.id); paint(); };
    r.append(more);

    if (!open.has(t.id)) return r;
    const box = el('div');
    box.append(r);
    const why = el('div', 'mus-why');
    why.innerHTML = `<div class="dim">file</div><pre>${esc(t.file)}</pre>
      <div class="dim">prompt</div><pre>${esc(t.prompt) || '<span class="warnc">no prompt recorded — this track cannot be remade</span>'}</pre>
      ${t.lyrics ? `<div class="dim">lyrics</div><pre>${esc(t.lyrics)}</pre>` : ''}`;
    box.append(why);
    return box;
  }

  paint();
  return { paint };
}

function sel(values, labels) {
  const s = document.createElement('select');
  values.forEach((v, i) => { const o = document.createElement('option'); o.value = v; o.textContent = labels[i]; s.append(o); });
  return s;
}
