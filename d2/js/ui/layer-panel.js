// ui/layer-panel.js - Layer list with drag reorder, visibility, delete, rename
export function setupLayerPanel(state, history) {
  const listEl = document.getElementById('layer-list');
  const addBtn = document.getElementById('btn-add-layer');

  addBtn.addEventListener('click', () => {
    history.push();
    state.addLayer();
  });

  let dragSrcIndex = null;

  function render() {
    listEl.innerHTML = '';

    // Render layers top-to-bottom (last layer in array is topmost)
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      const item = document.createElement('div');
      item.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '');
      item.draggable = true;
      item.dataset.index = i;

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.className = 'layer-visibility' + (layer.visible ? '' : ' hidden');
      visBtn.innerHTML = layer.visible ? '&#128065;' : '&#128065;';
      visBtn.style.opacity = layer.visible ? 1 : 0.3;
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        state.emit('layers-changed');
      });

      // Layer name
      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(item, nameSpan, layer);
      });

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'layer-delete';
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.layers.length <= 1) return; // keep at least one layer
        history.push();
        state.deleteLayer(layer.id);
      });

      item.appendChild(visBtn);
      item.appendChild(nameSpan);
      item.appendChild(delBtn);

      // Click to select layer
      item.addEventListener('click', () => {
        state.activeLayerId = layer.id;
        state.emit('layers-changed');
      });

      // Drag events for reordering
      item.addEventListener('dragstart', (e) => {
        dragSrcIndex = parseInt(item.dataset.index);
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        dragSrcIndex = null;
        clearDragOver();
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDragOver();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDragOver();
        const dropIndex = parseInt(item.dataset.index);
        if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
          history.push();
          state.moveLayer(dragSrcIndex, dropIndex);
        }
      });

      listEl.appendChild(item);
    }
  }

  function clearDragOver() {
    listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  function startRename(item, nameSpan, layer) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'layer-name-input';
    input.value = layer.name;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    function finishRename() {
      const newName = input.value.trim();
      if (newName) layer.name = newName;
      state.emit('layers-changed');
    }
    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { finishRename(); }
      if (e.key === 'Escape') { state.emit('layers-changed'); }
    });
  }

  state.on('layers-changed', render);
  render();
}
