import { generateId } from './utils.js';

const ITEMS_KEY    = 'fnote_items';
const SETTINGS_KEY = 'fnote_settings';
const API_BASE     = '/api/notes';

// Set by initSync() once the user logs in.
let _username = null;

// ─── Sync API ────────────────────────────────────────────────────────────────

/** Call this right after the user supplies a username. */
export function initSync(username) {
  _username = username;
}

/**
 * Fetch remote notes, merge with local (latest updatedAt wins per item id),
 * persist the merged result locally, and push it back if anything changed.
 * Safe to call in the background — never throws.
 */
export async function syncFromCloud() {
  if (!_username) return;
  try {
    const res = await fetch(`${API_BASE}?user=${encodeURIComponent(_username)}`);
    if (!res.ok) return;
    const remote = await res.json();
    const remoteItems = Array.isArray(remote.items) ? remote.items : [];

    const local = readItems();
    const merged = mergeItems(local, remoteItems);

    // Write merged to local storage directly (skip cloud push to avoid loop)
    localStorage.setItem(ITEMS_KEY, JSON.stringify(merged));

    // Push merged back only if remote was missing something
    if (merged.length !== remoteItems.length ||
        merged.some((m, i) => !remoteItems[i] || m.updatedAt !== remoteItems[i].updatedAt)) {
      _pushToCloud(merged);
    }

    return merged;
  } catch {
    // Offline or network error — continue with local data
  }
}

/** Fire-and-forget push to cloud. */
async function _pushToCloud(items) {
  if (!_username) return;
  try {
    await fetch(`${API_BASE}?user=${encodeURIComponent(_username)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch {
    // Offline — local data is safe; sync will reconcile on next load
  }
}

/** Merge two item arrays. For each id, keep the item with the higher updatedAt. */
function mergeItems(local, remote) {
  const map = new Map();
  [...local, ...remote].forEach(item => {
    const existing = map.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readItems() {
  try {
    return JSON.parse(localStorage.getItem(ITEMS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  // Push to cloud in the background after every local write
  _pushToCloud(items);
}

// ─── Public CRUD (unchanged interface) ───────────────────────────────────────

export function getAll() {
  return readItems();
}

export function getById(id) {
  return readItems().find(item => item.id === id) || null;
}

export function getChildren(parentId) {
  return readItems()
    .filter(item => item.parentId === parentId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getBreadcrumbs(id) {
  const items = readItems();
  const crumbs = [];
  let current = items.find(i => i.id === id);
  while (current) {
    crumbs.unshift({ id: current.id, title: current.title });
    current = current.parentId ? items.find(i => i.id === current.parentId) : null;
  }
  return crumbs;
}

export function save(item) {
  const items = readItems();
  item.updatedAt = Date.now();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  writeItems(items);
}

export function remove(id) {
  let items = readItems();
  const toRemove = new Set();

  function collectDescendants(parentId) {
    toRemove.add(parentId);
    items.filter(i => i.parentId === parentId).forEach(child => {
      collectDescendants(child.id);
    });
  }

  collectDescendants(id);
  items = items.filter(i => !toRemove.has(i.id));
  writeItems(items);
}

export function create(type, parentId = null) {
  const prefix = type === 'folder' ? 'f' : 'n';
  const now = Date.now();
  const item = {
    id: generateId(prefix),
    type,
    title: '',
    content: '',
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  save(item);
  return item;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { theme: 'dark' };
  } catch {
    return { theme: 'dark' };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export function exportAll() {
  return JSON.stringify({
    items: readItems(),
    settings: getSettings(),
  }, null, 2);
}

export function importAll(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Invalid backup format');
  }
  writeItems(data.items);
  if (data.settings) {
    saveSettings(data.settings);
  }
}
