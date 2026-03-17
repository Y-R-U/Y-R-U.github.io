/* io.js – import/export JSON, autosave, PNG export */

import { getState, serialize, deserialize, markDirty } from './state.js';
import { getTile } from './assets.js';
import { debounce } from './utils.js';
import { modalAlert, modalConfirm, modalPrompt } from './modal.js';

const AUTOSAVE_KEY = 'edit2d_autosave';

// ── Export JSON ──
export async function exportJSON() {
  const s = getState();
  const name = await modalPrompt('Level name:', s.map.name, 'Export Level');
  if (name === null) return;
  s.map.name = name || s.map.name;

  const data = serialize();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFilename(s.map.name)}.json`);
  await modalAlert('Level exported successfully.', 'Export');
}

// ── Import JSON ──
export async function importJSON() {
  const ok = await modalConfirm('Import a level? Current unsaved changes will be lost.', 'Import Level');
  if (!ok) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.edit2d) {
        await modalAlert('Invalid Edit2D level file.', 'Error');
        return;
      }
      deserialize(json);
      await modalAlert(`Loaded "${json.name || 'Untitled'}" (${json.width}x${json.height}).`, 'Import');
    } catch (e) {
      await modalAlert('Failed to parse file: ' + e.message, 'Error');
    }
  };
  input.click();
}

// ── Autosave ──
export const autosave = debounce(() => {
  try {
    const data = serialize();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded, silently fail */ }
}, 1000);

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const json = JSON.parse(raw);
    if (!json.edit2d) return false;
    deserialize(json);
    return true;
  } catch { return false; }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// ── New map ──
export async function newMap() {
  const ok = await modalConfirm('Create a new map? Unsaved changes will be lost.', 'New Map');
  if (!ok) return;

  const widthStr = await modalPrompt('Map width (tiles):', '32', 'New Map');
  if (widthStr === null) return;
  const heightStr = await modalPrompt('Map height (tiles):', '24', 'New Map');
  if (heightStr === null) return;

  const w = parseInt(widthStr) || 32;
  const h = parseInt(heightStr) || 24;

  const { initMap } = await import('./state.js');
  initMap(Math.max(4, Math.min(256, w)), Math.max(4, Math.min(256, h)), getState().map.tileSize);
  clearAutosave();
}

// ── Resize map ──
export async function resizeMapDialog() {
  const s = getState();
  const widthStr = await modalPrompt('New width:', String(s.map.width), 'Resize Map');
  if (widthStr === null) return;
  const heightStr = await modalPrompt('New height:', String(s.map.height), 'Resize Map');
  if (heightStr === null) return;

  const w = Math.max(4, Math.min(256, parseInt(widthStr) || s.map.width));
  const h = Math.max(4, Math.min(256, parseInt(heightStr) || s.map.height));

  if (w !== s.map.width || h !== s.map.height) {
    const { resizeMap } = await import('./state.js');
    resizeMap(w, h);
  }
}

// ── Export PNG ──
export async function exportPNG() {
  const s = getState();
  const ts = s.map.tileSize;
  const w = s.map.width * ts;
  const h = s.map.height * ts;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d');

  // Background
  ctx.fillStyle = s.map.backgroundColor;
  ctx.fillRect(0, 0, w, h);

  // Draw visible layers
  s.layers.forEach(layer => {
    if (!layer.visible || layer.type === 'collision') return;
    ctx.globalAlpha = layer.opacity;

    if (layer.type === 'tile') {
      for (let y = 0; y < s.map.height; y++) {
        for (let x = 0; x < s.map.width; x++) {
          const tileId = layer.data[y]?.[x];
          if (!tileId) continue;
          const tile = getTile(tileId);
          if (!tile) continue;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, x * ts, y * ts, ts, ts);
        }
      }
    } else if (layer.type === 'object') {
      layer.objects.forEach(obj => {
        const tile = getTile(obj.tileId);
        if (!tile) return;
        ctx.imageSmoothingEnabled = false;
        const ow = obj.width || ts;
        const oh = obj.height || ts;
        ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, obj.x - ow / 2, obj.y - oh / 2, ow, oh);
      });
    }

    ctx.globalAlpha = 1;
  });

  offscreen.toBlob(blob => {
    downloadBlob(blob, `${sanitizeFilename(s.map.name)}.png`);
  });
}

// ── Helpers ──
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}
