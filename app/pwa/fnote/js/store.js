import { generateId } from './utils.js';

const ITEMS_KEY = 'fnote_items';
const SETTINGS_KEY = 'fnote_settings';

function readItems() {
  try {
    return JSON.parse(localStorage.getItem(ITEMS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

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
