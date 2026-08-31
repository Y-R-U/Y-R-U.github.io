// Skin tab — type a description, generate a texture on the local Flux box, watch it land on the
// dummy. The model on the left is the real js/world/dummy.js rig; the sheet on the right is the
// actual PNG, so a texture that looks lovely and maps wrong is visible in one glance.
//
// mount() is exported as well as registered, because js/dev/hub.js's SLOTS list has no `skin` id
// and is another agent's file: js/dev/skin/studio.html mounts this same module directly until one
// line is added there.

import { SkinPreview, VIEWS } from '../skin/preview.js';
import { listSkins, readSidecar, generate, skinURL, artURL } from '../skin/gen.js';

const PRESETS = [
  'a rusted iron knight in battered plate armour with a red tabard',
  'a woodland ranger in green leather and a hooded cloak',
  'a market baker in a flour-dusted apron and rolled sleeves',
  'a city watch sergeant in a blue surcoat and mail',
  'a wandering scholar in dark robes with a satchel',
];

const state = { shape: 'm', mode: 'edit', busy: false, skin: null };
let live = null;   // the mounted preview; module-level because studio.html calls mount() on the
                   // module namespace, where `this` is frozen and `this._preview` throws.

// js/dev/dev.css belongs to the dev-infrastructure agent, so this tab carries its own few rules and
// prefixes every class, per DEVTOOLS.md §3.
const CSS = `
#wf-dev .skin-wrap{gap:14px}
#wf-dev .skin-side{min-width:290px;max-width:330px;display:flex;flex-direction:column;gap:6px}
#wf-dev .skin-side label{font:11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#7f93aa}
#wf-dev .skin-side textarea{width:100%;box-sizing:border-box}
#wf-dev .skin-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-start}
#wf-dev .skin-list{display:flex;flex-wrap:wrap;gap:4px;max-height:220px;overflow:auto}
#wf-dev .skin-main{display:flex;flex-direction:column;gap:8px;min-width:0}
#wf-dev .skin-stage{height:min(58vh,540px);background:#121820;border-radius:6px;overflow:hidden}
#wf-dev .skin-canvas{width:100%;height:100%;display:block}
#wf-dev .skin-sheets{display:flex;gap:10px;flex-wrap:wrap}
#wf-dev .skin-sheets figure{margin:0;width:150px}
#wf-dev .skin-sheets img{width:150px;height:150px;object-fit:contain;background:#0b0f14;border-radius:4px}
#wf-dev .skin-state.warnc{color:#e8c06a}
#wf-dev .skin-wrap button{background:#1e2734;border:1px solid #2f3d4e;color:#c8d4e2;border-radius:4px;padding:4px 9px;cursor:pointer}
#wf-dev .skin-wrap button:hover{background:#283444}
#wf-dev .skin-wrap button.primary{background:#2c5f8f;border-color:#3d7cb5;color:#eaf3fb}
#wf-dev .skin-wrap button:disabled{opacity:.5;cursor:default}
#wf-dev .skin-wrap input,#wf-dev .skin-wrap textarea{background:#0e141c;border:1px solid #2a3646;color:#dbe6f2;border-radius:4px;padding:4px 6px;font:13px ui-monospace,Menlo,monospace}
#wf-dev .skin-row label{display:flex;gap:5px;align-items:center;text-transform:none;letter-spacing:0}
`;

function ensureCSS() {
  if (document.getElementById('wf-skin-css')) return;
  const st = document.createElement('style');
  st.id = 'wf-skin-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export async function mount(el, ctx) {
  ensureCSS();
  el.innerHTML = `
    <div class="split skin-wrap">
      <div class="side skin-side">
        <label>Describe the character</label>
        <textarea class="skin-desc" rows="4" placeholder="a rusted iron knight in battered plate armour"></textarea>
        <div class="row skin-row"><button class="skin-dice" title="a description that has worked">try one</button></div>

        <label>Body</label>
        <div class="row skin-row skin-shape">
          <button data-shape="m" class="primary">male</button>
          <button data-shape="f">female</button>
        </div>

        <label>How</label>
        <div class="row skin-row skin-mode">
          <button data-mode="edit" class="primary">from the pose sheet</button>
          <button data-mode="txt2img">from the prompt alone</button>
        </div>

        <div class="row skin-row">
          <label>seed <input class="skin-seed" size="7" placeholder="random"></label>
          <label>steps <input class="skin-steps" size="3" value="14"></label>
          <label>name <input class="skin-name" size="12" placeholder="auto"></label>
        </div>

        <div class="row skin-row">
          <button class="primary skin-go">Generate</button>
          <span class="skin-state dim">idle</span>
        </div>
        <div class="problems skin-problems" hidden></div>

        <label>Skins on disk</label>
        <div class="skin-list empty">…</div>
      </div>

      <div class="main skin-main">
        <div class="skin-stage"><canvas class="skin-canvas"></canvas></div>
        <div class="row skin-row skin-views"></div>
        <div class="skin-sheets">
          <figure hidden><img class="skin-sheet" alt="the current skin"><figcaption class="dim">skin</figcaption></figure>
          <figure><img class="skin-ref" alt="the pose reference"><figcaption class="dim">pose reference given to Flux</figcaption></figure>
          <figure><img class="skin-guide" alt="the labelled UV guide"><figcaption class="dim">UV guide (also a test texture)</figcaption></figure>
        </div>
      </div>
    </div>`;

  const $ = s => el.querySelector(s);
  const set = (msg, kind = 'dim') => { const n = $('.skin-state'); n.className = `skin-state ${kind}`; n.textContent = msg; };

  $('.skin-ref').src = artURL('art/skin/pose_ref.png');
  $('.skin-guide').src = artURL('art/skin/uv_guide.png');

  const preview = new SkinPreview($('.skin-canvas'));
  live?.dispose();
  live = preview;
  await preview.start();
  preview.setShape(state.shape);

  const views = $('.skin-views');
  for (const v of ['spin', ...Object.keys(VIEWS)]) {
    const b = document.createElement('button');
    b.textContent = v;
    b.onclick = () => { if (v === 'spin') preview.auto = true; else preview.view(v); };
    views.appendChild(b);
  }

  for (const b of el.querySelectorAll('.skin-shape button')) {
    b.onclick = () => {
      state.shape = b.dataset.shape;
      preview.setShape(state.shape);
      for (const o of el.querySelectorAll('.skin-shape button')) o.className = o === b ? 'primary' : '';
    };
  }
  for (const b of el.querySelectorAll('.skin-mode button')) {
    b.onclick = () => {
      state.mode = b.dataset.mode;
      for (const o of el.querySelectorAll('.skin-mode button')) o.className = o === b ? 'primary' : '';
    };
  }
  $('.skin-dice').onclick = () => { $('.skin-desc').value = PRESETS[Math.random() * PRESETS.length | 0]; };

  async function wear(id) {
    state.skin = id;
    try {
      await preview.setSkin(skinURL(id));
      $('.skin-sheet').src = `${skinURL(id)}?t=${Date.now()}`;
      $('.skin-sheet').closest('figure').hidden = false;
      const meta = await readSidecar(id);
      set(meta ? `${id} · seed ${meta.seed} · ${meta.mode}` : id, 'good');
    } catch (e) { set(`could not load ${id}: ${e.message}`, 'bad'); }
  }

  async function refreshList() {
    const list = await listSkins();
    const box = $('.skin-list');
    box.className = list.length ? 'skin-list' : 'skin-list empty';
    box.innerHTML = list.length ? '' : 'nothing in art/skins yet';
    for (const s of list) {
      const b = document.createElement('button');
      b.textContent = s.id;
      b.onclick = () => wear(s.id);
      box.appendChild(b);
    }
  }
  await refreshList();

  $('.skin-go').onclick = async () => {
    if (state.busy) return;
    const desc = $('.skin-desc').value.trim();
    if (!desc) return ctx.toast('describe the character first', 'warn');
    const id = ($('.skin-name').value.trim() || desc.split(/\s+/).slice(0, 3).join('_'))
      .toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 40) || 'skin';
    state.busy = true;
    $('.skin-go').disabled = true;
    set('submitting…', 'warnc');
    const r = await generate({
      id, desc, mode: state.mode,
      seed: $('.skin-seed').value.trim() === '' ? undefined : +$('.skin-seed').value,
      steps: +$('.skin-steps').value || 14,
    }, s => set(`${s.state}${s.position ? ` (${s.position} in queue)` : ''} — ${s.note || ''}`, 'warnc'));
    state.busy = false;
    $('.skin-go').disabled = false;
    if (!r.ok) {
      set(r.error, 'bad');
      const p = $('.skin-problems');
      p.hidden = false;
      p.textContent = r.error;
      return ctx.toast(`skin failed — ${r.error}`, 'bad');
    }
    $('.skin-problems').hidden = true;
    await refreshList();
    await wear(id);
    ctx.toast(`skin ${id} generated`, 'good');
  };

  // The unwrap check, always one click away: the labelled guide worn as a texture. FACE has to be
  // on the face. If it is not, nothing generated afterwards can be trusted.
  const check = document.createElement('button');
  check.textContent = 'wear the UV guide';
  check.onclick = async () => {
    await preview.setSkin(artURL('art/skin/uv_guide.png'));
    $('.skin-sheet').src = artURL('art/skin/uv_guide.png');
    $('.skin-sheet').closest('figure').hidden = false;
    set('wearing the UV guide — FACE should be on the face', 'warnc');
  };
  views.appendChild(check);
}

export function unmount() { live?.dispose(); live = null; }

// Registering is harmless when the hub never imports this file, and correct the moment it does.
import('../hub.js').then(h => h.registerTab({ id: 'skin', label: 'Skins', order: 35, mount, unmount }))
  .catch(() => { /* studio.html mounts it directly */ });
