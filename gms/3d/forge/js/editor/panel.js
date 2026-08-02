// Settings panel, built from the quality knob schema. Modules get UI for free by registering.

import { Quality } from '../engine/quality.js';
import { allScenarios, getScenario } from '../scenarios.js';

export function buildPanel(app) {
  const body = document.getElementById('panel-body');
  const panel = document.getElementById('panel');
  document.getElementById('panel-toggle').onclick = () => panel.classList.toggle('open');

  const presets = Object.entries(Quality.presets)
    .map(([k, v]) => `<button data-preset="${k}" class="${k === app.quality.presetName ? 'on' : ''}">${v.label}</button>`)
    .join('');

  const scenarios = allScenarios()
    .map(s => `<button data-shot="${s.id}">${s.label}</button>`).join('');

  let html = `
    <div class="grp">
      <h4>Preset</h4>
      <div class="presets">${presets}</div>
    </div>
    ${scenarios ? `<div class="grp"><h4>Camera</h4><div class="shots">${scenarios}</div></div>` : ''}`;

  for (const [group, schemas] of app.quality.groups()) {
    html += `<div class="grp"><h4>${group}</h4>${schemas.map(s => control(s, app.quality.get(s.key))).join('')}</div>`;
  }
  body.innerHTML = html;

  // Safari does not fire `input` on <select>, so a phone user's zone change silently did nothing.
  for (const evt of ['input', 'change']) body.addEventListener(evt, e => {
    const key = e.target.dataset.knob;
    if (!key) return;
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const val = e.target.type === 'range' ? +raw : raw;
    app.quality.set(key, val);
    const out = body.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = fmtVal(val);
  });

  body.addEventListener('click', e => {
    const p = e.target.dataset.preset;
    if (p) {
      app.quality.usePreset(p);
      body.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === p));
      syncControls(body, app.quality);
    }
    const s = e.target.dataset.shot;
    if (s) getScenario(s)?.setup(app);
  });

  app.quality.onChange(() => syncControls(body, app.quality));
}

function control(s, value) {
  const id = `k_${s.key}`;
  if (s.type === 'select') {
    const opts = s.options.map(o => `<option value="${o}" ${String(o) === String(value) ? 'selected' : ''}>${o}</option>`).join('');
    return `<label class="row" for="${id}"><span>${s.label}</span><select id="${id}" data-knob="${s.key}">${opts}</select></label>`;
  }
  if (s.type === 'toggle') {
    return `<label class="row" for="${id}"><span>${s.label}</span><input id="${id}" type="checkbox" data-knob="${s.key}" ${value ? 'checked' : ''}></label>`;
  }
  return `<label class="row range" for="${id}">
      <span>${s.label}<em data-out="${s.key}">${fmtVal(value)}</em></span>
      <input id="${id}" type="range" data-knob="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}">
    </label>`;
}

function syncControls(body, q) {
  body.querySelectorAll('[data-knob]').forEach(el => {
    const v = q.get(el.dataset.knob);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    const out = body.querySelector(`[data-out="${el.dataset.knob}"]`);
    if (out) out.textContent = fmtVal(v);
  });
}

function fmtVal(v) { return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v; }
