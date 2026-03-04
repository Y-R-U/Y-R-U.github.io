// ui/toolbar.js - Toolbar: tools, colors, stroke width, undo/redo, export
export function setupToolbar(state, history, renderer) {
  // Tool buttons
  const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
  function updateToolButtons() {
    toolBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === state.activeTool);
    });
  }
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTool = btn.dataset.tool;
      state.emit('tool-changed');
    });
  });
  state.on('tool-changed', updateToolButtons);
  updateToolButtons();

  // Stroke color
  const strokeColor = document.getElementById('stroke-color');
  const strokeWell = document.getElementById('stroke-color-well');
  strokeColor.addEventListener('input', () => {
    state.strokeColor = strokeColor.value;
    strokeWell.style.background = strokeColor.value;
    updateSelectedShapeColors(state);
  });

  // Fill color
  const fillColor = document.getElementById('fill-color');
  const fillWell = document.getElementById('fill-color-well');
  const toggleFill = document.getElementById('toggle-fill');
  let fillEnabled = false;

  function updateFillUI() {
    if (fillEnabled) {
      fillWell.classList.remove('no-fill');
      fillWell.style.background = fillColor.value;
      state.fillColor = fillColor.value;
    } else {
      fillWell.classList.add('no-fill');
      fillWell.style.background = '';
      state.fillColor = null;
    }
  }

  toggleFill.addEventListener('click', () => {
    fillEnabled = !fillEnabled;
    updateFillUI();
    updateSelectedShapeColors(state);
  });

  fillColor.addEventListener('input', () => {
    if (!fillEnabled) {
      fillEnabled = true;
    }
    updateFillUI();
    updateSelectedShapeColors(state);
  });

  // Stroke width
  const strokeWidth = document.getElementById('stroke-width');
  const strokeWidthVal = document.getElementById('stroke-width-val');
  strokeWidth.addEventListener('input', () => {
    state.strokeWidth = parseInt(strokeWidth.value);
    strokeWidthVal.textContent = strokeWidth.value;
  });

  // Update selected shape's colors when pickers change
  function updateSelectedShapeColors(state) {
    if (state.selectedShapeIds.length === 0) return;
    for (const id of state.selectedShapeIds) {
      const found = state.findShapeById(id);
      if (found) {
        found.shape.strokeColor = state.strokeColor;
        found.shape.fillColor = state.fillColor;
        found.shape.strokeWidth = state.strokeWidth;
      }
    }
    state.emit('shapes-changed');
  }

  // When selection changes, update UI to match selected shape
  state.on('selection-changed', () => {
    if (state.selectedShapeIds.length === 1) {
      const found = state.findShapeById(state.selectedShapeIds[0]);
      if (found) {
        const shape = found.shape;
        if (shape.strokeColor) {
          strokeColor.value = shape.strokeColor;
          strokeWell.style.background = shape.strokeColor;
          state.strokeColor = shape.strokeColor;
        }
        if (shape.fillColor) {
          fillColor.value = shape.fillColor;
          fillEnabled = true;
        } else {
          fillEnabled = false;
        }
        updateFillUI();
        if (shape.strokeWidth) {
          strokeWidth.value = shape.strokeWidth;
          strokeWidthVal.textContent = shape.strokeWidth;
          state.strokeWidth = shape.strokeWidth;
        }
      }
    }
  });

  // Undo/Redo buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  btnUndo.addEventListener('click', () => history.undo());
  btnRedo.addEventListener('click', () => history.redo());

  function updateHistoryButtons() {
    btnUndo.disabled = !history.canUndo();
    btnRedo.disabled = !history.canRedo();
  }
  state.on('history-changed', updateHistoryButtons);
  updateHistoryButtons();

  // Export PNG
  const btnExport = document.getElementById('btn-export');
  btnExport.addEventListener('click', () => {
    // Create a 1x export canvas to avoid DPR scaling
    const mainCanvas = renderer.mainCanvas;
    const w = parseInt(mainCanvas.style.width);
    const h = parseInt(mainCanvas.style.height);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ectx = exportCanvas.getContext('2d');

    // Render to export canvas at 1x
    const { getShapeRenderer } = renderer._getShapeRendererFn
      ? { getShapeRenderer: renderer._getShapeRendererFn }
      : {};

    // Simpler approach: just draw white bg + all shapes
    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, w, h);

    // Import and render manually to avoid DPR issues
    import('./shapes/registry.js').then(({ getShapeRenderer }) => {
      for (const layer of state.layers) {
        if (!layer.visible) continue;
        for (const shape of layer.shapes) {
          const sr = getShapeRenderer(shape.type);
          if (sr) {
            ectx.save();
            ectx.globalAlpha = shape.opacity != null ? shape.opacity : 1;
            sr.draw(ectx, shape);
            ectx.restore();
          }
        }
      }

      exportCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'image.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
  });
}
