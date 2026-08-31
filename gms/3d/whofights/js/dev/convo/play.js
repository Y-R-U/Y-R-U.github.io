// "Play it" — walks a node the way the game will, through js/game/dialogue.js and the real action
// executor. A branching conversation you cannot walk in the tool is one you debug by playing.

import { h, select } from './dom.js';
import { open, current, advance, skip, visibleChoices, choose, effectsOf, run } from '../../game/dialogue.js';
import { runActions } from '../../game/actions.js';
import { flagNames } from './model.js';
import { describePred } from './preds.js';

export function playPanel(E) {
  const wrap = h('div');
  const out = h('div', { class: 'convo-transcript' });
  const stage = h('div', { class: 'convo-col', style: 'margin-top:8px' });
  const state = { scene: null, seen: [], visited: [], picks: [], flags: {}, hour: 11, day: 1, vo: true };

  const pctx = () => ({ flags: state.flags, hour: state.hour, day: state.day, items: {}, quests: {} });
  const say = (cls, text) => out.append(h('div', { class: cls, text }));

  function start() {
    state.scene = null; state.seen = []; state.visited = []; state.picks = [];
    out.innerHTML = '';
    enter(E.nodeId);
    draw();
  }

  function enter(id) {
    const scene = open(E.doc.nodes, id, { ...pctx(), seen: state.seen });
    if (!scene) {
      say('fx', `— ${id} is a "once" node and has already played in this run —`);
      state.scene = null;
      return;
    }
    state.seen.push(id);
    state.visited.push(id);
    say('who', `── ${id} ── ${E.doc.nodes[id]?.name || ''}`);
    state.scene = scene;
  }

  function finishNode() {
    const fx = effectsOf(state.scene.node);
    apply(fx);
    const next = state.scene.goto;
    state.scene = null;
    if (next) enter(next);
    else say('fx', '— end —');
  }

  function apply(list) {
    for (const a of list) {
      if (Array.isArray(a)) { say('fx', `» ${a.join(' ')}`); continue; }
      say('fx', `» ${a.k} ${a.name || a.node || a.set || a.who || ''}${a.k === 'flag' ? ` = ${a.value !== false}` : ''}`);
    }
    runActions(list.filter(a => !Array.isArray(a)), { flags: state.flags, emit: () => {}, say: () => {}, goto: () => {} });
  }

  function draw() {
    stage.innerHTML = '';
    const s = state.scene;
    if (!s) {
      stage.append(h('div', { class: 'dim', text: state.visited.length ? `visited ${state.visited.length} node(s)` : 'not started' }));
      return;
    }
    if (s.choosing) {
      const list = visibleChoices(s.node, pctx());
      if (!list.length) return finishNode(), draw();
      for (const [i, c] of list.entries()) {
        stage.append(h('button', { class: 'convo-choicebtn', onclick: () => pick(i) },
          `▸ ${c.say}`, c.if ? h('span', { class: 'dim', text: `   [${describePred(c.if)}]` }) : null));
      }
      const hidden = (s.node.choices || []).length - list.length;
      if (hidden > 0) stage.append(h('div', { class: 'dim', text: `${hidden} choice(s) hidden by their if` }));
      return;
    }
    const line = current(s);
    if (!line) return finishNode(), draw();
    const who = E.cast[line.who];
    stage.append(h('div', { class: 'row' },
      h('b', { text: (who?.name || line.who || '?') + ':' }),
      h('span', { text: line.text || '(no text)' })));
    stage.append(h('div', { class: 'row' },
      h('button', { class: 'primary', text: 'Next ▸', onclick: step }),
      h('button', { text: 'Skip to choices', onclick: () => { state.scene = skip(state.scene, pctx()); draw(); } })));
    if (state.vo && line.vo && E.onDisk.has(line.vo)) E.playClip(line.vo, line.who);
    say('', `${who?.name || line.who}: ${line.text}`);
  }

  function step() {
    state.scene = advance(state.scene, pctx());
    if (!state.scene.done) return draw();
    finishNode();
    draw();
  }

  function pick(i) {
    const list = visibleChoices(state.scene.node, pctx());
    say('who', `→ ${list[i]?.say}`);
    state.picks.push(i);
    const fx = effectsOf(state.scene.node);
    apply(fx);
    const r = choose(state.scene, i, pctx());
    apply(r.effects);
    state.scene = null;
    if (r.goto) enter(r.goto);
    else say('fx', '— end —');
    draw();
  }

  const flags = flagNames(E.doc.nodes);
  const flagRow = h('div', { class: 'convo-flags' },
    flags.length ? flags.map(f => h('label', {},
      h('input', { type: 'checkbox', onchange: e => { state.flags[f] = e.target.checked; } }), f))
      : h('span', { class: 'dim', text: 'no flags used in this pack yet' }));

  wrap.append(
    h('div', { class: 'convo-head' },
      h('button', { class: 'primary', text: '▶ Play it', onclick: start }),
      h('button', { text: 'Transcript', title: 'dialogue.run() with the choices taken so far',
        onclick: () => {
          const r = run(E.doc.nodes, E.nodeId, pctx(), state.picks);
          out.innerHTML = '';
          say('who', `run() · ${r.visited.length} nodes · ${r.lines.length} lines · ${r.effects.length} effects`);
          for (const l of r.lines) say('', `${E.cast[l.who]?.name || l.who}: ${l.text}`);
          for (const e of r.effects) say('fx', `» ${e.k || e[0]} ${e.name || e.node || e[1] || ''}`);
        } }),
      h('label', { class: 'dim' },
        h('input', { type: 'checkbox', checked: true, onchange: e => { state.vo = e.target.checked; } }), ' play VO'),
      h('span', { class: 'dim', text: 'hour' }),
      select([...Array(24).keys()].map(i => [String(i), String(i)]), String(state.hour), v => { state.hour = +v; }, { class: 'convo-mini' })),
    h('div', { class: 'row' }, h('span', { class: 'dim', text: 'flags:' }), flagRow),
    stage, h('div', { style: 'height:8px' }), out);
  return wrap;
}
