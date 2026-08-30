// Raw JSON for every document kind: the escape hatch when a purpose-built tab cannot express
// something, and the first proof that the store loads, validates, saves and reverts.

import { registerTab } from '../hub.js';

registerTab({
  id: 'data',
  async mount(el, ctx) {
    const state = { kind: null, id: null, dirtyText: false };
    el.innerHTML = `<div class="split">
      <div class="side" data-role="side"></div>
      <div class="main">
        <div data-role="banner"></div>
        <div class="row">
          <strong data-role="title">—</strong><span class="dim" data-role="file"></span>
          <span class="spacer" style="flex:1"></span>
          <button class="primary" data-act="save">Save</button>
          <button data-act="format">Format</button>
          <button data-act="revert">Revert</button>
          <button data-act="download">Download</button>
          <button data-act="import">Import…</button>
        </div>
        <textarea spellcheck="false" data-role="text"></textarea>
        <div class="problems" data-role="problems"></div>
      </div></div>
      <input type="file" accept="application/json,.json" hidden data-role="file-input">`;

    const q = s => el.querySelector(`[data-role="${s}"]`);
    const text = q('text'), problems = q('problems');

    const off = ctx.data.onAny(({ kind, id, why }) => {
      // A change from another tab, or an undo, must land in the editor — but not while the author
      // is mid-keystroke in it.
      if (kind === state.kind && (id ?? null) === (state.id ?? null) && why !== 'set') load(kind, id);
      paintSide();
    });

    async function paintBanner() {
      const online = await ctx.api.online();
      q('banner').innerHTML = online ? '' : `<div class="banner"><b>no dev server</b> — changes are
        local to this browser; run <code>node tools/devserver.mjs</code> to write real files.
        Until then use <b>Download</b> and drop the file into <code>data/</code> by hand.</div>`;
    }

    async function paintSide() {
      const side = q('side');
      const levels = await ctx.data.levelIds();
      const groups = [
        ['Documents', ctx.data.kinds().filter(k => k !== 'levels').map(k => ({ kind: k, id: null, label: k }))],
        ['Levels', levels.map(id => ({ kind: 'levels', id, label: id }))],
      ];
      side.innerHTML = '';
      for (const [head, items] of groups) {
        const h = document.createElement('div');
        h.className = 'grouphead';
        h.textContent = head;
        side.appendChild(h);
        for (const it of items) {
          const b = document.createElement('button');
          const dirty = ctx.data.dirty(it.kind, it.id);
          b.innerHTML = `${it.label}${dirty ? ' <span class="dot">●</span>' : ''}`;
          b.className = it.kind === state.kind && (it.id ?? null) === (state.id ?? null) ? 'active' : '';
          b.onclick = () => load(it.kind, it.id);
          side.appendChild(b);
        }
        if (head === 'Levels') {
          const row = document.createElement('div');
          row.className = 'row';
          row.innerHTML = `<input type="text" placeholder="new level id" data-role="newlevel"
            style="width:120px"><button data-act="add" style="width:auto">+</button>`;
          const input = row.querySelector('input');
          const add = async () => {
            const id = input.value.trim();
            if (!/^[a-z0-9_-]+$/i.test(id)) return ctx.toast('level id: letters, digits, - and _ only', 'bad');
            input.value = '';
            await ctx.data.load('levels', id);
            load('levels', id);
          };
          row.querySelector('button').onclick = add;
          input.onkeydown = e => { if (e.key === 'Enter') add(); };
          side.appendChild(row);
        }
      }
    }

    async function load(kind, id) {
      state.kind = kind;
      state.id = id ?? null;
      await ctx.data.load(kind, id);
      const doc = ctx.data.get(kind, id);
      text.value = JSON.stringify(doc, null, 2);
      state.dirtyText = false;
      q('title').textContent = id ? `${kind}: ${id}` : kind;
      q('file').textContent = `${ctx.data.fileOf(kind, id)} · from ${ctx.data.source(kind, id)}`;
      check();
      paintSide();
    }

    // Parse on every keystroke: a tab agent's first question is always "why did my save not land",
    // and the answer is nearly always a comma.
    function check() {
      if (!state.kind) return;
      let doc = null, err = null;
      try { doc = JSON.parse(text.value); } catch (e) { err = e.message; }
      text.classList.toggle('bad', !!err);
      if (err) {
        problems.className = 'problems';
        problems.textContent = `not valid JSON — ${err}`;
        return null;
      }
      const list = ctx.data.validate(state.kind, doc);
      problems.className = 'problems' + (list.length ? '' : ' clean');
      problems.textContent = list.length ? list.map(p => '• ' + p).join('\n')
        : `valid ${state.kind} document${state.dirtyText ? ' — unsaved' : ''}`;
      return doc;
    }

    text.addEventListener('input', () => {
      state.dirtyText = true;
      const doc = check();
      // Every keystroke that parses goes into the store, so the Status tab and any other open tab
      // see it; the edits coalesce into one undo step.
      if (doc !== null) ctx.data.set(state.kind, doc, state.id, { label: 'json edit', coalesce: true });
    });

    el.querySelector('[data-act=save]').onclick = async () => {
      const doc = check();
      if (doc === null) return ctx.toast('will not save invalid JSON', 'bad');
      ctx.data.set(state.kind, doc, state.id, { label: 'json edit' });
      const r = await ctx.data.save(state.kind, state.id);
      state.dirtyText = false;
      check();
      paintSide();
      q('file').textContent = `${ctx.data.fileOf(state.kind, state.id)} · from ${ctx.data.source(state.kind, state.id)}`;
      if (r.ok && r.problems?.length) ctx.toast(`saved, but ${r.problems.length} validation problems`, 'warn');
    };
    el.querySelector('[data-act=format]').onclick = () => {
      const doc = check();
      if (doc === null) return ctx.toast('cannot format invalid JSON', 'bad');
      text.value = JSON.stringify(doc, null, 2);
    };
    el.querySelector('[data-act=revert]').onclick = () => {
      const r = ctx.data.revert(state.kind, state.id);
      if (!r.ok) return ctx.toast(r.error, 'bad');
      load(state.kind, state.id);
      ctx.toast('reverted to the last saved bytes');
    };
    el.querySelector('[data-act=download]').onclick = () => {
      const r = ctx.data.download(state.kind, state.id);
      ctx.toast(r.ok ? `downloaded ${r.file.split('/').pop()}` : r.error, r.ok ? 'good' : 'bad');
    };
    el.querySelector('[data-act=import]').onclick = () => q('file-input').click();
    q('file-input').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const doc = JSON.parse(await f.text());
        ctx.data.set(state.kind, doc, state.id, { label: `import ${f.name}` });
        load(state.kind, state.id);
        ctx.toast(`imported ${f.name} — not saved yet`, 'warn');
      } catch (err) { ctx.toast(`${f.name}: ${err.message}`, 'bad'); }
      e.target.value = '';
    };

    this._off = off;
    await paintBanner();
    await paintSide();
    await load('characters', null);
  },
  unmount() { this._off?.(); },
});
