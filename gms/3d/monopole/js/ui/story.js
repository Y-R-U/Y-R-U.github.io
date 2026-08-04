// The story panel and the Dossier it collects into.
//
// The law is never a tick or a cross. `band` is a one-word chip for scanning; the stance line and
// the story's own `outcome` sit directly under it and carry the qualification, because several of
// these cases are genuinely unsettled — under appeal, disputed, lawful-unless-it-lessens-
// competition, lost twice then won. Flattening that is the fastest way to lose the reader.

import content from '../sim/content.js';
import { definePanel, panels } from './panels.js';
import { showroom } from '../showroom/index.js';
import { esc, bandWord, lawStance, duration, credits } from './format.js';

const opened = new Set();

export function markRead(storyId) { if (storyId) opened.add(storyId); }

// Everything the run has surfaced. Derived from the event log so it survives save/load, plus
// whatever the player opened by hand this session.
export function readStories(sim) {
  const seen = new Set(opened);
  for (const e of sim?.state?.log || []) {
    if (e.story) seen.add(e.story);
    if (e.tactic) { const t = content.get('tactic', e.tactic); if (t?.story) seen.add(t.story); }
  }
  return seen;
}

definePanel({
  id: 'story',
  title: 'The real case',
  group: 'dossier',
  fixture: () => ({ story: 'bunnings_ryobi', tactic: 'exclusive_supply' }),

  render(props, api) {
    const story = content.get('story', props.story) || content.all('story')[0];
    if (!story) return `<div class="pad"><p class="dim">No story.</p></div>`;
    markRead(story.id);
    const tactic = props.tactic ? content.get('tactic', props.tactic)
      : content.all('tactic').find(t => t.story === story.id);

    return `
<article class="case band-${esc(story.band)}">
  ${plate(story)}

  <header class="case-head">
    <div class="case-eyebrow"><span class="chip band">${esc(bandWord(story.band))}</span><span>Case file</span></div>
    <h1>${esc(story.title)}</h1>
    <p class="case-meta">
      <b>${esc(story.who)}</b>
      <span>${esc(story.where)}</span>
      <span>${esc(story.year)}</span>
    </p>
  </header>

  ${tactic ? `
  <section class="case-sec">
    <h2>The tactic in your hands</h2>
    <div class="tactic-quote">
      <b>${esc(tactic.name)}</b>
      <p>${esc(tactic.blurb)}</p>
      <ul class="tactic-facts">
        <li><s>Cost</s><em>${tactic.cost ? esc(credits(tactic.cost)) : 'Free'}</em></li>
        <li><s>Runs for</s><em>${esc(duration(tactic.duration))}</em></li>
        <li><s>Heat</s><em>${tactic.heat ? tactic.heat + ' / week' : 'None'}</em></li>
      </ul>
    </div>
  </section>` : ''}

  <section class="case-sec">
    <h2>What actually happened</h2>
    ${story.body.map((p, i) => `<p class="${i === 0 ? 'lede' : ''}">${esc(p)}</p>`).join('')}
  </section>

  <section class="case-sec case-law">
    <h2>Where the law stands</h2>
    <div class="law-card">
      <div class="law-head"><i></i>${esc(bandWord(story.band))}</div>
      <p class="law-stance">${esc(lawStance(story.band))}</p>
      <p class="law-outcome">${esc(story.outcome)}</p>
      <p class="law-note">That one word is shorthand so the game can sort them. The paragraphs above are the actual answer, and in several of these cases the answer is still moving.</p>
    </div>
  </section>

  <section class="case-sec case-src">
    <h2>Sources</h2>
    <ol>
      ${(story.links || []).map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}
    </ol>
  </section>
</article>

<div class="sheet-cta">
  <button data-open="dossier" data-swap>Dossier</button>
  <button class="primary" data-sheet-close>Back to the Reach</button>
</div>`;
  },
});

definePanel({
  id: 'dossier',
  title: 'Dossier',
  group: 'the cases',

  render(props, api) {
    const seen = readStories(api.sim);
    const all = content.all('story');
    const bands = [
      ['legal', 'Legal', 'Done in the open, and it worked.'],
      ['grey', 'Contested', 'Lawful or not depending on facts somebody has to prove.'],
      ['illegal', 'Illegal', 'Over the line as the line stands today.'],
    ];

    return `
<div class="dossier">
  <p class="dossier-lede">
    Every tactic in this game is one a real company used. <b>${seen.size}</b> of ${all.length} cases uncovered.
  </p>
  ${bands.map(([band, label, note]) => {
    const rows = all.filter(s => s.band === band);
    if (!rows.length) return '';
    return `
    <section class="dossier-band band-${band}">
      <h3><i></i>${esc(label)}<s>${rows.filter(r => seen.has(r.id)).length}/${rows.length}</s></h3>
      <p class="dossier-note">${esc(note)}</p>
      ${rows.map(s => seen.has(s.id) ? `
        <button class="case-row" data-open="story" data-props='${esc(JSON.stringify({ story: s.id }))}'>
          <b>${esc(s.title)}</b>
          <s>${esc(s.who)} · ${esc(s.year)}</s>
          <p>${esc(s.outcome)}</p>
        </button>` : `
        <div class="case-row locked">
          <b>Not yet uncovered</b>
          <s>Unlocks with the tactic it belongs to</s>
        </div>`).join('')}
    </section>`;
  }).join('')}
</div>
<div class="sheet-cta"><button class="primary" data-sheet-close>Close</button></div>`;
  },
});

// §5: every story in content/stories.js gets its own showroom entry.
export function registerStoryEntries() {
  for (const s of content.all('story')) {
    showroom.expect('story', `story_${s.id}`);
    showroom.register({
      id: `story_${s.id}`,
      group: 'story',
      label: s.title,
      note: `${s.who.split(/[,&]/)[0].trim()} · ${s.year}`,
      run: () => panels.showFixture('story', {
        story: s.id,
        tactic: content.all('tactic').find(t => t.story === s.id)?.id,
      }),
    });
  }
}

// The plate. `image` is null on every story today; this renders a composed card in its place at
// the same aspect and with the same caption slot, so dropping the image in later is one branch
// and no relayout.
function plate(story) {
  const cap = `<figcaption><span>${esc(story.credit || 'illustration')}</span></figcaption>`;
  if (story.image) {
    return `<figure class="case-plate has-img"><img src="${esc(story.image)}" alt="">${cap}</figure>`;
  }
  return `
<figure class="case-plate">
  <div class="plate-art">
    ${MOTIF[story.id] || MOTIF_BAND[story.band] || ''}
    <div class="plate-year">${esc(String(story.year).split(/[–—-]/)[0])}</div>
    <div class="plate-who">${esc(story.where)}</div>
  </div>
  ${cap}
</figure>`;
}

const S = (inner, vb = '0 0 120 68') =>
  `<svg class="plate-mark" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const MOTIF = {
  // one shelf, one box, and a shut gate for everybody else
  bunnings_ryobi: S(`
    <path d="M18 44h84"/><path d="M26 44v-10h18v10"/>
    <path d="M58 44V22h44v22" opacity=".35"/>
    <path d="M64 30h32M64 36h32" opacity=".35"/>
    <rect x="28" y="18" width="14" height="10" rx="2"/>
    <path d="M31 18v-4a4 4 0 0 1 8 0v4"/>`),
  // one column, one arrow, ore at the top and cars at the bottom
  ford_rouge: S(`
    <rect x="30" y="10" width="34" height="10" rx="1"/>
    <rect x="30" y="26" width="34" height="10" rx="1"/>
    <rect x="30" y="42" width="34" height="10" rx="1"/>
    <path d="M47 20v6M47 36v6M47 52v8"/>
    <path d="M43 56l4 4 4-4" />
    <path d="M74 10v50" opacity=".3"/><path d="M74 60h14" opacity=".3"/>`),
  // a guarantee measured against an empty column
  bunnings_guarantee: S(`
    <path d="M24 14l22 0 16 16-22 22-16-16z"/>
    <circle cx="36" cy="24" r="2.6"/>
    <path d="M38 40l12-12" /><circle cx="39" cy="39" r="1.4"/><circle cx="49" cy="29" r="1.4"/>
    <path d="M78 12v42h22" opacity=".35" stroke-dasharray="3 4"/>
    <circle cx="89" cy="30" r="8" opacity=".5"/><path d="M95 36l7 7" opacity=".5"/>`),
  // the larger square taking the smaller one inside
  meta_instagram: S(`
    <rect x="20" y="12" width="44" height="44" rx="9"/>
    <rect x="52" y="24" width="30" height="30" rx="7" stroke-dasharray="4 4" opacity=".7"/>
    <path d="M88 39h14M96 33l6 6-6 6" opacity=".45"/>`),
  // one line dives under the cost line and holds; the other stops
  boral_predatory: S(`
    <path d="M16 56h90"/><path d="M16 56V10" opacity=".4"/>
    <path d="M20 30h84" stroke-dasharray="4 5" opacity=".55"/>
    <path d="M22 22c14 0 18 22 32 24 12 2 22 0 34-2"/>
    <path d="M22 26c12 2 16 12 26 12 8 0 10-4 14-4"/>
    <circle cx="62" cy="34" r="2.2"/>`),
  // the bulb with the dial stopped hard at a thousand
  phoebus_cartel: S(`
    <path d="M60 12a16 16 0 0 0-9 29v5h18v-5a16 16 0 0 0-9-29z"/>
    <path d="M53 50h14M54 55h12"/>
    <path d="M52 34c2-6 4-9 8-9s6 3 8 9" opacity=".8"/>
    <circle cx="60" cy="32" r="26" opacity=".3" stroke-dasharray="2 6"/>
    <path d="M60 32l18-13" opacity=".9"/>
    <path d="M86 15v6M92 22h-6" opacity=".5"/>`),
};

const MOTIF_BAND = {
  legal: S(`<rect x="30" y="14" width="60" height="40" rx="4"/>`),
  grey: S(`<rect x="30" y="14" width="60" height="40" rx="4" stroke-dasharray="4 4"/>`),
  illegal: S(`<rect x="30" y="14" width="60" height="40" rx="4"/><path d="M30 54L90 14" opacity=".5"/>`),
};

export default { markRead, readStories, registerStoryEntries };
