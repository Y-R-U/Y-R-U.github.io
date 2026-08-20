// §S2-E — the debt, the pace signal, the Boss's escalation, both act-one endings, the hire loop.
//
// PURE, like economy.js and ranks.js and for the same reason: no three.js, no DOM, no Date.now().
// Every function takes a story state and an economy state and returns a plain object, so
// `tools/sim_s2e.mjs` can run the whole arc in node and the two constants that decide whether the
// game is fair are MEASURED. The clock is always a sim time in SECONDS passed as an argument.
//
// ── THERE ARE NO DAYS ──────────────────────────────────────────────────────
//
// Aaron: *"i actually like the idea of no days in the game."* The player never sleeps, there is no
// day counter, and — the part that matters here — **there is no visible clock on the debt**. The
// Boss never names a number. He says the money will be called in *soon*.
//
// That is only fair if the player can still see they are falling behind, which is what the warmth
// gauge is for and why it reads PACE rather than TIME:
//
//     projection = credits + (recent earning rate x time remaining)
//     ratio      = projection / DEBT
//     warmth     = 1 when ratio <= 0.75,  0.5 at ratio 1.00,  0 at ratio >= 1.25
//
// At t = 0 the rate is seeded at exactly break-even (`DEBT / WINDOW`), so the gauge opens at
// **half scale and stays there while the player earns exactly the rate the debt requires**. It
// moves the moment they earn faster or slower than that. A countdown could not do this: it would
// read the same for a player who is going to make it and one who is not.
//
// The Boss reads the same signal. *"Better make money fast"* arrives because you are behind, not
// because a week went by — he is reading your balance, not the calendar.
//
// ── THE MONEY MUST BE IN THE ACCOUNT ───────────────────────────────────────
//
// Progress is `credits`, never `lifetime`. The crew takes what is in the account, so a player who
// ploughs their earnings into a hull is genuinely behind — and the borrowed hull makes that a real
// decision, because every upgrade fitted to it is fitted to a car that is leaving either way. The
// sweep measured that: `tools/sim_s2e.mjs`'s `invest` pilot, which is the `normal` pilot with
// upgrade buying turned on, holds the debt at 84 minutes on a `kestrel` and **never** on a
// `nocturne`, where upgrades are priced off a 20,000 list.
//
// ── NO FAIL STATE (DECISIONS 6) ────────────────────────────────────────────
//
// Both endings lose the car. Neither ends the game. See `settle()`.

import * as E from './economy.js';

// ── the debt ───────────────────────────────────────────────────────────────

export const DEBT = 50000;

// The window, in SECONDS OF PLAY. `simTime`, so it does not advance while the tab is backgrounded
// (main.js parks the loop) and it does not advance during the intro.
//
// **SWEPT, NOT PICKED** — `node tools/sim_s2e.mjs --seeds=12`, output committed at
// `docs/s2e_balance.json`. 12 world seeds x 5 pilot classes were run through the real economy and
// the real mission generator in a borrowed `kestrel`, and the first moment each career's LIQUID
// balance reached 50,000 was recorded. Median minutes to the debt, and the share of each class
// still holding the car at the candidate window:
//
//     pilot     CRD/min   payAt p10/p50/p90      | window   focused normal casual invest dawdle
//     focused     737.9    61.4  69.4  73.7      |    72 m     75.0  83.3    0.0  100.0    0.0
//     normal      733.3    67.3  69.9  72.1      |    76 m     91.7 100.0    0.0  100.0    0.0
//     casual      595.3    81.9  85.0  90.4      |  * 84 m     91.7 100.0   33.3  100.0    0.0
//     invest      952.0    62.6  64.6  65.8      |    88 m    100.0 100.0   66.7  100.0    0.0
//     dawdle      490.0   106.1 109.6 112.8      |   108 m    100.0 100.0  100.0  100.0   41.7
//
// 84 minutes is the row where the target distribution in the brief holds: a focused player who
// routes well keeps the car on most runs (91.7 %), a dawdling player loses it on all of them, and
// the swing class — `casual`, which is `hop` at 0.78 skill and 1.6x dwell — is a one-in-three
// coin flip. That is the *"real risk of running out of time"*, and it is a risk the gauge warns
// about from the first minute rather than at the end.
//
// **The limitation, stated rather than buried:** sim_p7a's flight model prices a leg as distance
// over cruise speed and cannot see a wall, so it is optimistic about a real pilot. Every class
// above is therefore an UPPER bound on how often the car is kept, and real play moves the whole
// table down. That is the direction the design wants (tight), but it is one constant to change if
// Aaron reports it as unwinnable rather than tense.
export const WINDOW_S = 84 * 60;

// The rate the debt requires if you start from nothing: 9.92 CRD/s, 595 CRD/min. Also the seed for
// the pace EWMA, which is what puts the needle at exactly half scale on the first frame.
export const BREAK_EVEN = DEBT / WINDOW_S;

// The pace EWMA's time constant. Earnings arrive as lumps roughly every 60-90 s, so a short window
// would make the gauge flick between "miles ahead" and "hopeless" once per delivery. Five minutes
// is long enough to be a pace and short enough that two slow jobs in a row are visible.
export const RATE_TAU = 300;

// Where the needle sits. `ratio` is projected-final-balance over the debt.
export const COLD = 1.25;      // comfortably ahead — the gauge is cool
export const HOT = 0.75;       // will not make it at this rate — the gauge is pegged

// ── the Boss's escalation ──────────────────────────────────────────────────
//
// Keyed on WARMTH, which is pace. Ratcheting: each line fires once, in order, and the ladder never
// walks back down — a threat that is withdrawn is not a threat. `hold` keeps two lines from
// arriving inside the same minute when a big delivery swings the projection.
export const MSG_HOLD = 105;         // s between messages
export const MSG_FLOOR = 150;        // s of play before the first one can arrive

export const BOSS_LINES = [
  { id: 'b1', at: 0.55, text: 'Better make money fast.' },
  { id: 'b2', at: 0.70, text: 'Will be needing the money soon.' },
  { id: 'b3', at: 0.84, text: 'Ensure you have the money ready.' },
  { id: 'b4', at: 0.94, text: 'We are on our way, better have the money ready!' },
];
// Fired once, the first time the account actually covers the debt. It is not an escalation — it is
// the crew noticing, and it is the line that tells the player to stop spending.
export const BOSS_CLEAR = { id: 'clear', text: 'Good. It stays in the account until we come for it.' };

// ── the hire loop ──────────────────────────────────────────────────────────
//
// Aaron fixed the block at 5 minutes. The PRICE was swept, and the brief's own arithmetic for it
// turned out to be wrong by roughly a factor of four — worth recording, because the wrong number
// is what the "$90 buys five minutes" proposal was built on.
//
// The addendum estimates *"~2,000 CRD in a deliberately slow clunker"* over twenty minutes. The
// measurement, over 72 non-overlapping five-minute windows per pilot class flown in a `wisp`:
//
//     pilot     block gross p10 / p50 / p90      first block p10 / p50
//     focused        3359   4112.5    4925            3983   4212.5
//     normal        2923.5   3532.5   4124.5          3691.5  3825
//     casual          2442     2950    3474           2839    3110
//     dawdle          1886   2282.5     2643          2302    2530
//
// A five-minute block in the free starter hull is worth ~3,500 CRD to a normal pilot, not ~500.
// So the addendum's *"$90 for 20 minutes is 2-4 % of the take"* is itself an overestimate of $90:
// it is nearer 0.6 %. **$90 cannot be a market price for anything**, at any block length, and the
// two ways out the addendum offers are therefore not alternatives — the answer is both:
//
//   · the MARKET rate is swept (below), and
//   · the $90 is a ONE-OFF STORY PRICE for a wreck nobody else wants, granted once at the seizure.
//
// BLOCK_BASE is the swept market rate for the base hull. Target from the addendum: burn 30-50 % of
// gross across the early hires, and a reasonably-playing pilot failing to cover a block on under
// ~10 % of blocks. Measured at 1,425 CRD:
//
//     burn against the median block   focused 34.7 %  ·  normal 40.3 %  ·  casual 48.3 %  ·  dawdle 62.4 %
//     blocks not covered              0 % for every class, including dawdle
//
// The dawdler burning 62 % is the loop having teeth, which is the point of it; nobody is priced
// out, which is what "no fail state" requires.
export const HIRE = {
  BLOCK_S: 300,                // 5 minutes, fixed by Aaron
  BLOCK_BASE: 1425,            // swept — see above
  // How much a better hull costs over the base, as a fraction of how much more it is worth. A
  // `mammoth` block is ~8x a `wisp` block against a 22x list price, so hiring the big hull for one
  // job you cannot otherwise carry is a decision the player can win, and holding it all session is
  // one they cannot afford.
  SCALE: 0.35,
  WRECK_PRICE: 90,             // the story price. Granted once, at the seizure. See above.
  SEIZED_CREDITS: 90,          // what the crew leaves in the account
  // Discount for committing to several blocks at once, by block count. Index 0 is unused.
  DISCOUNT: [1, 1.00, 0.96, 0.93, 0.90, 0.88, 0.86, 0.845, 0.83, 0.82, 0.81, 0.80, 0.79],
  MAX_BLOCKS: 12,
  // The last 45 s of a hire. The cabin lamp and the panel both read this, so "about to lapse" is
  // one number rather than two thresholds that drift apart.
  WARN_S: 45,
};

// A hull's block price. `wisp` and `kestrel` land on the same number because `craftList`
// substitutes `wisp`'s 2,000 notional for its 0 list and a `kestrel` lists at 1,800 — they are
// the same class of vehicle and a hire desk would price them the same.
export function blockPrice(craftId) {
  const list = Math.max(E.WISP_NOTIONAL, E.craftList(craftId));
  return E.round5(HIRE.BLOCK_BASE * (1 + HIRE.SCALE * (list / E.WISP_NOTIONAL - 1)));
}

export function hireDiscount(blocks) {
  const n = Math.max(1, Math.min(HIRE.MAX_BLOCKS, blocks | 0));
  return HIRE.DISCOUNT[n] === undefined ? HIRE.DISCOUNT[HIRE.DISCOUNT.length - 1] : HIRE.DISCOUNT[n];
}

// What `blocks` blocks of `craftId` cost right now. The wreck is a single block and cannot be
// bought in bulk — it is one vehicle, not a rate.
export function hireCost(story, craftId, blocks = 1) {
  const n = Math.max(1, Math.min(HIRE.MAX_BLOCKS, blocks | 0));
  if (wreckAvailable(story, craftId)) {
    return { blocks: 1, price: HIRE.WRECK_PRICE, unit: HIRE.WRECK_PRICE, discount: 1, wreck: true };
  }
  const unit = blockPrice(craftId);
  const d = hireDiscount(n);
  return { blocks: n, price: E.round5(unit * n * d), unit, discount: d, wreck: false };
}

// The MARKET price of n blocks, ignoring the wreck. The panel needs this to show what a hire will
// cost once the one-off is used up; nothing else should call it, because `hireCost` is the price
// that is actually charged.
export function round5Blocks(craftId, blocks = 1) {
  const n = Math.max(1, Math.min(HIRE.MAX_BLOCKS, blocks | 0));
  return E.round5(blockPrice(craftId) * n * hireDiscount(n));
}

export function wreckAvailable(story, craftId) {
  return !!story && story.wreckLeft > 0 && craftId === 'wisp';
}

// Take a hire. Mutates BOTH states, because a hire is a purchase and a vehicle change and the two
// cannot be allowed to half-happen. Returns { ok, why, ... } in the same shape economy.js uses, so
// the panel's refusal path is the existing greyed-row-with-a-reason and never an alert().
export function takeHire(story, econ, craftId, blocks, now) {
  if (!E.CRAFT[craftId]) return { ok: false, why: 'unknown' };
  const q = hireCost(story, craftId, blocks);
  if (econ.credits < q.price) return { ok: false, why: 'credits', short: q.price - econ.credits };
  // Extending a DIFFERENT hull is a new hire, not an extension: the old one goes back.
  const extending = !!story.hire && story.hire.craft === craftId;
  E.spend(econ, q.price);
  if (q.wreck) story.wreckLeft = Math.max(0, (story.wreckLeft | 0) - 1);
  const add = q.blocks * HIRE.BLOCK_S;
  // Extending from inside the cabin adds to what is left rather than restarting it, which is what
  // makes "+5 minutes, or as many blocks as you can afford" mean what it says.
  const until = extending ? Math.max(now, story.hire.until) + add : now + add;
  story.hire = { craft: craftId, until, blocks: (extending ? story.hire.blocks : 0) + q.blocks,
    spent: (extending ? story.hire.spent : 0) + q.price, took: extending ? story.hire.took : now };
  story.hireSpend = (story.hireSpend || 0) + q.price;
  story.hireBlocks = (story.hireBlocks || 0) + q.blocks;
  econ.craft = craftId;
  // A hire is not an asset — you do not own it. `borrowed` is what stops ranks.assetValue()
  // counting somebody else's vehicle as your net worth, and it is the same flag the borrowed
  // parents' car sets.
  econ.borrowed = true;
  // Upgrades are per-hull and they were fitted to whatever you were in. A hire desk does not
  // transfer them, exactly as `buyCraft` does not.
  econ.upgrades = { thrust: 0, cargo: 0, cell: 0, eff: 0 };
  econ.cellUnits = Math.min(econ.cellUnits, E.cellMax(econ));
  return { ok: true, price: q.price, blocks: q.blocks, until, wreck: q.wreck, extended: extending };
}

// Seconds left on the hire. `null` when the player is not on one.
export function hireLeft(story, now) {
  if (!story || !story.hire) return null;
  return story.hire.until - now;
}

// A LAPSED hire is not a fail state and never strands anybody. The vehicle is recalled, which in
// this game means it limps: the same 12 m/s tow speed §7.4.3 already uses, so the mechanic the
// player has met before is the one that catches them. They can extend from the cabin at any time —
// that is exactly what Aaron's *"never have to fly somewhere to keep the meter running"* requires —
// and if they have no money the free tow still gets them to a pad. Nothing here can end a session.
export function hireLapsed(story, now) {
  const left = hireLeft(story, now);
  return left !== null && left <= 0;
}

// ── §S2-J — THE TWO DOORS INTO THE SHADY SIDE ──────────────────────────────
//
// This is settled design and is not re-derived here. Aaron: *"the success branch may mean access to
// the 'shady' side of the story may trigger later - via an interaction with Dad, where you may even
// demand to know a contact. perhaps triggers off a certain job? perhaps a comment someone makes
// about your Dad or etc?"*
//
//   SEIZED   immediate. The crew already has a hook in you; the relationship IS the debt you could
//            not pay. `settle()` sets `crew_hook`, and act two opens with the desk already there.
//
//   PAID     delayed, and EARNED BY CURIOSITY. Remarks about your father surface in ordinary
//            content — an open-channel line, a client's aside — and a player who is not paying
//            attention simply never notices them. Once two have landed the player's own voice says
//            something, one row appears on a screen they already read, and pulling it is what opens
//            the door. **They open it themselves.**
//
// The remarks are the load-bearing part and they are deliberately NOT a menu. They go out through
// `ui.chatter` on the same ticker every radio line uses, in the same `bg`/`info` tiers, from
// speakers the player has been hearing for an hour. Nothing marks them. `main.js` counts them; the
// player is the one who has to notice.
export const THREAD_NEED = 2;        // remarks before the player's own line fires
export const REMARK_GAP_S = 200;     // never two inside this, so it reads as coincidence
export const REMARK_CHANCE = 0.5;    // per delivery, once the gap has passed

// The remarks. `who` is the ticker speaker and it is a speaker the player already knows: OPEN
// CHANNEL is the `life` group's label and PIRATE RADIO is the `pirate` group's, so these arrive
// looking exactly like the two hundred lines around them. `tag` is the S2-A/B contract vocabulary
// and both tiers here are the QUIET ones — a remark that rendered bright would be the game pointing
// at itself.
//
// `slot` names a REAL chatter clip. The four lines below were added to `tools/vo/lines.json`'s
// `life` and `pirate` pools and generated by the same `tools/vo/gen_chatter.py` +
// `tools/radio_fx.sh` chain as the other 203 — same voices, same 300-3400 Hz band-limit, same
// squelch, same 16 kbps mono — so they are literally indistinguishable from the surrounding
// traffic. `who` and `tag` match their manifest entries exactly; `main.js` hands the slot to
// `radio.speak()`, which falls back to text if the 11 KB has not been fetched yet, exactly as the
// ticker already does for every line's first play.
//
// The pool went 203 → 207 slots and 2,283 → 2,333 KB. The DIRECTOR never draws these four on its
// own — `js/story.js` asks for them by name — so a player who has not reached the thread does not
// hear them at random, and a player who has reached it hears them among two hundred others.
export const REMARKS = [
  { id: 'r1', who: 'OPEN CHANNEL', tag: 'bg', slot: 'life_36',
    text: 'Whoever settled the Vane account — the old boy, not the kid — tell him the desk still has his paper.' },
  { id: 'r2', who: 'THE UNDERSTACK', tag: 'bg', slot: 'pirate_16',
    text: 'And a quiet one out to the man who borrowed off the wrong room and walked away. Rare. Play him something warm.' },
  { id: 'r3', who: 'OPEN CHANNEL', tag: 'bg', slot: 'life_37',
    text: 'Somebody was asking after a hauler by that surname at the Tallow desk. Not a friendly ask, if you follow.' },
  { id: 'r4', who: 'OPEN CHANNEL', tag: 'bg', slot: 'life_38',
    text: 'Second time this month a courier has come in with a name on a docket that should not be on a docket.' },
];

// The player's own line when the second remark lands. Their voice, not a prompt — `storyui.js`
// renders it in the same bubble the closing monologue uses.
export const THREAD_CUE = 'That is twice tonight somebody has said my father’s name like they '
  + 'know it. He is home, he is fine, and he still has not told me who he borrowed from.';

// What the player demands, and what they are given. Short, because the scene is the player deciding
// to pull the thread and not a second cutscene.
export const THREAD_SCENE = [
  { who: 'pc', text: 'Who was it. Not what it was for, not how much. Who.' },
  { who: 'dad', text: 'You settled it. It is done. Leave it done.' },
  { who: 'pc', text: 'They came for your car with me in it. I am not asking twice.' },
  { who: 'dad', text: '…There is a desk under the Tallow Yard. Ask for the Quartermaster. '
    + 'And do not tell them whose kid you are, because they already know.' },
];

export function newThread(over = {}) {
  return { remarks: 0, heard: [], last: -1e9, cue: false, asked: false, at: 0, ...over };
}

// The next unheard remark, or null. PURE — the caller owns the clock and the dice, which is what
// lets `tools/gates_s2j.mjs` walk the whole thread deterministically without waiting for a chance.
export function nextRemark(story, now, roll = 0) {
  if (!story || story.stage !== STAGE.ACT2) return null;
  if (story.branch !== 'paid') return null;          // the seized branch has its own door
  const th = story.thread || (story.thread = newThread());
  if (th.asked) return null;
  if (now - th.last < REMARK_GAP_S) return null;
  if (roll > REMARK_CHANCE) return null;
  return REMARKS.find(r => !th.heard.includes(r.id)) || null;
}

// Record one. Returns `{ remark, cue }` — `cue` true on the frame the player's own line is due.
export function hearRemark(story, remark, now) {
  const th = story.thread || (story.thread = newThread());
  if (!remark || th.heard.includes(remark.id)) return { remark: null, cue: false };
  th.heard.push(remark.id);
  th.remarks = th.heard.length;
  th.last = now;
  const cue = !th.cue && th.remarks >= THREAD_NEED;
  if (cue) th.cue = true;
  return { remark, cue };
}

// The player pulls the thread. This is the ONLY thing that opens the paid branch's door, and it is
// a call that only a key the player pressed can make.
export function askDad(story, now = 0) {
  const th = story.thread || (story.thread = newThread());
  if (th.asked) return { ok: false, why: 'done' };
  if (!th.cue) return { ok: false, why: 'early', need: THREAD_NEED - th.remarks };
  th.asked = true;
  th.at = now;
  return { ok: true, scene: THREAD_SCENE };
}

// Which door is open, and `null` when neither is — the whole shady branch reads this one function.
//
// The seized branch is immediate because the crew already has the hook; the paid branch is open
// only once the player has asked. A THIRD state matters and is why this returns a string and not a
// boolean: `'cue'` is "the thread is live and the player has not pulled it", which is the state the
// one row on the RECORD tab exists for.
export function shadyDoor(story) {
  if (!story || story.stage !== STAGE.ACT2) return null;
  if (story.branch === 'seized') return 'seized';
  const th = story.thread || newThread();
  if (th.asked) return 'asked';
  if (th.cue) return 'cue';
  return null;
}

export const shadyOpen = story => {
  const d = shadyDoor(story);
  return d === 'seized' || d === 'asked';
};

// ── the story state ────────────────────────────────────────────────────────

export const STAGE = { INTRO: 'intro', DEBT: 'debt', ACT2: 'act2' };

export function newStory(over = {}) {
  return {
    stage: STAGE.INTRO,
    name: '',
    gender: 'n',                 // 'm' | 'f' | 'n' — picks which of the three player VO takes plays
    t: 0,                        // seconds of play since the mob flew off
    rate: BREAK_EVEN,            // the pace EWMA, seeded at break-even (see the header)
    earned: 0,                   // gross since the debt started, for the record screen
    due: false,                  // the window has closed; the crew arrive at the next dock
    branch: null,                // 'paid' | 'seized', set by settle()
    sent: [],                    // Boss line ids already delivered
    lastMsg: -1e9,
    hire: null,                  // { craft, until, blocks, spent, took }
    wreckLeft: 0,                // one-off $90 hulls available (granted by the seizure)
    hireSpend: 0,
    hireBlocks: 0,
    // §S2-J — the paid branch's door. See THE TWO DOORS above.
    thread: newThread(),
    ...over,
  };
}

// Every credit the player earns is announced here, the same way every credit goes through
// `economy.earn()`. Injecting the lump into the EWMA is what makes `rate` a real trailing rate
// rather than a smoothed sample of an instantaneous quantity that is zero 99 % of the time.
export function credit(story, amount) {
  const n = Math.max(0, amount);
  story.earned += n;
  story.rate += n / RATE_TAU;
  return story.rate;
}

// The whole pace signal, from a story and an economy. Nothing here reads a clock.
export function pace(story, econ) {
  const remain = Math.max(0, WINDOW_S - story.t);
  const credits = econ ? econ.credits : 0;
  const clear = credits >= DEBT;
  const proj = credits + story.rate * remain;
  const ratio = proj / DEBT;
  // CLEAR is not "very cool", it is a different state: the money is in the account and the only
  // way to leave this state is to spend it. Collapsing it into the ratio would show a player who
  // has just made it a needle at half scale, which reads as "you are behind".
  const warmth = clear ? 0 : clamp01((COLD - ratio) / (COLD - HOT));
  return {
    remain, ratio: +ratio.toFixed(4), warmth: +warmth.toFixed(4), clear,
    need: Math.max(0, DEBT - credits),
    rate: +story.rate.toFixed(3),
    perMin: Math.round(story.rate * 60),
    // The rate the player would have to hold from here. This is the actionable number and it is
    // what the gauge's legend shows, because "you are behind" without "by how much" is a mood.
    required: remain > 0 ? +(Math.max(0, DEBT - credits) / remain).toFixed(3) : Infinity,
  };
}

// Advance the arc. `dt` and `now` are SIM seconds. Returns the events this tick produced; it never
// speaks, toasts or plays anything itself — main.js owns every surface.
export function tick(story, econ, dt, now) {
  const out = { boss: null, due: false, lapsed: false };
  if (!story || story.stage !== STAGE.DEBT) return out;
  story.t += dt;
  // Continuous decay of the trailing rate. Paired with `credit()`'s impulse, this is an EWMA over
  // RATE_TAU seconds expressed as a rate, so it is correct at any frame rate.
  story.rate *= Math.exp(-dt / RATE_TAU);

  const p = pace(story, econ);

  if (!story.due && story.t >= WINDOW_S) { story.due = true; out.due = true; }

  // The clear line, once, the first time the account covers it.
  if (p.clear && !story.sent.includes(BOSS_CLEAR.id)) {
    story.sent.push(BOSS_CLEAR.id);
    story.lastMsg = now;
    out.boss = BOSS_CLEAR;
    return out;
  }
  if (p.clear) return out;
  if (story.t < MSG_FLOOR || now - story.lastMsg < MSG_HOLD) return out;
  // Ratcheting: the NEXT unsent line, and only if warmth has reached its threshold. Walking the
  // list in order means a sudden collapse in pace delivers the ladder one rung at a time rather
  // than jumping to the last line, which is what makes the escalation read as escalation.
  const next = BOSS_LINES.find(l => !story.sent.includes(l.id));
  if (next && p.warmth >= next.at) {
    story.sent.push(next.id);
    story.lastMsg = now;
    out.boss = next;
  }
  return out;
}

// ── the two endings ────────────────────────────────────────────────────────
//
// **Both lose the car.** Aaron: *"either way we lose the car"*. That is structural: every player
// ends act one carless and hiring, so the hire loop is the spine of the game rather than a
// consolation prize, and "buy your own craft, debt-free" is the real arc.
//
// The branches differ in STARTING CAPITAL, not in whether you continue. There is no game over.
export const OUTCOME = {
  paid: {
    branch: 'paid',
    flags: ['debt_cleared', 'dad_favour'],
    title: 'THEY CAME FOR THE MONEY',
    // Dad's gratitude is a concrete asset, not a thank-you: it is a standing rung, and it is the
    // door to the shady ladder later, when a remark about him makes you go and ask who he borrowed
    // from. See the brief — the paid branch reaches the same room through curiosity.
    kicker: 'PAID IN FULL',
  },
  seized: {
    branch: 'seized',
    flags: ['car_seized', 'crew_hook'],
    title: 'THEY CAME FOR THE CAR',
    kicker: 'REPOSSESSED',
  },
};

// Close act one. Mutates both states. Called by main.js at a DOCK and nowhere else — the seizure
// must never happen mid-air, because the player has to be standing somewhere they can hire.
export function settle(story, econ) {
  const paid = econ.credits >= DEBT;
  const O = paid ? OUTCOME.paid : OUTCOME.seized;
  const before = econ.credits;
  if (paid) {
    E.spend(econ, DEBT);
  } else {
    // Cleaned out. `credits` is set rather than spent: `spend()` refuses to overdraw and the point
    // is that they take everything and leave a float.
    econ.credits = HIRE.SEIZED_CREDITS;
    story.wreckLeft = 1;           // the one vehicle $90 buys — see the HIRE header
  }
  // The car goes either way. `hire` is null, `craft` is left as it was so nothing downstream reads
  // an undefined hull, and `grounded` is what the dock screen and main.js test: the player owns
  // nothing and cannot undock until they have hired something.
  story.stage = STAGE.ACT2;
  story.branch = O.branch;
  story.due = false;
  story.hire = null;
  story.grounded = true;
  econ.borrowed = true;            // whatever they are sitting in, it is not theirs
  econ.flags = Array.from(new Set([...(econ.flags || []), ...O.flags]));
  return { ...O, paid, before, kept: econ.credits, took: paid ? DEBT : before - econ.credits };
}

// The player is grounded when act two has begun and they are not currently on a hire. It is the
// one condition that blocks UNDOCK, and it is a state the hire panel can always leave.
export function grounded(story) {
  return !!story && story.stage === STAGE.ACT2 && !story.hire;
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── save round-trip ────────────────────────────────────────────────────────
// The persistent half is small and explicitly listed, for the same reason economy.toSave is: a
// spread of the live object would persist whatever a later phase happens to hang on it.

export function toSave(story, now = 0) {
  return {
    stage: story.stage, name: story.name, gender: story.gender,
    t: +story.t.toFixed(2), rate: +story.rate.toFixed(4), earned: Math.round(story.earned),
    due: !!story.due, branch: story.branch, sent: story.sent.slice(), lastMsg: -1e9,
    // A hire's `until` is an absolute SIM time and sim time restarts at zero on the next load, so
    // persisting it would hand the player either an expired hire or an eternal one. What survives
    // is how much was LEFT; main.js re-bases it against the new clock. Getting this wrong is the
    // shape of the bug that would only appear on a reload, i.e. never in a gate that boots once.
    hire: story.hire ? { craft: story.hire.craft, left: Math.max(0, story.hire.until - now),
      blocks: story.hire.blocks, spent: story.hire.spent } : null,
    wreckLeft: story.wreckLeft | 0, hireSpend: story.hireSpend | 0, hireBlocks: story.hireBlocks | 0,
    grounded: !!story.grounded,
    // `last` is an absolute sim time and sim time restarts at zero on the next load — persisting it
    // would silence the thread for the rest of the session. It is deliberately reset, which costs
    // at most one remark's spacing and cannot strand the player mid-thread.
    thread: { remarks: (story.thread || {}).remarks | 0,
      heard: ((story.thread || {}).heard || []).slice(),
      cue: !!(story.thread || {}).cue, asked: !!(story.thread || {}).asked,
      at: +(((story.thread || {}).at) || 0).toFixed(1), last: -1e9 },
  };
}

export function fromSave(profile, now = 0) {
  const s = newStory();
  const p = profile || {};
  for (const k of ['stage', 'name', 'gender', 'branch']) if (p[k] !== undefined) s[k] = p[k];
  for (const k of ['t', 'rate', 'earned', 'wreckLeft', 'hireSpend', 'hireBlocks']) {
    if (typeof p[k] === 'number' && Number.isFinite(p[k])) s[k] = p[k];
  }
  s.due = !!p.due;
  s.grounded = !!p.grounded;
  s.sent = Array.isArray(p.sent) ? p.sent.slice() : [];
  if (p.thread) {
    s.thread = newThread({
      remarks: p.thread.remarks | 0,
      heard: Array.isArray(p.thread.heard) ? p.thread.heard.slice() : [],
      cue: !!p.thread.cue, asked: !!p.thread.asked, at: +p.thread.at || 0,
    });
    s.thread.remarks = s.thread.heard.length;
  }
  if (p.hire && E.CRAFT[p.hire.craft]) {
    s.hire = { craft: p.hire.craft, until: now + Math.max(0, p.hire.left || 0),
      blocks: p.hire.blocks | 0, spent: p.hire.spent | 0, took: now };
  }
  return s;
}
