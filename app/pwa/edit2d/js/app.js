/* app.js – entry point: boot, service worker, toolbar wiring */

import { getState, setState, onChange } from './state.js';
import { init as initCanvas } from './canvas.js';
import { init as initInput } from './input.js';
import { init as initEditor, setTool, setCollisionType, updateStatus, setStatusEl, deleteSelectedObject } from './editor.js';
import { loadCatalog, loadPack } from './assets.js';
import { init as initPalette, render as renderPalette } from './palette.js';
import { init as initLayers, render as renderLayers } from './layers.js';
import { initModals, modalAlert, modalConfirm, modalSelect } from './modal.js';
import { exportJSON, importJSON, newMap, resizeMapDialog, exportPNG, autosave, loadAutosave } from './io.js';
import { TOOLS, COLLISION_TYPES } from './tools.js';

async function boot() {
  const splash = document.getElementById('splash');

  // Init modals first
  initModals();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Load asset catalog + placeholder pack
  await loadCatalog();
  await loadPack('placeholder');

  // Try loading autosave
  const restored = loadAutosave();

  // Init canvas
  const canvasEl = document.getElementById('editor-canvas');
  initCanvas(canvasEl);

  // Init input
  initInput(canvasEl);

  // Init editor
  initEditor();
  setStatusEl(document.getElementById('status-bar'));

  // Init panels
  initPalette(document.getElementById('palette-panel'));
  initLayers(document.getElementById('layers-panel'));

  // Wire up autosave
  onChange(() => autosave());

  // Wire up toolbar
  wireToolbar();
  wireMenus();

  // Center camera on map
  const s = getState();
  s.camera.x = (s.map.width * s.map.tileSize) / 2;
  s.camera.y = (s.map.height * s.map.tileSize) / 2;

  // Select first tile
  const { getAllTiles } = await import('./assets.js');
  const tiles = getAllTiles();
  if (tiles.length > 0 && !s.selectedTileId) {
    setState({ selectedTileId: tiles[0].id });
  }

  updateStatus();

  // Hide splash
  splash.classList.add('hidden');

  // Mobile drawer
  setupMobileDrawer();

  if (restored) {
    console.log('Edit2D: Restored autosave');
  }
}

function wireToolbar() {
  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.onclick = () => setTool(btn.dataset.tool);
  });

  // Collision type buttons
  document.querySelectorAll('.coll-btn').forEach(btn => {
    btn.onclick = () => {
      const type = parseInt(btn.dataset.collType);
      setCollisionType(type);
      document.querySelectorAll('.coll-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  // Grid toggle
  const gridBtn = document.getElementById('btn-grid');
  if (gridBtn) {
    gridBtn.onclick = () => {
      setState({ showGrid: !getState().showGrid });
      gridBtn.classList.toggle('active', getState().showGrid);
    };
  }

  // Delete object
  const delBtn = document.getElementById('btn-delete');
  if (delBtn) {
    delBtn.onclick = deleteSelectedObject;
  }
}

function wireMenus() {
  // File menu buttons
  document.getElementById('btn-new')?.addEventListener('click', async () => {
    await newMap();
    renderPalette();
    renderLayers();
  });

  document.getElementById('btn-open')?.addEventListener('click', async () => {
    await importJSON();
    renderPalette();
    renderLayers();
  });

  document.getElementById('btn-save')?.addEventListener('click', () => exportJSON());
  document.getElementById('btn-export-png')?.addEventListener('click', () => exportPNG());

  document.getElementById('btn-resize')?.addEventListener('click', async () => {
    await resizeMapDialog();
    renderLayers();
  });

  // Zoom buttons
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    const s = getState();
    s.camera.zoom = Math.min(8, s.camera.zoom * 1.25);
    updateStatus();
    import('./canvas.js').then(m => m.markDirtyCanvas());
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    const s = getState();
    s.camera.zoom = Math.max(0.25, s.camera.zoom * 0.8);
    updateStatus();
    import('./canvas.js').then(m => m.markDirtyCanvas());
  });
  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
    const s = getState();
    const cs = import('./canvas.js');
    cs.then(m => {
      const { width, height } = m.getCanvasSize();
      const mapPxW = s.map.width * s.map.tileSize;
      const mapPxH = s.map.height * s.map.tileSize;
      s.camera.zoom = Math.min(width / mapPxW, height / mapPxH) * 0.9;
      s.camera.x = mapPxW / 2;
      s.camera.y = mapPxH / 2;
      m.markDirtyCanvas();
      updateStatus();
    });
  });

  // Mobile menu toggle
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    document.getElementById('file-menu')?.classList.toggle('open');
  });

  // Layers toggle (mobile)
  document.getElementById('btn-layers-toggle')?.addEventListener('click', () => {
    document.getElementById('layers-panel')?.classList.toggle('open');
  });

  // Close menus on outside click
  document.addEventListener('click', e => {
    const fileMenu = document.getElementById('file-menu');
    if (fileMenu?.classList.contains('open') && !e.target.closest('#file-menu') && !e.target.closest('#btn-menu')) {
      fileMenu.classList.remove('open');
    }
  });
}

function setupMobileDrawer() {
  const handle = document.getElementById('drawer-handle');
  const palette = document.getElementById('palette-panel');
  if (!handle || !palette) return;

  let startY, startH;
  handle.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    startH = palette.offsetHeight;
    e.preventDefault();
  }, { passive: false });

  handle.addEventListener('touchmove', e => {
    const dy = startY - e.touches[0].clientY;
    const newH = Math.max(50, Math.min(window.innerHeight * 0.6, startH + dy));
    palette.style.height = newH + 'px';
    e.preventDefault();
  }, { passive: false });

  // Also handle click to toggle
  handle.addEventListener('click', () => {
    palette.classList.toggle('expanded');
  });
}

// Prevent context menu on canvas
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#editor-canvas')) e.preventDefault();
});

// Boot
boot();
