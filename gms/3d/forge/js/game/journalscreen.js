// The journal: Quests, Truths, Log. Everything it draws comes from `journal.js` and `quest.js`.

import { truthChains, count, logScenes, questList } from './journal.js';
import { progress } from './quest.js';
import { el, clear } from './ui.js';
import { nameOf } from './towns.js';

const TABS = ['quests', 'truths', 'log'];
const RING = { light: '○', dark: '◐', neutral: '●' };
const MARK = { active: '○', turnin: '○', done: '✓', failed: '✕', cooling: '·' };

export class JournalScreen {
  constructor({ host, quests, journal, clock, names = () => ({}), onClose = () => {} }) {
    this.host = host;
    this.quests = quests;
    this.journal = journal;
    this.clock = clock;
    this.names = names;
    this.onClose = onClose;
    this.tab = 'quests';
    this.selected = null;
    this.jumpTo = null;
    this.root = el('div', 'g-journal');
    this.open_ = false;
  }

  get open() { return this.open_; }

  toggle(tab) { return this.open_ ? this.close() : this.show(tab); }

  show(tab = this.tab) {
    this.tab = TABS.includes(tab) ? tab : 'quests';
    this.open_ = true;
    this.host.append(this.root);
    this.draw();
  }

  close() {
    this.open_ = false;
    this.root.remove();
    this.onClose();
  }

  showTruth(id) {
    const t = this.journal().truths.find(x => x.id === id);
    this.jumpTo = t?.scene || null;
    this.show(this.jumpTo ? 'log' : 'truths');
  }

  draw() {
    clear(this.root);
    const j = this.journal();
    const defs = this.quests.truths || {};

    const bar = el('header', 'g-tabs');
    const x = el('button', 'g-x', '✕');
    x.onclick = () => this.close();
    bar.append(x);
    for (const t of TABS) {
      const n = t === 'truths' ? ` (${count(j, defs).known})` : '';
      const b = el('button', t === this.tab ? 'on' : null, t.toUpperCase() + n);
      b.onclick = () => { this.tab = t; this.draw(); };
      bar.append(b);
    }
    bar.append(el('i', null, this.stamp()));
    this.root.append(bar);

    const body = el('div', 'g-jbody');
    this.root.append(body);
    if (this.tab === 'quests') this.drawQuests(body);
    if (this.tab === 'truths') this.drawTruths(body, j, defs);
    if (this.tab === 'log') this.drawLog(body, j);
  }

  stamp() {
    const c = this.clock;
    if (!c) return '';
    const bell = ['Deep', 'Rising', 'Forenoon', 'High', 'Afternoon', 'Setting', 'Low'][
      c.hour < 5 ? 0 : c.hour < 8 ? 1 : c.hour < 12 ? 2 : c.hour < 14 ? 3 : c.hour < 18 ? 4 : c.hour < 21 ? 5 : 6];
    return `Day ${c.day} · ${bell}`;
  }

  drawQuests(body) {
    const q = this.quests;
    const rows = questList(q.defs, q.state, id => progress(q.defs, q.state, id));
    const list = el('div', 'g-jlist');
    if (!rows.length) list.append(el('p', 'g-empty', 'Nothing taken on yet.'));
    if (!rows.some(r => r.id === this.selected)) this.selected = rows[0]?.id || null;

    for (const r of rows) {
      const row = el('button', `g-jrow${r.id === this.selected ? ' on' : ''}${r.state === 'done' ? ' done' : ''}`);
      const head = el('span');
      head.append(el('i', null, r.tracked ? '●' : MARK[r.state] || '○'));
      head.append(r.title);
      if (r.board) head.append(el('em', null, 'BOARD'));
      else if (r.act) head.append(el('em', null, `ACT ${r.act}`));
      row.append(head);
      if (r.state === 'active' || r.state === 'turnin') {
        const sub = el('span', 'g-jsub');
        sub.append(r.text);
        if (r.need > 1) sub.append(el('i', null, `${r.have}/${r.need}`));
        row.append(sub);
      }
      row.onclick = () => { this.selected = r.id; this.draw(); };
      list.append(row);
    }
    body.append(list);

    const pane = el('div', 'g-jpane');
    const def = this.quests.defs[this.selected];
    if (def) {
      const rec = this.quests.state.quests[this.selected];
      pane.append(el('h3', null, def.title));
      pane.append(el('p', 'g-jby', [def.giver && this.nameOf(def.giver), def.town && nameOf(def.town)].filter(Boolean).join(' · ')));
      pane.append(el('p', null, def.summary));
      const steps = el('ol', 'g-jsteps');
      const reqs = def.steps.filter(s => !s.optional);
      reqs.forEach((s, i) => {
        const li = el('li', i < rec.i ? 'was' : i === rec.i ? 'now' : null, s.text);
        if (i === rec.i && rec.s === 'active') {
          const p = progress(this.quests.defs, this.quests.state, this.selected);
          if (p?.need > 1) li.append(el('i', null, `${p.have}/${p.need}`));
        }
        steps.append(li);
      });
      pane.append(steps);
      pane.append(el('p', 'g-jby', `Rewards   ${this.quests.rewardText(this.selected)}`));

      const acts = el('div', 'g-jacts');
      const add = (label, fn, on = true) => {
        const b = el('button', null, label);
        b.disabled = !on;
        b.onclick = fn;
        acts.append(b);
      };
      const live = rec.s === 'active' || rec.s === 'turnin';
      add('Track', () => { this.quests.track(this.selected); this.draw(); },
        live && this.quests.state.tracked !== this.selected);
      add('Reset step', () => { this.quests.resetStep(this.selected); this.draw(); }, rec.s === 'active');
      if (rec.s === 'failed') add('Try again', () => { this.quests.retry(this.selected); this.draw(); });
      pane.append(acts);
    }
    body.append(pane);
  }

  drawTruths(body, j, defs) {
    const wrap = el('div', 'g-jtruths');
    const chains = truthChains(j, defs);
    if (!chains.length) wrap.append(el('p', 'g-empty', 'Nothing known yet that anyone would argue with.'));
    for (const chain of chains) {
      const block = el('div', 'g-chain');
      for (const row of chain) {
        const line = el('div', row.struck ? 'g-truth struck' : 'g-truth');
        line.append(el('i', null, RING[row.campaign] || '·'));
        line.append(el('span', null, row.text));
        line.append(el('em', null, `Day ${row.day}`));
        if (row.scene) line.onclick = () => this.showTruth(row.id);
        block.append(line);
      }
      wrap.append(block);
    }
    const c = count(j, defs);
    const foot = el('footer', 'g-jfoot');
    foot.append(el('span', null, `${RING.light} Whitewall    ${RING.dark} Blackstone    ${RING.neutral} Longacre`));
    foot.append(el('i', null, `${c.known} of ${c.total} known`));
    wrap.append(foot);
    body.append(wrap);
  }

  nameOf(id) {
    const n = this.names();
    return id === 'player' ? (n.player || 'You') : (n[id] || id);
  }

  drawLog(body, j) {
    const wrap = el('div', 'g-jlog');
    const scenes = logScenes(j);
    if (!scenes.length) wrap.append(el('p', 'g-empty', 'Nobody has said anything yet.'));
    for (const s of scenes) {
      const block = el('div', s.scene === this.jumpTo ? 'g-scene-log hit' : 'g-scene-log');
      block.append(el('b', null, `Day ${s.day}`));
      for (const line of s.lines) {
        block.append(el('p', null, `${this.nameOf(line[0])}: ${line.slice(1).join(' ')}`));
      }
      wrap.append(block);
    }
    body.append(wrap);
    this.jumpTo = null;
  }
}
