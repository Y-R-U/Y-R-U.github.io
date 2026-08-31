// The node editor: lines, choices, the node's own fields, and the preview.

import { h, select } from './dom.js';
import { CAMS, blankLine, blankChoice, move, nodeProblems, voName, flagNames } from './model.js';
import { speakerSelect, NEW_NPC, NEW_NARRATOR } from './speaker.js';
import { predEditor, flagDatalist } from './prededit.js';
import { actionList } from './actionedit.js';
import { playPanel } from './play.js';
import { describeLink } from './links.js';
import { clipState } from './vo.js';

export function renderEditor(host, E) {
  host.innerHTML = '';
  const { node, nodeId } = E;
  host.append(flagDatalist(flagNames(E.doc.nodes)));

  host.append(h('div', { class: 'convo-head' },
    h('b', { text: nodeId }),
    h('input', {
      type: 'text', class: 'convo-grow', value: node.name || '', placeholder: 'what this node is, for the author',
      oninput: e => E.edit(d => { d.nodes[nodeId].name = e.target.value; }, 'node name', { keep: true }),
    }),
    h('span', { class: 'dim', text: 'cam' }),
    select(CAMS.map(c => [c, c]), node.cam || 'two', v => E.edit(d => { d.nodes[nodeId].cam = v; }, 'cam')),
    h('label', { class: 'dim' }, h('input', {
      type: 'checkbox', checked: !!node.once,
      onchange: e => E.edit(d => { d.nodes[nodeId].once = e.target.checked; }, 'once'),
    }), ' once'),
    h('span', { class: 'dim', text: 'then' }),
    select([['', '— stop —'], ...Object.keys(E.doc.nodes).filter(i => i !== nodeId).map(i => [i, i])],
      node.next || '', v => E.edit(d => { d.nodes[nodeId].next = v || null; }, 'next')),
    h('button', { class: 'convo-mini', text: 'Rename…', onclick: E.rename }),
    h('button', { class: 'convo-mini', text: 'Duplicate', onclick: E.duplicate }),
    h('button', { class: 'convo-mini danger', text: 'Delete', onclick: E.remove })));

  host.append(linksBlock(E));
  host.append(problemsBlock(E));

  host.append(section('Lines', [
    h('button', { class: 'convo-mini', text: '＋ line', onclick: () => E.edit(d => {
      d.nodes[nodeId].lines.push(blankLine(lastSpeaker(node) || ''));
    }, 'add line') }),
    h('button', { class: 'convo-mini', text: '⏺ generate missing VO', onclick: () => E.generateAll() }),
  ]));
  const lines = h('div');
  (node.lines || []).forEach((l, i) => lines.append(lineCard(l, i, E)));
  if (!(node.lines || []).length) lines.append(h('div', { class: 'dim', text: 'no lines — this node is a pure branch point' }));
  host.append(lines);

  host.append(section('Choices', [
    h('button', { class: 'convo-mini', text: '＋ choice', onclick: () => E.edit(d => {
      d.nodes[nodeId].choices = [...(d.nodes[nodeId].choices || []), blankChoice()];
    }, 'add choice') }),
  ]));
  (node.choices || []).forEach((c, i) => host.append(choiceCard(c, i, E)));
  if (!(node.choices || []).length) host.append(h('div', { class: 'dim', text: 'no choices — the node ends, or falls through to “then”' }));

  host.append(section('When this node plays', []));
  host.append(h('div', { class: 'convo-card' },
    actionList(() => E.doc.nodes[nodeId].sets || [], E,
      (v, o) => E.edit(d => { d.nodes[nodeId].sets = v; }, 'node effects', o))));

  host.append(section('Preview', []));
  host.append(playPanel(E));
}

const section = (title, buttons) => h('div', { class: 'convo-head', style: 'margin-top:14px' },
  h('h2', { style: 'margin:0', text: title }), ...buttons);

const lastSpeaker = node => [...(node.lines || [])].reverse().find(l => l.who)?.who || '';

function linksBlock(E) {
  const list = E.links[E.nodeId] || [];
  const box = h('div', { class: 'convo-card convo-links' });
  if (!list.length) {
    box.append(h('span', { class: 'convo-badge orphan', text: 'ORPHAN' }),
      ' nothing triggers this node — no hotspot, no character, no choice and no “then” reaches it.');
    return box;
  }
  box.append(h('div', { text: `linked from ${list.length}:` }));
  for (const l of list) {
    const row = h('div', {},
      h('span', { class: `convo-badge ${l.kind === 'hotspot' || l.kind === 'character' ? 'link' : ''}`, text: l.kind }),
      describeLink(l));
    if (l.from) row.append(' ', h('span', { class: 'convo-jump', text: 'open', onclick: () => E.goTo(l.from) }));
    box.append(row);
  }
  return box;
}

function problemsBlock(E) {
  const list = nodeProblems(E.nodeId, E.node, E.doc, E.cast);
  return h('div', { class: `problems${list.length ? '' : ' clean'}`, 'data-role': 'convo-problems',
    text: list.length ? list.map(p => '• ' + p).join('\n') : 'this node is valid' });
}

// Typing does not redraw the editor, so this is how the problem list keeps up with the words.
export function repaintProblems(host, E) {
  const old = host.querySelector('[data-role=convo-problems]');
  if (old && E.node) old.replaceWith(problemsBlock(E));
}

function lineCard(line, i, E) {
  const nodeId = E.nodeId;
  const who = E.cast[line.who];
  const setLine = (patch, label, opts) => E.edit(d => {
    d.nodes[nodeId].lines[i] = { ...d.nodes[nodeId].lines[i], ...patch };
  }, label, opts);

  const speakerCol = h('div', { class: 'convo-col' },
    h('div', { class: 'convo-num', text: `line ${i + 1}` }),
    speakerSelect(E.cast, line.who, v => {
      if (v === NEW_NPC || v === NEW_NARRATOR) return E.createSpeaker(v, id => setLine({ who: id }, 'speaker'));
      setLine({ who: v }, 'speaker');
    }, { style: 'width:100%' }));
  if (who) {
    speakerCol.append(h('div', { class: 'convo-vo dim', text: who.voice ? `${who.voice} · ${who.body}` : `no voice · ${who.body}` }));
    if (who.body !== 'robed') {
      speakerCol.append(h('button', { class: 'convo-mini', text: 'Turn into a full character',
        onclick: () => E.promoteSpeaker(line.who) }));
    }
  } else if (line.who) {
    speakerCol.append(h('div', { class: 'convo-vo bad', text: 'not in characters.json' }));
  }

  const state = clipState({ line, character: who, cache: E.cache, onDisk: E.onDisk });
  const voRow = h('div', { class: 'row', style: 'margin:0' },
    h('span', { class: 'dim convo-vo', text: 'vo' }),
    h('input', {
      type: 'text', value: line.vo || '', placeholder: voName(nodeId, i), style: 'width:230px',
      oninput: e => setLine({ vo: e.target.value.trim() }, 'vo name', { keep: true }),
    }),
    h('span', { class: `convo-vo ${state === 'fresh' ? 'fresh' : state === 'stale' ? 'stale' : state === 'novoice' ? 'bad' : 'missing'}`,
      text: { fresh: 'clip up to date', stale: 'clip is older than this text', missing: 'no clip yet',
        unnamed: 'unnamed', unknown: 'clip on disk, hash unknown', novoice: 'speaker has no voice' }[state] }),
    h('button', { class: 'convo-mini', text: '▶', title: 'play the clip', disabled: !line.vo || !E.onDisk.has(line.vo),
      onclick: () => E.playClip(line.vo, line.who) }),
    h('button', { class: 'convo-mini', text: 'Generate', disabled: !who?.voice,
      onclick: () => E.generateLine(i) }));

  return h('div', { class: 'convo-card line' },
    speakerCol,
    h('div', { class: 'convo-col' },
      h('textarea', {
        spellcheck: 'true', value: line.text || '', placeholder: 'what they say',
        oninput: e => setLine({ text: e.target.value }, 'line text', { keep: true, coalesce: true }),
      }),
      voRow),
    h('div', { class: 'convo-col' },
      h('button', { class: 'convo-mini', text: '▲', disabled: i === 0,
        onclick: () => E.edit(d => { d.nodes[nodeId].lines = move(d.nodes[nodeId].lines, i, i - 1); }, 'move line') }),
      h('button', { class: 'convo-mini', text: '▼', disabled: i === (E.node.lines.length - 1),
        onclick: () => E.edit(d => { d.nodes[nodeId].lines = move(d.nodes[nodeId].lines, i, i + 1); }, 'move line') }),
      h('button', { class: 'convo-mini', text: '⧉', title: 'duplicate',
        onclick: () => E.edit(d => { d.nodes[nodeId].lines.splice(i + 1, 0, { ...line }); }, 'duplicate line') }),
      h('button', { class: 'convo-mini danger', text: '✕',
        onclick: () => E.edit(d => { d.nodes[nodeId].lines.splice(i, 1); }, 'delete line') })));
}

function choiceCard(choice, i, E) {
  const nodeId = E.nodeId;
  const setChoice = (patch, label, opts) => E.edit(d => {
    d.nodes[nodeId].choices[i] = { ...d.nodes[nodeId].choices[i], ...patch };
  }, label, opts);

  const gotoOptions = [['', '— nowhere —'], ...Object.keys(E.doc.nodes).map(id => [id, id]), ['__new', '＋ new node…']];

  return h('div', { class: 'convo-card convo-choice' },
    h('div', { class: 'row' },
      h('span', { class: 'convo-num', text: `choice ${i + 1}` }),
      h('input', {
        type: 'text', class: 'convo-grow', style: 'flex:1 1 auto', value: choice.say || '',
        placeholder: 'what the player says',
        oninput: e => setChoice({ say: e.target.value }, 'choice text', { keep: true, coalesce: true }),
      }),
      h('span', { class: 'dim', text: 'goes to' }),
      select(gotoOptions, choice.goto || '', v => {
        if (v === '__new') return E.newChildNode(choice.say, id => setChoice({ goto: id }, 'choice goto'));
        setChoice({ goto: v || null }, 'choice goto');
      }),
      h('button', { class: 'convo-mini', text: '▲', disabled: i === 0,
        onclick: () => E.edit(d => { d.nodes[nodeId].choices = move(d.nodes[nodeId].choices, i, i - 1); }, 'move choice') }),
      h('button', { class: 'convo-mini', text: '▼', disabled: i === (E.node.choices.length - 1),
        onclick: () => E.edit(d => { d.nodes[nodeId].choices = move(d.nodes[nodeId].choices, i, i + 1); }, 'move choice') }),
      h('button', { class: 'convo-mini danger', text: '✕',
        onclick: () => E.edit(d => { d.nodes[nodeId].choices.splice(i, 1); }, 'delete choice') })),
    predEditor(() => E.doc.nodes[nodeId].choices[i]?.if ?? null,
      (v, o) => setChoice({ if: v }, 'choice if', o), { flags: flagNames(E.doc.nodes) }),
    actionList(() => E.doc.nodes[nodeId].choices[i]?.sets || [], E,
      (v, o) => setChoice({ sets: v }, 'choice effects', o)));
}
