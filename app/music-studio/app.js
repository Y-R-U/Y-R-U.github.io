/* Music Studio — vanilla JS, no build step. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtB = (b) => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round((b || 0) / 1e3) + ' KB';
const ago = (t) => { const s = Date.now() / 1000 - t; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t * 1000).toLocaleDateString(); };
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------------------------------------------------------------- server address */
// Blank = the server that served this page. A hosted copy (yru.br8t.com) needs the LAN
// address set under Offline & settings; it lives in this browser only, never in the code.
const SERVER = String(ls.get('server', '') || '').trim().replace(/\/+$/, '');
const U = (p) => SERVER ? `${SERVER}/${p.replace(/^\//, '')}` : p;
// HTTPS page -> http://192.168.x.x is allowed by Chrome's Local Network Access (one prompt),
// but only for fetch(): audio, downloads and the admin script go through blobs instead.
// No `targetAddressSpace` hint: Chrome spots private IPs / .local itself, and a wrong
// hint (e.g. 'local' for localhost, which is 'loopback') makes the fetch fail outright.
const LNA = {};
const HOSTED = !SERVER && !/^(localhost|127\.0\.0\.1|\[::1\]|.+\.local|\d+\.\d+\.\d+\.\d+)$/.test(location.hostname);
function xfetch(p, init = {}, ms = 0) {
  if (HOSTED) return Promise.reject(new TypeError('no server address set'));
  const ctl = new AbortController(); const t = ms && setTimeout(() => ctl.abort(), ms);
  return fetch(U(p), { ...LNA, ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
}
async function blobUrl(p) {
  const r = await xfetch(p); if (!r.ok) throw new Error(r.statusText); return URL.createObjectURL(await r.blob());
}
async function download(p, name) {
  if (!SERVER) { const a = document.createElement('a'); a.href = p; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return; }
  toast('Preparing download…', 60000);
  const r = await xfetch(p); if (!r.ok) return toast('Download failed: ' + r.statusText);
  const cd = r.headers.get('content-disposition') || '', m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob());
  a.download = m ? decodeURIComponent(m[1]) : name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast('Downloaded');
}

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------------------------------------------------------- IndexedDB */
const IDB = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open('music-studio', 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => { for (const s of ['api', 'audio', 'collections']) r.result.createObjectStore(s); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store);
      const out = fn(s); t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, k) { return this.tx(store, 'readonly', s => s.get(k)).catch(() => undefined); },
  put(store, k, v) { return this.tx(store, 'readwrite', s => s.put(v, k)); },
  del(store, k) { return this.tx(store, 'readwrite', s => s.delete(k)).catch(() => {}); },
  keys(store) { return this.tx(store, 'readonly', s => s.getAllKeys()).catch(() => []); },
};

/* ---------------------------------------------------------------- API (with offline fallback) */
let ONLINE = true;
function setOnline(v) {
  const was = ONLINE; ONLINE = v;
  document.body.classList.toggle('offline', !v);
  $('#netState').classList.toggle('off', !v); $('#netState').title = v ? 'server reachable' : 'offline — showing cached data';
  const c = $('#conn');
  c.className = 'conn ' + (v ? 'on' : 'off');
  c.textContent = v ? 'Connected' : HOSTED ? 'No server set' : 'Not connected';
  c.title = v ? 'Music server reachable' : 'Can\'t reach the music server — saved songs still play, creating is paused. Tap for settings.';
  if (v && !was) { toast('Reconnected to the server'); refresh(); loadAdmin(); }
}

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const init = { method, headers: {} };
  if (opts.body !== undefined) {
    if (opts.body instanceof Blob) init.body = opts.body;
    else { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  }
  try {
    const r = await xfetch('api/' + path, init, method === 'GET' ? 8000 : 0);
    // a static host answering 404 HTML is not our server
    if (!(r.headers.get('content-type') || '').includes('json')) throw new TypeError('not the music server');
    setOnline(true);
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch {} throw Object.assign(new Error(m), { http: r.status }); }
    const data = await r.json();
    if (method === 'GET') IDB.put('api', path, data).catch(() => {});
    return data;
  } catch (e) {
    if (e.http) throw e;
    setOnline(false);
    if (method === 'GET') { const c = await IDB.get('api', path); if (c !== undefined) return c; }
    throw new Error('offline — not available without the server');
  }
}

/* ---------------------------------------------------------------- state */
const S = { config: null, projects: [], playlists: { smart: [], playlists: [] }, offline: {}, view: null, queue: [] };

// filled from the cue test — see music/CLAUDE.md
var CUE_RESULTS = `<table>
<tr><th>Cue (in lyrics box)</th><th style="color:var(--ace)">ACE</th><th style="color:var(--yue2)">YuE2</th></tr>
<tr><td><code>[Verse - whispered]</code> / <code>[whispered]</code> line</td><td>~ not sung; vocals came in at 0 s — listen for softer delivery</td><td>? not sung; untested (clip was all intro)</td></tr>
<tr><td><code>[male voice yelling]</code></td><td>~ not sung; vocal became unintelligible to speech-to-text — probably rougher</td><td>? not sung; untested</td></tr>
<tr><td><code>(female)</code> <code>(male)</code> <code>(both)</code></td><td>✓ not sung, lyrics intact (put "duet" in style too)</td><td>~ not sung; vocals entered earlier (17 s vs 23 s)</td></tr>
<tr><td><code>[Guitar Solo]</code> before the verse</td><td>✓ vocals held back to 13.6 s (others 0–5 s)</td><td>? untested</td></tr>
<tr><td><code>[spoken word]</code></td><td>~ not sung; delivery changed enough that speech-to-text lost it</td><td>? untested</td></tr>
<tr><td><code>(ooh)</code> backing line</td><td>~ came out as "oh, oh" — sung, as intended</td><td>? untested</td></tr>
</table>
<p class="note">Measured with speech-to-text, not ears — 16 clips, seed 4242, in the <b>Cue tests</b> project. No cue was ever sung as a lyric by either model.</p>`;
const HELP = {
  style: {
    title: 'Style — what goes in the style box',
    body: `
<p>Comma-separated tags. Both models read it the same way: <b>genre, mood, instruments, vocal type, tempo</b>.
This is where voice character lives — neither model reliably takes voice instructions from inside the lyrics.</p>
<h4>Examples (click to use)</h4>
<div class="ex"><pre>English, warm piano pop, expressive female voice, acoustic piano, rounded bass, light drums, 88 BPM</pre><button type="button" class="btn small" data-use-style>Use</button></div>
<div class="ex"><pre>dark synthwave, driving arpeggios, gated drums, male baritone vocal, cinematic, 104 BPM</pre><button type="button" class="btn small" data-use-style>Use</button></div>
<div class="ex"><pre>aggressive punk rock, distorted guitars, shouted male vocals, fast, raw, 180 BPM</pre><button type="button" class="btn small" data-use-style>Use</button></div>
<div class="ex"><pre>Instrumental, eerie ambient horror, low drones, detuned music box, sparse piano, no vocals</pre><button type="button" class="btn small" data-use-style>Use</button></div>
<div class="ex"><pre>8-bit chiptune, upbeat adventure, square-wave lead, punchy bass, 140 BPM, video game overworld</pre><button type="button" class="btn small" data-use-style>Use</button></div>
<h4>Per model</h4>
<table>
<tr><td><b style="color:var(--yue2)">YuE2</b></td><td>Start with the language (<code>English, …</code>) — upstream's own examples do. Name the vocal type explicitly (<code>breathy female voice</code>, <code>gritty male tenor</code>). Tempo as <code>NN BPM</code>.</td></tr>
<tr><td><b style="color:var(--ace)">ACE</b></td><td>Same tags. BPM and key can also be set exactly under <i>Options</i>. Duets: say <code>female and male vocals, duet</code> here, then cue lines with <code>(female)</code>/<code>(male)</code>.</td></tr>
</table>`,
  },
  lyrics: {
    title: 'Lyrics — tags and cues',
    body: `
<p>Put each section tag on its own line. Leave lyrics empty (or tick <i>Instrumental</i>) for no vocals.</p>
<h4>Section tags — both models</h4>
<p><code>[Intro]</code> <code>[Verse]</code> <code>[Pre-Chorus]</code> <code>[Chorus]</code> <code>[Bridge]</code> <code>[Outro]</code> — numbering like <code>[Verse 2]</code> is fine.</p>
<pre>[Verse]
Neon fades along the lane
Footsteps keep the time of rain

[Chorus]
Let the day come into view
Every road begins with you</pre>
<h4>Inline cues like <code>[whispered]</code>, <code>(male)</code>, <code>[guitar solo]</code></h4>
<p>Neither model has an official cue language — anything beyond section tags is a <i>hint</i> it may ignore.
The results of testing these cues are below; ✓ = it reliably did something, ~ = sometimes, ✗ = ignored or sang the words.</p>
<div id="cueResults">${CUE_RESULTS}</div>
<h4>Tips</h4>
<ul>
<li>Short, singable lines with a steady syllable count align best.</li>
<li>Voice <i>character</i> (gender, grit, breathiness) still belongs in the style box — cues nudge delivery, they don't recast the singer.</li>
<li><b>YuE2 writes a long intro</b> (~20 s at 118 BPM). Clips under ~45 s may barely reach the vocals; start lyrics with <code>[Verse]</code> and keep the default length.</li>
<li>YuE2 instrumentals: tick <i>Instrumental</i>. It plans a song, moves the vocal melody to an instrument, then renders it — section tags in the lyrics box still shape the structure.</li>
</ul>`,
  },
  cover: {
    title: 'Cover — re-sing a tune (YuE2)',
    body: `
<p>Upload a recording. SheetSage2 transcribes its melody to sheet music (ABC), then YuE2 performs that melody in <b>your</b> style, with <b>your</b> lyrics.</p>
<ul>
<li>It keeps the <b>melody</b>, not the singer, the mix or the arrangement.</li>
<li><i>Keep harmony</i> also keeps the original chords; otherwise YuE2 writes new accompaniment.</li>
<li>Lyrics: write new words that fit the tune's phrasing (same sections, similar syllable counts). Or tick <i>Instrumental</i> for an instrumental cover where an instrument carries the melody.</li>
<li>Only cover material you have rights to if you plan to publish the result.</li>
</ul>`,
  },
};

/* ---------------------------------------------------------------- routing */
async function route() {
  document.body.classList.remove('side-open');
  const [, kind, id] = (location.hash || '#/').split('/');
  closeMenu();
  S.view = { kind: kind || 'home', id };
  highlightNav();
  try {
    if (kind === 'project' && id) await viewProject(id);
    else if (kind === 'playlist' && id) await viewPlaylist(id);
    else if (kind === 'queue') await viewQueue();
    else if (kind === 'offline') await viewOffline();
    else await viewHome();
  } catch (e) {
    setTitle('Not available'); $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}
function setTitle(t, actions = '') { $('#viewTitle').textContent = t; $('#viewActions').innerHTML = actions; document.title = `${t} · Music Studio`; }
function highlightNav() {
  const h = location.hash || '#/';
  $$('#side a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h));
}

async function loadSide() {
  try { S.projects = await api('projects'); } catch {}
  try { S.playlists = await api('playlists'); } catch {}
  S.offline = {};
  for (const k of await IDB.keys('collections')) S.offline[k] = await IDB.get('collections', k);
  const off = (k) => S.offline[k] ? '<span class="off" title="available offline">⤓</span>' : '';
  $('#projectList').innerHTML = S.projects.map(p =>
    `<a href="#/project/${p.id}"><span class="name">${esc(p.name)}</span><span class="n">${off('project:' + p.id)} ${p.n || ''}</span></a>`).join('')
    || '<div class="note" style="padding:6px 10px">No projects yet</div>';
  const pls = [...S.playlists.smart, ...S.playlists.playlists];
  $('#playlistList').innerHTML = pls.map(p =>
    `<a href="#/playlist/${p.id}"><span class="name">${esc(p.name)}</span><span class="n">${off('playlist:' + p.id)} ${p.n || ''}</span></a>`).join('');
  highlightNav();
}

/* ---------------------------------------------------------------- views */
async function viewHome() {
  setTitle('Projects', '<button class="btn primary" data-act="new-project">＋ New project</button>');
  const recent = await api('tracks?limit=8&status=done').catch(() => []);
  $('#view').innerHTML = `
    <div class="grid">${S.projects.map(p => `<a class="tile" href="#/project/${p.id}"><b>${esc(p.name)}</b>
      <span class="note">${p.n || 0} track${p.n == 1 ? '' : 's'}${p.last_track ? ' · ' + ago(p.last_track) : ''}</span></a>`).join('')
      || '<div class="empty">Create a project folder to start making music.</div>'}</div>
    <div class="list-h" style="margin-top:24px"><h3>Recent tracks</h3><a class="btn small" href="#/playlist/recent">All tracks</a></div>
    <div class="tracks" id="trackList"></div>`;
  renderTracks(recent, $('#trackList'));
}

async function viewProject(id) {
  const p = await api('projects/' + id);
  S.project = p;
  setTitle(p.name, `
    <button class="btn" data-act="offline" data-kind="project" data-id="${p.id}">${S.offline['project:' + p.id] ? '⤓ Update offline' : '⤓ Keep offline'}</button>
    <button class="icon" data-act="project-menu" title="Project options">⋯</button>`);
  $('#view').innerHTML = `<div class="split">
      <section class="card create" id="create"></section>
      <section>
        <div id="draftWrap"></div>
        <div class="list-h"><h3>Tracks</h3><span class="note" id="projCount"></span></div>
        <div class="tracks" id="trackList"></div>
      </section></div>`;
  renderCreate($('#create'), p.id);
  // phones: the form is long, so fold it away once the project has tracks
  $('#create').classList.toggle('collapsed', ls.get('create-open', null) === null ? p.tracks.length > 0 : !ls.get('create-open'));
  renderProjectLists(p);
}
function renderProjectLists(p) {
  $('#draftWrap').innerHTML = p.drafts.length ? `<div class="list-h"><h3>Lyric sheets</h3></div><div class="drafts">${p.drafts.map(d => `
      <div class="draft"><div class="meta"><div class="t1"><b>${esc(d.title || 'Untitled sheet')}</b></div>
      <div class="note">${d.author ? 'by ' + esc(d.author) + ' · ' : ''}${ago(d.updated)}${d.notes ? ' · ' + esc(d.notes) : ''}</div></div>
      <button class="btn small" data-act="load-draft" data-id="${d.id}">Load</button>
      <button class="icon" data-act="del-draft" data-id="${d.id}" title="Delete sheet">✕</button></div>`).join('')}</div>` : '';
  $('#projCount').textContent = p.tracks.length ? `${p.tracks.length}` : '';
  renderTracks(p.tracks, $('#trackList'), { empty: 'Nothing generated yet — fill in the form and hit Create.' });
}

async function viewPlaylist(id) {
  const p = await api('playlists/' + id);
  setTitle(p.name, `
    <button class="btn" data-act="play-all">▶ Play all</button>
    <button class="btn" data-act="offline" data-kind="playlist" data-id="${p.id}">${S.offline['playlist:' + p.id] ? '⤓ Update offline' : '⤓ Keep offline'}</button>
    ${p.smart ? '' : '<button class="icon" data-act="playlist-menu" title="Playlist options">⋯</button>'}`);
  S.playlist = p;
  $('#view').innerHTML = `<div class="tracks" id="trackList"></div>`;
  renderTracks(p.tracks, $('#trackList'), { showProject: true, playlist: p.smart ? null : p.id, empty: 'No tracks here yet.' });
}

async function viewQueue() {
  const q = await api('queue');
  setTitle('Queue');
  $('#view').innerHTML = `<p class="note">One job at a time. Before each job every other model on the server (LLMs, the other music model, image gen) is unloaded; jobs wait if something else is busy.</p>
    <div class="tracks" id="trackList"></div>`;
  renderTracks(q, $('#trackList'), { showProject: true, empty: 'Queue is empty.' });
}

/* ---------------------------------------------------------------- track list */
function trackLine2(t, opts) {
  const bits = [];
  if (opts.showProject && t.project_name) bits.push(esc(t.project_name));
  if (t.status === 'done') {
    bits.push(fmtT(t.duration));
    if (t.truncated) bits.push('cut at max length');
    bits.push(ago(t.created));
  } else if (t.status === 'failed') bits.push('failed: ' + esc(t.error || ''));
  else if (t.status === 'cancelled') bits.push('cancelled');
  else bits.push(esc(t.progress || t.status));
  return bits.join(' · ');
}
const LISTS = new Map();
function renderTracks(tracks, el, opts = {}) {
  LISTS.set(el, { tracks, opts });
  if (!tracks.length) { el.innerHTML = `<div class="empty">${opts.empty || 'Nothing here.'}</div>`; return; }
  el.innerHTML = tracks.map(t => {
    const busy = t.status === 'queued' || t.status === 'running';
    const cover = t.params && t.params.cover;
    return `<div class="trk st-${t.status} ${PL.cur && PL.cur.id === t.id ? 'playing' : ''}" data-tid="${t.id}">
      <button class="pbtn" data-act="play" ${t.audio ? '' : 'disabled'} aria-label="Play">${busy ? '⋯' : t.status === 'done' ? (PL.cur && PL.cur.id === t.id && !PL.a.paused ? '❚❚' : '▶') : '!'}</button>
      <div class="meta"><div class="t1"><span class="badge ${t.model}">${t.model === 'ace' ? 'ACE' : 'YuE2'}</span>${cover ? '<span class="badge cover">COVER</span>' : ''}${esc(t.title)}</div>
        <div class="t2">${trackLine2(t, opts)} <span class="cached" data-cached="${t.id}"></span></div>
        ${busy ? `<div class="prog"><i style="width:${Math.round((t.pct || 0) * 100)}%"></i></div>` : ''}</div>
      <div class="right">
        ${t.status === 'done' ? `<button class="icon fav ${t.favorite ? 'on' : ''}" data-act="fav" title="Favourite">♥</button>` : ''}
        <button class="icon" data-act="track-menu" title="More">⋯</button></div></div>`;
  }).join('');
  markCached(el);
}
async function markCached(el) {
  const keys = new Set(await IDB.keys('audio'));
  $$('[data-cached]', el).forEach(s => { s.textContent = keys.has(s.dataset.cached) ? '⤓ offline' : ''; });
}
function findTrack(tid) {
  for (const { tracks } of LISTS.values()) { const t = tracks.find(x => x.id === tid); if (t) return t; }
}

/* ---------------------------------------------------------------- create form */
const FORM_DEFAULT = { models: ['yue2'], title: '', style: '', lyrics: '', instrumental: false, variations: 1, seed: '',
  ace: { model: 'acestep-v15-turbo', duration: 120, steps: 8, thinking: true, bpm: '', key: '', language: 'en' },
  yue2: { max_seconds: 240, cot: 'full', cfg_scale: '', intro: 'short' }, cover: null };

function formKey(pid) { return 'form:' + pid; }
function getForm(pid) {
  const f = ls.get(formKey(pid), null) || ls.get('form:last', null) || {};
  return { ...structuredClone(FORM_DEFAULT), ...f, ace: { ...FORM_DEFAULT.ace, ...(f.ace || {}) }, yue2: { ...FORM_DEFAULT.yue2, ...(f.yue2 || {}) } };
}
function saveForm(pid, f) { ls.set(formKey(pid), f); ls.set('form:last', { ...f, title: '', lyrics: '', cover: null }); }

function renderCreate(el, pid) {
  const f = getForm(pid);
  const aceModels = Object.entries(S.config?.ace_models || { 'acestep-v15-turbo': 'ACE turbo' });
  el.innerHTML = `
    <h3 class="create-h" data-act="toggle-create">Create <span class="only-mobile caret">▾</span></h3>
    <div class="field"><div class="lbl">Model — pick one, or both to compare</div>
      <div class="models">
        <button type="button" class="chip ace" data-model="ace"><b>ACE-Step</b><small>fast · weaker vocals</small></button>
        <button type="button" class="chip yue2" data-model="yue2"><b>YuE2</b><small>~6× slower · best vocals</small></button>
      </div></div>
    <div class="field"><label>Title <span class="note">(optional)</span></label><input type="text" id="f_title" maxlength="80"></div>
    <div class="field"><div class="lbl">Style <button type="button" class="help" data-help="style">?</button></div>
      <textarea id="f_style" rows="3" placeholder="genre, mood, instruments, vocal type, BPM"></textarea></div>
    <div class="field"><div class="lbl"><span class="grow">Lyrics <button type="button" class="help" data-help="lyrics">?</button></span>
      <button type="button" class="btn small" data-act="write-lyrics">✨ Write lyrics</button></div>
      <textarea id="lyrics" placeholder="[Verse]&#10;…&#10;&#10;[Chorus]&#10;…"></textarea>
      <div class="tags">${['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]'].map(t => `<button type="button" class="tag" data-ins="${t}">${t}</button>`).join('')}</div>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="f_instr"> Instrumental (no vocals)</label></div>
    <div class="field" id="coverBox">
      <div class="lbl">Cover a tune <span class="note">(YuE2 only)</span> <button type="button" class="help" data-help="cover">?</button></div>
      <div id="coverState"></div>
    </div>
    <details ${ls.get('opts-open', false) ? 'open' : ''}><summary>Options</summary>
      <div class="opt-grid">
        <div class="field"><label>Variations (per model)</label><select id="f_var">${[1, 2, 3, 4].map(n => `<option>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Seed <span class="note">blank = random</span></label><input type="number" id="f_seed" min="0"></div>
        <div class="opt-h ace" data-for="ace">ACE-Step</div>
        ${aceModels.length > 1 ? `<div class="field" data-for="ace" style="grid-column:1/-1"><label>Checkpoint</label><select id="a_model">${aceModels.map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></div>` : ''}
        <div class="field" data-for="ace"><label>Length (s)</label><input type="number" id="a_duration" min="10" max="480"></div>
        <div class="field" data-for="ace"><label>Steps</label><input type="number" id="a_steps" min="4" max="16"></div>
        <div class="field" data-for="ace"><label>BPM <span class="note">blank = auto</span></label><input type="number" id="a_bpm" min="40" max="240"></div>
        <div class="field" data-for="ace"><label>Key <span class="note">e.g. A minor</span></label><input type="text" id="a_key"></div>
        <div class="field" data-for="ace"><label>Vocal language</label><select id="a_language">${['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru'].map(l => `<option>${l}</option>`).join('')}</select></div>
        <div class="field" data-for="ace"><label class="check" style="margin-top:22px"><input type="checkbox" id="a_thinking"> Thinking (better vocals)</label></div>
        <div class="opt-h yue2" data-for="yue2">YuE2</div>
        <div class="field" data-for="yue2"><label>Max length (s)</label><input type="number" id="y_max_seconds" min="10" max="360"></div>
        <div class="field" data-for="yue2"><label>Planning</label><select id="y_cot">
          <option value="full">full — melody + chords (default)</option><option value="melody">melody only</option><option value="off">off — no score</option></select></div>
        <div class="field" data-for="yue2"><label>Intro</label><select id="y_intro">
          <option value="short">short — 4 bars, ~8 s (default)</option><option value="minimal">1 bar — straight in</option><option value="none">none</option><option value="auto">model's choice — often 20 s+</option></select></div>
        <div class="field" data-for="yue2"><label>Guidance <span class="note">blank = default</span></label><input type="number" id="y_cfg_scale" min="0" max="20" step="0.1"></div>
      </div>
      <p class="note" data-for="yue2">YuE2 decides the song length from its plan; "max length" cuts it off (with a fade on export) if it runs long. Roughly 6–7 s of compute per second of audio.</p>
    </details>
    <div class="actions"><button type="button" class="btn" data-act="save-draft">Save sheet</button>
      <button type="button" class="btn primary" data-act="generate">Create</button></div>`;

  const set = (sel, v) => { const e = $(sel, el); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v ?? ''; };
  set('#f_title', f.title); set('#f_style', f.style); set('#lyrics', f.lyrics); set('#f_instr', f.instrumental);
  set('#f_var', f.variations); set('#f_seed', f.seed);
  for (const k of Object.keys(FORM_DEFAULT.ace)) set('#a_' + k, f.ace[k]);
  for (const k of Object.keys(FORM_DEFAULT.yue2)) set('#y_' + k, f.yue2[k]);
  el._form = f;
  el._pid = pid;
  syncModels(el);
  renderCover(el);
  el.addEventListener('input', () => saveForm(pid, readForm(el)));
  el.addEventListener('change', () => saveForm(pid, readForm(el)));
  $('details', el).addEventListener('toggle', e => ls.set('opts-open', e.target.open));
}
function readForm(el) {
  const v = (s) => { const e = $(s, el); return !e ? undefined : e.type === 'checkbox' ? e.checked : e.value; };
  const f = el._form;
  f.title = v('#f_title'); f.style = v('#f_style'); f.lyrics = v('#lyrics'); f.instrumental = v('#f_instr');
  f.variations = +v('#f_var') || 1; f.seed = v('#f_seed');
  for (const k of Object.keys(FORM_DEFAULT.ace)) { const x = v('#a_' + k); if (x !== undefined) f.ace[k] = x; }
  for (const k of Object.keys(FORM_DEFAULT.yue2)) { const x = v('#y_' + k); if (x !== undefined) f.yue2[k] = x; }
  return f;
}
function syncModels(el) {
  const f = el._form;
  if (f.cover) f.models = ['yue2'];
  $$('.chip', el).forEach(c => c.classList.toggle('on', f.models.includes(c.dataset.model)));
  $$('[data-for]', el).forEach(x => x.hidden = !f.models.includes(x.dataset.for));
  $('#coverBox', el).hidden = !f.models.includes('yue2');
  $('[data-act=generate]', el).textContent = f.models.length === 2 ? `Create both (A/B)` : 'Create';
}
function renderCover(el) {
  const f = el._form, box = $('#coverState', el);
  if (!f.cover) {
    box.innerHTML = `<label class="btn small" style="display:inline-block">Choose audio…<input type="file" accept="audio/*" id="coverFile" hidden></label>
      <span class="note">mp3 / wav / flac / m4a</span>`;
    $('#coverFile', el).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      box.innerHTML = '<span class="note">uploading…</span>';
      try {
        const r = await xfetch('api/uploads?name=' + encodeURIComponent(file.name), { method: 'POST', body: file });
        if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
        const u = await r.json();
        f.cover = { upload_id: u.id, name: file.name, keep_harmony: false };
        saveForm(el._pid, f); syncModels(el); renderCover(el);
      } catch (err) { toast('Upload failed: ' + err.message); renderCover(el); }
    });
  } else {
    box.innerHTML = `<div class="warnbox" style="margin:0">🎵 <b>${esc(f.cover.name)}</b> — melody will be transcribed and re-sung.
      <label class="check" style="margin-top:6px"><input type="checkbox" id="c_harm" ${f.cover.keep_harmony ? 'checked' : ''}> Keep original harmony</label>
      <button type="button" class="btn small" data-act="cover-clear" style="margin-top:6px">Remove reference</button></div>`;
    $('#c_harm', el).addEventListener('change', e => { f.cover.keep_harmony = e.target.checked; saveForm(el._pid, f); });
  }
}

async function doGenerate(el) {
  const f = readForm(el);
  if (!f.models.length) return toast('Pick a model');
  if (!f.style.trim()) return toast('Style is empty');
  if (f.models.includes('yue2') && !f.instrumental && !f.lyrics.trim()) {
    return toast('YuE2 needs lyrics — or tick Instrumental');
  }
  const body = { project_id: el._pid, models: f.models, title: f.title, style: f.style, lyrics: f.instrumental ? '' : f.lyrics,
    instrumental: f.instrumental, variations: f.variations, seed: f.seed === '' ? null : +f.seed,
    ace: { ...f.ace, duration: +f.ace.duration, steps: +f.ace.steps, bpm: f.ace.bpm ? +f.ace.bpm : null },
    yue2: { ...f.yue2, max_seconds: +f.yue2.max_seconds, cfg_scale: f.yue2.cfg_scale === '' ? null : +f.yue2.cfg_scale, cover: f.cover } };
  if (f.instrumental && f.lyrics.trim()) body.lyrics = f.lyrics.split('\n').filter(l => /^\s*\[.*\]\s*$/.test(l)).join('\n\n');
  const btn = $('[data-act=generate]', el); btn.disabled = true;
  try {
    const r = await api('generate', { method: 'POST', body });
    toast(`Queued ${r.tracks.length} track${r.tracks.length > 1 ? 's' : ''}`);
    if (f.cover) { f.cover = null; saveForm(el._pid, f); syncModels(el); renderCover(el); }
    await refreshProject();
    poll();
  } catch (e) { toast(e.message); }
  btn.disabled = false;
}

async function refreshProject() {
  if (S.view.kind !== 'project') return;
  const p = await api('projects/' + S.view.id).catch(() => null);
  if (p && S.view.kind === 'project' && S.view.id === p.id) { S.project = p; renderProjectLists(p); }
}

/* ---------------------------------------------------------------- dialogs + menus */
function dialog(html, onSubmit) {
  const d = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = html;
  f.onsubmit = async (e) => {
    const v = e.submitter && e.submitter.value;
    if (v === 'cancel' || !onSubmit) return;
    e.preventDefault();
    const keep = await onSubmit(f, v);
    if (keep !== true) d.close();
  };
  d.showModal();
  const first = $('input,textarea,select', f); if (first) first.focus();
  return f;
}
function ask(title, value = '', label = 'Name') {
  return new Promise(res => {
    dialog(`<h2>${esc(title)}</h2><div class="field"><label>${esc(label)}</label><input type="text" name="v" value="${esc(value)}" required></div>
      <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">OK</button></div>`,
      (f) => res(f.v.value.trim()));
    $('#dlg').addEventListener('close', () => res(null), { once: true });
  });
}
function showHelp(key) {
  const h = HELP[key];
  dialog(`<h2>${esc(h.title)}</h2><div class="helpdoc">${h.body}</div><div class="actions"><button class="btn primary" value="cancel">Close</button></div>`);
  $$('[data-use-style]', $('#dlgForm')).forEach(b => b.onclick = () => {
    const ta = $('#f_style'); if (ta) { ta.value = b.previousElementSibling.textContent; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    $('#dlg').close();
  });
  $$('[data-use-lyric]', $('#dlgForm')).forEach(b => b.onclick = () => { insertAtCursor($('#lyrics'), b.dataset.useLyric); $('#dlg').close(); });
}
function insertAtCursor(ta, text) {
  if (!ta) return;
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  const pre = ta.value.slice(0, s), needNl = pre && !pre.endsWith('\n') && /^\[/.test(text);
  const ins = (needNl ? '\n' : '') + text + (/^\[(intro|verse|pre-chorus|chorus|bridge|outro)/i.test(text) ? '\n' : ' ');
  ta.value = pre + ins + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + ins.length; ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

let MENU = null;
function closeMenu() { if (MENU) { MENU.remove(); MENU = null; } }
function menu(anchor, items) {
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" data-i="${i}" ${it.danger ? 'class="danger" style="color:var(--bad)"' : ''}>${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8);
  m.style.top = Math.max(8, top) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  m.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; closeMenu(); items[+b.dataset.i].fn(); });
  MENU = m;
}

function trackMenu(anchor, t) {
  const list = LISTS.get(anchor.closest('.tracks'));
  const items = [];
  if (t.status === 'done') {
    items.push({ label: 'Export MP3…', fn: () => exportDialog(t) });
    items.push({ label: 'Add to playlist…', fn: () => addToPlaylist(t) });
  }
  items.push({ label: 'Show lyrics & settings', fn: () => showTrack(t) });
  items.push({ label: 'Reuse settings in form', fn: () => reuse(t) });
  if (t.status === 'done') items.push({ label: 'Rename', fn: async () => { const n = await ask('Rename track', t.title, 'Title'); if (n) { await api('tracks/' + t.id, { method: 'PATCH', body: { title: n } }); refresh(); } } });
  items.push({ label: 'Move to project…', fn: () => moveTrack(t) });
  if (list && list.opts.playlist) items.push({ label: 'Remove from this playlist', fn: async () => { await api('playlists/' + list.opts.playlist, { method: 'PATCH', body: { remove: [t.id] } }); refresh(); } });
  if (t.status === 'queued' || t.status === 'running') items.push({ label: 'Cancel', fn: async () => { await api(`tracks/${t.id}/cancel`, { method: 'POST' }); refresh(); } });
  if (t.status === 'failed' || t.status === 'cancelled') items.push({ label: 'Retry', fn: async () => { await api(`tracks/${t.id}/retry`, { method: 'POST' }); refresh(); poll(); } });
  items.push('-');
  items.push({ label: 'Delete', danger: true, fn: async () => {
    if (!confirmInline(`Delete "${t.title}"?`)) return;
    try { await api('tracks/' + t.id, { method: 'DELETE' }); await IDB.del('audio', t.id); refresh(); } catch (e) { toast(e.message); } } });
  menu(anchor, items);
}
// window.confirm is a modal browser dialog; fine on a user click, never from automation
function confirmInline(msg) { return window.confirm(msg); }

function exportDialog(t) {
  const presets = S.config?.mp3_presets || { 192: '192 kbps' };
  const last = ls.get('export', { preset: '192', fade: !!t.truncated, normalize: false });
  dialog(`<h2>Export “${esc(t.title)}”</h2>
    <div class="field"><label>MP3 quality</label><select name="preset">${Object.entries(presets).map(([k, v]) => `<option value="${k}" ${k === last.preset ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" name="fade" ${last.fade || t.truncated ? 'checked' : ''}> Fade out the last 2.5 s ${t.truncated ? '<span class="note">(recommended — this one was cut at max length)</span>' : ''}</label>
    <label class="check" style="margin-top:6px"><input type="checkbox" name="normalize" ${last.normalize ? 'checked' : ''}> Normalise loudness (-14 LUFS, streaming level)</label>
    <p class="note">Or download the lossless <a href="#" data-dl="api/tracks/${t.id}/export?master=1" data-name="${esc(t.title)}.flac" style="text-decoration:underline">FLAC master</a>.</p>
    <div class="actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Download</button></div>`,
    (f) => {
      const o = { preset: f.preset.value, fade: f.fade.checked, normalize: f.normalize.checked };
      ls.set('export', o);
      download(`api/tracks/${t.id}/export?preset=${o.preset}&fade=${+o.fade}&normalize=${+o.normalize}`, t.title + '.mp3');
      if (!SERVER) toast('Encoding… the download starts when ready');
    });
}
async function addToPlaylist(t) {
  const pls = S.playlists.playlists;
  dialog(`<h2>Add to playlist</h2>
    <div class="field"><select name="pl">${pls.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}<option value="__new">＋ New playlist…</option></select></div>
    <div class="actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Add</button></div>`,
    async (f) => {
      let id = f.pl.value;
      if (id === '__new') { const n = await ask('New playlist'); if (!n) return; id = (await api('playlists', { method: 'POST', body: { name: n } })).id; }
      await api('playlists/' + id, { method: 'PATCH', body: { add: [t.id] } });
      toast('Added'); loadSide();
    });
}
async function moveTrack(t) {
  dialog(`<h2>Move to project</h2>
    <div class="field"><select name="p">${S.projects.map(p => `<option value="${p.id}" ${p.id === t.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Move</button></div>`,
    async (f) => { await api('tracks/' + t.id, { method: 'PATCH', body: { project_id: f.p.value } }); refresh(); loadSide(); });
}
async function showTrack(t) {
  const full = await api('tracks/' + t.id).catch(() => t);
  const p = full.params || {};
  const opts = Object.entries(p).filter(([k, v]) => v !== null && v !== '' && k !== 'cover').map(([k, v]) => `${k}: ${v}`).join(' · ');
  dialog(`<h2>${esc(full.title)}</h2>
    <p class="note"><span class="badge ${full.model}">${full.model === 'ace' ? 'ACE' : 'YuE2'}</span>${esc(full.variant || '')} · seed ${full.seed}${full.duration ? ' · ' + fmtT(full.duration) : ''}</p>
    ${p.cover ? `<p class="note">Cover of <b>${esc(p.cover.name)}</b>${p.cover.keep_harmony ? ' (original harmony kept)' : ''}</p>` : ''}
    <div class="field"><label>Style</label><pre class="lyr">${esc(full.style)}</pre></div>
    <div class="field"><label>Lyrics</label><pre class="lyr">${esc(full.lyrics || '(instrumental)')}</pre></div>
    <p class="note">${esc(opts)}</p>
    ${full.score ? `<details><summary>Score (ABC) YuE2 planned</summary><pre class="lyr">${esc(full.score)}</pre></details>` : ''}
    ${full.error ? `<div class="warnbox">${esc(full.error)}</div>` : ''}
    <div class="actions"><button class="btn" value="cancel">Close</button></div>`);
}
function reuse(t) {
  if (S.view.kind !== 'project' || S.view.id !== t.project_id) {
    const f = getForm(t.project_id); applyTrackToForm(f, t); saveForm(t.project_id, f);
    location.hash = '#/project/' + t.project_id; return;
  }
  const el = $('#create'); const f = el._form; applyTrackToForm(f, t); saveForm(el._pid, f); renderCreate(el, el._pid);
  el.scrollIntoView({ behavior: 'smooth' }); toast('Settings loaded into the form');
}
function applyTrackToForm(f, t) {
  const p = t.params || {};
  Object.assign(f, { models: [t.model], title: t.title, style: t.style, lyrics: t.lyrics, instrumental: !!p.instrumental, seed: t.seed });
  if (t.model === 'ace') Object.assign(f.ace, { duration: p.duration, steps: p.steps, thinking: p.thinking, bpm: p.bpm || '', key: p.key || '', language: p.language || 'en', model: t.variant });
  else Object.assign(f.yue2, { max_seconds: p.max_seconds, cot: p.cot, cfg_scale: p.cfg_scale ?? '', intro: p.intro || 'auto' });
  f.cover = null;
}

function lyricsDialog(el) {
  const models = S.config?.lyric_models || {};
  const last = ls.get('lyric-model', Object.keys(models)[0]);
  const hasL = $('#lyrics', el).value.trim();
  dialog(`<h2>✨ Write lyrics</h2>
    <p class="note">Quick drafts from a local model. For lyrics that really matter, ask Claude — it can drop a finished lyric sheet straight into this project.</p>
    <div class="field"><label>What's the song about?</label><textarea name="brief" rows="3" placeholder="e.g. a lighthouse keeper waiting for a ship that never comes; hopeful chorus"></textarea></div>
    <div class="field"><label>Structure</label><select name="len">
      <option value="verse, chorus, verse, chorus, bridge, chorus">Full song (V C V C B C)</option>
      <option value="verse, chorus">Short (V C) — ~1 min</option>
      <option value="intro, verse, chorus, outro">Game loop (intro V C outro)</option></select></div>
    ${hasL ? '<label class="check"><input type="checkbox" name="revise"> Revise the current lyrics instead of starting over</label>' : ''}
    <div class="field" style="margin-top:10px"><label>Model</label><select name="model">${Object.entries(models).map(([k, v]) => `<option value="${k}" ${k === last ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" name="style" checked> Also fill style and title if they're empty</label>
    <div class="actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Write</button></div>`,
    async (f, v) => {
      const btn = $('button[value=ok]', f); btn.disabled = true; btn.textContent = S.queue.some(t => t.status === 'running') ? 'Waiting for the music job to finish…' : 'Writing… (loading model)';
      ls.set('lyric-model', f.model.value);
      try {
        const r = await api('lyrics', { method: 'POST', body: { brief: f.brief.value, model: f.model.value, length: f.len.value,
          style: $('#f_style', el).value, lyrics: f.revise && f.revise.checked ? $('#lyrics', el).value : '' } });
        $('#lyrics', el).value = r.lyrics || '';
        if (f.style.checked) {
          if (!$('#f_style', el).value.trim() && r.style) $('#f_style', el).value = r.style;
          if (!$('#f_title', el).value.trim() && r.title) $('#f_title', el).value = r.title;
        }
        $('#f_instr', el).checked = false;
        el.dispatchEvent(new Event('input'));
      } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Write'; return true; }
    });
}

/* ---------------------------------------------------------------- player */
const PL = { a: null, list: [], i: -1, cur: null, urls: [] };
async function playTrack(t, list) {
  PL.list = list || [t]; PL.i = PL.list.findIndex(x => x.id === t.id); PL.cur = t;
  PL.urls.forEach(u => URL.revokeObjectURL(u)); PL.urls = [];
  const cached = await IDB.get('audio', t.id);
  let src = 'api/' + t.audio.replace(/^api\//, '');
  if (cached && cached.blob) { src = URL.createObjectURL(cached.blob); PL.urls.push(src); }
  else if (SERVER) {  // remote server: an <audio src=http://…> would be blocked as mixed content
    try { src = await blobUrl(src); PL.urls.push(src); } catch { return toast('Not connected — this track isn\'t saved offline'); }
  }
  PL.a.src = src;
  PL.a.play().catch(() => {});
  $('#player').hidden = false;
  $('#plTitle').textContent = t.title;
  $('#plSub').textContent = `${t.model === 'ace' ? 'ACE-Step' : 'YuE2'}${t.project_name ? ' · ' + t.project_name : ''}${cached ? ' · offline copy' : ''}`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.model === 'ace' ? 'ACE-Step' : 'YuE2', album: t.project_name || 'Music Studio' });
  }
  paintPlaying();
}
function paintPlaying() {
  $$('.trk').forEach(r => {
    const on = PL.cur && r.dataset.tid === PL.cur.id; r.classList.toggle('playing', on);
    const b = $('.pbtn', r); if (b && !b.disabled) b.textContent = on && !PL.a.paused ? '❚❚' : '▶';
  });
  $('#plPlay').textContent = PL.a.paused ? '▶' : '❚❚';
}
function step(d) {
  const n = PL.list.length; if (!n) return;
  for (let k = 1; k <= n; k++) { const t = PL.list[(PL.i + d * k + n * k) % n]; if (t.audio) return playTrack(t, PL.list); }
}
function initPlayer() {
  PL.a = $('#audio');
  PL.a.addEventListener('play', paintPlaying); PL.a.addEventListener('pause', paintPlaying);
  PL.a.addEventListener('ended', () => { if (PL.i < PL.list.length - 1) step(1); else paintPlaying(); });
  PL.a.addEventListener('timeupdate', () => {
    $('#plCur').textContent = fmtT(PL.a.currentTime); $('#plDur').textContent = fmtT(PL.a.duration);
    if (!PL.seeking && PL.a.duration) $('#plSeek').value = Math.round(PL.a.currentTime / PL.a.duration * 1000);
  });
  $('#plSeek').addEventListener('input', () => { PL.seeking = true; });
  $('#plSeek').addEventListener('change', e => { if (PL.a.duration) PL.a.currentTime = e.target.value / 1000 * PL.a.duration; PL.seeking = false; });
  $('#plPlay').onclick = () => PL.a.paused ? PL.a.play() : PL.a.pause();
  $('#plPrev').onclick = () => (PL.a.currentTime > 3 ? (PL.a.currentTime = 0) : step(-1));
  $('#plNext').onclick = () => step(1);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }
}

/* ---------------------------------------------------------------- offline */
const SECURE = window.isSecureContext;
let SW_REG = null;

async function cacheCollection(kind, id, quiet) {
  const m = await api(`offline/${kind}/${id}`);
  const key = `${kind}:${id}`;
  const have = new Set(await IDB.keys('audio'));
  let got = 0, bytes = 0;
  for (const t of m.tracks) {
    if (!t.audio) continue;
    const cur = have.has(t.id) ? await IDB.get('audio', t.id) : null;
    if (cur && cur.etag === t.audio_etag) continue;
    if (!quiet) toast(`Downloading ${++got}… ${t.title}`, 60000);
    const r = await xfetch('api/tracks/' + t.id + '/play.mp3');
    if (!r.ok) continue;
    const blob = await r.blob(); bytes += blob.size;
    await IDB.put('audio', t.id, { etag: t.audio_etag, blob, title: t.title });
  }
  // keep the track metadata browsable offline
  await api(kind === 'project' ? 'projects/' + id : 'playlists/' + id).catch(() => {});
  await IDB.put('collections', key, { kind, id, name: m.name, tracks: m.tracks.map(t => t.id), bytes: m.bytes, synced: Date.now() / 1000 });
  await pruneAudio();
  if (!quiet) toast(got ? `${m.name}: ${got} new/updated track${got > 1 ? 's' : ''} saved offline` : `${m.name} is up to date`);
  return got;
}
async function pruneAudio() {
  // drop audio no cached collection still references
  const keep = new Set();
  for (const k of await IDB.keys('collections')) (await IDB.get('collections', k)).tracks.forEach(t => keep.add(t));
  for (const k of await IDB.keys('audio')) if (!keep.has(k)) await IDB.del('audio', k);
}
async function removeCollection(key) { await IDB.del('collections', key); await pruneAudio(); }

async function checkAppUpdate() {
  const r = await xfetch('api/version', { cache: 'no-store' }).then(r => r.json());
  const have = ls.get('app-version', null);
  if (SW_REG) {
    await SW_REG.update().catch(() => {});
    // refresh the cached copy of the page itself
    await new Promise(res => {
      const ch = new MessageChannel(); ch.port1.onmessage = () => res();
      (navigator.serviceWorker.controller || SW_REG.active)?.postMessage({ type: 'refresh-shell' }, [ch.port2]);
      setTimeout(res, 8000);
    });
  }
  ls.set('app-version', r.version);
  return { changed: have && have !== r.version, version: r.version };
}
async function updateEverything() {
  if (!ONLINE && !(await xfetch('api/version', {}, 6000).then(() => true).catch(() => false))) return toast('Server not reachable');
  toast('Checking for updates…', 60000);
  const app = await checkAppUpdate().catch(() => ({}));
  let n = 0;
  for (const k of await IDB.keys('collections')) {
    const c = await IDB.get('collections', k);
    try { n += await cacheCollection(c.kind, c.id, true); } catch (e) { if (e.http === 404) await removeCollection(k); }
  }
  toast(`Done — ${n} track${n === 1 ? '' : 's'} updated${app.changed ? '; app updated, reloading…' : ''}`);
  if (app.changed) setTimeout(() => location.reload(), 1200);
  else { loadSide(); if (S.view.kind === 'offline') viewOffline(); }
}

async function viewOffline() {
  setTitle('Offline & settings');
  const cols = [];
  for (const k of await IDB.keys('collections')) cols.push({ key: k, ...(await IDB.get('collections', k)) });
  let est = null;
  try { est = await navigator.storage.estimate(); } catch {}
  let persisted = false; try { persisted = await navigator.storage.persisted(); } catch {}
  const httpsUrl = S.config?.https_url || `https://${location.hostname}:7878/`;
  $('#view').innerHTML = `<div class="stack" style="max-width:720px">
    <section class="card" id="serverCard">
      <h3>Server <span class="conn ${ONLINE ? 'on' : 'off'}">${ONLINE ? 'Connected' : 'Not connected'}</span></h3>
      <p class="note">${SERVER ? 'This page talks to the server below.' : HOSTED ? 'This is the hosted copy — enter your music server\'s address to connect.' : 'Blank = the server this page came from.'}
        Saved in this browser only. Away from home it simply shows as not connected: saved songs keep playing, creating waits until you're back.</p>
      <form class="row" style="flex-wrap:wrap" data-form="server">
        <input name="server" type="url" style="flex:1;min-width:220px" placeholder="${HOSTED ? 'http://192.168.x.x:7877' : 'blank = this server'}" value="${esc(SERVER)}">
        <button class="btn" type="button" data-act="server-test" style="flex:0 0 auto">Test</button>
        <button class="btn primary" type="button" data-act="server-save" style="flex:0 0 auto">Save</button></form>
      <p class="note" id="serverMsg"></p>
    </section>
    <section class="card">
      <h3>Update</h3>
      <p class="note">When the server is reachable the page always loads fresh. The saved copy is only used offline, so it can be out of date — these buttons refresh it.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn primary" data-act="update-all">⟳ Update everything</button>
        <button class="btn" data-act="update-app">Check app update</button></div>
      <p class="note">“Update everything” = new app version (if any) + re-sync every playlist and folder you've saved offline.</p>
    </section>
    <section class="card">
      <h3>Saved for offline</h3>
      ${cols.length ? cols.map(c => `<div class="off-row"><div class="meta"><b>${esc(c.name)}</b>
          <div class="note">${c.kind} · ${c.tracks.length} tracks · ${fmtB(c.bytes)} · synced ${ago(c.synced)}</div></div>
          <a class="btn small" href="#/${c.kind}/${c.id}">Open</a>
          <button class="btn small" data-act="offline" data-kind="${c.kind}" data-id="${c.id}">Update</button>
          <button class="btn small danger" data-act="off-remove" data-key="${c.key}">Remove</button></div>`).join('')
        : '<p class="note">Nothing yet. Open a project or playlist and press <b>⤓ Keep offline</b>.</p>'}
      ${est ? `<p class="note">Browser storage used: ${fmtB(est.usage)} of ~${fmtB(est.quota)}. ${persisted ? 'Storage is persistent.' : '<button class="btn small" data-act="persist">Ask browser to keep it</button>'}</p>` : ''}
    </section>
    <section class="card">
      <h3>Opening the page with no connection</h3>
      ${SERVER || HOSTED ? `<p>✅ This copy is served over real HTTPS — no certificate to install. It opens offline once loaded, and saved music plays anywhere.
        On a phone, use “Add to Home screen” for an app icon.</p>`
      : SECURE ? `<p>✅ This page is on a secure origin${SW_REG ? ' and the offline page cache is active' : ''}. Saved music plays and the app opens with no connection.
        On a phone, use “Add to Home screen” for an app icon.</p>`
      : `<p>⚠️ You're on plain HTTP. Saved music still plays while this tab is open, but browsers only let a page <b>load</b> offline over HTTPS.</p>
        <p><b>Use the HTTPS address:</b> <a href="${esc(httpsUrl)}" style="text-decoration:underline">${esc(httpsUrl)}</a>. It needs the airon certificate installed once per device:</p>
        <ol class="note">
          <li>Download the certificate: <a href="airon-ca.crt" style="text-decoration:underline">airon-ca.crt</a></li>
          <li><b>Android:</b> Settings → Security &amp; privacy → More → Encryption &amp; credentials → Install a certificate → <b>CA certificate</b> → pick the file.</li>
          <li><b>iPhone:</b> open the file → Settings → Profile Downloaded → Install; then Settings → General → About → Certificate Trust Settings → enable “Airon Local CA”.</li>
          <li><b>Mac:</b> double-click it → Keychain Access → set it to “Always Trust”.</li>
        </ol>
        <p class="note">Offline caches are per address, so save your playlists again once you're on HTTPS.</p>`}
    </section></div>`;
}

/* ---------------------------------------------------------------- polling */
let pollT = null;
async function poll() {
  clearTimeout(pollT);
  let q = [];
  try { q = await api('queue'); } catch {}
  S.queue = q;
  $('#queueCount').textContent = q.length || '';
  for (const [el, { tracks }] of LISTS) {
    if (!el.isConnected) { LISTS.delete(el); continue; }
    const active = tracks.some(t => t.status === 'queued' || t.status === 'running');
    if (!active) continue;
    if (S.view.kind === 'project') { await refreshProject(); break; }
    if (S.view.kind === 'queue') { renderTracks(q, el, LISTS.get(el).opts); break; }
    if (S.view.kind === 'home') { viewHome(); break; }
  }
  pollT = setTimeout(poll, q.length ? 3000 : 15000);
}
function refresh() { route(); loadSide(); }

/* ---------------------------------------------------------------- events */
document.addEventListener('click', async (e) => {
  if (MENU && !e.target.closest('.menu')) closeMenu();
  const chip = e.target.closest('.chip[data-model]');
  if (chip) {
    const el = $('#create'), f = el._form, m = chip.dataset.model;
    if (f.cover && m === 'ace') return toast('Covers are YuE2-only — remove the reference to use ACE');
    f.models = f.models.includes(m) ? f.models.filter(x => x !== m) : [...f.models, m];
    syncModels(el); saveForm(el._pid, f); return;
  }
  const ins = e.target.closest('[data-ins]'); if (ins) return insertAtCursor($('#lyrics'), ins.dataset.ins);
  const help = e.target.closest('[data-help]'); if (help) return showHelp(help.dataset.help);
  const dl = e.target.closest('[data-dl]'); if (dl) { e.preventDefault(); return download(dl.dataset.dl, dl.dataset.name); }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (!ONLINE && NEEDS_SERVER.has(b.dataset.act))
    return toast('Not connected to the music server — saved songs still play, but creating needs the server.', 4000);
  const act = b.dataset.act, row = b.closest('.trk'), t = row && findTrack(row.dataset.tid);
  switch (act) {
    case 'server-test': case 'server-save': {
      const v = $('[data-form=server] [name=server]').value.trim().replace(/\/+$/, ''), msg = $('#serverMsg');
      if (v && !/^https?:\/\/[^/]+$/.test(v)) { msg.textContent = 'Use the form http://192.168.x.x:7877'; return; }
      msg.textContent = 'Testing…';
      let ok = false;
      try { const base = v || ''; const r = await fetch((base ? base + '/' : '') + 'api/version', { cache: 'no-store' }); ok = r.ok; } catch {}
      msg.textContent = ok ? '✅ Reached the server.' : '❌ Couldn\'t reach it from here' + (v.startsWith('http:') && location.protocol === 'https:' ? ' — if Chrome asked about “local network access”, allow it. Safari can\'t do this; use the server\'s own HTTPS page there.' : '.');
      if (act === 'server-save') { ls.set('server', v); msg.textContent += ' Saved — reloading…'; setTimeout(() => location.reload(), 900); }
      return;
    }
    case 'new-project': return newProject();
    case 'toggle-create': { if (innerWidth > 860) return; const c = $('#create'); c.classList.toggle('collapsed'); return ls.set('create-open', !c.classList.contains('collapsed')); }
    case 'generate': return doGenerate($('#create'));
    case 'write-lyrics': return lyricsDialog($('#create'));
    case 'cover-clear': { const el = $('#create'); el._form.cover = null; saveForm(el._pid, el._form); syncModels(el); return renderCover(el); }
    case 'save-draft': {
      const el = $('#create'), f = readForm(el);
      await api('drafts', { method: 'POST', body: { project_id: el._pid, title: f.title || 'Untitled sheet', style: f.style, lyrics: f.lyrics, author: 'me' } });
      toast('Lyric sheet saved'); return refreshProject();
    }
    case 'load-draft': {
      const d = S.project.drafts.find(x => x.id === b.dataset.id), el = $('#create');
      Object.assign(el._form, { title: d.title, style: d.style || el._form.style, lyrics: d.lyrics });
      saveForm(el._pid, el._form); renderCreate(el, el._pid); el.scrollIntoView({ behavior: 'smooth' }); return toast('Loaded into the form');
    }
    case 'del-draft': if (confirmInline('Delete this lyric sheet?')) { await api('drafts/' + b.dataset.id, { method: 'DELETE' }); refreshProject(); } return;
    case 'play': {
      if (PL.cur && PL.cur.id === t.id) return PL.a.paused ? PL.a.play() : PL.a.pause();
      const l = LISTS.get(row.closest('.tracks')); return playTrack(t, l.tracks.filter(x => x.audio));
    }
    case 'play-all': { const l = [...LISTS.values()][0]; const ts = (l?.tracks || []).filter(x => x.audio); if (ts.length) playTrack(ts[0], ts); return; }
    case 'fav': t.favorite = t.favorite ? 0 : 1; b.classList.toggle('on', !!t.favorite); await api('tracks/' + t.id, { method: 'PATCH', body: { favorite: t.favorite } }); return loadSide();
    case 'track-menu': return trackMenu(b, t);
    case 'offline': {
      b.disabled = true;
      try { await cacheCollection(b.dataset.kind, b.dataset.id); } catch (err) { toast(err.message); }
      b.disabled = false; await loadSide(); if (S.view.kind === 'offline') viewOffline(); else { b.textContent = '⤓ Update offline'; $$('.tracks').forEach(markCached); }
      return;
    }
    case 'off-remove': await removeCollection(b.dataset.key); await loadSide(); return viewOffline();
    case 'update-all': return updateEverything();
    case 'update-app': { const r = await checkAppUpdate().catch(err => (toast(err.message), null)); if (!r) return;
      if (r.changed) { toast('New version — reloading…'); setTimeout(() => location.reload(), 900); } else toast('App is up to date (' + r.version + ')'); return; }
    case 'persist': try { await navigator.storage.persist(); } catch {} return viewOffline();
    case 'project-menu': return menu(b, [
      { label: 'Rename project', fn: async () => { const n = await ask('Rename project', S.project.name); if (n) { await api('projects/' + S.project.id, { method: 'PATCH', body: { name: n } }); refresh(); } } },
      { label: 'Delete project', danger: true, fn: async () => { if (!confirmInline('Delete this project? (It must be empty.)')) return; try { await api('projects/' + S.project.id, { method: 'DELETE' }); location.hash = '#/'; loadSide(); } catch (err) { toast(err.message); } } }]);
    case 'playlist-menu': return menu(b, [
      { label: 'Rename playlist', fn: async () => { const n = await ask('Rename playlist', S.playlist.name); if (n) { await api('playlists/' + S.playlist.id, { method: 'PATCH', body: { name: n } }); refresh(); } } },
      { label: 'Delete playlist', danger: true, fn: async () => { if (!confirmInline('Delete this playlist? Tracks are kept.')) return; await api('playlists/' + S.playlist.id, { method: 'DELETE' }); await removeCollection('playlist:' + S.playlist.id); location.hash = '#/playlist/recent'; loadSide(); } }]);
  }
});
async function newProject() {
  const n = await ask('New project', '', 'Project name');
  if (!n) return;
  const r = await api('projects', { method: 'POST', body: { name: n } });
  await loadSide(); location.hash = '#/project/' + r.id;
}

// actions that need the server; blocked with a clear message while disconnected
const NEEDS_SERVER = new Set(['generate', 'write-lyrics', 'save-draft', 'cover-clear', 'offline', 'update-all', 'update-app']);

function loadAdmin() {
  if (loadAdmin.done || HOSTED || !ONLINE) return;
  loadAdmin.done = true;
  const base = SERVER || location.origin;
  window.AIRON_ADMIN_BASE = (port) => `${base}/__port/${port}`;  // via the music server: works on HTTPS too
  const add = (src) => { const s = document.createElement('script'); s.src = src; document.body.appendChild(s); };
  if (!SERVER) return add('__admin/admin.js');
  xfetch('__admin/admin.js', {}, 8000).then(r => r.ok ? r.text() : Promise.reject())
    .then(js => add(URL.createObjectURL(new Blob([js], { type: 'text/javascript' })))).catch(() => { loadAdmin.done = false; });
}

/* ---------------------------------------------------------------- boot */
async function boot() {
  initPlayer();
  $('#menuBtn').onclick = () => document.body.classList.add('side-open');
  $('#sideClose').onclick = $('#scrim').onclick = () => document.body.classList.remove('side-open');
  $('#newProject').onclick = newProject;
  $('#newPlaylist').onclick = async () => { const n = await ask('New playlist'); if (!n) return; const r = await api('playlists', { method: 'POST', body: { name: n } }); await loadSide(); location.hash = '#/playlist/' + r.id; };
  addEventListener('online', () => poll()); addEventListener('offline', () => setOnline(false));
  $('#conn').onclick = () => { location.hash = '#/offline'; };
  setOnline(!HOSTED);
  if (SECURE && 'serviceWorker' in navigator) {
    try { SW_REG = await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('sw', e); }
  }
  try { S.config = await api('config'); if (!ls.get('app-version', null)) ls.set('app-version', S.config.version); } catch {}
  loadAdmin();
  await loadSide();
  addEventListener('hashchange', route);
  await route();
  poll();
}
boot();
