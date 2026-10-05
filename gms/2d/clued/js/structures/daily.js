// Daily: the same 10 questions for everyone (UTC date seed). Kids, map and music dailies have their own seeds.
import { playSpec } from './session.js?v=202610050144';
import { makeSpec } from '../core/spec.js?v=202610050144';
import { listFormats, getFormat } from '../formats/registry.js?v=202610050144';
import { todayUTC, dailyDone, recordDaily, getStats, getSettings } from '../core/store.js?v=202610050144';
import { defineScreen, go, header } from '../ui/app.js?v=202610050144';
import { h, fmtNum } from '../ui/kit.js?v=202610050144';
import { shareText } from '../ui/share.js?v=202610050144';

const KINDS = {
  main: { title: 'Daily challenge', icon: '🔎', blurb: 'Ten questions from everything.' },
  kids: { title: 'Kids Daily', icon: '🧸', blurb: 'Ten easy picture questions.' },
  map: { title: 'Daily map', icon: '🗺️', blurb: 'Ten map questions.', tag: 'map' },
  music: { title: 'Daily music', icon: '🎵', blurb: 'Ten music questions.', tag: 'music' },
};

const tagged = tag => listFormats().filter(f => (f.tags || []).includes(tag) && !(f.tags || []).includes('nodaily')).map(f => f.id).sort();

export function dailySpec(kind, day = todayUTC()) {
  let rounds;
  if (kind === 'main' || kind === 'kids') rounds = [{ format: 'mc', count: 7 }, { format: 'tf', count: 3 }];
  else {
    const ids = tagged(KINDS[kind].tag);
    if (!ids.length) return null;
    rounds = ids.slice(0, 5).map((id, i, a) => ({ format: id, count: Math.floor(10 / a.length) + (i < 10 % a.length ? 1 : 0) }));
  }
  return makeSpec('daily', rounds.map(r => ({ ...r, packs: 'all', difficulty: 0 })), `daily${kind === 'main' ? '' : '-' + kind}:${day}`, { kids: kind === 'kids', daily: kind });
}

export const gridOf = answers => answers.map(a => (a.correct ? '🟩' : a.skipped ? '⬜' : '🟥')).join('');

export function dailyShare(kind, day, r) {
  const g = [...r.grid];
  const lines = [];
  for (let i = 0; i < g.length; i += 5) lines.push(g.slice(i, i + 5).join(''));
  return `Clued ${KINDS[kind].title} ${day} 🔎\n${r.correct}/${r.total}${kind === 'kids' ? '' : ` · ${fmtNum(r.score)} pts`}\n${lines.join('\n')}\n${location.origin}${location.pathname}`;
}

function startDaily(kind) {
  const day = todayUTC();
  const spec = dailySpec(kind, day);
  if (!spec) return;
  playSpec(spec, {
    title: KINDS[kind].title, cfg: () => ({ timer: kind === 'kids' ? 0 : 20 }),
    onDone(res, out) {
      const result = { score: res.score, correct: res.correct, total: res.total, grid: gridOf(res.answers) };
      const first = !dailyDone(day, kind);
      if (first && !res.aborted) recordDaily(day, kind, result);
      go('results', { ...out, result: res, daily: { kind, day, first, text: dailyShare(kind, day, result) } }, { replace: true, skipGuard: true });
    },
  });
}

defineScreen('daily', el => {
  const kids = !!getSettings().kids;
  const day = todayUTC();
  const st = getStats();
  el.append(header('Daily'));
  el.append(h('p.muted.center', { style: { marginTop: '0', marginBottom: '14px' } }, `${new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · new questions at midnight UTC`));
  const kinds = kids ? ['kids', 'main'] : ['main', 'kids', 'map', 'music'];
  const list = h('div.stack');
  for (const kind of kinds) {
    const k = KINDS[kind];
    if (k.tag && !tagged(k.tag).length) continue;
    const done = dailyDone(day, kind);
    const r = st.daily.results[`${kind}:${day}`];
    const card = h('div.panel', { dataset: { daily: kind } },
      h('div.row', {}, h('span', { style: { fontSize: '36px' } }, k.icon), h('div', { style: { flex: 1 } }, h('h2', {}, k.title), h('div.muted.tiny', {}, k.blurb))));
    if (done && r) {
      card.append(h('div.share-grid.center', {}, r.grid), h('p.center', { style: { margin: '4px 0 10px' } }, `${r.correct}/${r.total}${kind === 'kids' ? '' : ` · ${fmtNum(r.score)} pts`}`),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn.sun.small', { type: 'button', onclick: () => shareText(dailyShare(kind, day, r), 'Clued Daily') }, 'Share'),
          h('button.btn.small', { type: 'button', onclick: () => startDaily(kind) }, 'Play again (unscored)')));
    } else {
      card.append(h('button.btn.primary.wide', { type: 'button', style: { marginTop: '12px' }, dataset: { act: 'play' }, onclick: () => startDaily(kind) }, 'Play'));
    }
    list.append(card);
  }
  el.append(list);
}, { pester: true });

export default { id: 'daily', title: 'Daily', icon: '🔎', start: ({ kind = 'main' } = {}) => startDaily(kind), formatTitle: id => getFormat(id)?.title };
