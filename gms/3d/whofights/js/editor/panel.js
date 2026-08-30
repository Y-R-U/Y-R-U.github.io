// Settings panel, built from the quality knob schema. Modules get UI for free by registering.

import { Quality } from '../engine/quality.js';
import { allScenarios, getScenario } from '../scenarios.js';

// Shown up front; the other ~57 knobs go one tap deeper. A phone cannot present them all.
const PRIMARY = ['playerZone', 'time', 'nightSky', 'a2c', 'shadowRate'];

// Anything registering a knob after the panel was built calls this to get its UI.
let rebuild = null;
export const refreshPanel = () => rebuild?.();

export function buildPanel(app) {
  const body = document.getElementById('panel-body');
  const panel = document.getElementById('panel');
  document.getElementById('panel-toggle').onclick = () => panel.classList.toggle('open');

  rebuild = () => {
    const presets = Object.entries(Quality.presets)
      .map(([k, v]) => `<button data-preset="${k}" class="${k === app.quality.presetName ? 'on' : ''}">${v.label}</button>`)
      .join('');

    const scenarios = allScenarios()
      .map(s => `<button data-shot="${s.id}">${s.label}</button>`).join('');

    let html = `
      <div class="wf-grp">
        <h4>Preset</h4>
        <div class="wf-presets">${presets}</div>
      </div>
      ${scenarios ? `<div class="wf-grp"><h4>Camera</h4><div class="wf-shots">${scenarios}</div></div>` : ''}`;

    const groups = app.quality.groups();
    const byKey = new Map();
    for (const [, schemas] of groups) for (const s of schemas) byKey.set(s.key, s);

    const top = PRIMARY.map(k => byKey.get(k)).filter(Boolean);
    if (top.length) {
      html += `<div class="wf-grp"><h4>Test</h4>${top.map(s => control(s, app.quality.get(s.key))).join('')}</div>`;
    }

    let adv = '';
    for (const [group, schemas] of groups) {
      const rest = schemas.filter(s => !PRIMARY.includes(s.key));
      if (rest.length) adv += `<div class="wf-grp"><h4>${group}</h4>${rest.map(s => control(s, app.quality.get(s.key))).join('')}</div>`;
    }
    html += `<details class="wf-adv"><summary>Advanced</summary>${adv}</details>`;
    body.innerHTML = html;
  };
  rebuild();

  // Safari does not fire `input` on <select>, so a phone user's zone change silently did nothing.
  for (const evt of ['input', 'change']) body.addEventListener(evt, e => {
    const key = e.target.dataset.knob;
    if (!key) return;
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const val = e.target.type === 'range' ? +raw : raw;
    // both events fire for one gesture; compared as text because a select hands back "1024"
    // for a preset's numeric 1024 and that is not a change
    if (String(app.quality.get(key)) === String(val)) return;
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
    return `<label class="wf-row" for="${id}"><span>${s.label}</span><select id="${id}" data-knob="${s.key}">${opts}</select></label>`;
  }
  if (s.type === 'toggle') {
    return `<label class="wf-row" for="${id}"><span>${s.label}</span><input id="${id}" type="checkbox" data-knob="${s.key}" ${value ? 'checked' : ''}></label>`;
  }
  return `<label class="wf-row range" for="${id}">
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
