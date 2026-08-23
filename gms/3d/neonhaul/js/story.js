// §S2-E — the debt, the pace signal, the Boss's escalation, both act-one endings, the hire loop.
//
// PURE, like economy.js and ranks.js and for the same reason: no three.js, no DOM, no Date.now().
// Every function takes a story state and an economy state and returns a plain object, so
// `tools/sim_s2e.mjs` can run the whole arc in node and the two constants that decide whether the
// game is fair are MEASURED. The clock is always a sim time in SECONDS passed as an argument.
//
// ── ONE ROAD, AND IT IS PAVED WITH MONEY YOU CAN SEE ───────────────────────
//
// **This is a restructure, and the thing it replaced is worth stating so nobody rebuilds it.**
//
// The shipped arc gave the player 84 minutes of play (`WINDOW_S`) to bank 50,000 credits. It had
// three defects and they compounded:
//
//   1. The gauge saturated. `warmth` was 1 at pace ratio <= 0.75 and 0 at >= 1.25, so a player
//      earning 70 % of the required rate pinned the needle to MAX **at minute zero** and it never
//      moved again for the whole 84 minutes. The one instrument that existed to tell you how you
//      were doing was dead for exactly the player who most needed it.
//   2. The gauge was not the trigger. The crew arrived on `t >= WINDOW_S` — an invisible clock —
//      while the visible instrument read pace. Aaron reached max warmth, was told they were
//      coming, and nothing happened, twice, five thousand credits apart.
//   3. Measured against the real courier rate (737 CRD/min, `shots/_courier_rate.json`) the
//      50,000 took 67 minutes against an 84-minute window, so the whole game up to that point was
//      a grind whose reward was losing everything.
//
// Aaron's call, verbatim: *"a single starting storyline where you are 100% going to lose the car
// next stop after 2k or 2.5k cash… stick with the bad guys demanding money, they take the car and
// say they won't break your arm, earn $10k and bring it to 'the boss' as he wants to talk to
// you."*
//
// So the arc is now three numbers and no clock at all:
//
//     SEIZE_AT   2 500   the first DOCK at or above this and they take the craft. Everyone.
//     SUMMONS   10 000   bring it to the Boss in person. That meeting opens act two.
//     DEBT      50 000   what your father owes. The SHADOW — never an act-one target.
//
// The intro VO did not have to be re-recorded for any of this, and that is a check on the design
// rather than a convenience: `boss_06` is *"If it is not ready we take the craft and sell it. Then
// we break an arm."* One road is that threat paid off and then **commuted** — they take the craft,
// they do not break the arm, because you are worth more to them working. `boss_03`/`04`/`05` stay
// literally true.
//
// ── THE GAUGE IS THE TRIGGER ───────────────────────────────────────────────
//
// `warmth` is now `credits / target`, and the target is whichever of the two demands is live. It
// opens at 250/2500 = 0.10 on a fresh profile, it moves on every single delivery, and it reaches
// full scale on **exactly the frame the event arms**. It cannot saturate early because there is
// nothing for it to saturate against, and it cannot disagree with the trigger because it is the
// same comparison. The Boss's escalation reads the same number for the same reason.
//
// ── THERE ARE STILL NO DAYS ────────────────────────────────────────────────
//
// Aaron: *"i actually like the idea of no days in the game."* There is no day counter and no clock
// on the debt — and now there is no hidden one either. `story.t` survives as playtime for the
// record screen and gates nothing.
//
// ── THE MONEY MUST BE IN THE ACCOUNT ───────────────────────────────────────
//
// Progress is `credits`, never `lifetime`, for both demands. A player who ploughs earnings into
// upgrades on the borrowed hull genuinely delays the seizure — and every one of those upgrades is
// fitted to a car that is leaving anyway, which is the joke the borrowed hull exists to tell.
//
// ── NO FAIL STATE (DECISIONS 6) ────────────────────────────────────────────
//
// The seizure takes the craft and NOT the money (Aaron: *"it could even allow to let the player
// keep his cash"*), so nobody is ever left unable to hire. See `settle()`.

import * as E from './economy.js';

// ── the three numbers ──────────────────────────────────────────────────────

// What your father owes. It is never an act-one target and the player is never asked to earn it;
// it is the reason any of this is happening, it is what the Boss says out loud in the intro, and
// `meetBoss()` pays SUMMONS off it so the shadow has a figure that moves.
export const DEBT = 50000;

// The seizure. The first dock at or above this balance and the craft is gone.
//
// **Why 2 500 rather than 2 000.** Aaron named both. The measured courier rate is 737 CRD/min
// (`shots/_courier_rate.json`, an autopilot at tier 2 that routes better than a person), and a
// fresh profile boots on 250 CRD — so 2 500 is 2 250 CRD of earning, which is **3.1 minutes at
// the measured rate and realistically 6-8 for somebody meeting the controls for the first time**.
// 2 000 would be 2.4 minutes and would land before the Boss's escalation could finish. This is the
// number that leaves room for all four of his lines and still fires inside the first ten minutes,
// which is what *"the hire loop is the spine of the game"* requires.
export const SEIZE_AT = 2500;

// The summons. Earn it, dock, and hand it to him yourself — that meeting opens act two.
//
// 10 000 is Aaron's number. At the measured rate it is ~13 minutes of earning on top of the hire
// burn (a `wisp` block is 1 425 CRD per 5 minutes, so roughly 3 800 CRD of hire across it), i.e.
// somewhere around 20 minutes of real play. It is a fifth of the debt, which is the line the
// meeting itself makes.
export const SUMMONS = 10000;

// The trailing earning rate's EWMA constant. It no longer feeds the gauge — the gauge is a
// balance, not a rate — but `perMin` is a genuinely useful readout and the record screen shows it.
// Earnings arrive as lumps roughly every 60-90 s, so five minutes is long enough to be a pace.
export const RATE_TAU = 300;

// ── the Boss's escalation ──────────────────────────────────────────────────
//
// Keyed on WARMTH, which is now `credits / SEIZE_AT` — **the same comparison that fires the
// seizure**. That is the whole repair. Under the window the ladder read pace while the event read
// a hidden clock, so "we are on our way" could be true of the gauge and false of the game.
//
// Ratcheting: each line fires once, in order, and the ladder never walks back down — a threat that
// is withdrawn is not a threat. `hold` keeps two lines arriving inside the same breath when a big
// delivery swings the balance.
//
// **The spacing and the thresholds are MEASURED against a real climb, not picked.** They were
// 150 s before the first line and 105 s between, which needed 465 s — 7.75 minutes — to deliver
// four lines into an act one that now ends in three to eight.
//
// The first retune (40 / 55 s, thresholds .42 .62 .80 .94) was still wrong, and the thing that
// caught it was a `?courier=1` run rather than a gate: the navigating pilot earned to the seizure
// in 221 sim seconds over six deliveries and heard **two of the four lines**. The observed climb,
// which is what these numbers are now solved against:
//
//     t (s)     71    91   121   161   191   221
//     warmth  0.21  0.38  0.57  0.73  0.96  seizure
//
// At 30 / 40 s with the thresholds below, that same run delivers b1 at t≈91, b2 at ≈131, b3 at
// ≈171 and b4 at ≈211 — the whole ladder, ten seconds clear of the pad. And `?courier=1` is the
// FAST arm: it routes better than a person and never loses a second to a wall, so a human's climb
// is longer and has more room, not less.
export const MSG_HOLD = 40;          // s between messages
export const MSG_FLOOR = 30;         // s of play before the first one can arrive

export const BOSS_LINES = [
  { id: 'b1', at: 0.35, text: 'Better make money fast.' },
  { id: 'b2', at: 0.55, text: 'Will be needing the money soon.' },
  { id: 'b3', at: 0.72, text: 'Ensure you have the money ready.' },
  // The last rung is ALSO force-fired the instant `due` arms, spacing ignored — see `tick`. A
  // player who blitzes to 2 500 must not have the payoff line eaten by MSG_HOLD, because it is the
  // only warning that the next pad is the one.
  { id: 'b4', at: 0.90, text: 'We are on our way, better have the money ready!' },
];

// Act two's line, fired once, the first time the account covers the SUMMONS. It is not an
// escalation — it is the crew noticing, and it is the line that tells the player to stop spending
// and go and see him.
export const BOSS_READY = { id: 'ready', text: 'He is expecting you. Bring it yourself.' };

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
  // The story price. Granted once, at the seizure — the crew leave you something to work in,
  // because a courier who cannot fly cannot pay. `SEIZED_CREDITS` used to sit beside this and is
  // DELETED rather than left there: the seizure no longer touches the account at all, and a
  // constant describing what the crew leave in it would be describing a rule that is gone.
  WRECK_PRICE: 90,
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

// ── §S2-J — THE DOOR INTO THE SHADY SIDE ───────────────────────────────────
//
// Aaron: *"the success branch may mean access to the 'shady' side of the story may trigger later -
// via an interaction with Dad, where you may even demand to know a contact… perhaps a comment
// someone makes about your Dad or etc?"* and, on the restructure, *"we may need to combine the
// latter Dad story into a sub story now that there is only a single storyline."*
//
// So there was a SEIZED door (immediate, because the crew had a hook in you) and a PAID door
// (delayed, earned by curiosity). One road means **one door, and it is the good one**: the thread
// about your father, opened after the Boss meeting. That is mostly gating REMOVED — the remarks,
// the spacing, the cue and `ThreadPanel` were all built for the delayed door and none of them
// change. What went is `branch !== 'paid'` here and the `'seized'` state in `shadyDoor`.
//
// Why after the meeting rather than after the seizure: the remarks are people talking about a man
// who borrowed off the wrong room, and they only mean anything once you have sat opposite that
// room and been asked after your father by his first name. `meetBoss()` is what sets `met`.
//
// It stays EARNED BY CURIOSITY. Remarks surface in ordinary content — an open-channel line, a
// client's aside — and a player who is not paying attention simply never notices them. Once two
// have landed the player's own voice says something, one row appears on a screen they already
// read, and pulling it is what opens the door. **They open it themselves.**
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
  + 'know it. He is back, he is fine, and he has not once asked me where the car went.';

// What the player demands, and what they are given. Short, because the scene is the player deciding
// to pull the thread and not a second cutscene.
export const THREAD_SCENE = [
  { who: 'pc', text: 'Who was it. Not what it was for, not how much. Who.' },
  { who: 'dad', text: 'They took the car and they have not been back. That is as done as it gets.' },
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
  if (!story.met) return null;                       // not until you have sat opposite him
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

// Which door is open, and `null` when it is not — the whole shady branch reads this one function.
//
// THREE states, which is why this returns a string and not a boolean: `'cue'` is "the thread is
// live and the player has not pulled it", and that is a different game from never having heard the
// remarks at all. It is the state the one row on the RECORD tab exists for.
//
// `'seized'` is GONE. It was the other branch's immediate door and there is no other branch.
export function shadyDoor(story) {
  if (!story || story.stage !== STAGE.ACT2 || !story.met) return null;
  const th = story.thread || newThread();
  if (th.asked) return 'asked';
  if (th.cue) return 'cue';
  return null;
}

export const shadyOpen = story => shadyDoor(story) === 'asked';

// ── the story state ────────────────────────────────────────────────────────

export const STAGE = { INTRO: 'intro', DEBT: 'debt', ACT2: 'act2' };

export function newStory(over = {}) {
  return {
    stage: STAGE.INTRO,
    name: '',
    gender: 'n',                 // 'm' | 'f' | 'n' — picks which of the three player VO takes plays
    t: 0,                        // seconds of play since the mob flew off — playtime, gates nothing
    rate: 0,                     // the trailing earning EWMA, in CRD/s. A readout, not the gauge.
    earned: 0,                   // gross since the debt started, for the record screen
    // The seizure is armed. A LATCH: once the balance has been seen at or above SEIZE_AT the crew
    // are coming, and spending back down below it at the shop does not call them off.
    due: false,
    branch: null,                // 'taken', set by settle(). One road — see OUTCOME.
    // The Boss meeting. It is the beat that opens act two proper: the company layer, the remarks
    // about your father, and through them the desk under the Tallow Yard.
    met: false,
    sent: [],                    // Boss line ids already delivered
    lastMsg: -1e9,
    hire: null,                  // { craft, until, blocks, spent, took }
    wreckLeft: 0,                // one-off $90 hulls available (granted by the seizure)
    hireSpend: 0,
    hireBlocks: 0,
    // §S2-J — the paid branch's door. See THE TWO DOORS above.
    thread: newThread(),
    // The arc's curtain, latched. See `ownArc`.
    own: false,
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

// ── the demand, and the one gauge that shows it ────────────────────────────
//
// Which of the two demands is live, and how close the account is to it. This is the ONLY thing the
// warmth bay draws and the ONLY thing the seizure and the summons compare against, and that
// identity is the repair: the instrument and the trigger cannot disagree because they are one
// expression.
//
//     stage DEBT              target SEIZE_AT   state 'call'    · 'due' once armed
//     stage ACT2, not met     target SUMMONS    state 'summons' · 'ready' once covered
//     stage ACT2, met         null — the bay goes back to a blanking plate
//
// `null` and not "a gauge reading zero": there is nothing left to be short of, and a needle parked
// at cold would be a claim about something that no longer exists.
export function demand(story, econ) {
  if (!story) return null;
  const credits = econ ? econ.credits : 0;
  if (story.stage === STAGE.DEBT) {
    const clear = credits >= SEIZE_AT || !!story.due;
    return { target: SEIZE_AT, have: credits, clear, state: story.due ? 'due' : 'call' };
  }
  if (story.stage === STAGE.ACT2 && !story.met) {
    const clear = credits >= SUMMONS;
    return { target: SUMMONS, have: credits, clear, state: clear ? 'ready' : 'summons' };
  }
  return null;
}

// The whole signal, from a story and an economy. Nothing here reads a clock — that is the point.
//
// `warmth` is a BALANCE against a target, so it is 0.10 on a fresh profile, it moves on every
// delivery, and it hits 1.0 on the frame the event arms. The old signal was a projection against a
// window and pinned to 1.0 at minute zero for any player under 75 % of pace; that could not be
// falsified by anything the player did, which is what made it useless.
export function pace(story, econ) {
  const d = demand(story, econ);
  const credits = econ ? econ.credits : 0;
  const rate = { rate: +(story ? story.rate : 0).toFixed(3),
    perMin: Math.round((story ? story.rate : 0) * 60) };
  if (!d) {
    return { target: null, warmth: null, ratio: null, clear: false, need: 0, state: null, ...rate };
  }
  const ratio = d.have / d.target;
  return {
    target: d.target, state: d.state, clear: d.clear,
    ratio: +ratio.toFixed(4),
    warmth: +clamp01(ratio).toFixed(4),
    need: Math.max(0, d.target - credits),
    ...rate,
  };
}

// Advance the arc. `dt` and `now` are SIM seconds. Returns the events this tick produced; it never
// speaks, toasts or plays anything itself — main.js owns every surface.
//
// It runs in BOTH story stages now. Act two has a demand of its own and the same crew watching the
// same account, so the line that says "he is expecting you" has to come from the same place.
export function tick(story, econ, dt, now) {
  const out = { boss: null, due: false, ready: false };
  if (!story || story.stage === STAGE.INTRO) return out;
  story.t += dt;
  // Continuous decay of the trailing rate. Paired with `credit()`'s impulse, this is an EWMA over
  // RATE_TAU seconds expressed as a rate, so it is correct at any frame rate.
  story.rate *= Math.exp(-dt / RATE_TAU);

  const p = pace(story, econ);

  // ── act two: the summons ────────────────────────────────────────────
  if (story.stage === STAGE.ACT2) {
    if (p.clear && !story.met && !story.sent.includes(BOSS_READY.id)) {
      story.sent.push(BOSS_READY.id);
      story.lastMsg = now;
      out.boss = BOSS_READY;
      out.ready = true;
    }
    return out;
  }

  // ── act one: the seizure arms, and the last rung goes with it ───────
  //
  // A LATCH. Once the balance has been seen at or above SEIZE_AT the crew are coming, and paying
  // for an upgrade on the way to the pad does not call them off.
  if (!story.due && econ && econ.credits >= SEIZE_AT) {
    story.due = true;
    out.due = true;
    // The payoff line, spacing IGNORED. A player who reaches 2 500 in three minutes would
    // otherwise have it eaten by MSG_HOLD, and it is the only warning that the next pad is the
    // one. Everything below it is marked sent, because a ladder that walks backwards after its own
    // top rung is not a ladder.
    const last = BOSS_LINES[BOSS_LINES.length - 1];
    if (!story.sent.includes(last.id)) {
      for (const l of BOSS_LINES) if (!story.sent.includes(l.id)) story.sent.push(l.id);
      story.lastMsg = now;
      out.boss = last;
    }
    return out;
  }
  if (story.due) return out;
  if (story.t < MSG_FLOOR || now - story.lastMsg < MSG_HOLD) return out;
  // Ratcheting: the NEXT unsent line, and only if warmth has reached its threshold. Walking the
  // list in order means a big delivery delivers the ladder one rung at a time rather than jumping
  // to the last line, which is what makes the escalation read as escalation.
  const next = BOSS_LINES.find(l => !story.sent.includes(l.id));
  if (next && p.warmth >= next.at) {
    story.sent.push(next.id);
    story.lastMsg = now;
    out.boss = next;
  }
  return out;
}

// ── the end of act one ─────────────────────────────────────────────────────
//
// **ONE road, and it loses the car.** Aaron: *"a single starting storyline where you are 100% going
// to lose the car."* That is structural: every player ends act one carless and hiring, so the hire
// loop is the spine of the game rather than a consolation prize, and "buy your own craft,
// debt-free" is the real arc.
//
// There is no paid branch, no fork and no dice. `OUTCOME` is a single object rather than a table
// keyed by branch, so there is nowhere for a second road to grow back.
//
// **They do not take the money.** Aaron: *"it could even allow to let the player keep his cash,
// since we established renting a car should be expensive."* It is also what makes the arm line
// true rather than a bluff — a courier with nothing in the bank cannot hire, and a courier who
// cannot hire cannot earn, and he says as much.
//
// The two flags cancel on the standing ladder ON PURPOSE. `car_seized` is −1 because the city saw
// your craft repossessed and that is public; `dad_favour` is +1 because you settled his debt with
// a vehicle rather than with money, and *"your father owes you, and he knows it"* was already the
// line. Under two branches only one player carried a penalty; under one road a permanent −1 with
// no choice attached to it would not be an axis at all, it would be an offset.
export const OUTCOME = {
  branch: 'taken',
  flags: ['car_seized', 'dad_favour'],
  title: 'THEY CAME FOR THE CAR',
  kicker: 'REPOSSESSED',
};

// Close act one. Mutates both states. Called by main.js at a DOCK and nowhere else — the seizure
// must never happen mid-air, because the player has to be standing somewhere they can hire.
export function settle(story, econ) {
  const before = econ.credits;
  // The one vehicle 90 credits buys. Not a mercy any more — the account is untouched — but the
  // crew's own arithmetic: they want you flying, so they point you at the thing nobody wants.
  story.wreckLeft = 1;
  // `hire` is null, `craft` is left as it was so nothing downstream reads an undefined hull, and
  // `grounded` is what the dock screen and main.js test: the player owns nothing and cannot undock
  // until they have hired something.
  story.stage = STAGE.ACT2;
  story.branch = OUTCOME.branch;
  story.due = false;
  story.hire = null;
  story.grounded = true;
  // Act two has its own demand and its own escalation line, and `sent` is what stops a line
  // repeating. Cleared so BOSS_READY can fire on a list that act one filled.
  story.sent = [];
  story.lastMsg = -1e9;
  econ.borrowed = true;            // whatever they are sitting in, it is not theirs
  econ.flags = Array.from(new Set([...(econ.flags || []), ...OUTCOME.flags]));
  return { ...OUTCOME, before, kept: econ.credits, took: 0, summons: SUMMONS, debt: DEBT,
    wreck: HIRE.WRECK_PRICE };
}

// ── the summons ────────────────────────────────────────────────────────────
//
// Act one's threat was *"we take the craft and sell it. Then we break an arm."* One road is that
// threat carried out to the first clause and commuted at the second, and the commutation is the
// most menacing thing in the scene because it is arithmetic: you are worth more working. This is
// the appointment that comes with it.
//
// Aaron: *"earn $10k and bring it to 'the boss' as he wants to talk to you."* So it is not an
// open-ended debt with a person at the far end of it, it is a person with a number in front of
// them — and the money is genuinely paid, against the fifty thousand, which is what stops the
// shadow being scenery. `settled()` reports how much of DEBT has been cleared.
export function summonsReady(story, econ) {
  return !!story && story.stage === STAGE.ACT2 && !story.met
    && !!econ && econ.credits >= SUMMONS;
}

// What has been paid off the father's debt, and what is left. The meeting is the only thing that
// moves it.
export function settled(story) {
  const paid = story && story.met ? SUMMONS : 0;
  return { paid, left: DEBT - paid, debt: DEBT };
}

// The meeting. Mutates both states, once. Called by main.js at a DOCK and nowhere else, for the
// same reason `settle()` is: a full-screen scene over a moving craft is a scene the player cannot
// put down.
export function meetBoss(story, econ) {
  if (!summonsReady(story, econ)) return null;
  const before = econ.credits;
  E.spend(econ, SUMMONS);
  story.met = true;
  // `crew_hook` is worth 0 rungs — a contact is not a reputation. `paid_up` is worth 1: you turned
  // up with ten thousand credits when running was an option, and this city can tell.
  econ.flags = Array.from(new Set([...(econ.flags || []), 'crew_hook', 'paid_up']));
  return { paid: SUMMONS, before, kept: econ.credits, ...settled(story),
    flags: (econ.flags || []).slice() };
}

// The player is grounded when act two has begun and there is NOTHING ON THE PAD THAT IS THEIRS. It
// is the one condition that blocks UNDOCK, and it is a state the hire panel can always leave.
//
// It shipped reading only `stage` and `hire`, and that made the arc's own destination a trap: a
// player who bought a hull outright in act two has no hire, so this returned true, so `doUndock`
// refused and re-opened the hire panel — on a craft they owned. **They could not take off.** The
// field `story.grounded` that `settle()` and `takeHire()` maintain was never read by this function
// at all, so nothing anywhere contradicted it.
//
// `borrowed` is the flag that separates the two cases and it is `js/economy.js`'s, so this takes
// the economy. It is not optional: `story` is only ever non-null when `Game.economy` is (main.js
// creates them together), and the `!!story` test short-circuits ahead of the dereference.
export function grounded(story, econ) {
  return !!story && story.stage === STAGE.ACT2 && !story.hire && econ.borrowed !== false;
}

// ── the arc closes ─────────────────────────────────────────────────────────
//
// The brief, verbatim: *"'buy your own craft, debt-free' is the real arc rather than a consolation
// prize."* Act one takes the car from every player and act two is the hire loop; this is the
// moment the loop stops being the game.
//
// **It is a curtain, not a stop.** Nothing here moves `stage`, sets a flag, spends a credit or
// locks a surface. There is no fail state and there is no win state either — DECISIONS 6 — and the
// player is on the board again the second they press FLY.
//
// ── what "debt-free" is allowed to mean ────────────────────────────────────
//
// `borrowed === false` with no hire on the meter is the obvious reading, and on its own it is
// wrong twice:
//
//   1. **`wisp` costs nothing.** `economy.buyCraft` will hand a grounded act-two player the free
//      starter hull for 0 CRD, which clears `borrowed`, ends the grounding and would fire the
//      game's climax about ten seconds into act two having bought nothing. So the hull has to be
//      at least the one that was taken — the brief's own *"climbing back to what you started with
//      and past it"*, which is a sentence about the `kestrel` the player opens the game in and not
//      a threshold invented here. (The free hull ALSO walks straight past the hire loop, which is
//      a bigger hole than this beat and is not this function's to fix. It is recorded in
//      docs/MANAGER_STATE.md.)
//
//   2. **Wages.** §S2-I's payroll is the only other money in this game that is owed to a person,
//      and a fleet in arrears is a fleet whose drivers are about to walk over it. A screen reading
//      NOTHING OWED over three unpaid drivers is the game congratulating you on somebody else's
//      loss. Arrears clear themselves the moment the account can cover them (`company.payWages`
//      pays back pay before it pays anyone new), so this delays the beat and can never withhold it.
//
// What is deliberately NOT in here: a balance, a licence tier, a standing rung, a lifetime figure.
// Those are numbers, and the requirement is that this fires when the ARC completes.

// The hull the player opens the game in — their parents'. `js/save.js`'s defaults are the source of
// truth for that; this is the copy a pure module is allowed to hold, and `tools/gates_end.mjs` A1
// asserts the two strings are the same so they cannot drift apart in silence.
export const STARTER_HULL = 'kestrel';

// A sub-credit residue of arrears must not hold the curtain shut forever. `payWages` lands on exact
// zero when the account covers the payment, so this is slack and not a threshold.
const ARREARS_EPS = 0.5;

// Is the arc complete? PURE. It returns the UNMET conditions rather than a boolean, because a gate
// that can only see `true` can only prove that a true is true — with this it can knock out one
// condition at a time and watch the answer change.
//
// `arrears` is the caller's: story.js does not import company.js, and main.js sums it across every
// charter the player holds, because a debt parked on a shell is still a debt.
export function ownArc(story, econ, arrears = 0) {
  const need = [];
  if (!story || story.stage !== STAGE.ACT2) need.push('act2');
  else if (story.own) need.push('done');
  // The restructure's condition. The arc is not over while the crew are still waiting for you to
  // walk in with their ten thousand: a player who bought a hull with the summons unpaid would get
  // a curtain reading NOTHING OWED over an appointment they have not kept. In play the meeting
  // always comes first — both beats fire at a dock and the meeting is the cheaper one — so this is
  // a guard on a state the game makes hard to reach rather than a new gate on the player.
  if (story && story.stage === STAGE.ACT2 && !story.met) need.push('summons');
  if (story && story.hire) need.push('hire');
  if (!econ || econ.borrowed !== false) need.push('borrowed');
  const price = econ && E.CRAFT[econ.craft] ? E.CRAFT[econ.craft].price : 0;
  if (price < E.CRAFT[STARTER_HULL].price) need.push('hull');
  if (arrears > ARREARS_EPS) need.push('arrears');
  return { done: need.length === 0, need, craft: econ ? econ.craft : null, price,
    floor: E.CRAFT[STARTER_HULL].price, arrears: +(+arrears || 0).toFixed(2),
    branch: story ? story.branch : null };
}

// The headline. The prose is `js/storyui.js`'s, exactly as OUTCOME's is: this holds what the arc
// DECIDES and not what it says.
//
// It was a table keyed by branch — YOU BOUGHT IT YOURSELF / YOU BOUGHT IT BACK — and it is a
// single object now for the same reason OUTCOME is. `NOTHING OWED` is a claim about the HULL and
// stays exactly true: the meter is off and the hull is yours. What is emphatically still owed is
// the forty thousand, and the panel says so.
export const OWN = { branch: 'taken', kicker: 'NOTHING OWED ON IT', title: 'YOU BOUGHT IT BACK' };

// Fire it, once. Mutates `story` and nothing else, and the one field it writes is the latch.
export function closeArc(story, econ, arrears = 0) {
  const a = ownArc(story, econ, arrears);
  if (!a.done) return null;
  story.own = true;
  return { ...OWN, branch: story.branch, craft: a.craft, price: a.price,
    flags: (econ.flags || []).slice(), ...settled(story),
    hireSpend: story.hireSpend | 0, hireBlocks: story.hireBlocks | 0 };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── save round-trip ────────────────────────────────────────────────────────
// The persistent half is small and explicitly listed, for the same reason economy.toSave is: a
// spread of the live object would persist whatever a later phase happens to hang on it.

export function toSave(story, now = 0) {
  return {
    stage: story.stage, name: story.name, gender: story.gender,
    t: +story.t.toFixed(2), rate: +story.rate.toFixed(4), earned: Math.round(story.earned),
    due: !!story.due, branch: story.branch, met: !!story.met,
    sent: story.sent.slice(), lastMsg: -1e9,
    // A hire's `until` is an absolute SIM time and sim time restarts at zero on the next load, so
    // persisting it would hand the player either an expired hire or an eternal one. What survives
    // is how much was LEFT; main.js re-bases it against the new clock. Getting this wrong is the
    // shape of the bug that would only appear on a reload, i.e. never in a gate that boots once.
    hire: story.hire ? { craft: story.hire.craft, left: Math.max(0, story.hire.until - now),
      blocks: story.hire.blocks, spent: story.hire.spent } : null,
    wreckLeft: story.wreckLeft | 0, hireSpend: story.hireSpend | 0, hireBlocks: story.hireBlocks | 0,
    grounded: !!story.grounded, own: !!story.own,
    // `last` is an absolute sim time and sim time restarts at zero on the next load — persisting it
    // would silence the thread for the rest of the session. It is deliberately reset, which costs
    // at most one remark's spacing and cannot strand the player mid-thread.
    thread: { remarks: (story.thread || {}).remarks | 0,
      heard: ((story.thread || {}).heard || []).slice(),
      cue: !!(story.thread || {}).cue, asked: !!(story.thread || {}).asked,
      at: +(((story.thread || {}).at) || 0).toFixed(1), last: -1e9 },
  };
}

// ── what a profile from the SHIPPED build becomes ──────────────────────────
//
// Every save on disk carries `branch: 'paid' | 'seized' | null` and the flags that went with it.
// There is one road now, and the migration is explicit rather than emergent because the failure
// mode of getting it wrong is a player parked in a state the game can no longer leave.
//
//   stage 'intro'   untouched. They never started.
//
//   stage 'debt'    untouched, and it does the right thing on its own: `t` and the old 84-minute
//                   window gate nothing any more, and the seizure re-arms off the BALANCE on the
//                   next tick. A mid-arc save almost certainly holds more than 2 500, so the crew
//                   arrive at their next dock — which is exactly what the new rule says and is a
//                   thing the player can see coming on the gauge.
//
//   stage 'act2'    **`met` is forced true, on BOTH old branches.** They finished act one under
//                   the old rules; billing them ten thousand credits now for an appointment that
//                   did not exist when they played it is the retroactive charge this restructure
//                   exists to remove. It also keeps the company layer and the arc's curtain open
//                   for them, both of which read `met`.
//
//                   An old SEIZED save additionally had the shady desk open from the moment act
//                   two began. Under one road the desk is the thread's, so a straight migration
//                   would CLOSE a door that player already had. `thread.cue`/`asked` are set for
//                   them — the hook they were given stays given.
//
//   `branch`        both old values become 'taken'. Nothing reads it as a fork any more; it is
//                   kept because it is what act two's surfaces print on the record.
export function fromSave(profile, now = 0) {
  const s = newStory();
  const p = profile || {};
  for (const k of ['stage', 'name', 'gender']) if (p[k] !== undefined) s[k] = p[k];
  for (const k of ['t', 'rate', 'earned', 'wreckLeft', 'hireSpend', 'hireBlocks']) {
    if (typeof p[k] === 'number' && Number.isFinite(p[k])) s[k] = p[k];
  }
  const legacy = p.branch === 'paid' || p.branch === 'seized';
  s.branch = p.branch === undefined || p.branch === null ? null
    : legacy ? OUTCOME.branch : p.branch;
  s.due = !!p.due;
  s.grounded = !!p.grounded;
  s.met = p.met === undefined ? (legacy && p.stage === STAGE.ACT2) : !!p.met;
  // The latch. A profile written before this beat existed has no key at all, which reads as `false`
  // — i.e. a player who already owns a hull outright gets the beat on their next dock rather than
  // never. That is the right way round: the alternative silently retires it for everyone who was
  // already there.
  s.own = !!p.own;
  s.sent = Array.isArray(p.sent) ? p.sent.slice() : [];
  if (p.thread) {
    s.thread = newThread({
      remarks: p.thread.remarks | 0,
      heard: Array.isArray(p.thread.heard) ? p.thread.heard.slice() : [],
      cue: !!p.thread.cue, asked: !!p.thread.asked, at: +p.thread.at || 0,
    });
    s.thread.remarks = s.thread.heard.length;
  }
  // The old SEIZED branch's door, carried over. It was `shadyDoor`'s immediate `'seized'` state and
  // that state is gone, so without this the desk they already had would shut on the next load.
  if (p.branch === 'seized' && p.stage === STAGE.ACT2) { s.thread.cue = true; s.thread.asked = true; }
  if (p.hire && E.CRAFT[p.hire.craft]) {
    s.hire = { craft: p.hire.craft, until: now + Math.max(0, p.hire.left || 0),
      blocks: p.hire.blocks | 0, spent: p.hire.spent | 0, took: now };
  }
  return s;
}
