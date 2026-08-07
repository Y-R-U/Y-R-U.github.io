// The end card. The one full-screen thing in the game — `body[data-panel="gameover"]` takes the
// dock and the top bar away, and gives them back on every dismissal path.
//
// `state.over` is any string. Endings the copy does not know still get a card.
//
// The verdict is the point of the whole game: it names the real case the run just re-ran, picked
// at runtime from what the player actually did. VERDICT is copy, not data the sim reads, and it
// belongs in content/ the moment anyone owns that file — see the handoff.

import content from '../sim/content.js';
import { definePanel, panels } from './panels.js';
import { clearSave, newSeed } from './save.js';
import { esc, cr, crShort, pct, pts, titleCase, shareCurve } from './format.js';

const RIVAL = content.rival.profile.name;
// the name ends in "Co." and a sentence cannot end on two full stops
const THEM = RIVAL.replace(/\.$/, '');

const ENDINGS = {
  monopoly: {
    tone: 'win', word: 'Monopoly', kicker: 'The Reach is yours',
    line: st => `${pct(st.share.player, 0)} of every tonne that moves in the Tamber Reach moves under your flag. ${THEM} still exists. Nobody charters it.`,
  },
  duopoly: {
    tone: 'win', word: 'Duopoly', kicker: 'Two names left',
    line: st => `${pct(st.share.player, 0)} of Reach freight, and the only other name on a manifest is ${THEM}. Between you there is nothing left for anyone to undercut.`,
  },
  bust: {
    tone: 'lose', word: 'Bust', kicker: 'The company folded',
    line: st => `The bank stopped covering the overdraft at ${cr(st.cash)} credits. The hulls were sold where they sat, and ${THEM} bought two of them.`,
  },
  oligopoly: {
    tone: 'win', word: 'Oligopoly', kicker: 'One of the few',
    line: st => `${pct(st.share.player, 0)} of Reach freight. ${THEM} is still the biggest name here, but there is no longer a version of this system that does not have you in it.`,
  },
  alsoran: {
    tone: 'lose', word: 'Also-ran', kicker: 'The season closed without you',
    line: st => `The Reach was re-surveyed and you were carrying ${pct(st.share.player, 0)} of it. Not nothing. Not enough for anyone to have to plan around.`,
  },
  banned: {
    tone: 'lose', word: 'Struck off', kicker: 'The regulator finished it',
    line: () => `The licence is gone. Everything the company was carrying was carried by somebody else inside a fortnight, and the Reach did not notice.`,
  },
};

const ending = over => ENDINGS[over] || {
  tone: 'lose', word: titleCase(String(over || 'over')), kicker: 'The run ended',
  line: () => 'The run ended here and the Reach carried on without you.',
};

const BAND_WEIGHT = { legal: 1, grey: 1.7, illegal: 2.8 };

const VERDICT = {
  bunnings_ryobi: {
    win: 'You did not beat Corvain on price. You made yourself the only door a brand people ask for by name can walk through. Techtronic and Bunnings lodged exactly that arrangement with the ACCC in 2008 and the regulator did not oppose it, because exclusive dealing is only unlawful where it substantially lessens competition. Seventeen years later Ryobi is still sold in one place.',
    lose: 'You paid for the exclusive and never earned it back. Locking up a supplier only pays where buyers ask for that brand by name and will go where it is — which is why Bunnings and Ryobi has held since 2008 and your agreement was a price floor with an invoice attached.',
  },
  ford_rouge: {
    win: 'You bought the rock, the refinery and the hulls, so there was nobody upstream left to price you. Ford did the same thing at the River Rouge between 1917 and 1928 — mines, freighters, a railroad, and eventually 2.5 million acres of Amazon to grow his own rubber. It was never challenged as an antitrust matter. Owning your supply chain does not remove a competitor; it removes their leverage over you.',
    lose: 'You bought the whole chain and then could not feed it. That is the Rouge\'s other lesson: integration replaced Ford\'s suppliers\' leverage with assets he had to keep running, the plant was very hard to retool, and Fordlandia lost him more than twenty million dollars growing rubber that never reached a car.',
  },
  bunnings_guarantee: {
    win: 'You promised to beat any price in the Reach, and it cost you nothing, because there was nobody left to beat. Four Corners made that argument about Bunnings\' ten-per-cent guarantee in May 2025 across some 9,000 house-brand lines; Bunnings rejects it and no regulator has found against the promise. Economists have argued since the 1980s that a promise to match is really a message to your rival that cutting price will win them nothing.',
    lose: 'The guarantee only pays for itself while you are the one setting the price. You were matching a rival who still had somewhere to move, so every cut they made you made too, and you funded both sides of the war.',
  },
  meta_instagram: {
    win: 'You did not beat Harrow Filament. You bought it. Facebook paid about a billion dollars for Instagram in 2012 for the same reason, and internal messages later showed the company weighing buying a rising competitor against building against one. The FTC sued in 2020 and lost at trial in November 2025; its appeal was still undecided in mid-2026. Buying a competitor is lawful and reviewable, and whether a given purchase was a violation can stay open for well over a decade.',
    lose: 'You spent the company\'s cash removing a competitor and the market did not shrink to match. That is the part of the Meta case everyone forgets: the FTC\'s claim failed at trial because TikTok and YouTube had turned up while the argument was running. You can buy every rival you can see and still lose to the ones you cannot.',
  },
  boral_predatory: {
    win: 'You sold under what the holds cost to fill until the other side stopped. Boral did that in Melbourne masonry from 1994 to 1996 and won in the High Court in 2003, six to one: without substantial market power there was no realistic prospect of recouping the losses, so below-cost pricing was simply hard competition. It is lawful right up to the point where you can raise prices afterwards — which is precisely what you are about to do.',
    lose: 'You ran a price war and ran out of money first. That is the half of Boral nobody quotes. The High Court threw the ACCC\'s case out in 2003 because Boral had no realistic prospect of raising prices afterwards to recoup what the war had cost — the same test you have just failed from the other side of it. Selling under cost is only a tactic if you can outlast them.',
  },
  phoebus_cartel: {
    win: 'You and Corvain agreed on a coil that fails, so the Reach has to buy it again forever. The largest lamp makers in the world met in Geneva in December 1924 and fixed bulb life at 1,000 hours, testing each other\'s samples in a Swiss laboratory and fining anyone who built something better. Average life fell from about 1,800 hours to about 1,205. It was largely lawful in Europe then. The same agreement today is flatly illegal under Article 101, the Sherman Act and Part IV.',
    lose: 'The regulator got there first, which is the only reason Phoebus is remembered as a cartel and not as a standard. It ran for sixteen years because cartels were lawful in much of Europe in 1924, and General Electric took part one step removed through its overseas arm precisely because they were not lawful in America — where a court found against it over lamps in 1949. Fixing a specification is the one tactic in this game with no defence left anywhere.',
  },
};

const UNTOUCHED = {
  win: {
    story: 'ford_rouge',
    line: 'You won without reaching for the playbook once. You simply ran the chain better than Corvain ran theirs, which is the oldest advantage there is and the one Ford was chasing at the River Rouge: ore in one end, cars out the other, nobody upstream with any leverage. It was never challenged as an antitrust matter, because being better at the work has never been an offence.',
  },
  lose: {
    story: 'boral_predatory',
    line: 'You went under without taking a single tactic, which means you lost the ordinary way — costs outran revenue and the interest finished it. Boral survived exactly that in Melbourne for two and a half years and won in the High Court in 2003. The difference is that Boral could afford to keep losing money, and whoever runs out of cash first stops.',
  },
};

// What the run was actually about: the tactic that ran longest, weighted by how far over the line
// it sat. Getting caught outranks everything — that is the story of that run whatever else ran.
function pickCase(sim, won) {
  const st = sim.state;
  const caught = sim.all('investigate');
  if (!won && caught.length) {
    const def = content.get('tactic', caught[caught.length - 1].tactic);
    if (def?.story) return { story: def.story, tactic: def, why: `caught running ${def.name}` };
  }

  const scored = new Map();
  for (const e of st.log) {
    if (e.t !== 'tactic') continue;
    const def = content.get('tactic', e.tactic);
    if (!def || !def.story) continue;
    const end = st.log.find(x => x.week > e.week && x.tactic === e.tactic && (x.t === 'expire' || x.t === 'investigate'));
    const weeks = ((end ? end.week : st.week) - e.week) + 1;
    const prev = scored.get(def.id) || { def, weeks: 0 };
    prev.weeks += weeks;
    scored.set(def.id, prev);
  }

  const best = [...scored.values()].sort((a, b) =>
    (b.weeks * BAND_WEIGHT[b.def.band]) - (a.weeks * BAND_WEIGHT[a.def.band]))[0];

  if (!best) {
    const f = UNTOUCHED[won ? 'win' : 'lose'];
    return { story: f.story, tactic: null, why: null, line: f.line };
  }
  return {
    story: best.def.story, tactic: best.def,
    why: `${best.def.name}, ${best.weeks} week${best.weeks === 1 ? '' : 's'} of it`,
  };
}

function runStats(sim) {
  const st = sim.state;
  const bands = { legal: 0, grey: 0, illegal: 0 };
  for (const id of st.tactics.owned || []) {
    const def = content.get('tactic', id);
    if (def) bands[def.band] = (bands[def.band] || 0) + 1;
  }
  const shares = sim.all('share');
  return {
    weeks: st.week,
    peak: Math.max(st.share.player, content.balance.start.share.player, ...shares.map(e => e.player)),
    earned: sim.all('cost').reduce((n, e) => n + (e.revenue || 0), 0),
    investigations: sim.all('investigate').length,
    bands,
  };
}

definePanel({
  id: 'gameover',
  title: 'How it ended',
  group: 'the run',
  fixture: () => ({ over: 'duopoly' }),

  render(props, api) {
    const sim = api.sim;
    const st = sim.state;
    const over = props.over || st.over || 'bust';
    const end = ending(over);
    const won = end.tone === 'win';
    const s = runStats(sim);
    const hit = pickCase(sim, won);
    const story = content.get('story', hit.story);
    const line = hit.line || VERDICT[hit.story]?.[won ? 'win' : 'lose'] || story?.outcome || '';
    const curve = shareCurve(sim.all('share'), {
      marks: [
        { at: content.balance.win.monopoly, label: 'mono' },
        { at: content.balance.win.duopoly, label: 'duo' },
      ],
    });

    return `
<div class="over over-${end.tone} band-${esc(story?.band || 'legal')}">
  <div class="over-crown">
    <span class="over-kicker">${esc(end.kicker)} · week ${s.weeks}</span>
    <h1>${esc(end.word)}</h1>
    <p class="over-line">${esc(end.line(st))}</p>
  </div>

  <div class="over-stats">
    <div class="over-tile"><s>Weeks survived</s><em>${s.weeks}</em></div>
    <div class="over-tile"><s>Peak share</s><em>${pct(s.peak, 1)}</em></div>
    <div class="over-tile"><s>Credits earned</s><em>${crShort(s.earned)}</em></div>
    <div class="over-tile ${s.investigations ? 'hot' : ''}"><s>Investigated</s><em>${s.investigations}×</em></div>
  </div>

  <div class="over-bands">
    ${[['legal', 'legal'], ['grey', 'contested'], ['illegal', 'illegal']].map(([b, label]) => `
      <div class="over-band band-${b} ${s.bands[b] ? 'on' : ''}"><em>${s.bands[b]}</em><s>${label}</s></div>`).join('')}
  </div>

  ${story ? `
  <section class="over-verdict">
    <h2>What you actually did</h2>
    ${hit.why ? `<p class="over-why">${esc(hit.why)}</p>` : ''}
    <div class="verdict-card">
      <b>${esc(story.title)}</b>
      <s>${esc(story.who)} · ${esc(story.year)} · ${esc(story.where)}</s>
      <p>${esc(line)}</p>
      <p class="verdict-outcome">${esc(story.outcome)}</p>
      <button class="link" data-open="story" data-props='${esc(JSON.stringify({ story: story.id, tactic: hit.tactic?.id }))}'>Read the case in full →</button>
    </div>
  </section>` : ''}

  ${curve ? `<div class="over-curve">
    <h2>The line, week by week</h2>
    ${curve}
    <ul class="legend">
      <li class="you"><s>Ferrous Line</s><em>${pct(st.share.player, 1)}</em></li>
      <li class="them"><s>${esc(RIVAL)}</s><em>${pct(st.share.rival, 1)}</em></li>
    </ul>
  </div>` : ''}
</div>

<div class="sheet-cta over-cta">
  ${st.canContinue ? '<button class="primary" data-a="on">Carry on trading</button>' : ''}
  <button class="${st.canContinue ? '' : 'primary'}" data-a="again">Play again</button>
  <button data-open="dossier">Review the dossier</button>
  <button data-a="look">Keep looking around</button>
</div>`;
  },

  mount(el, props, api) {
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      if (t.dataset.a === 'look') return api.close();
      if (t.dataset.a === 'on') {
        api.sim.resume();
        api.close();
        api.sim.setSpeed(1);
        return;
      }
      if (t.dataset.a === 'again') {
        clearSave();
        api.sim.reset(newSeed());
        api.close();
        api.sim.setSpeed(1);
      }
    });
  },
});

export default { pickCase, runStats };
