import * as player from './player.js';

const $ = (id) => document.getElementById(id);

export function showLibrary() {
  $('library-view').classList.remove('hidden');
  $('player-view').classList.add('hidden');
}

export function showPlayer() {
  $('player-view').classList.remove('hidden');
  $('library-view').classList.add('hidden');
}

/* ---- Library ---- */
export function renderJobs(jobs, onCancel) {
  const section = $('jobs-section');
  const list = $('jobs-list');
  list.innerHTML = '';
  if (!jobs.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  for (const j of jobs) {
    const card = document.createElement('div');
    card.className = 'job-card' + (j.state === 'error' ? ' error' : '');
    const stateLabel = j.state === 'error' ? 'Failed'
      : j.state === 'done' ? 'Saving…'
      : j.state === 'processing' ? 'Converting'
      : j.state === 'uploading' ? 'Uploading'
      : 'Queued';
    const pct = Math.round((j.progress || 0) * 100);
    card.innerHTML = `
      <div class="job-info">
        <div class="job-title"></div>
        <div class="job-state"></div>
        <div class="job-bar"><div class="job-bar-fill"></div></div>
        <div class="job-error hidden"></div>
      </div>
      <button class="icon-btn job-cancel" aria-label="Cancel">×</button>
    `;
    card.querySelector('.job-title').textContent = j.title || j.filename;
    card.querySelector('.job-state').textContent = `${stateLabel} · ${pct}%`;
    card.querySelector('.job-bar-fill').style.width = pct + '%';
    if (j.error) {
      const err = card.querySelector('.job-error');
      err.textContent = j.error;
      err.classList.remove('hidden');
    }
    card.querySelector('.job-cancel').addEventListener('click', () => onCancel(j));
    list.appendChild(card);
  }
}

export function renderLibrary(books, onOpen, onDelete, onDownload) {
  const list = $('library-list');
  list.innerHTML = '';
  const empty = $('library-empty');
  if (!books.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  books.sort((a, b) => (b.lastPlayed || b.createdAt || 0) - (a.lastPlayed || a.createdAt || 0));
  for (const b of books) {
    const card = document.createElement('div');
    card.className = 'book-card';
    const dur = b.duration ? fmtDuration(b.duration) : '';
    const sub = [b.author, dur, fmtSize(b.size)].filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="book-thumb">🎧</div>
      <div class="book-info">
        <div class="book-title"></div>
        <div class="book-meta"></div>
      </div>
      <button class="icon-btn book-dl" aria-label="Download MP3">⬇</button>
      <button class="icon-btn book-del" aria-label="Delete">🗑</button>
    `;
    card.querySelector('.book-title').textContent = b.title;
    card.querySelector('.book-meta').textContent = sub;
    card.querySelector('.book-info').addEventListener('click', () => onOpen(b.id));
    card.querySelector('.book-thumb').addEventListener('click', () => onOpen(b.id));
    card.querySelector('.book-dl').addEventListener('click', (e) => { e.stopPropagation(); onDownload(b); });
    card.querySelector('.book-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm({
        title: 'Delete audiobook?',
        message: `"${b.title}" will be removed from this device.`,
        okLabel: 'Delete', danger: true,
      });
      if (ok) onDelete(b.id);
    });
    list.appendChild(card);
  }
}

export function fmtDuration(sec) {
  if (!sec || !isFinite(sec)) return '';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/* ---- Player ---- */
export function updatePlayer() {
  const s = player.state;
  if (!s.book) return;
  $('player-title').textContent = s.book.title;
  $('player-author').textContent = s.book.author || '';
  $('btn-play').textContent = s.playing ? '⏸' : '▶';
  $('btn-play').setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
  $('time-cur').textContent = fmtTime(s.position);
  $('time-total').textContent = fmtTime(s.duration);
  const scrub = $('scrubber');
  if (s.duration > 0 && document.activeElement !== scrub) {
    scrub.max = String(s.duration);
    scrub.value = String(s.position);
  }
  $('speed-val').textContent = s.speed.toFixed(2).replace(/0$/, '') + '×';
}

function fmtTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/* ---- Upload / voice modal ---- */
export function renderVoicePicker(voices, currentVoice, onSelect) {
  const list = $('voice-list');
  list.innerHTML = '';
  const groups = [
    { label: 'American female', filter: (v) => v.accent === 'American' && v.gender === 'female' },
    { label: 'American male',   filter: (v) => v.accent === 'American' && v.gender === 'male' },
    { label: 'British female',  filter: (v) => v.accent === 'British'  && v.gender === 'female' },
    { label: 'British male',    filter: (v) => v.accent === 'British'  && v.gender === 'male' },
  ];
  const gradeOrder = { 'A+': 0, 'A': 1, 'A-': 2, 'B+': 3, 'B': 4, 'B-': 5, 'C+': 6, 'C': 7, 'C-': 8, 'D+': 9, 'D': 10, 'D-': 11, 'F+': 12, 'F': 13 };
  for (const g of groups) {
    const items = voices.filter(g.filter).sort((a, b) => (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99));
    if (!items.length) continue;
    const h = document.createElement('div');
    h.className = 'voice-group';
    h.textContent = g.label;
    list.appendChild(h);
    for (const v of items) {
      const item = document.createElement('div');
      item.className = 'voice-item' + (v.id === currentVoice ? ' selected' : '');
      item.innerHTML = `
        <div class="info">
          <div class="name"></div>
          <div class="traits"></div>
        </div>
        <span class="grade"></span>
      `;
      item.querySelector('.name').textContent = v.name;
      item.querySelector('.traits').textContent = `${v.accent} · ${v.gender}`;
      const ge = item.querySelector('.grade');
      ge.textContent = v.grade || '—';
      ge.classList.add(`grade-${(v.grade || 'X')[0]}`);
      item.addEventListener('click', () => onSelect(v.id));
      list.appendChild(item);
    }
  }
}

export function openImport({ filename, voices, currentVoice, onConfirm, onCancel }) {
  $('import-filename').textContent = filename;
  renderVoicePicker(voices, currentVoice, (id) => {
    document.querySelectorAll('#voice-list .voice-item').forEach((el) => el.classList.remove('selected'));
    const items = document.querySelectorAll('#voice-list .voice-item');
    items.forEach((el) => {
      if (el.querySelector('.name')?.textContent && voices.find((v) => v.id === id)?.name === el.querySelector('.name').textContent) {
        el.classList.add('selected');
      }
    });
    $('import-modal').dataset.selected = id;
  });
  $('import-modal').dataset.selected = currentVoice;
  $('import-modal').classList.remove('hidden');
  const confirmBtn = $('btn-import-confirm');
  const cancelBtn = $('btn-import-cancel');
  const scrim = $('import-modal').querySelector('.modal-scrim');
  const cleanup = () => {
    $('import-modal').classList.add('hidden');
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    scrim.onclick = null;
  };
  confirmBtn.onclick = () => {
    const voice = $('import-modal').dataset.selected || currentVoice;
    cleanup();
    onConfirm(voice);
  };
  cancelBtn.onclick = () => { cleanup(); onCancel(); };
  scrim.onclick = () => { cleanup(); onCancel(); };
}

/* ---- Settings ---- */
export function openSettings() { $('settings-modal').classList.remove('hidden'); }
export function closeSettings() { $('settings-modal').classList.add('hidden'); }

export function setStorageStatus({ persisted, usage, quota }) {
  const el = $('storage-status');
  if (!el) return;
  const mb = (b) => (b / 1024 / 1024).toFixed(0);
  const line1 = persisted
    ? 'Storage: persistent (browser will not evict cached audiobooks).'
    : 'Storage: best-effort (browser may evict under pressure).';
  const line2 = quota ? `Used ${mb(usage || 0)} MB of ${mb(quota)} MB quota.` : '';
  el.innerHTML = `<p class="hint">${line1}</p>${line2 ? `<p class="hint">${line2}</p>` : ''}`;
}

/* ---- Toast / confirm ---- */
let toastTimer = null;
export function showToast(msg, { error = false, duration = 3500 } = {}) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!error);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

export function showConfirm({ title = 'Confirm', message = '', okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = $('confirm-modal');
    $('confirm-title').textContent = title;
    $('confirm-msg').textContent = message;
    const ok = $('btn-confirm-ok');
    const cancel = $('btn-confirm-cancel');
    const scrim = m.querySelector('.modal-scrim');
    ok.textContent = okLabel;
    ok.classList.toggle('danger', !!danger);
    m.classList.remove('hidden');
    const done = (v) => {
      m.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      scrim.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); else if (e.key === 'Enter') onOk(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    scrim.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    setTimeout(() => ok.focus(), 0);
  });
}
