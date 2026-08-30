// The barks panel: the shared pool, a character's overrides, and the generate/play buttons.
// DEV_CONTRACT §8. The categories are fixed; only the lines are authored here.

import { BARK_CATEGORIES, effectiveBarks, clipKey, clipFile, hashLine, planJobs, applyResults,
  speedOf, pitchOf, synthSpeed } from './vo.js';
import { loadIndex, saveIndex, clipsOnDisk } from './voindex.js';
import { playClip } from './play.js';

const CHUNK = 40;   // one kokoro model load per request (~6 s) against a run you can watch

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createBarks(ctx, host) {
  const el = document.createElement('section');
  el.className = 'chars-barks';
  el.innerHTML = `
    <div class="row">
      <h2 style="margin:0">Barks</h2>
      <span class="dim" data-role="counts"></span>
      <span class="spacer" style="flex:1 1 auto"></span>
      <label class="dim">scope
        <select data-role="scope">
          <option value="one">this character</option>
          <option value="all">every character with a voice</option>
        </select></label>
      <label class="dim"><input type="checkbox" data-role="force"> ignore hashes</label>
      <button data-act="genall" class="primary">Generate all</button>
      <button data-act="cancel" hidden class="danger">Stop</button>
    </div>
    <div data-role="progress" class="chars-progress" hidden></div>
    <div data-role="fails" class="problems" hidden></div>
    <div data-role="cats"></div>`;

  const q = r => el.querySelector(`[data-role=${r}]`);
  let index = { version: 1, clips: {} };
  let indexWhere = 'blank';
  let onDisk = null;
  let running = false, cancel = false;

  const cast = () => host.cast();
  const id = () => host.id();
  const chr = () => cast()[id()] || null;
  const barks = () => ctx.data.get('barks') || { shared: {} };

  el.querySelector('[data-act=genall]').onclick = () => generateAll();
  el.querySelector('[data-act=cancel]').onclick = () => { cancel = true; };

  async function boot() {
    const r = await loadIndex(ctx.api);
    index = r.doc;
    indexWhere = r.where;
    onDisk = await clipsOnDisk(ctx.api);
    host.onIndex?.(index, indexWhere);
    repaint();
  }

  function clipState(key, text, voice, speed, pitch) {
    const rec = index.clips?.[key];
    if (!rec) return { k: 'none', label: '—', title: 'never generated' };
    const want = hashLine(text, voice, speed, pitch);
    if (onDisk && !onDisk.has(key)) return { k: 'bad', label: 'file gone', title: `${clipFile(key)} is not on disk` };
    if (rec.hash !== want) return { k: 'warnc', label: 'stale', title: 'the line, voice, speed or pitch changed since this clip' };
    return { k: 'good', label: `${(rec.seconds ?? 0).toFixed(1)}s`, title: `${rec.voice} · ${rec.rms ?? '?'} dBFS` };
  }

  function repaint() {
    const c = chr();
    if (!c) { q('cats').innerHTML = '<div class="empty">no character selected</div>'; return; }
    const doc = barks();
    const eff = effectiveBarks(doc, c);
    const own = c.barks || {};
    const speed = speedOf(c), pitch = pitchOf(c);
    let total = 0, done = 0;

    const blocks = BARK_CATEGORIES.map(cat => {
      const meta = doc.categories?.[cat] || {};
      const overridden = Array.isArray(own[cat]);
      const lines = eff[cat];
      total += lines.length;
      const rows = lines.map((text, i) => {
        const key = clipKey(id(), cat, i);
        const st = c.voice ? clipState(key, text, c.voice, speed, pitch)
          : { k: 'dim', label: 'no voice', title: 'this character has no voice yet' };
        if (st.k === 'good') done++;
        return `<div class="bark-row" data-cat="${cat}" data-i="${i}">
          <span class="dim bark-n">${String(i + 1).padStart(2, '0')}</span>
          <input type="text" data-act="line" value="${esc(text)}">
          <span class="${st.k} bark-state" title="${esc(st.title)}">${esc(st.label)}</span>
          <button data-act="play" title="play the clip">▶</button>
          <button data-act="gen" title="generate this one line">gen</button>
          <button data-act="del" class="danger" title="delete this line">✕</button>
        </div>`;
      }).join('');
      return `<details class="bark-cat" data-cat="${cat}">
        <summary><b>${esc(meta.label || cat)}</b>
          <span class="dim">${lines.length} line${lines.length === 1 ? '' : 's'} · ${esc(meta.note || '')}</span>
          <span class="pill ${overridden ? 'on' : ''}">${overridden ? 'this character' : 'shared'}</span>
        </summary>
        <div class="row">
          ${overridden
            ? '<button data-act="useshared">Use the shared list</button>'
            : '<button data-act="override">Make this character\'s own</button>'}
          <button data-act="gencat">Generate this category</button>
          <span class="dim">${overridden ? 'edits here touch this character only'
            : 'edits here change the shared pool — every character using it'}</span>
        </div>
        ${rows}
        <div class="row bark-add">
          <input type="text" data-act="new" placeholder="a new ${esc(meta.label || cat)} line…">
          <button data-act="add">Add</button>
        </div>
      </details>`;
    }).join('');

    q('cats').innerHTML = blocks;
    q('counts').textContent = `${total} lines for ${c.name} · ${done} clip${done === 1 ? '' : 's'} up to date · index ${indexWhere}`;
    wire();
  }

  function wire() {
    for (const d of q('cats').querySelectorAll('.bark-cat')) {
      const cat = d.dataset.cat;
      d.querySelector('[data-act=override]')?.addEventListener('click', () => setOverride(cat, true));
      d.querySelector('[data-act=useshared]')?.addEventListener('click', () => setOverride(cat, false));
      d.querySelector('[data-act=gencat]').addEventListener('click', () => generate({ categories: [cat] }));
      const add = () => {
        const input = d.querySelector('[data-act=new]');
        const t = input.value.trim();
        if (!t) return;
        editLines(cat, list => [...list, t]);
        input.value = '';
      };
      d.querySelector('[data-act=add]').addEventListener('click', add);
      d.querySelector('[data-act=new]').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

      for (const row of d.querySelectorAll('.bark-row')) {
        const i = +row.dataset.i;
        const input = row.querySelector('[data-act=line]');
        input.addEventListener('input', () => {
          editLines(cat, list => list.map((l, n) => (n === i ? input.value : l)), { quiet: true, coalesce: true });
          const st = clipState(clipKey(id(), cat, i), input.value, chr()?.voice, speedOf(chr()), pitchOf(chr()));
          const s = row.querySelector('.bark-state');
          s.className = `${st.k} bark-state`;
          s.textContent = st.label;
        });
        row.querySelector('[data-act=del]').addEventListener('click', () =>
          editLines(cat, list => list.filter((_, n) => n !== i)));
        row.querySelector('[data-act=play]').addEventListener('click', () => play(cat, i));
        row.querySelector('[data-act=gen]').addEventListener('click', () =>
          generate({ categories: [cat], only: [clipKey(id(), cat, i)], force: true }));
      }
    }
  }

  // A category is either the shared list or this character's own. Copying the shared lines in is
  // how you extend rather than replace — a union would leave no way to drop one shared line.
  function setOverride(cat, on) {
    const c = chr();
    const list = on ? effectiveBarks(barks(), c)[cat].slice() : null;
    ctx.data.mutate('characters', null, d => {
      const rec = d.characters[id()];
      rec.barks = rec.barks || {};
      if (on) rec.barks[cat] = list;
      else delete rec.barks[cat];
      if (!Object.keys(rec.barks).length) delete rec.barks;
    }, { label: `${on ? 'override' : 'share'} ${cat} barks` });
    repaint();
  }

  function editLines(cat, fn, { quiet = false, coalesce = false } = {}) {
    const c = chr();
    const overridden = Array.isArray(c.barks?.[cat]);
    if (overridden) {
      ctx.data.mutate('characters', null, d => {
        const rec = d.characters[id()];
        rec.barks[cat] = fn(rec.barks[cat] || []);
      }, { label: `${id()} ${cat} barks`, coalesce });
    } else {
      ctx.data.mutate('barks', null, d => {
        d.shared[cat] = fn(d.shared[cat] || []);
      }, { label: `shared ${cat} barks`, coalesce });
    }
    if (!quiet) repaint();
  }

  async function play(cat, i) {
    const c = chr();
    const key = clipKey(id(), cat, i);
    if (!index.clips?.[key]) return ctx.toast('no clip yet — press gen', 'warn');
    try { await playClip(clipFile(key), { pitch: pitchOf(c) }); }
    catch (e) { ctx.toast(`could not play ${key}: ${e.message}`, 'bad'); }
  }

  const generateAll = () => generate({ scope: q('scope').value, force: q('force').checked });

  async function generate({ categories = null, only = null, scope = 'one', force = false } = {}) {
    if (running) return ctx.toast('already generating', 'warn');
    if (!(await ctx.api.online())) return ctx.toast('no dev server — nothing to generate with', 'bad');
    const all = cast();
    const who = scope === 'all' ? Object.keys(all).filter(k => all[k].voice) : [id()];
    onDisk = await clipsOnDisk(ctx.api);
    let { jobs, skip, noVoice } = planJobs({ cast: all, barks: barks(), index, who, categories,
      force: force || !!only, onDisk });
    if (only) jobs = jobs.filter(j => only.includes(j.key));
    if (noVoice.length && !jobs.length) return ctx.toast(`${noVoice.length} lines have no voice set`, 'warn');
    if (!jobs.length) return ctx.toast(`nothing to do — ${skip.length} clips already up to date`);

    running = true; cancel = false;
    el.querySelector('[data-act=cancel]').hidden = false;
    el.querySelector('[data-act=genall]').disabled = true;
    const prog = q('progress');
    prog.hidden = false;
    const fails = [];
    let done = 0;
    const t0 = Date.now();

    for (let n = 0; n < jobs.length && !cancel; n += CHUNK) {
      const chunk = jobs.slice(n, n + CHUNK);
      prog.innerHTML = `generating ${done + 1}–${done + chunk.length} of ${jobs.length}
        <span class="dim">(${skip.length} skipped, unchanged)</span>`;
      const r = await ctx.api.ttsBatch(chunk.map(j => ({ voice: j.voice, text: j.text,
        speed: j.ttsSpeed, out: j.out })));
      if (!r.ok && !r.results) {
        fails.push({ key: chunk[0].key, error: r.error || 'the batch call failed' });
        break;
      }
      const applied = applyResults(index, chunk, r.results);
      index = applied.index;
      fails.push(...applied.failed);
      done += chunk.length;
      const save = await saveIndex(ctx.api, index);
      if (!save.ok) ctx.toast(`vo index did not save: ${save.error}`, 'bad');
      indexWhere = save.where || indexWhere;
    }

    onDisk = await clipsOnDisk(ctx.api);
    running = false;
    el.querySelector('[data-act=cancel]').hidden = true;
    el.querySelector('[data-act=genall]').disabled = false;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    prog.innerHTML = `${done - fails.length} of ${jobs.length} written in ${secs}s`
      + (cancel ? ' <span class="warnc">— stopped</span>' : '')
      + (fails.length ? ` <span class="bad">— ${fails.length} refused</span>` : '');
    // kokoro_say.py refuses a silent or too-short take on purpose. Those have to be read, not
    // swallowed: a clip that "exists" but says nothing is the bug this whole check exists for.
    q('fails').hidden = !fails.length;
    q('fails').innerHTML = fails.length
      ? `<b>${fails.length} take${fails.length === 1 ? '' : 's'} refused by kokoro — no file written</b>`
        + fails.map(f => `<div>${esc(f.key)} — ${esc(f.error)}</div>`).join('')
      : '';
    ctx.toast(fails.length ? `${fails.length} of ${jobs.length} takes failed` : `generated ${done} clips in ${secs}s`,
      fails.length ? 'bad' : 'good');
    host.onIndex?.(index, indexWhere);
    repaint();
  }

  boot();

  return {
    el,
    repaint,
    getIndex: () => index,
    setCharacter() {
      // Another character's run report on this character's panel reads as this character's.
      q('progress').hidden = true;
      q('fails').hidden = true;
      repaint();
    },
    async refreshDisk() { onDisk = await clipsOnDisk(ctx.api); repaint(); },
    // The audition take is scratch: outside the index, one fixed name, overwritten every time.
    async audition(text) {
      const c = chr();
      if (!c?.voice) { ctx.toast('pick a voice first', 'warn'); return null; }
      const r = await ctx.api.tts({ voice: c.voice, text,
        speed: synthSpeed(speedOf(c), pitchOf(c)), out: '__audition' });
      if (!r.ok) { ctx.toast(`kokoro refused: ${r.error}`, 'bad'); return r; }
      try { await playClip('audio/vo/__audition.wav', { pitch: pitchOf(c), bust: true }); }
      catch (e) { ctx.toast(`could not play the audition: ${e.message}`, 'bad'); }
      return r;
    },
  };
}
