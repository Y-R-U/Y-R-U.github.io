// The scene graph, one row per node, plus what the selected node is made of and which level
// document entry stands at that point.

import { rows, subtreeTris, materialInfo, docEntryAt } from '../graph.js';
import { TYPES } from '../../../editor/scene.js';
import { state } from '../core.js';
import { handles, warpTo } from '../game.js';
import { h, section, table, button, clear, fmt, num } from '../ui.js';

const open = new Set();
const hidden = new Set();

export const panel = {
  id: 'world',
  label: 'World',

  mount(el, ctx) {
    const tree = h('div', 'dbg-tree');
    const detail = h('div');
    const bar = h('div', 'row');

    bar.append(
      button('Pick in the world', 'primary', () => arm(ctx)),
      button('Expand roots', '', () => {
        const g = handles(ctx);
        if (g.scene) { open.add(g.scene.uuid); for (const c of g.scene.children) open.add(c.uuid); }
        paint();
      }),
      button('Collapse all', '', () => { open.clear(); paint(); }),
      button('Show everything', '', () => {
        for (const o of hidden) o.visible = true;
        hidden.clear();
        paint();
      }),
    );

    el.append(section('Scene graph', bar,
      h('p', 'dbg-note', 'Pick closes the hub and arms one click on the game: whatever the ray hits '
        + 'is selected and the hub reopens here. Hiding a node is undone by Show everything.'),
      h('div', 'dbg-cols', tree, detail)));

    function paint() {
      const g = handles(ctx);
      clear(tree);
      if (!g.scene) return void tree.append(h('div', 'empty', 'no scene — is the engine up?'));
      for (const r of rows(g.scene, open)) {
        const row = h('div', `dbg-row${state.selected === r.node ? ' sel' : ''}${r.visible ? '' : ' off'}`);
        row.style.paddingLeft = `${8 + r.depth * 13}px`;
        const tw = h('span', 'dbg-tw', r.kids ? (r.open ? '▾' : '▸') : '·');
        tw.onclick = e => {
          e.stopPropagation();
          if (!r.kids) return;
          if (open.has(r.id)) open.delete(r.id); else open.add(r.id);
          paint();
        };
        row.append(tw, h('span', null, r.label));
        if (r.kids) row.append(h('span', 'dim', ` (${r.kids})`));
        if (r.tris) row.append(h('span', 'dbg-t', `${fmt(r.tris)} tris`));
        row.onclick = () => { state.selected = r.node; paint(); };
        tree.append(row);
      }
    }

    function paintDetail() {
      const g = handles(ctx);
      const o = state.selected;
      clear(detail);
      if (!o) return void detail.append(h('div', 'empty', 'nothing selected'));
      const sub = subtreeTris(o);
      const p = worldPos(g, o);
      const rowsOut = [
        ['name', o.name || '(unnamed)'],
        ['type', o.type],
        ['uuid', { html: `<span class="dim">${o.uuid}</span>` }],
        ['visible', { html: o.visible ? 'yes' : 'no', cls: o.visible ? 'good' : 'warnc' }],
        ['world position', `${num(p.x, 2)}, ${num(p.y, 2)}, ${num(p.z, 2)}`],
        ['local position', `${num(o.position.x, 2)}, ${num(o.position.y, 2)}, ${num(o.position.z, 2)}`],
        ['rotation', `${num(o.rotation.x, 3)}, ${num(o.rotation.y, 3)}, ${num(o.rotation.z, 3)}`],
        ['scale', `${num(o.scale.x, 3)}, ${num(o.scale.y, 3)}, ${num(o.scale.z, 3)}`],
        ['children', String(o.children?.length ?? 0)],
        ['subtree', `${fmt(sub.tris)} triangles over ${sub.nodes} nodes${sub.capped ? ' (capped)' : ''}`],
        ['render order', String(o.renderOrder ?? 0)],
        ['casts / receives', `${o.castShadow ? 'yes' : 'no'} / ${o.receiveShadow ? 'yes' : 'no'}`],
      ];
      if (o.isInstancedMesh) rowsOut.push(['instances', `${o.count} of ${o.instanceMatrix?.count ?? '?'}`]);
      if (o.geometry) {
        const g2 = o.geometry;
        rowsOut.push(['geometry', `${g2.type} · ${g2.attributes?.position?.count ?? 0} verts${g2.index ? ` · ${g2.index.count} indices` : ''}`]);
      }
      detail.append(section('Selected', table(null, rowsOut)));

      for (const m of materialInfo(o.material)) {
        detail.append(section(`Material · ${m.name}`, table(null, [
          ['type', m.type],
          ['colour', m.color ? { html: `<span style="display:inline-block;width:10px;height:10px;background:${m.color};border-radius:2px"></span> ${m.color}` } : '—'],
          ['maps', m.maps],
          ['transparent', `${m.transparent} (opacity ${num(m.opacity, 2)})`],
          ['side', m.side],
        ])));
      }

      const doc = g.level;
      const entry = doc ? docEntryAt(doc, p.x, p.z, o2 => TYPES[o2.type].plan(o2.p)) : null;
      detail.append(section('Level document', entry
        ? table(null, [
          [entry.inside ? 'stands inside' : 'nearest entry', `#${entry.o.id} ${entry.o.type} (${entry.o.zone})`],
          ['distance', entry.inside ? 'inside its footprint' : `${num(entry.dist, 1)} m away`],
          ['at', `${entry.o.x}, ${entry.o.z} · ry ${num(entry.o.ry, 3)}`],
          ['params', { html: `<span class="dim">${JSON.stringify(entry.o.p)}</span>`, cls: 'wide' }],
        ])
        : h('div', 'dim', 'no level document loaded')));

      const acts = h('div', 'row');
      acts.append(
        button(o.visible ? 'Hide' : 'Show', '', () => {
          o.visible = !o.visible;
          if (o.visible) hidden.delete(o); else hidden.add(o);
          paint();
          paintDetail();
        }),
        button('Warp player here', '', () => {
          const r = warpTo(ctx, { x: p.x, z: p.z, id: o.name || o.type, label: o.name });
          ctx.toast(r.ok ? `warped to ${num(p.x, 1)}, ${num(p.z, 1)}` : r.error, r.ok ? 'good' : 'warn');
        }),
        button('Log to console', '', () => { console.log('[debug] selected', o); ctx.toast('logged'); }),
      );
      detail.append(acts);
    }

    const repaint = () => { paint(); paintDetail(); };
    repaint();
    this._t = setInterval(() => { if (state.selected !== this._was) { this._was = state.selected; repaint(); } }, 500);
  },

  unmount() { clearInterval(this._t); },
};

// three is only reachable through window.__wf.three; without it the local position is the honest
// answer rather than a crash.
function worldPos(g, o) {
  const V = g.w?.three?.Vector3;
  if (!V || !o.getWorldPosition) return o.position;
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new V());
}

// One click, on the real canvas, with the hub out of the way. The listener removes itself either
// way so an armed pick can never linger into ordinary play.
function arm(ctx) {
  const g = handles(ctx);
  if (!g.scene || !g.camera) return ctx.toast('no scene to pick from', 'warn');
  state.picking = true;
  ctx.toast('click anywhere in the game — Esc cancels');
  ctx.close();
  const stage = document.getElementById('stage') || document.body;
  const done = () => {
    state.picking = false;
    stage.removeEventListener('pointerdown', onClick, true);
    removeEventListener('keydown', onKey, true);
  };
  const onKey = e => { if (e.key === 'Escape') { done(); ctx.toast('pick cancelled'); } };
  const onClick = async e => {
    e.preventDefault();
    e.stopPropagation();
    done();
    const THREE = g.w.three;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), g.camera);
    const hits = ray.intersectObjects(g.scene.children, true).filter(x => x.object.visible);
    if (!hits.length) return ctx.toast('the ray hit nothing', 'warn');
    state.selected = hits[0].object;
    for (let o = hits[0].object; o; o = o.parent) open.add(o.uuid);
    await window.__wfDev?.open?.();
    ctx.hub.show('debug');
  };
  stage.addEventListener('pointerdown', onClick, true);
  addEventListener('keydown', onKey, true);
}
