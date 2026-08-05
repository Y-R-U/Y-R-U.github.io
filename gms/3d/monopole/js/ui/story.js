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
import { featured, alternatives, poolFor, markSeen } from './storypool.js';

const opened = new Set();

export function markRead(storyId) {
  if (!storyId) return;
  opened.add(storyId);
  markSeen(storyId);
}

// Everything the run has surfaced. Derived from the event log so it survives save/load, plus
// whatever the player opened by hand this session. A logged tactic resolves through the pool,
// because which of its four cases this run is telling is a UI decision, not a sim one.
export function readStories(sim) {
  const seen = new Set(opened);
  for (const e of sim?.state?.log || []) {
    if (e.story) seen.add(e.story);
    if (e.tactic) { const f = featured(e.tactic); if (f) seen.add(f); }
  }
  return seen;
}

definePanel({
  id: 'story',
  title: 'The real case',
  group: 'dossier',
  live: false,
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

  ${more(story, props.tactic)}
</article>

<div class="sheet-cta">
  <button data-open="dossier" data-swap>Dossier</button>
  <button class="primary" data-sheet-close>Back to the Reach</button>
</div>`;
  },
});

// The other three cases behind the same tactic. A run only ever surfaces one of them on its own,
// so this is how a reader who wants more of the same gets it without waiting for another game.
function more(story, tactic) {
  const rest = alternatives(story.id);
  if (!rest.length) return '';
  const t = tactic ? content.get('tactic', tactic) : content.get('tactic', story.tactic);
  return `
<section class="case-sec case-more">
  <h2>More cases like this</h2>
  <p class="dim">${esc(t ? `${t.name} has been run for real more than once. These are the other times.` : 'Other times this was done for real.')}</p>
  ${rest.map(s => `
    <button class="case-row band-${esc(s.band)}" data-open="story" data-swap
      data-props='${esc(JSON.stringify({ story: s.id, tactic: s.tactic }))}'>
      <b>${esc(s.title)}</b>
      <s>${esc(bandWord(s.band))} · ${esc(s.who)} · ${esc(s.year)}</s>
      <p>${esc(s.outcome)}</p>
    </button>`).join('')}
</section>`;
}

definePanel({
  id: 'dossier',
  title: 'Dossier',
  group: 'the cases',
  live: false,

  // Grouped by the tactic, not by the band: a tactic is the thing the player holds in their hand,
  // and the four cases behind it are four answers to the same question. The band is a chip on the
  // row. `all` reveals the whole library — the run only surfaces one case per tactic on its own,
  // and somebody who wants to read the rest should not have to replay six times for them.
  render(props, api) {
    const seen = readStories(api.sim);
    const all = content.all('story');
    const showAll = !!props.all;

    return `
<div class="dossier">
  <p class="dossier-lede">
    Every tactic in this game is one real companies used, and each one has four real cases behind it.
    <b>${seen.size}</b> of ${all.length} uncovered in play.
  </p>
  <div class="dossier-switch">
    <button class="${showAll ? '' : 'on'}" data-open="dossier" data-swap data-props='{}'>Uncovered</button>
    <button class="${showAll ? 'on' : ''}" data-open="dossier" data-swap data-props='{"all":true}'>Every case</button>
  </div>
  ${content.all('tactic').map(t => {
    const rows = poolFor(t.id);
    if (!rows.length) return '';
    const run = featured(t.id);
    return `
    <section class="dossier-band band-${esc(t.band)}">
      <h3><i></i>${esc(t.name)}<s>${rows.filter(r => seen.has(r.id)).length}/${rows.length}</s></h3>
      <p class="dossier-note">${esc(t.blurb)}</p>
      ${rows.map(s => (showAll || seen.has(s.id)) ? `
        <button class="case-row band-${esc(s.band)}" data-open="story"
          data-props='${esc(JSON.stringify({ story: s.id, tactic: t.id }))}'>
          <b>${esc(s.title)}${s.id === run && !seen.has(s.id) ? ' <em>this run</em>' : ''}</b>
          <s>${esc(bandWord(s.band))} · ${esc(s.who)} · ${esc(s.year)}</s>
          <p>${esc(s.outcome)}</p>
        </button>` : `
        <div class="case-row locked">
          <b>Not yet uncovered</b>
          <s>${s.id === run ? 'Unlocks with this tactic' : 'Read it from Every case'}</s>
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
    // a plate that has not been generated yet must not leave a broken-image glyph in the middle
    // of the sheet — drop the figure and let the composed card below stand in
    return `<figure class="case-plate has-img"><img src="${esc(story.image)}" alt=""
      onerror="this.closest('.case-plate').outerHTML=this.dataset.fb"
      data-fb="${esc(motifPlate(story))}">${cap}</figure>`;
  }
  return motifPlate(story);
}

function motifPlate(story) {
  const cap = `<figcaption><span>${esc(story.credit || 'illustration')}</span></figcaption>`;
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
