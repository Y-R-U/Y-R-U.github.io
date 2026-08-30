// Conversations — DEV_CONTRACT §6. The list knows what points at every node (derived, never
// stored), the editor edits one, and the preview walks it through js/game/dialogue.js.
//
// A hotspot's "edit this conversation" button hands a node id over through window.__wfConvo.open(id)
// or sessionStorage['wf.dev.convo.open']; hub.show() drops any extra argument it is given.

import { registerTab } from '../hub.js';
import { h, ensureCSS, promptCard } from '../convo/dom.js';
import { deriveLinks, tree } from '../convo/links.js';
import { blankNode, nodeProblems, uniqueId, slug, voName } from '../convo/model.js';
import { renderEditor, repaintProblems } from '../convo/editor.js';
import { createForm, promoteForm } from '../convo/speaker.js';
import { makeCache, lineHash, ttsJob, clipURL } from '../convo/vo.js';
import { loadIndex } from '../chars/voindex.js';

const HANDOFF_KEY = 'wf.dev.convo.open';
let pending = null;
let live = null;

// Available as soon as the hub has loaded its tabs, i.e. before this tab has ever been shown.
if (typeof window !== 'undefined') {
  window.__wfConvo = {
    open(id) {
      pending = id || null;
      try { sessionStorage.setItem(HANDOFF_KEY, pending || ''); } catch { /* private mode */ }
      live?.goTo(pending, pending);
      return true;
    },
    get nodeId() { return live?.nodeId ?? null; },
    get doc() { return live?.doc ?? null; },
    get cast() { return live?.cast ?? null; },
  };
}

registerTab({
  id: 'convo',
  order: 20,
  async mount(el, ctx, arg) {
    ensureCSS();
    const cache = makeCache();
    const state = { nodeId: null, search: '', onDisk: new Set(), levelIds: [], levelList: [], banner: null };

    const doc = await ctx.data.load('conversations');
    await ctx.data.load('characters');
    const index = await ctx.data.load('levelIndex');
    state.levelIds = await ctx.data.levelIds();
    for (const id of state.levelIds) await ctx.data.load('levels', id);
    state.levelList = (Array.isArray(index) ? index : []).map(e => ({ ...e }));
    for (const id of state.levelIds) {
      const lv = ctx.data.get('levels', id);
      if (!state.levelList.some(l => l.id === id)) state.levelList.push({ id, name: lv?.name || id, start: lv?.start });
    }
    await refreshDisk();
    // data/vo.json is the generated-clip ledger the character tab writes; it carries the same hash
    // for any clip it made, so a clip generated over there is not regenerated over here.
    cache.merge((await loadIndex(ctx.api))?.doc?.clips);
    state.offline = !(await ctx.api.online());

    el.innerHTML = '';
    const bannerEl = h('div');
    const listEl = h('div', { class: 'convo-scroll' });
    const editorEl = h('div');
    const searchEl = h('input', { type: 'text', placeholder: 'search id, name, line, speaker…', class: 'convo-grow',
      oninput: e => { state.search = e.target.value.trim().toLowerCase(); paintList(); } });
    const saveState = h('span', { class: 'dim convo-vo' });

    el.append(h('div', { class: 'convo-split' },
      h('div', { class: 'convo-list' },
        h('div', { class: 'convo-head' }, searchEl,
          h('button', { class: 'convo-mini primary', text: '＋ node', onclick: newNode })),
        listEl),
      h('div', { class: 'convo-editor' },
        h('div', { class: 'convo-head' },
          h('button', { class: 'primary', text: 'Save conversations', onclick: () => save('conversations') }),
          h('button', { text: 'Save characters', onclick: () => save('characters') }),
          saveState),
        bannerEl, editorEl)));

    const E = {
      ctx,
      cache,
      get doc() { return ctx.data.get('conversations') || { version: 1, nodes: {} }; },
      get cast() { return ctx.data.get('characters')?.characters || {}; },
      get node() { return this.doc.nodes[state.nodeId]; },
      get nodeId() { return state.nodeId; },
      get links() { return derived().links; },
      get levels() { return state.levelList; },
      get onDisk() { return state.onDisk; },
      edit, goTo, rename, duplicate, remove, newChildNode, createSpeaker, promoteSpeaker,
      generateLine: i => generate([i]),
      generateAll: () => generate((E.node?.lines || []).map((_, i) => i)),
      playClip,
    };
    live = E;
    if (window.__wf) window.__wf.convo = window.__wfConvo;

    const offDoc = ctx.data.onChange('conversations', (_d, _id, why) => { if (why !== 'set') paintAll(); });
    const offCast = ctx.data.onChange('characters', (_d, _id, why) => { if (why !== 'set') paintAll(); });
    const offSave = ctx.data.onSave(r => {
      if (r.kind !== 'conversations' && r.kind !== 'characters') return;
      saveState.className = `convo-vo ${r.ok ? (r.where === 'local' ? 'stale' : 'fresh') : 'bad'}`;
      saveState.textContent = r.ok
        ? `${r.kind} → ${r.where === 'local' ? 'this browser only' : r.path} at ${new Date().toLocaleTimeString()}`
        : `${r.kind} SAVE FAILED — ${r.error}`;
    });
    this._off = () => { offDoc(); offCast(); offSave(); if (live === E) live = null; };

    const want = arg?.node || pending || takeStashed();
    pending = null;
    goTo(want && E.doc.nodes[want] ? want : firstNode(), want);

    function firstNode() { return Object.keys(E.doc.nodes)[0] || null; }

    function takeStashed() {
      try {
        const v = sessionStorage.getItem(HANDOFF_KEY) || localStorage.getItem(HANDOFF_KEY);
        sessionStorage.removeItem(HANDOFF_KEY);
        localStorage.removeItem(HANDOFF_KEY);
        return v || null;
      } catch { return null; }
    }

    // Read the level documents out of the store every time: the Level editor owns them and a
    // hotspot it adds has to show up here without a reload.
    function derived() {
      const levels = {};
      for (const id of state.levelIds) levels[id] = ctx.data.get('levels', id);
      return deriveLinks({ nodes: E.doc.nodes, levels, characters: E.cast });
    }

    // `keep` leaves the editor DOM alone so a caret survives a keystroke; everything structural
    // redraws.
    function edit(fn, label, { keep = false, coalesce = false } = {}) {
      ctx.data.mutate('conversations', null, fn, { label: `convo: ${label}`, coalesce });
      if (keep) { paintList(); repaintProblems(editorEl, E); }
      else paintAll();
    }

    function goTo(id, requested) {
      if (id && E.doc.nodes[id]) state.nodeId = id;
      state.banner = requested && !E.doc.nodes[requested] ? requested : null;
      paintAll();
    }

    function paintAll() { paintBanner(); paintList(); paintEditor(); }

    function paintEditor() {
      editorEl.innerHTML = '';
      if (!state.nodeId || !E.node) {
        editorEl.append(h('div', { class: 'empty' }, h('b', { text: 'No node selected' }),
          'pick one on the left, or make one with ＋ node'));
        return;
      }
      renderEditor(editorEl, E);
    }

    function paintBanner() {
      bannerEl.innerHTML = '';
      const { missing } = derived();
      if (state.offline) {
        bannerEl.append(h('div', { class: 'banner' }, h('b', { text: 'no dev server — ' }),
          'edits are kept in this browser only and no voice-over can be generated. Run ',
          h('code', { text: 'node tools/devserver.mjs' }), ' to write real files.'));
      }
      if (state.banner) {
        bannerEl.append(h('div', { class: 'banner' },
          h('b', { text: `${state.banner} does not exist yet. ` }),
          h('button', { class: 'convo-mini primary', text: 'Create it',
            onclick: () => { createNode(state.banner); state.banner = null; paintAll(); } })));
      }
      const gaps = [...new Map(missing.map(m => [`${m.node}|${m.from}`, m])).values()];
      if (gaps.length) {
        const box = h('div', { class: 'banner' }, h('b', { text: `${gaps.length} link(s) point at a node that does not exist: ` }));
        for (const g of gaps) {
          box.append(h('div', {}, `${g.node} — from ${g.from} `,
            h('button', { class: 'convo-mini', text: 'create', onclick: () => { createNode(g.node); paintAll(); } })));
        }
        bannerEl.append(box);
      }
    }

    function paintList() {
      const d = derived();
      listEl.innerHTML = '';
      const rows = state.search ? searchRows(d) : tree(E.doc.nodes, d);
      if (!rows.length) listEl.append(h('div', { class: 'dim', text: 'nothing matches' }));
      for (const r of rows) {
        const n = E.doc.nodes[r.id];
        const links = d.links[r.id] || [];
        const problems = nodeProblems(r.id, n, E.doc, E.cast);
        const badges = h('div', {});
        if (!links.length) badges.append(h('span', { class: 'convo-badge orphan', text: 'orphan' }));
        else {
          const triggers = links.filter(l => l.kind === 'hotspot' || l.kind === 'character').length;
          if (triggers) badges.append(h('span', { class: 'convo-badge link', text: `▶ ${triggers}` }));
          const inbound = links.length - triggers;
          if (inbound) badges.append(h('span', { class: 'convo-badge', text: `◀ ${inbound}` }));
        }
        if ((n?.lines || []).length) badges.append(h('span', { class: 'convo-badge', text: `${n.lines.length} lines` }));
        if ((n?.choices || []).length) badges.append(h('span', { class: 'convo-badge', text: `${n.choices.length} choices` }));
        if (problems.length) badges.append(h('span', { class: 'convo-badge bad', text: `${problems.length} ⚠` }));
        const row = h('button', {
          class: `convo-node${r.id === state.nodeId ? ' active' : ''}${r.repeat ? ' repeat' : ''}`,
          style: `margin-left:${(r.depth || 0) * 12}px`,
          onclick: () => goTo(r.id),
        },
          h('b', { text: (r.repeat ? '↺ ' : '') + (n?.name || r.id) }),
          h('div', { class: 'convo-id', text: r.id }),
          r.via ? h('div', { class: 'convo-via', text: r.via === 'next' ? '↳ then' : `↳ “${r.say}”` }) : null,
          r.repeat ? null : badges);
        listEl.append(row);
        if (r.id === state.nodeId && !r.repeat) queueMicrotask(() => row.scrollIntoView({ block: 'nearest' }));
      }
    }

    function searchRows(d) {
      const q = state.search;
      return Object.entries(E.doc.nodes)
        .filter(([id, n]) => `${id} ${n.name || ''} ${(n.lines || []).map(l => `${l.who} ${l.text}`).join(' ')} ${(n.choices || []).map(c => c.say).join(' ')}`
          .toLowerCase().includes(q))
        .map(([id]) => ({ id, depth: 0, via: null, say: '', repeat: false }));
    }

    function createNode(id, name) {
      const key = uniqueId(id, E.doc.nodes);
      edit(d => { d.nodes[key] = blankNode(name || key.split('.').pop()); }, `new node ${key}`);
      state.nodeId = key;
      return key;
    }

    function newNode() {
      ask({
        title: 'New conversation node', note: 'a dotted id, e.g. academy.smith.hello',
        value: state.nodeId ? `${state.nodeId.split('.').slice(0, -1).join('.')}.` : 'academy.',
        ok: 'Create',
        onOK: v => { const id = slug(v); if (!id) return paintAll(); createNode(id); paintAll(); },
      });
    }

    // Every question this tab asks is drawn in the page: prompt() is a modal, and a headless
    // dialog handler answers it before anyone has typed anything.
    function ask(opts) {
      paintEditor();
      showCard(promptCard({ ...opts, onCancel: paintAll }));
    }

    function newChildNode(sayText, apply) {
      const base = `${state.nodeId.split('.').slice(0, -1).join('.') || 'node'}.${slug(sayText) || 'reply'}`;
      const parent = state.nodeId;
      const key = uniqueId(base, E.doc.nodes);
      edit(d => { d.nodes[key] = blankNode(sayText || key); }, `new node ${key}`);
      state.nodeId = parent;
      apply(key);
    }

    function rename() {
      const from = state.nodeId;
      ask({ title: `Rename ${from}`, value: from, ok: 'Rename', onOK: v => renameTo(from, slug(v)) });
    }

    function renameTo(from, to) {
      if (!to || to === from) return paintAll();
      if (E.doc.nodes[to]) return ctx.toast(`${to} already exists`, 'bad');
      const pointing = (derived().links[from] || []).filter(l => l.kind === 'hotspot' || l.kind === 'character');
      edit(d => {
        const nodes = {};
        for (const [id, n] of Object.entries(d.nodes)) nodes[id === from ? to : id] = n;
        for (const n of Object.values(nodes)) {
          if (n.next === from) n.next = to;
          for (const c of n.choices || []) if (c.goto === from) c.goto = to;
        }
        d.nodes = nodes;
      }, `rename ${from}`);
      state.nodeId = to;
      paintAll();
      if (pointing.length) {
        ctx.toast(`${pointing.length} hotspot/character link${pointing.length > 1 ? 's' : ''} still say "${from}" — fix them in the Level editor`, 'warn');
      }
    }

    function duplicate() {
      const key = uniqueId(`${state.nodeId}.copy`, E.doc.nodes);
      const src = E.node;
      edit(d => { d.nodes[key] = JSON.parse(JSON.stringify(src)); d.nodes[key].name = `${src.name || state.nodeId} (copy)`; }, 'duplicate node');
      state.nodeId = key;
      paintAll();
    }

    function remove() {
      const id = state.nodeId;
      const links = derived().links[id] || [];
      ask({
        title: `Delete ${id}?`, ok: 'Delete', danger: true,
        note: links.length ? `${links.length} link(s) point at it and will break` : 'nothing points at it',
        onOK: () => {
          edit(d => { delete d.nodes[id]; }, `delete ${id}`);
          state.nodeId = firstNode();
          paintAll();
        },
      });
    }

    function createSpeaker(kind, apply) {
      showCard(createForm({
        kind, cast: E.cast,
        onCreate: made => {
          ctx.data.mutate('characters', null, d => { d.characters[made.id] = made.record; },
            { label: `character ${made.id}` });
          ctx.toast(`created ${made.record.name} (${made.id}) — body: none`, 'good');
          apply(made.id);
          paintAll();
        },
        onCancel: paintAll,
      }));
    }

    function promoteSpeaker(id) {
      const record = E.cast[id];
      if (!record) return;
      showCard(promoteForm({
        id, record, levels: state.levelList.length ? state.levelList : [{ id: 'academy', start: {} }],
        onPromote: next => {
          if (!next) return ctx.toast('pick a level first', 'bad');
          ctx.data.mutate('characters', null, d => { d.characters[id] = next; }, { label: `promote ${id}` });
          ctx.toast(`${record.name} now has a body in ${next.place.level} — place it precisely in the Level editor`, 'good');
          paintAll();
        },
        onCancel: paintAll,
      }));
    }

    // The editor's scroll container is the ancestor, not editorEl, so a card prepended to a
    // scrolled editor lands off-screen unless it asks to be looked at.
    function showCard(card) {
      editorEl.prepend(card);
      card.scrollIntoView({ block: 'center' });
    }

    async function refreshDisk() {
      const ls = await ctx.api.ls('audio/vo');
      state.onDisk = new Set((ls.files || []).filter(f => f.name.endsWith('.wav')).map(f => f.name.slice(0, -4)));
    }

    function playClip(name) {
      if (!name) return;
      const a = new Audio(clipURL(name, Date.now()));
      a.play().catch(e => ctx.toast(`cannot play ${name}: ${e.message}`, 'bad'));
    }

    async function generate(indices) {
      const nodeId = state.nodeId;
      const node = E.node;
      const jobs = [];
      for (const i of indices) {
        const line = node.lines[i];
        const who = E.cast[line?.who];
        if (!who?.voice) continue;
        const out = line.vo || voName(nodeId, i);
        const hash = lineHash(line, who);
        if (cache.get(out) === hash && state.onDisk.has(out)) continue;
        const job = ttsJob(line, who, out);
        if (job) jobs.push({ i, out, hash, job });
      }
      if (!jobs.length) return ctx.toast('nothing to generate — every clip matches its line', 'good');
      ctx.toast(`generating ${jobs.length} clip${jobs.length > 1 ? 's' : ''}…`);
      const r = await ctx.api.ttsBatch(jobs.map(j => j.job));
      if (!r.ok && !r.results) return ctx.toast(`kokoro: ${r.error}`, 'bad');
      (r.results || []).forEach((res, n) => {
        const j = jobs[n];
        if (!res?.ok) return ctx.toast(`${j.out}: ${res?.error || 'failed'}`, 'bad');
        cache.set(j.out, j.hash);
      });
      edit(d => {
        (r.results || []).forEach((res, n) => { if (res?.ok) d.nodes[nodeId].lines[jobs[n].i].vo = jobs[n].out; });
      }, 'vo names');
      await refreshDisk();
      paintAll();
      const good = (r.results || []).filter(x => x?.ok).length;
      ctx.toast(`${good}/${jobs.length} clips written to audio/vo/`, good ? 'good' : 'bad');
    }

    async function save(kind) {
      const r = await ctx.data.save(kind, null);
      if (r.ok && r.problems?.length) ctx.toast(`saved, but ${r.problems.length} validation problems`, 'warn');
    }
  },

  unmount() { this._off?.(); },
});
