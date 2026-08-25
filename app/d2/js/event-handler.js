// event-handler.js - Mouse/keyboard event dispatch + paste handling + text editing
import { generateId, ShapeType } from './state.js';

export function setupEventHandler(state, history, renderer, tools) {
  const overlay = renderer.overlayCanvas;
  const container = document.getElementById('canvas-container');
  let activeTool = tools[state.activeTool];
  let overlayDirty = true;
  let mainDirty = true;

  // --- Text editing state ---
  let editingShapeId = null;
  let editingTextarea = null;

  // Get mouse position relative to canvas
  function getPos(e) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  // --- Text editing overlay ---
  function startTextEditing(shapeId) {
    // Close any existing editor first
    stopTextEditing();

    const found = state.findShapeById(shapeId);
    if (!found || found.shape.type !== ShapeType.TEXT) return;
    const shape = found.shape;

    editingShapeId = shapeId;

    const textarea = document.createElement('textarea');
    textarea.className = 'text-edit-overlay';
    textarea.value = shape.text || '';
    textarea.style.left = shape.x + 'px';
    textarea.style.top = shape.y + 'px';
    textarea.style.width = shape.width + 'px';
    textarea.style.height = shape.height + 'px';
    textarea.style.fontSize = (shape.fontSize || 16) + 'px';
    textarea.style.fontFamily = 'sans-serif';
    textarea.style.color = shape.strokeColor || '#000000';
    textarea.style.background = shape.fillColor || 'rgba(255,255,255,0.95)';

    container.appendChild(textarea);
    editingTextarea = textarea;

    // Focus after a frame so the click that created it doesn't interfere
    requestAnimationFrame(() => {
      textarea.focus();
      if (!shape.text) {
        // New text box - cursor at start
      } else {
        textarea.select();
      }
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stopTextEditing();
      }
      // Allow Enter for newlines (no special handling needed)
    });

    textarea.addEventListener('blur', () => {
      // Small delay to avoid conflicts with mousedown handlers
      setTimeout(() => stopTextEditing(), 50);
    });
  }

  function stopTextEditing() {
    if (!editingTextarea || !editingShapeId) return;

    const found = state.findShapeById(editingShapeId);
    const text = editingTextarea.value;

    // Remove textarea from DOM
    if (editingTextarea.parentNode) {
      editingTextarea.parentNode.removeChild(editingTextarea);
    }

    if (found) {
      if (text.trim() === '') {
        // Empty text - delete the shape
        const layerInfo = state.findShapeLayerIndex(editingShapeId);
        if (layerInfo) {
          history.push();
          layerInfo.layer.shapes.splice(layerInfo.index, 1);
          state.selectedShapeIds = [];
          state.emit('selection-changed');
        }
      } else {
        found.shape.text = text;
      }
      state.emit('shapes-changed');
      mainDirty = true;
      overlayDirty = true;
    }

    editingShapeId = null;
    editingTextarea = null;
  }

  // Listen for start-text-edit events (from text tool)
  state.on('start-text-edit', (shapeId) => {
    startTextEditing(shapeId);
  });

  // --- Double-click to edit text shapes ---
  overlay.addEventListener('dblclick', (e) => {
    const pos = getPos(e);
    // Search top-to-bottom for text shapes
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      if (!layer.visible) continue;
      for (let j = layer.shapes.length - 1; j >= 0; j--) {
        const shape = layer.shapes[j];
        if (shape.type === ShapeType.TEXT) {
          if (pos.x >= shape.x && pos.x <= shape.x + shape.width &&
              pos.y >= shape.y && pos.y <= shape.y + shape.height) {
            e.preventDefault();
            startTextEditing(shape.id);
            return;
          }
        }
      }
    }
  });

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

    // Escape: deselect (but not if editing text)
    if (e.key === 'Escape') {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      state.selectedShapeIds = [];
      state.emit('selection-changed');
      overlayDirty = true;
      return;
    }

    // Tool shortcuts
    const shortcuts = { v: 'select', d: 'draw', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow', t: 'text' };
    if (!mod && !e.shiftKey && !e.altKey && shortcuts[e.key]) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      state.activeTool = shortcuts[e.key];
      state.emit('tool-changed');
    }
  });

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    // Don't intercept paste when editing text
    if (editingTextarea && document.activeElement === editingTextarea) return;

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
