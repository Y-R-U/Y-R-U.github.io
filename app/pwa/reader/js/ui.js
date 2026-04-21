import * as player from './player.js';
import * as tts from './tts.js';

const $ = (id) => document.getElementById(id);

export function showLibrary() {
  $('library-view').classList.remove('hidden');
  $('player-view').classList.add('hidden');
}

export function showPlayer() {
  $('player-view').classList.remove('hidden');
  $('library-view').classList.add('hidden');
}

export function renderLibrary(books, onOpen, onDelete) {
  const list = $('library-list');
  list.innerHTML = '';
  const empty = $('library-empty');
  if (!books.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  for (const b of books) {
    const card = document.createElement('div');
    card.className = 'book-card';
    const thumb = { epub: '📘', pdf: '📕', txt: '📄' }[b.format] || '📖';
    const lastRead = b.lastOpened ? timeAgo(b.lastOpened) : 'Never';
    const chapter = b.chapters?.[b.position?.chapter || 0]?.title || '';
    card.innerHTML = `
      <div class="book-thumb">${thumb}</div>
      <div class="book-info">
        <div class="book-title"></div>
        <div class="book-meta"></div>
      </div>
      <button class="icon-btn book-del" aria-label="Delete">🗑</button>
    `;
    card.querySelector('.book-title').textContent = b.title;
    card.querySelector('.book-meta').textContent = [b.author, chapter, lastRead].filter(Boolean).join(' · ');
    card.querySelector('.book-info').addEventListener('click', () => onOpen(b.id));
    card.querySelector('.book-thumb').addEventListener('click', () => onOpen(b.id));
    card.querySelector('.book-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm({
        title: 'Delete book?',
        message: `“${b.title}” will be removed from your library.`,
        okLabel: 'Delete',
        danger: true,
      });
      if (ok) onDelete(b.id);
    });
    list.appendChild(card);
  }
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return Math.floor(d / 60_000) + 'm ago';
  if (d < 86400_000) return Math.floor(d / 3600_000) + 'h ago';
  return Math.floor(d / 86400_000) + 'd ago';
}

export function updatePlayer() {
  const s = player.state;
  if (!s.book) return;
  $('player-title').textContent = s.book.title;
  const ch = s.book.chapters[s.chapterIdx];
  $('now-chapter').textContent = ch ? `${ch.title}  ·  ${s.chapterIdx + 1}/${s.book.chapters.length}` : '';
  const sentence = s.sentences[s.sentenceIdx] || (s.playing ? 'Generating…' : 'Ready');
  $('now-sentence').textContent = sentence;
  $('btn-play').textContent = s.playing ? '⏸' : '▶';
  $('btn-play').setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
  $('speed').value = s.speed.toFixed(1);
  $('speed-val').textContent = s.speed.toFixed(1) + '×';
  const voices = tts.getEnglishVoices();
  const all = [...voices.female, ...voices.male];
  const current = all.find((v) => v.id === s.voice);
  $('voice-name').textContent = current?.name || s.voice;
  const errEl = $('player-error');
  if (s.lastError) {
    errEl.textContent = s.lastError;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
    errEl.textContent = '';
  }
}

export function renderChapters(onSelect) {
  const s = player.state;
  const list = $('chapter-list');
  list.innerHTML = '';
  if (!s.book) return;
  s.book.chapters.forEach((ch, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${ch.title}`;
    if (i === s.chapterIdx) li.classList.add('current');
    li.addEventListener('click', () => onSelect(i));
    list.appendChild(li);
  });
}

export function openChapters() { $('chapter-drawer').classList.remove('hidden'); }
export function closeChapters() { $('chapter-drawer').classList.add('hidden'); }

export function renderVoicePicker(onSelect, onPreview) {
  const voices = tts.getEnglishVoices();
  const list = $('voice-list');
  list.innerHTML = '';
  const currentId = player.state.voice;
  const groups = [
    { label: 'Female', items: voices.female },
    { label: 'Male', items: voices.male },
  ];
  for (const g of groups) {
    if (!g.items.length) continue;
    const h = document.createElement('div');
    h.className = 'voice-group';
    h.textContent = g.label;
    list.appendChild(h);
    for (const v of g.items) {
      const item = document.createElement('div');
      item.className = 'voice-item' + (v.id === currentId ? ' selected' : '');
      item.innerHTML = `
        <div class="info">
          <div class="name"></div>
          <div class="traits"></div>
        </div>
        <span class="grade"></span>
        <button class="voice-preview" aria-label="Preview">▶</button>
      `;
      item.querySelector('.info').style.flex = '1';
      item.querySelector('.name').textContent = `${v.name} · ${v.region}`;
      item.querySelector('.traits').textContent = v.traits || '';
      const gradeEl = item.querySelector('.grade');
      gradeEl.textContent = v.grade || '—';
      if (v.gradeClass) gradeEl.classList.add(v.gradeClass);
      item.addEventListener('click', (e) => {
        if (e.target.closest('.voice-preview')) return;
        onSelect(v.id);
      });
      const prevBtn = item.querySelector('.voice-preview');
      prevBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        prevBtn.classList.add('loading');
        prevBtn.textContent = '…';
        try {
          await onPreview(v.id);
        } catch (err) {
          console.error(err);
        } finally {
          prevBtn.classList.remove('loading');
          prevBtn.textContent = '▶';
        }
      });
      list.appendChild(item);
    }
  }
}

export function openVoicePicker() { $('voice-modal').classList.remove('hidden'); }
export function closeVoicePicker() { $('voice-modal').classList.add('hidden'); }

export function openSettings() { $('settings-modal').classList.remove('hidden'); }
export function closeSettings() { $('settings-modal').classList.add('hidden'); }

export function showLoading(msg, pct) {
  $('loading-msg').textContent = msg;
  const p = $('loading-progress');
  if (pct == null) {
    p.hidden = true;
  } else {
    p.hidden = false;
    p.value = pct;
  }
  $('loading').classList.remove('hidden');
}

export function hideLoading() { $('loading').classList.add('hidden'); }

export function setModelStatus(msg) { $('model-status').textContent = msg; }

/* Middle-truncate a filename so it fits in narrow progress labels. */
export function shortName(name, max = 24) {
  if (!name || name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(4, max - ext.length - 1);
  if (base.length <= keep) return base + ext;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return base.slice(0, head) + '…' + base.slice(base.length - tail) + ext;
}

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
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onOk();
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    scrim.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    setTimeout(() => ok.focus(), 0);
  });
}
