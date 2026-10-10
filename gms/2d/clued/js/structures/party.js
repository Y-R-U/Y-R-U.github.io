// Pass and play: 2–8 named players take turns on one device. Each player can be in kids mode.
import { playSpec } from './session.js?v=202610100510';
import { specFor, fmtTitle } from './common.js?v=202610100510';
import { handoff } from './handoff.js?v=202610100510';
import { defineScreen, go, header } from '../ui/app.js?v=202610100510';
import { h, esc, fmtNum } from '../ui/kit.js?v=202610100510';
import { read, write, getSettings } from '../core/store.js?v=202610100510';
import { toast } from '../ui/popup.js?v=202610100510';

const KEY = 'clued.party';
export function getPlayers() {
  const p = read(KEY);
  if (Array.isArray(p) && p.length >= 2) return p;
  const kids = !!getSettings().kids;
  return [{ name: 'Player 1', kids }, { name: 'Player 2', kids }];
}
const savePlayers = p => write(KEY, p);

// Interleave per-player question lists: turn t belongs to player t % n.
export function interleave(questions, n) {
  const by = Array.from({ length: n }, (_, r) => questions.filter(q => q.round === r));
  const out = [];
  for (let k = 0; by.some(l => l.length > k); k++) for (let r = 0; r < n; r++) if (by[r][k]) out.push(by[r][k]);
  return out;
}

export function playersEditor(host, players, { min = 2, max = 8, kidsToggle = true } = {}) {
  const box = h('div.players');
  const draw = () => {
    box.innerHTML = '';
    players.forEach((p, i) => {
      const name = h('input.field', { type: 'text', value: p.name, maxlength: 16, 'aria-label': `Player ${i + 1} name`, enterkeyhint: 'next' });
      name.addEventListener('input', () => { p.name = name.value; });
      const kid = kidsToggle ? h('button.btn.kid-btn', { type: 'button', class: p.kids ? 'on' : '', title: 'Kids mode for this player', 'aria-pressed': String(!!p.kids) }, '🧸') : null;
      kid && kid.addEventListener('click', () => { p.kids = !p.kids; kid.classList.toggle('on', p.kids); kid.setAttribute('aria-pressed', String(p.kids)); });
      const del = h('button.icon-btn', { type: 'button', 'aria-label': 'Remove player', disabled: players.length <= min }, '✕');
      del.addEventListener('click', () => { players.splice(i, 1); draw(); });
      box.append(h('div.player-row', {}, name, kid, del));
    });
    if (players.length < max) {
      box.append(h('button.btn.small', { type: 'button', onclick: () => { players.push({ name: `Player ${players.length + 1}`, kids: !!getSettings().kids }); draw(); box.querySelector('.player-row:last-of-type input')?.select(); } }, '+ Add player'));
    }
  };
  draw();
  host.append(box);
  return { players: () => players.map((p, i) => ({ name: (p.name || '').trim() || `Player ${i + 1}`, kids: !!p.kids })) };
}

defineScreen('party', el => {
  const players = getPlayers().map(p => ({ ...p }));
  el.append(header('Party'));
  el.append(h('p.muted.center', { style: { marginTop: '0', marginBottom: '12px' } }, 'Pass the phone. Everyone gets their own questions. Tap 🧸 to give a player easy kids questions.'));
  const panel = h('div.panel');
  const ed = playersEditor(panel, players);
  el.append(panel);
  el.append(h('div.start-bar', {}, h('button.btn.go.big.wide', {
    type: 'button', dataset: { act: 'next' }, onclick: () => {
      const ps = ed.players();
      if (ps.length < 2) { toast('Party needs at least 2 players'); return; }
      savePlayers(ps);
      go('formats', { structure: 'party', title: 'Pick a format' });
    },
  }, 'Next: pick a format')));
});

const party = {
  id: 'party', title: 'Party', icon: '🎉', blurb: 'Each player answers this many questions.',
  start(c) {
    const players = getPlayers();
    const rounds = players.map(p => ({ format: c.format, packs: c.packs, count: c.count, opts: c.opts, difficulty: p.kids ? 1 : c.difficulty, kids: !!p.kids }));
    const spec = specFor('party', { ...c, kids: false }, rounds);
    playSpec(spec, {
      title: `Party · ${fmtTitle(c.format)}`, choice: c, replay: () => party.start(c), players,
      cfg: questions => {
        const list = interleave(questions, players.length);
        return {
          questions: list, players, timer: c.timer, playerOf: i => list[i]?.round ?? 0,
          label: (i, q, s) => `Turn ${Math.floor(i / players.length) + 1} / ${Math.ceil(list.length / players.length)}`,
          before: (i, q, s) => {
            const p = s.players[q.round];
            const lead = [...s.players].sort((a, b) => b.score - a.score)[0];
            return handoff(document.querySelector('.scr-play'), {
              name: p.name, sub: i ? `${esc(p.name)}: ${fmtNum(p.score)} pts · leader ${esc(lead.name)}` : 'First question!',
              icon: p.kids ? '🧸' : '', button: "I'm ready",
            });
          },
        };
      },
    });
  },
};
export default party;
