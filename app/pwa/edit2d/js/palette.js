/* palette.js – tile palette panel: search, category tabs, tile grid */

import { getState, setState } from './state.js';
import { getActivePack, getAllTiles, searchTiles, getTilesByCategory, getCategories, getTile } from './assets.js';

let container, searchInput, categoryBar, tileGrid;
let currentCategory = 'all';
let currentSearch = '';

export function init(containerEl) {
  container = containerEl;
  buildDOM();
  render();
}

function buildDOM() {
  container.innerHTML = `
    <div class="palette-header">
      <span class="palette-title">Tiles</span>
      <span class="palette-pack-name"></span>
    </div>
    <input type="text" class="palette-search" placeholder="Search tiles...">
    <div class="palette-categories"></div>
    <div class="palette-grid"></div>
  `;

  searchInput = container.querySelector('.palette-search');
  categoryBar = container.querySelector('.palette-categories');
  tileGrid = container.querySelector('.palette-grid');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    renderTiles();
  });
}

export function render() {
  const pack = getActivePack();
  if (!pack) return;

  container.querySelector('.palette-pack-name').textContent = pack.name;
  renderCategories();
  renderTiles();
}

function renderCategories() {
  const cats = getCategories();
  categoryBar.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (cat === currentCategory ? ' active' : '');
    btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    btn.onclick = () => {
      currentCategory = cat;
      currentSearch = '';
      searchInput.value = '';
      renderCategories();
      renderTiles();
    };
    categoryBar.appendChild(btn);
  });
}

function renderTiles() {
  const s = getState();
  let tiles;

  if (currentSearch) {
    tiles = searchTiles(currentSearch);
  } else {
    tiles = getTilesByCategory(currentCategory);
  }

  tileGrid.innerHTML = '';
  const pack = getActivePack();
  if (!pack) return;

  const ts = pack.tileSize;

  tiles.forEach(t => {
    const el = document.createElement('div');
    el.className = 'palette-tile' + (s.selectedTileId === t.id ? ' selected' : '');
    el.dataset.tileId = t.id;
    el.title = t.name;

    // Draw tile thumbnail
    const cvs = document.createElement('canvas');
    cvs.width = 32;
    cvs.height = 32;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const tileInfo = getTile(t.id);
    if (tileInfo && tileInfo.image.complete) {
      ctx.drawImage(tileInfo.image, tileInfo.sx, tileInfo.sy, tileInfo.sw, tileInfo.sh, 0, 0, 32, 32);
    }

    el.appendChild(cvs);

    const label = document.createElement('span');
    label.className = 'palette-tile-label';
    label.textContent = t.name;
    el.appendChild(label);

    el.onclick = () => {
      setState({ selectedTileId: t.id });
      // Update selection visuals
      tileGrid.querySelectorAll('.palette-tile').forEach(p => p.classList.remove('selected'));
      el.classList.add('selected');
    };

    tileGrid.appendChild(el);
  });
}

export function refreshSelection() {
  const s = getState();
  tileGrid?.querySelectorAll('.palette-tile').forEach(el => {
    el.classList.toggle('selected', el.dataset.tileId === s.selectedTileId);
  });
}
