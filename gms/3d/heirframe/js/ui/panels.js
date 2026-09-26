import { h, onTap, haptic } from './core.js';
import { icon } from './icons.js';
import { contractsPanel } from './panel_contracts.js';
import { warehousePanel } from './panel_warehouse.js';
import { codexPanel } from './panel_codex.js';
import { settingsPanel, pausePanel } from './panel_settings.js';

const DEFS = {
  contracts: { icon: 'contracts', kicker: 'Halcyon Exchange · Open Board', title: 'Contracts', render: contractsPanel },
  warehouse: { icon: 'warehouse', kicker: 'Remote Link · Bay Control', title: 'Warehouse', render: warehousePanel },
  codex: { icon: 'codex', kicker: 'Lineage Archive', title: 'Codex', render: codexPanel },
  settings: { icon: 'settings', kicker: 'System', title: 'Settings', render: settingsPanel, size: 'md' },
  pause: { icon: 'pause', kicker: 'Link Suspended', title: 'Paused', render: pausePanel, size: 'sm' },
};

export function createPanels(bus, ctxBase) {
  const el = h('div.hf-panel', {
    html: `<div class="pn-back hf-live"></div>
    <section class="pn-sheet hf-glass hf-blur hf-brackets">
      <header class="pn-hd">
        <div class="pn-ic"></div>
        <div class="pn-tt"><span class="hf-label"></span><h2 class="hf-title-d"></h2></div>
        <div class="pn-extra"></div>
        <button class="hf-ibtn pn-x hf-live" aria-label="Close">${icon('close')}</button>
      </header>
      <div class="pn-body"></div>
    </section>`,
  });
  const $ = s => el.querySelector(s);
  const body = $('.pn-body'), extra = $('.pn-extra');
  let cur = null, data = null, cleanup = null;
  const state = {};
  const stack = [];

  onTap($('.pn-x'), () => api.close());
  $('.pn-back').addEventListener('click', () => api.close());

  function render() {
    const d = DEFS[cur];
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    body.innerHTML = ''; extra.innerHTML = '';
    state[cur] ||= {};
    cleanup = d.render(body, data || {}, { ...ctxBase, bus, extra, state: state[cur], rerender: render, open: api.open, close: api.close, back: api.back }) || null;
  }

  const api = {
    el,
    get current() { return cur; },
    open(name, d) {
      const def = DEFS[name];
      if (!def) return console.warn('[ui] unknown panel', name);
      const was = cur;
      if (was && was !== name) stack.push({ name: was, data });
      cur = name; data = d ?? (was === name ? data : null);
      el.dataset.panel = name;
      el.dataset.size = def.size || 'lg';
      $('.pn-ic').innerHTML = icon(def.icon);
      $('.pn-tt .hf-label').textContent = def.kicker;
      $('.pn-tt h2').textContent = def.title;
      render();
      if (!was) {
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        ctxBase.root.classList.add('hf-in-panel');
        bus.emit('sfx', 'open'); haptic(6);
        bus.emit('panel:open', name);
      } else if (was !== name) {
        el.querySelector('.pn-sheet').animate([{ opacity: .4, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
      }
    },
    update(d) { if (cur) { data = { ...(data || {}), ...d }; render(); } },
    back() {
      const prev = stack.pop();
      if (!prev) return api.close();
      const name = cur; cur = null;
      api.open(prev.name, prev.data);
      bus.emit('panel:close', name);
    },
    close() {
      if (!cur) return;
      const name = cur;
      if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
      cur = null; stack.length = 0;
      el.classList.remove('show');
      ctxBase.root.classList.remove('hf-in-panel');
      bus.emit('sfx', 'close');
      bus.emit('panel:close', name);
    },
  };
  return api;
}
