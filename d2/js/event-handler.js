// event-handler.js - Mouse/keyboard event dispatch + paste handling
import { generateId, ShapeType } from './state.js';

export function setupEventHandler(state, history, renderer, tools) {
  const overlay = renderer.overlayCanvas;
  let activeTool = tools[state.activeTool];
  let overlayDirty = true;
  let mainDirty = true;

  // Get mouse position relative to canvas
  function getPos(e) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  // Mouse events on overlay canvas
  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // left click only
    const pos = getPos(e);
    activeTool.onMouseDown(e, state, pos, history);
    overlayDirty = true;
    mainDirty = true;
  });

  overlay.addEventListener('mousemove', (e) => {
    const pos = getPos(e);
    const needsRedraw = activeTool.onMouseMove(e, state, pos);
    if (needsRedraw) {
      mainDirty = true;
    }
    overlayDirty = true;
    // Update cursor
    overlay.style.cursor = activeTool.cursor || 'default';
  });

  overlay.addEventListener('mouseup', (e) => {
    const pos = getPos(e);
    activeTool.onMouseUp(e, state, pos, history);
    overlayDirty = true;
    mainDirty = true;
  });

  // Prevent context menu on canvas
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Cmd+Z
    if (mod && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      history.undo();
      mainDirty = true;
      overlayDirty = true;
      return;
    }

    // Redo: Cmd+Shift+Z
    if (mod && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      history.redo();
      mainDirty = true;
      overlayDirty = true;
      return;
    }

    // Delete selected shape
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedShapeIds.length > 0) {
      // Don't delete if focus is on an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      history.push();
      for (const id of state.selectedShapeIds) {
        const found = state.findShapeLayerIndex(id);
        if (found) {
          found.layer.shapes.splice(found.index, 1);
        }
      }
      state.selectedShapeIds = [];
      state.emit('shapes-changed');
      state.emit('selection-changed');
      mainDirty = true;
      overlayDirty = true;
      return;
    }

    // Escape: deselect
    if (e.key === 'Escape') {
      state.selectedShapeIds = [];
      state.emit('selection-changed');
      overlayDirty = true;
      return;
    }

    // Tool shortcuts
    const shortcuts = { v: 'select', d: 'draw', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow' };
    if (!mod && !e.shiftKey && !e.altKey && shortcuts[e.key]) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      state.activeTool = shortcuts[e.key];
      state.emit('tool-changed');
    }
  });

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            let layer = state.getActiveLayer();
            if (!layer) {
              layer = state.addLayer();
            }
            history.push();
            const shape = {
              id: generateId('shape'),
              type: ShapeType.IMAGE,
              x: 0,
              y: 0,
              width: img.naturalWidth,
              height: img.naturalHeight,
              dataUrl: ev.target.result,
              opacity: 1,
              _imageElement: img,
            };
            layer.shapes.push(shape);
            state.selectedShapeIds = [shape.id];
            state.emit('shapes-changed');
            state.emit('selection-changed');
            mainDirty = true;
            overlayDirty = true;
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  });

  // Listen for tool changes
  state.on('tool-changed', () => {
    if (activeTool && activeTool.onDeactivate) activeTool.onDeactivate(state);
    activeTool = tools[state.activeTool];
    if (activeTool && activeTool.onActivate) activeTool.onActivate(state);
    overlay.style.cursor = activeTool?.cursor || 'default';
    overlayDirty = true;
  });

  // Listen for state changes that need rerender
  state.on('shapes-changed', () => { mainDirty = true; overlayDirty = true; });
  state.on('layers-changed', () => { mainDirty = true; overlayDirty = true; });
  state.on('selection-changed', () => { overlayDirty = true; });

  // Render loop
  function renderLoop() {
    if (mainDirty) {
      renderer.renderMain(state);
      mainDirty = false;
    }
    if (overlayDirty) {
      const preview = activeTool?.getPreviewShape?.() || null;
      renderer.renderOverlay(state, preview);
      overlayDirty = false;
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // Return a way to mark dirty from outside
  return {
    markDirty() { mainDirty = true; overlayDirty = true; },
  };
}
