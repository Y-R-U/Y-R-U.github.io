// Characters — DEV_CONTRACT §7 and §8. The cast list, a live turntable of the selected one built
// from the real rig, the kokoro voice picker, and the bark pool with its generator.
//
// Only the fields that genuinely reach js/world/people.js sit in the top group; everything the
// schema carries but the rig ignores is below the line and says so. A colour picker that changes
// nothing is worse than no colour picker.

import { registerTab } from '../hub.js';
import { Preview, metresOf } from '../chars/preview.js';
import { createBarks } from '../chars/barkui.js';
import { groupedVoices, LANGS, voice as voiceInfo, AUDITION } from '../chars/voices.js';
import { speedOf, pitchOf, pitchRate, synthSpeed, countBarks } from '../chars/vo.js';

// DEV_CONTRACT §7. `dummy` is another agent's rig (js/world/dummy.js) — listed so a dummy
// character opened here keeps its body instead of being silently rewritten to robed.
const BODIES = [
  { id: 'robed', label: 'robed — the hooded rig, stands in the world' },
  { id: 'dummy', label: 'dummy — the configurable rig (owned by the skin tab)' },
  { id: 'none', label: 'none — a voice only' },
];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);

const STYLE = `
#wf-dev .chars-cols { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
#wf-dev .chars-view { flex: 0 0 320px; }
#wf-dev .chars-view canvas { width: 320px; height: 400px; border-radius: 8px; border: 1px solid #232d3b;
  background: #121820; display: block; touch-action: none; cursor: grab; }
#wf-dev .chars-fields { flex: 1 1 360px; min-width: 320px; }
#wf-dev .chars-f { display: grid; grid-template-columns: 92px 1fr; gap: 6px 10px; align-items: center; margin-bottom: 6px; }
#wf-dev .chars-f > label { color: #8494a8; font-size: 12px; }
#wf-dev .chars-f input[type=range] { width: 150px; vertical-align: middle; }
#wf-dev .chars-f input[type=color] { width: 46px; height: 26px; padding: 2px; vertical-align: middle; }
#wf-dev .chars-f input[type=text] { max-width: 320px; }
#wf-dev .chars-f .val { color: #d7e2f0; font: 12px ui-monospace, Menlo, monospace; margin-left: 8px; }
#wf-dev .chars-unwired { border-top: 1px dashed #33404f; margin-top: 12px; padding-top: 10px; }
#wf-dev .chars-unwired .pill { margin-left: 6px; }
#wf-dev .chars-reach td { padding-right: 12px; }
#wf-dev .bark-cat { border: 1px solid #1e2733; border-radius: 6px; margin-bottom: 6px; background: #101720; }
#wf-dev .bark-cat > summary { cursor: pointer; padding: 7px 10px; display: flex; gap: 10px; align-items: center; }
#wf-dev .bark-cat > summary::-webkit-details-marker { color: #5d6b7d; }
#wf-dev .bark-cat > .row, #wf-dev .bark-cat > .bark-row { padding: 0 10px; }
#wf-dev .bark-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
#wf-dev .bark-row input { flex: 1 1 auto; }
#wf-dev .bark-n { font: 11px ui-monospace, Menlo, monospace; width: 20px; }
#wf-dev .bark-state { font: 11px ui-monospace, Menlo, monospace; width: 62px; text-align: right; }
#wf-dev .bark-add { padding-bottom: 10px !important; }
#wf-dev .bark-add input { flex: 1 1 auto; }
#wf-dev .chars-progress { margin: 6px 0; padding: 7px 10px; border-radius: 6px;
  background: #101a24; color: #6cc0ff; font: 12px ui-monospace, Menlo, monospace; }
#wf-dev .chars-newid { display: flex; gap: 6px; margin-top: 6px; }
#wf-dev .chars-newid input { width: 100%; }
`;

function injectStyle() {
  if (document.getElementById('wf-chars-css')) return;
  const s = document.createElement('style');
  s.id = 'wf-chars-css';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

registerTab({
  id: 'chars',
  order: 30,

  async mount(el, ctx) {
    injectStyle();
    await ctx.data.load('characters');
    await ctx.data.load('barks');

    this.ctx = ctx;
    window.__wfChars = this;          // §11: the tab's own debug handle, and what uitest drives
    this.sel = localStorage.getItem('wf.dev.chars.sel') || null;
    const cast = () => ctx.data.get('characters')?.characters || {};
    if (!this.sel || !cast()[this.sel]) this.sel = Object.keys(cast())[0] || null;

    el.innerHTML = `
      <div class="split">
        <div class="side">
          <div class="grouphead">Cast</div>
          <div data-role="list"></div>
          <div class="chars-newid" hidden data-role="newrow">
            <input type="text" data-role="newid" placeholder="id, e.g. quartermaster">
            <button data-act="create" class="primary">Add</button>
          </div>
          <button data-act="new" style="margin-top:8px">+ New character</button>
        </div>
        <div class="main" data-role="main"></div>
      </div>`;

    this.listEl = el.querySelector('[data-role=list]');
    this.mainEl = el.querySelector('[data-role=main]');
    el.querySelector('[data-act=new]').onclick = () => {
      const r = el.querySelector('[data-role=newrow]');
      r.hidden = !r.hidden;
      if (!r.hidden) el.querySelector('[data-role=newid]').focus();
    };
    el.querySelector('[data-act=create]').onclick = () => this.create(el.querySelector('[data-role=newid]'));
    el.querySelector('[data-role=newid]').onkeydown = e => {
      if (e.key === 'Enter') this.create(el.querySelector('[data-role=newid]'));
    };

    // One canvas and one WebGL context for the life of the tab: paintMain() rewrites its panel on
    // every selection, and a renderer per repaint runs the browser out of contexts inside a minute.
    this.canvasEl = document.createElement('canvas');
    this.canvasEl.width = 320;
    this.canvasEl.height = 400;

    this.barks = createBarks(ctx, {
      cast, id: () => this.sel,
      onIndex: () => this.paintVoiceState?.(),
    });

    this.paintList();
    await this.paintMain();

    // Another tab (or an undo) can rewrite the cast under us. A repaint on every keystroke of our
    // own would steal focus, so only a foreign change redraws the inspector.
    this.off = ctx.data.onChange('characters', (d, id2, why) => {
      this.paintList();
      if (why === 'undo' || why === 'redo' || why === 'load') this.paintMain();
    });
    this.offBarks = ctx.data.onChange('barks', (d, id2, why) => {
      if (why === 'undo' || why === 'redo') this.barks.repaint();
    });
  },

  unmount() {
    this.off?.();
    this.offBarks?.();
    this.preview?.dispose();
    this.preview = null;
  },

  cast() { return this.ctx.data.get('characters')?.characters || {}; },
  chr() { return this.cast()[this.sel] || null; },

  edit(fn, label, coalesce = false) {
    this.ctx.data.mutate('characters', null, d => { fn(d.characters[this.sel], d); },
      { label: `${this.sel}: ${label}`, coalesce });
  },

  create(input) {
    const raw = (input.value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_');
    if (!raw) return this.ctx.toast('give it an id first', 'warn');
    if (this.cast()[raw]) return this.ctx.toast(`${raw} already exists`, 'warn');
    this.ctx.data.mutate('characters', null, d => {
      d.characters[raw] = { name: raw.replace(/[_.-]+/g, ' ').replace(/^./, c => c.toUpperCase()),
        body: 'none', robe: 'neutral', gender: 'x', voice: null, voiceSpeed: 1, voicePitch: 0 };
    }, { label: `add ${raw}` });
    input.value = '';
    input.parentElement.hidden = true;
    this.select(raw);
  },

  select(id) {
    this.sel = id;
    localStorage.setItem('wf.dev.chars.sel', id);
    this.paintList();
    this.paintMain();
    this.mainEl.scrollTop = 0;
    this.mainEl.closest('main').scrollTop = 0;
  },

  paintList() {
    const cast = this.cast();
    const ids = Object.keys(cast).sort();
    const body = ids.filter(i => cast[i].body === 'robed');
    const none = ids.filter(i => cast[i].body !== 'robed');
    const group = (title, list) => (list.length ? `<div class="grouphead">${title}</div>` + list.map(i =>
      `<button data-id="${esc(i)}" class="${i === this.sel ? 'active' : ''}">${esc(cast[i].name || i)}
        <span class="dim">${esc(i)}</span></button>`).join('') : '');
    this.listEl.innerHTML = group('In the world', body) + group('Voice only', none)
      || '<div class="dim">no characters yet</div>';
    for (const b of this.listEl.querySelectorAll('button')) b.onclick = () => this.select(b.dataset.id);
  },

  async paintMain() {
    const c = this.chr();
    if (!c) { this.mainEl.innerHTML = '<div class="empty"><b>No character</b>add one on the left</div>'; return; }
    const ctx = this.ctx;

    this.mainEl.innerHTML = `
      <div class="row">
        <b style="font-size:15px" data-role="title"></b>
        <span class="dim">${esc(this.sel)}</span>
        <span style="flex:1 1 auto"></span>
        <button data-act="dup">Duplicate</button>
        <button data-act="del" class="danger">Delete</button>
      </div>
      <div class="chars-cols">
        <div class="chars-view">
          <div data-role="canvasslot"></div>
          <div class="row" style="margin-top:6px">
            <label class="dim"><input type="checkbox" data-role="spin" checked> turntable</label>
            <label class="dim"><input type="checkbox" data-role="eyes"> hood eyes</label>
            <label class="dim"><input type="checkbox" data-role="ruler" checked> ruler</label>
          </div>
          <div class="dim" data-role="rigline" style="font:11px ui-monospace,Menlo,monospace"></div>
        </div>
        <div class="chars-fields" data-role="fields"></div>
      </div>
      <section data-role="barkslot"></section>`;

    this.mainEl.querySelector('[data-role=title]').textContent = c.name || this.sel;
    this.mainEl.querySelector('[data-act=dup]').onclick = () => this.duplicate();
    const del = this.mainEl.querySelector('[data-act=del]');
    del.onclick = () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Really delete?'; return; }
      const gone = this.sel;
      ctx.data.mutate('characters', null, d => { delete d.characters[gone]; }, { label: `delete ${gone}` });
      this.sel = Object.keys(this.cast())[0] || null;
      this.paintList();
      this.paintMain();
      ctx.toast(`deleted ${gone} — ctrl+Z puts it back`, 'warn');
    };

    this.paintFields();
    this.mainEl.querySelector('[data-role=barkslot]').appendChild(this.barks.el);
    this.barks.setCharacter();

    await this.startPreview();
  },

  async startPreview() {
    const slot = this.mainEl.querySelector('[data-role=canvasslot]');
    // The preview draws the hooded rig. A dummy character is the skin tab's rig, and showing it a
    // robe would be the exact kind of lie this panel exists to avoid.
    if (this.chr()?.body === 'dummy') {
      slot.innerHTML = `<div class="empty"><b>Dummy rig</b>this preview draws the hooded figure only
        <br><span class="dim">the dummy body and its skin live in the Skin tab</span></div>`;
      return;
    }
    slot.appendChild(this.canvasEl);
    if (this.previewFailed) {
      slot.innerHTML = `<div class="empty"><b>No 3D preview</b>${esc(this.previewFailed)}<br>
        <span class="dim">the rig needs the importmap — open index.html or js/dev/chars/bench.html,
        not selftest.html</span></div>`;
      return;
    }
    if (!this.preview) {
      try { this.preview = await new Preview(this.canvasEl).start(); }
      catch (e) { this.previewFailed = e.message; return this.startPreview(); }
    }
    this.preview.auto = this.mainEl.querySelector('[data-role=spin]').checked;
    for (const [role, key] of [['spin', 'auto'], ['eyes', 'eyes'], ['ruler', 'ruler']]) {
      const box = this.mainEl.querySelector(`[data-role=${role}]`);
      box.onchange = () => {
        if (key === 'auto') this.preview.auto = box.checked;
        else this.preview.apply({ [key]: key === 'eyes' ? (box.checked ? 1.4 : 0) : box.checked });
      };
    }
    this.pushPreview();
  },

  pushPreview() {
    const c = this.chr();
    if (!this.preview || !c) return;
    const height = num(c.height, 1);
    const variant = 0;
    this.preview.apply({ robe: ['light', 'neutral', 'dark'].includes(c.robe) ? c.robe : 'neutral',
      height, variant });
    const line = this.mainEl.querySelector('[data-role=rigline]');
    if (line) {
      line.textContent = `${metresOf(height, variant).toFixed(2)} m · robe ${c.robe || 'neutral'}`
        + ` · ${c.body === 'robed' ? 'in the world' : 'voice only'}`;
    }
  },

  paintFields() {
    const c = this.chr();
    const f = this.mainEl.querySelector('[data-role=fields]');
    const placed = c.body === 'robed';
    const p = c.place || {};

    f.innerHTML = `
      <h2>Appearance</h2>
      <div class="chars-f">
        <label>Name</label><input type="text" data-f="name" value="${esc(c.name)}">
        <label>Body</label><select data-f="body">${BODIES.map(b =>
          `<option value="${b.id}">${esc(b.label)}</option>`).join('')}</select>
        <label>Robe</label><select data-f="robe">
          <option value="light">light</option><option value="neutral">neutral</option>
          <option value="dark">dark</option></select>
        <label>Height</label><span><input type="range" data-f="height" min="0.85" max="1.20" step="0.01"
          value="${num(c.height, 1)}"><span class="val" data-val="height"></span></span>
        <label>Gender</label><span><select data-f="gender">
          <option value="f">f</option><option value="m">m</option><option value="x">x</option></select>
          <span class="dim" style="font-size:11px"> metadata — it orders the voice list below and nothing else</span></span>
      </div>

      <div class="chars-unwired">
        <div class="dim" style="margin-bottom:6px">Carried by the schema, <b class="warnc">not read by the rig yet</b>
          — authorable now, nothing changes in the preview or the game.</div>
        <div class="chars-f">
          <label>Build</label><span><input type="range" data-f="build" min="0.85" max="1.20" step="0.01"
            value="${num(c.build, 1)}"><span class="val" data-val="build"></span>
            <span class="pill off">unwired</span></span>
          <label>Hood</label><span><select data-f="hood">
            <option value="up">up</option><option value="down">down</option></select>
            <span class="pill off">unwired</span></span>
          <label>Skin</label><span><input type="color" data-f="skin" value="${esc(c.skin || '#c8a887')}">
            <span class="pill off">no geometry — the cowl covers the face and the cavity is flat black</span></span>
          <label>Hair</label><span><input type="color" data-f="hair" value="${esc(c.hair || '#3a2a1e')}">
            <span class="pill off">no geometry</span></span>
        </div>
      </div>

      <h2 style="margin-top:16px">Voice</h2>
      <div class="chars-f">
        <label>Voice</label><span><select data-f="voice" style="max-width:230px"></select>
          <label class="dim" style="font-size:11px"><input type="checkbox" data-role="otherlangs"> other languages</label></span>
        <label>Speed</label><span><input type="range" data-f="voiceSpeed" min="0.7" max="1.3" step="0.01"
          value="${speedOf(c)}"><span class="val" data-val="voiceSpeed"></span>
          <span class="dim" style="font-size:11px">kokoro's own</span></span>
        <label>Pitch</label><span><input type="range" data-f="voicePitch" min="-4" max="4" step="0.5"
          value="${pitchOf(c)}"><span class="val" data-val="voicePitch"></span></span>
        <label>Audition</label><span><select data-role="auditionline" style="max-width:230px">
          ${AUDITION.map(a => `<option>${esc(a)}</option>`).join('')}</select>
          <button data-act="audition" class="primary">Hear it</button></span>
      </div>
      <div class="dim" style="font-size:11px;margin-bottom:8px" data-role="pitchnote"></div>

      ${placed ? `<h2 style="margin-top:16px">Place</h2>
      <div class="chars-f">
        <label>Level</label><input type="text" data-f="place.level" value="${esc(p.level || 'academy')}">
        <label>x / z / yaw</label><span>
          <input type="number" data-f="place.x" step="0.5" value="${num(p.x, 0)}" style="width:78px">
          <input type="number" data-f="place.z" step="0.5" value="${num(p.z, 0)}" style="width:78px">
          <input type="number" data-f="place.yaw" step="0.05" value="${num(p.yaw, 0)}" style="width:78px"></span>
        <label>Inside</label><input type="number" data-f="place.inside" value="${p.inside ?? ''}"
          placeholder="house object id" style="width:110px">
      </div>` : `<div class="row" style="margin-top:14px">
        <button data-act="promote" class="primary">Give it a body</button>
        <span class="dim">body: robed plus a place — that is the whole promotion</span></div>`}

      <h2 style="margin-top:16px">What reaches the rig</h2>
      <table class="chars-reach">
        <tr><th>robe</th><td class="good">yes</td><td class="dim">zones.js material + geometry set</td></tr>
        <tr><th>height</th><td class="good">yes</td><td class="dim">people.js agent <code>scale</code>, uniform</td></tr>
        <tr><th>gender</th><td class="dim">no</td><td class="dim">metadata; orders the voice list only (§7)</td></tr>
        <tr><th>body, place</th><td class="good">yes</td><td class="dim">whether and where a figure is spawned</td></tr>
        <tr><th>build</th><td class="bad">no</td><td class="dim">normalised, never read</td></tr>
        <tr><th>hood</th><td class="bad">no</td><td class="dim">the rig has only a hood-up mesh</td></tr>
        <tr><th>skin, hair</th><td class="bad">no</td><td class="dim">dropped by normaliseCast; no geometry exists</td></tr>
      </table>`;

    this.wireFields(f);
  },

  wireFields(f) {
    const setVal = k => {
      const s = f.querySelector(`[data-val=${k}]`);
      const i = f.querySelector(`[data-f=${k}]`);
      if (!s || !i) return;
      s.textContent = k === 'voicePitch' ? `${(+i.value > 0 ? '+' : '')}${(+i.value).toFixed(1)} st`
        : (+i.value).toFixed(2);
    };

    for (const i of f.querySelectorAll('[data-f]')) {
      const key = i.dataset.f;
      const c = this.chr();
      if (i.tagName === 'SELECT' && key !== 'voice') i.value = String(c[key] ?? (key === 'hood' ? 'up' : ''));
      const ev = i.type === 'range' || i.type === 'text' || i.type === 'number' ? 'input' : 'change';
      i.addEventListener(ev, () => {
        const v = i.type === 'range' || i.type === 'number'
          ? (i.value === '' ? null : +i.value) : i.value;
        this.edit(rec => {
          if (key.startsWith('place.')) {
            rec.place = rec.place || { level: 'academy', x: 0, z: 0, yaw: 0 };
            rec.place[key.slice(6)] = v;
          } else rec[key] = v;
        }, key, ev === 'input');
        setVal(key);
        if (key === 'name') this.mainEl.querySelector('[data-role=title]').textContent = v || this.sel;
        if (['robe', 'height'].includes(key)) this.pushPreview();
        if (key === 'gender') this.paintVoices();
        if (key === 'body') this.paintMain();
        if (key === 'voicePitch' || key === 'voiceSpeed' || key === 'voice') this.paintVoiceState();
      });
    }
    for (const k of ['height', 'build', 'voiceSpeed', 'voicePitch']) setVal(k);

    f.querySelector('[data-role=otherlangs]').onchange = () => this.paintVoices();
    f.querySelector('[data-act=audition]').onclick = async e => {
      const b = e.currentTarget;
      const text = f.querySelector('[data-role=auditionline]').value;
      b.disabled = true;
      b.textContent = 'kokoro…';
      const r = await this.barks.audition(text);
      b.disabled = false;
      b.textContent = 'Hear it';
      if (r?.ok) this.ctx.toast(`${r.seconds}s at ${r.rms} dBFS`, 'good');
    };
    f.querySelector('[data-act=promote]')?.addEventListener('click', () => {
      this.edit(rec => {
        rec.body = 'robed';
        rec.place = rec.place || { level: 'academy', x: 0, z: 0, yaw: 0 };
      }, 'give it a body');
      this.paintList();
      this.paintMain();
    });

    this.paintVoices();
    this.paintVoiceState();
  },

  paintVoices() {
    const f = this.mainEl.querySelector('[data-role=fields]');
    const sel = f.querySelector('[data-f=voice]');
    const c = this.chr();
    const other = f.querySelector('[data-role=otherlangs]').checked;
    const groups = groupedVoices({ gender: c.gender || 'x', english: !other });
    sel.innerHTML = '<option value="">— no voice —</option>' + groups.map(([label, list]) =>
      `<optgroup label="${esc(label)}${esc(LANGS[list[0].lang]?.extra ? ' (' + LANGS[list[0].lang].extra + ')' : '')}">`
      + list.map(v => `<option value="${v.id}">${esc(v.label)}${v.note ? ` — ${esc(v.note)}` : ''}</option>`).join('')
      + '</optgroup>').join('');
    // A voice from the other list must still show as selected, or switching the toggle looks like
    // it cleared the character's voice.
    if (c.voice && !sel.querySelector(`option[value="${c.voice}"]`)) {
      const v = voiceInfo(c.voice);
      sel.insertAdjacentHTML('afterbegin',
        `<option value="${esc(c.voice)}">${esc(v ? v.label : c.voice)} — ${esc(v ? LANGS[v.lang].label : 'unknown voice')}</option>`);
    }
    sel.value = c.voice || '';
  },

  paintVoiceState() {
    const f = this.mainEl?.querySelector('[data-role=fields]');
    if (!f) return;
    const c = this.chr();
    const note = f.querySelector('[data-role=pitchnote]');
    if (!note) return;
    const pitch = pitchOf(c), speed = speedOf(c);
    const idx = this.barks.getIndex();
    const mine = Object.values(idx.clips || {}).filter(v => v.who === this.sel).length;
    const { clips } = countBarks(this.ctx.data.get('barks'), { [this.sel]: c });
    note.innerHTML = pitch
      ? `pitch is a resample: the take is synthesised at speed <b>${synthSpeed(speed, pitch).toFixed(3)}</b>
         and played back at <b>×${pitchRate(pitch).toFixed(3)}</b>, which lands on the original length.
         Change it and every clip for ${esc(this.sel)} restages. · ${mine}/${clips} clips generated`
      : `no pitch shift — the take plays exactly as kokoro rendered it at speed ${speed.toFixed(2)}.
         · ${mine}/${clips} clips generated`;
  },

  duplicate() {
    const src = this.chr();
    let id = `${this.sel}_2`;
    for (let n = 2; this.cast()[id]; n++) id = `${this.sel}_${n}`;
    this.ctx.data.mutate('characters', null, d => {
      d.characters[id] = JSON.parse(JSON.stringify(src));
      d.characters[id].name = `${src.name} (copy)`;
    }, { label: `duplicate ${this.sel}` });
    this.select(id);
  },
});
