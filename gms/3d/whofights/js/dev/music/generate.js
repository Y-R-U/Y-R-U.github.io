// Local generation. Suno is a paid web service an agent cannot drive, so once Aaron's subscription
// lapses this is the only music route the project has — it has to work from cold.
//
// /api/music is a queue, not a call: it answers with a job and a position, and ACE-Step cannot be
// resident at the same time as Flux. One job at a time from here, always.

import { el, esc, field, num } from './ui.js';

const DRAFT = 'wf.dev.music.gen';

export function generate(host, C) {
  const wrap = el('div');
  host.append(wrap);

  let busy = false;
  let last = null;          // {out, url, seconds, prompt, lyrics, …} awaiting keep or discard
  const form = restore();

  const status = el('div', 'banner');
  const progress = el('div', 'dim');
  const result = el('div');

  const outIn = text(form.out, v => (form.out = v.replace(/[^A-Za-z0-9_.-]/g, '_')));
  const titleIn = text(form.title, v => (form.title = v));
  const moodIn = text(form.mood, v => (form.mood = v));
  const secIn = document.createElement('input');
  secIn.type = 'number'; secIn.min = 10; secIn.max = 300; secIn.step = 5; secIn.value = String(form.seconds);
  secIn.oninput = () => { form.seconds = num(secIn.value, 120); stash(); };
  const kindIn = document.createElement('select');
  for (const [v, l] of [['instrumental', 'instrumental'], ['song', 'song (with lyrics)']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = l; kindIn.append(o);
  }
  kindIn.value = form.kind;
  kindIn.onchange = () => { form.kind = kindIn.value; stash(); paintHint(); };

  const promptIn = area(form.prompt, v => (form.prompt = v));
  promptIn.rows = 5;
  const lyricsIn = area(form.lyrics, v => (form.lyrics = v));
  lyricsIn.rows = 8;
  const hint = el('small', 'dim');

  const go = el('button', 'primary', 'Generate');
  go.dataset.act = 'generate';
  const row = el('div', 'row');
  progress.dataset.role = 'progress';
  row.append(go, progress);

  const two = el('div', 'mus-two');
  const left = el('div');
  left.append(field('Track id / filename', outIn, 'written to audio/music/<id>.mp3'),
    field('Title', titleIn), field('Mood', moodIn),
    field('Kind', kindIn), field('Length (seconds)', secIn, 'beds 100–135 s, stings 20–25 s — a take that runs to the cap stops rather than ends'));
  const right = el('div');
  const lyricsField = field('Lyrics', lyricsIn, null);
  right.append(field('Style prompt', promptIn, null), lyricsField);
  right.firstChild.append(hint);
  two.append(left, right);

  wrap.append(status, el('h2', null, 'Generate a track'), two, row, result);

  function paintHint() {
    hint.textContent = form.kind === 'song'
      ? 'Voice character comes from this prompt, not from the lyrics — say "female lead" if that is what you want.'
      : 'Say "instrumental, no vocals" in words, or ACE-Step will put a wordless vocalise over the top.';
    lyricsField.hidden = form.kind !== 'song';
  }

  async function paintStatus() {
    const s = await C.ctx.api.status();
    if (!s.devserver) {
      status.className = 'banner';
      status.innerHTML = '<b class="bad">No dev server.</b> Generation needs one — ' +
        '<code>node tools/devserver.mjs</code>. Everything else on this tab still works.';
      go.disabled = true;
      return;
    }
    const q = s.queue || {};
    status.className = 'banner';
    status.innerHTML = s.ace
      ? `<b class="good">ACE-Step answering.</b> ${q.running ? `Busy: ${esc(q.running.kind)} ${esc(q.running.note || '')}` : 'Idle.'}
         One GPU slot — music and images take turns.`
      : '<b class="warnc">ACE-Step is not answering.</b> The job will queue and fail rather than hang; start it first.';
    go.disabled = busy;
  }

  go.onclick = async () => {
    if (busy) return;
    if (!form.out) return C.ctx.toast('give it an id', 'bad');
    if (!form.prompt.trim()) return C.ctx.toast('a style prompt is the whole instruction', 'bad');
    if ((C.doc().tracks || []).some(t => t.id === form.out)) {
      return C.ctx.toast(`${form.out} is already in the library — pick another id`, 'bad');
    }
    busy = true;
    go.disabled = true;
    result.innerHTML = '';
    progress.textContent = 'submitting…';
    progress.className = 'dim';
    const started = Date.now();
    const r = await C.ctx.api.music(
      { prompt: form.prompt, lyrics: form.kind === 'song' ? form.lyrics : '', seconds: form.seconds, out: form.out },
      p => { progress.textContent = p.position ? `${p.state} — ${p.position} in the queue` : `${p.state}${p.note ? ` — ${p.note}` : ''}`; });
    busy = false;
    go.disabled = false;
    const secs = Math.round((Date.now() - started) / 1000);
    // api.js's queued() builds its failure as {ok:false, ...s} and the spread puts the job's own
    // ok:true back on top, so a failed job arrives looking successful. Read the state, not ok.
    const failed = !r.ok || r.state === 'error' || (!!r.error && !r.url);
    if (failed) {
      progress.className = 'bad';
      progress.textContent = `failed after ${secs}s — ${r.error || 'no reason given'}${r.offline ? ' (dev server unreachable)' : ''}`;
      paintStatus();
      return;
    }
    progress.className = 'good';
    progress.textContent = `done in ${secs}s`;
    last = { out: form.out, url: r.url || `audio/music/${form.out}.mp3`, seconds: form.seconds,
      title: form.title || form.out, kind: form.kind, mood: form.mood,
      prompt: form.prompt, lyrics: form.kind === 'song' ? form.lyrics : '' };
    paintResult();
    paintStatus();
  };

  function paintResult() {
    result.innerHTML = '';
    if (!last) return;
    result.append(el('h2', null, 'Audition'));
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = C.base + last.url;
    audio.style.width = '100%';
    const acts = el('div', 'row');
    const keep = el('button', 'primary', 'Keep — add to the library');
    keep.onclick = () => {
      C.mutate(d => {
        (d.tracks ||= []).push({ id: last.out, title: last.title, file: `audio/music/${last.out}.mp3`,
          kind: last.kind, mood: last.mood, seconds: last.seconds, prompt: last.prompt, lyrics: last.lyrics, source: 'acestep' });
      }, 'keep generated track');
      C.ctx.toast(`${last.out} added — press Save all to write data/music.json`, 'good');
      last = null;
      paintResult();
      C.repaint();
    };
    const drop = el('button', 'danger', 'Discard');
    drop.onclick = () => {
      C.ctx.toast(`${last.out} left out of the library — audio/music/${last.out}.mp3 is still on disk`, 'warn');
      last = null;
      paintResult();
    };
    acts.append(keep, drop);
    result.append(audio, acts, el('p', 'dim',
      'Discard does not delete the file — the dev server only writes. Reuse the id to overwrite it, or delete it by hand.'));
  }

  function stash() { try { localStorage.setItem(DRAFT, JSON.stringify(form)); } catch { /* private mode */ } }

  function text(v, set) {
    const i = document.createElement('input');
    i.type = 'text'; i.value = v;
    i.oninput = () => { const out = set(i.value); if (typeof out === 'string' && out !== i.value) i.value = out; stash(); };
    return i;
  }
  function area(v, set) {
    const t = document.createElement('textarea');
    t.value = v;
    t.oninput = () => { set(t.value); stash(); };
    return t;
  }

  paintHint();
  paintStatus();
  return { paint: paintStatus };
}

function restore() {
  const blank = { out: '', title: '', mood: '', kind: 'instrumental', seconds: 120, prompt: '', lyrics: '' };
  try { return { ...blank, ...(JSON.parse(localStorage.getItem(DRAFT) || 'null') || {}) }; }
  catch { return blank; }
}
