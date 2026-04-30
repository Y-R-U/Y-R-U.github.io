/* Library state: server-authoritative tree (revisioned), local navigation
   path, and rendered views (recent / grid / breadcrumbs). */
import * as api from './api.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);

const TOP_LEVEL_IDS = ['f1', 'f2', 'f3', 'f4'];

const state = {
  tree: null,           // {rev, topLevel}
  path: [],             // [folder, folder, ...] — empty = root
  jobsById: new Map(),  // jobId -> server job meta
  metaById: new Map(),  // jobId -> local IDB meta (lastPlayed, cached, etc.)
  callbacks: null,      // {onOpenItem, onEditText, ...}
  putInFlight: null,    // promise chain so optimistic edits serialize
};

export function init(callbacks) {
  state.callbacks = callbacks;
}

export function getTree() { return state.tree; }
export function getPath() { return state.path; }
export function isAtRoot() { return state.path.length === 0; }

export function setData({ tree, jobs, metas }) {
  state.tree = tree;
  state.jobsById = new Map((jobs || []).map((j) => [j.id, j]));
  state.metaById = new Map((metas || []).map((m) => [m.jobId, m]));
  // Re-resolve each path entry against the new tree (so we read fresh
  // children arrays). Drop any entry whose folder no longer exists.
  const newPath = [];
  for (const tip of state.path) {
    const fresh = findFolderById(state.tree, tip.id);
    if (!fresh) break;
    newPath.push(fresh);
  }
  state.path = newPath;
}

function currentParent() {
  return state.path.length ? state.path[state.path.length - 1] : null;
}

export function currentParentId() {
  const p = currentParent();
  return p ? p.id : null;
}

function syncHistory() {
  // Reflect the current path into history so browser/Android back navigates up.
  const ids = state.path.map((f) => f.id);
  history.pushState({ view: 'library', path: ids }, '', null);
}

export function navigateTo(folder) {
  // folder: a folder object reachable from current parent (or top-level when at root)
  state.path.push(folder);
  syncHistory();
}

export function navigateUp() {
  state.path.pop();
  syncHistory();
}

export function navigateRoot() {
  state.path = [];
  syncHistory();
}

export function navigateToBreadcrumb(index) {
  // index === -1 means root
  state.path = state.path.slice(0, index + 1);
  syncHistory();
}

/** Set the path by folder ids without pushing history. Used by the popstate
    handler to react to browser/Android back. Returns true on success. */
export function setPathByIds(ids) {
  if (!state.tree) return false;
  const p = [];
  let children = state.tree.topLevel;
  for (const id of ids || []) {
    const next = (children || []).find((c) => c.id === id);
    if (!next) return false;
    if (next.type && next.type !== 'folder') return false;
    p.push(next);
    children = next.children;
  }
  state.path = p;
  return true;
}

/* ----- Tree helpers ----- */

export function findFolderById(tree, id) {
  if (!tree) return null;
  for (const slot of tree.topLevel) {
    if (slot.id === id) return slot;
    const got = findFolderInside(slot, id);
    if (got) return got;
  }
  return null;
}

function findFolderInside(node, id) {
  for (const c of node.children || []) {
    if (c.type === 'folder' && c.id === id) return c;
    if (c.type === 'folder') {
      const got = findFolderInside(c, id);
      if (got) return got;
    }
  }
  return null;
}

/** Find {parent, index} of a node by id, including folder children. Returns null if not found. */
export function findNodeLocation(tree, nodeId) {
  if (!tree) return null;
  for (const slot of tree.topLevel) {
    const got = walkLocate(slot, nodeId);
    if (got) return got;
  }
  return null;
}

function walkLocate(parent, nodeId) {
  const children = parent.children || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.id === nodeId) return { parent, index: i, node: c };
    if (c.type === 'folder') {
      const deeper = walkLocate(c, nodeId);
      if (deeper) return deeper;
    }
  }
  return null;
}

export function isAncestor(maybeAncestor, maybeDescendant) {
  // True iff maybeDescendant is reachable inside maybeAncestor (or is the same node).
  if (!maybeAncestor) return false;
  if (maybeAncestor.id === maybeDescendant.id) return true;
  for (const c of maybeAncestor.children || []) {
    if (c.type === 'folder' && isAncestor(c, maybeDescendant)) return true;
  }
  return false;
}

/* ----- Mutations (all go through PUT /api/library) -----

   We snapshot+swap: deep-clone the tree, mutate the clone, PUT it. On success
   adopt the server's reply. On conflict, refetch and let the caller retry.
*/

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

async function commit(mutator, { reason } = {}) {
  if (!state.tree) throw new Error('library not loaded');
  const prev = state.tree;
  const next = deepClone(prev);
  mutator(next);
  // Serialize PUTs so we don't fight ourselves with rev mismatches.
  const run = (state.putInFlight || Promise.resolve()).then(async () => {
    try {
      const saved = await api.putLibrary(prev.rev, next.topLevel);
      state.tree = saved;
      return saved;
    } catch (e) {
      if (e.conflict && e.current) {
        state.tree = e.current;
        // Caller decides whether to retry. We propagate the error so the
        // refresh loop can re-render with the latest server state.
        throw e;
      }
      throw e;
    }
  });
  state.putInFlight = run.catch(() => {});
  return run;
}

export async function renameFolder(folderId, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) return;
  await commit((tree) => {
    const f = findFolderById(tree, folderId);
    if (f) f.name = trimmed.slice(0, 100);
  });
}

export async function createFolder(parentFolderId, name) {
  const trimmed = (name || '').trim() || 'New folder';
  const newId = 'f-' + Math.random().toString(36).slice(2, 10);
  await commit((tree) => {
    const parent = findFolderById(tree, parentFolderId);
    if (!parent) return;
    parent.children = parent.children || [];
    parent.children.push({ type: 'folder', id: newId, name: trimmed.slice(0, 100), children: [] });
  });
  return newId;
}

export async function deleteFolder(folderId) {
  await commit((tree) => {
    const loc = findNodeLocation(tree, folderId);
    if (!loc) return;
    if (TOP_LEVEL_IDS.includes(folderId)) return; // top-level slots are fixed
    loc.parent.children.splice(loc.index, 1);
  });
}

/** Move a node (folder or item) from its current spot to (dstParentId, dstIndex).
    Top-level slots can't be moved. Can't move a folder into itself / a descendant. */
export async function moveNode(nodeId, dstParentId, dstIndex) {
  if (TOP_LEVEL_IDS.includes(nodeId)) return;
  await commit((tree) => {
    const srcLoc = findNodeLocation(tree, nodeId);
    if (!srcLoc) return;
    const dst = findFolderById(tree, dstParentId);
    if (!dst) return;
    // Refuse if dst is the moving node or a descendant of it.
    if (srcLoc.node.type === 'folder' && isAncestor(srcLoc.node, dst)) return;

    // Splice out, then insert at adjusted index.
    const [moved] = srcLoc.parent.children.splice(srcLoc.index, 1);
    const sameParent = srcLoc.parent === dst;
    let insertAt = dstIndex;
    if (sameParent && srcLoc.index < dstIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(insertAt, dst.children.length));
    dst.children.splice(insertAt, 0, moved);
  });
}

/* ----- Recent items ----- */

export function recentItems(limit = 3) {
  const ids = new Set();
  if (state.tree) {
    const visit = (folder) => {
      for (const c of folder.children || []) {
        if (c.type === 'item') ids.add(c.id);
        else if (c.type === 'folder') visit(c);
      }
    };
    for (const slot of state.tree.topLevel) visit(slot);
  }
  // Fallback: any IDB-cached item with a lastPlayed timestamp, even if the
  // server's tree doesn't reference it (offline, fresh APK install, etc).
  for (const m of state.metaById.values()) {
    if (m.lastPlayed && m.cached) ids.add(m.jobId);
  }

  return [...ids]
    .map((jid) => buildItemRow(jid))
    .filter((r) => r && r.lastPlayed)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export function buildItemRow(jobId) {
  const job = state.jobsById.get(jobId) || null;
  const meta = state.metaById.get(jobId) || null;
  if (!job && !meta) return null;
  const title = (job && job.title) || (meta && meta.title) || jobId;
  return {
    jobId,
    title,
    author: (job && job.author) || (meta && meta.author) || '',
    voice: (job && job.voice) || (meta && meta.voice) || '',
    kind: (job && job.kind) || 'audio',
    state: job ? job.state : 'unknown',
    hasText: !!(job && job.has_text),
    hasSegments: !!(job && job.has_segments),
    size: (job && job.mp3_size) || (meta && meta.size) || 0,
    duration: (meta && meta.duration) || null,
    position: (meta && meta.position) || 0,
    lastPlayed: (meta && meta.lastPlayed) || 0,
    cached: !!(meta && meta.cached),
    onServer: !!job,
  };
}

/* ----- Render ----- */

export function render() {
  renderBreadcrumbs();
  renderRecent();
  renderGrid();
}

function renderBreadcrumbs() {
  const el = $('breadcrumbs');
  el.innerHTML = '';
  if (state.path.length === 0) {
    el.classList.add('hidden');
    $('btn-up').classList.add('hidden');
    $('library-title').textContent = 'Reader';
    return;
  }
  el.classList.remove('hidden');
  $('btn-up').classList.remove('hidden');
  // "Reader / Folder1 / Sub" — each crumb a drop target + a click target.
  const crumbs = [{ id: '__root__', name: 'Reader', index: -1 }, ...state.path.map((f, i) => ({ id: f.id, name: f.name, index: i }))];
  crumbs.forEach((c, i) => {
    const a = document.createElement('button');
    a.className = 'crumb';
    a.textContent = c.name;
    a.dataset.crumbIndex = String(c.index);
    if (c.id !== '__root__') a.dataset.dropFolderId = c.id;
    a.addEventListener('click', () => {
      if (c.index === -1) navigateRoot(); else navigateToBreadcrumb(c.index);
      render();
      state.callbacks?.onNavigate?.();
    });
    el.appendChild(a);
    if (i < crumbs.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
  });
  const tip = state.path[state.path.length - 1];
  $('library-title').textContent = tip.name;
}

function renderRecent() {
  const section = $('recent-section');
  const list = $('recent-list');
  list.innerHTML = '';
  if (!isAtRoot()) { section.classList.add('hidden'); return; }
  const rows = recentItems(3);
  if (!rows.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  for (const row of rows) {
    list.appendChild(renderBookRow(row));
  }
}

function renderBookRow(row) {
  const card = document.createElement('div');
  card.className = 'book-row';
  const dur = row.duration ? fmtDuration(row.duration) : '';
  const sub = [row.author, dur].filter(Boolean).join(' · ');
  const stateLabel = row.state === 'done' ? '' : row.state === 'draft' ? 'Draft' : row.state;
  card.innerHTML = `
    <div class="book-thumb">${row.kind === 'text' && row.state !== 'done' ? '✎' : '🎧'}</div>
    <div class="book-info">
      <div class="book-title"></div>
      <div class="book-meta"></div>
    </div>
  `;
  card.querySelector('.book-title').textContent = row.title;
  card.querySelector('.book-meta').textContent = stateLabel || sub;
  card.addEventListener('click', () => state.callbacks?.onOpenItem?.(row));
  return card;
}

function renderGrid() {
  const grid = $('grid');
  const label = $('grid-label');
  grid.innerHTML = '';
  grid.classList.remove('grid-fixed');
  label.classList.add('hidden');

  if (isAtRoot()) {
    grid.classList.add('grid-fixed');
    if (!state.tree) return;
    for (const slot of state.tree.topLevel) {
      grid.appendChild(renderFolderCard(slot, { fixed: true }));
    }
    return;
  }

  // Inside a folder — show its children + a trailing "+" card.
  label.classList.remove('hidden');
  label.textContent = '';
  const parent = currentParent();
  for (const child of parent.children || []) {
    if (child.type === 'folder') grid.appendChild(renderFolderCard(child, { fixed: false }));
    else if (child.type === 'item') grid.appendChild(renderItemCard(child));
  }
  grid.appendChild(renderAddCard());
}

function renderFolderCard(folder, { fixed }) {
  const card = document.createElement('div');
  card.className = 'card folder-card' + (fixed ? ' fixed' : '');
  card.dataset.nodeId = folder.id;
  card.dataset.nodeType = 'folder';
  card.dataset.dropFolderId = folder.id;
  if (!fixed) card.dataset.draggable = '1';
  const childCount = (folder.children || []).length;
  card.innerHTML = `
    <div class="card-icon">📁</div>
    <div class="card-name"></div>
    <div class="card-sub"></div>
    <button class="card-menu icon-btn" aria-label="More">⋮</button>
  `;
  card.querySelector('.card-name').textContent = folder.name;
  card.querySelector('.card-sub').textContent = childCount === 0 ? 'Empty' : `${childCount} item${childCount === 1 ? '' : 's'}`;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-menu')) return;
    navigateTo(folder);
    render();
    state.callbacks?.onNavigate?.();
  });
  card.querySelector('.card-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    state.callbacks?.onFolderMenu?.(folder, { fixed });
  });
  return card;
}

function renderItemCard(node) {
  const row = buildItemRow(node.id);
  const card = document.createElement('div');
  card.className = 'card item-card';
  card.dataset.nodeId = node.id;
  card.dataset.nodeType = 'item';
  card.dataset.draggable = '1';
  if (!row) {
    // Item references a job that isn't on the server (offline) — render a stub.
    card.innerHTML = `
      <div class="card-icon">🎧</div>
      <div class="card-name">(unavailable)</div>
      <div class="card-sub"></div>
    `;
    return card;
  }
  const isDraft = row.state === 'draft';
  const isProcessing = row.state === 'queued' || row.state === 'processing';
  const isError = row.state === 'error';
  const sub = isDraft ? 'Draft text' : isProcessing ? row.state[0].toUpperCase() + row.state.slice(1) + '…'
            : isError ? 'Failed' : (row.duration ? fmtDuration(row.duration) : '');
  const icon = row.kind === 'text' ? (isDraft ? '✎' : '📜') : '🎧';
  card.innerHTML = `
    <div class="card-icon">${icon}</div>
    <div class="card-name"></div>
    <div class="card-sub"></div>
    ${row.hasText ? '<button class="card-edit icon-btn" aria-label="Edit text">✎</button>' : ''}
    <button class="card-menu icon-btn" aria-label="More">⋮</button>
  `;
  card.querySelector('.card-name').textContent = row.title;
  card.querySelector('.card-sub').textContent = sub;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-menu') || e.target.closest('.card-edit')) return;
    if (isDraft) state.callbacks?.onEditText?.(row);
    else if (isProcessing || isError) state.callbacks?.onItemMenu?.(row);
    else state.callbacks?.onOpenItem?.(row);
  });
  const editBtn = card.querySelector('.card-edit');
  if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); state.callbacks?.onEditText?.(row); });
  card.querySelector('.card-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    state.callbacks?.onItemMenu?.(row);
  });
  return card;
}

function renderAddCard() {
  const card = document.createElement('div');
  card.className = 'card add-card';
  card.innerHTML = '<div class="card-plus">+</div>';
  card.addEventListener('click', () => state.callbacks?.onAddHere?.(currentParentId()));
  return card;
}

/* ----- Format helpers (also used by player.js / app.js if imported) ----- */
export function fmtDuration(sec) {
  if (!sec || !isFinite(sec)) return '';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
