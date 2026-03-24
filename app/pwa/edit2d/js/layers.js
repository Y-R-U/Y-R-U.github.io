/* layers.js – layer panel: visibility, reorder, active selection */

import { getState, setState, getActiveLayer, moveLayer, removeLayer, addLayer, markDirty } from './state.js';
import { modalPrompt, modalConfirm, modalSelect } from './modal.js';

let container;

export function init(containerEl) {
  container = containerEl;
  render();
}

export function render() {
  const s = getState();
  container.innerHTML = `
    <div class="layers-header">
      <span class="layers-title">Layers</span>
      <button class="layers-add-btn" title="Add layer">+</button>
    </div>
    <div class="layers-list"></div>
  `;

  const list = container.querySelector('.layers-list');
  const addBtn = container.querySelector('.layers-add-btn');

  addBtn.onclick = async () => {
    const type = await modalSelect('Add Layer', 'Choose layer type:', [
      { label: 'Tile Layer', value: 'tile' },
      { label: 'Object Layer', value: 'object' },
      { label: 'Collision Layer', value: 'collision' },
    ]);
    if (!type) return;
    const name = await modalPrompt('Layer name:', type.charAt(0).toUpperCase() + type.slice(1), 'New Layer');
    if (!name) return;
    const layer = addLayer(type, name);
    setState({ activeLayerId: layer.id });
    render();
  };

  // Render layers in reverse (topmost first in the panel)
  const layers = [...s.layers].reverse();

  layers.forEach(layer => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (layer.id === s.activeLayerId ? ' active' : '');
    row.dataset.layerId = layer.id;

    const typeIcons = { tile: '\u25A6', object: '\u2316', collision: '\u25A8' };
    const typeIcon = typeIcons[layer.type] || '\u25A1';

    row.innerHTML = `
      <button class="layer-vis-btn ${layer.visible ? 'visible' : ''}" title="Toggle visibility">
        ${layer.visible ? '\u25C9' : '\u25CE'}
      </button>
      <span class="layer-name">${layer.name}</span>
      <div class="layer-actions">
        <button class="layer-act-btn" data-action="up" title="Move up">\u2191</button>
        <button class="layer-act-btn" data-action="down" title="Move down">\u2193</button>
        <button class="layer-act-btn layer-delete-btn" data-action="delete" title="Delete">\u2715</button>
      </div>
    `;

    // Click to select
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      setState({ activeLayerId: layer.id });
      render();
    });

    // Visibility toggle
    row.querySelector('.layer-vis-btn').onclick = () => {
      layer.visible = !layer.visible;
      markDirty();
      render();
    };

    // Action buttons
    row.querySelectorAll('.layer-act-btn').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        if (action === 'up') {
          // Move up in visual order = move forward in array (toward end)
          moveLayer(layer.id, 1);
          render();
        } else if (action === 'down') {
          moveLayer(layer.id, -1);
          render();
        } else if (action === 'delete') {
          if (s.layers.length <= 1) return;
          const ok = await modalConfirm(`Delete layer "${layer.name}"?`, 'Delete Layer');
          if (ok) { removeLayer(layer.id); render(); }
        }
      };
    });

    list.appendChild(row);
  });
}
