# Idle Western 2 — adversarial design challenge (P0b)

Target: `research/DESIGN_PROPOSAL.md` ("Big Hat Energy", referred to below as DP), checked against Aaron's brief in `MANAGER_STATE.md` and the Idle Life 2 (IL2) record.
The verdict comes first. The proposal is a strong comedy bible attached to an IL2 economy, and its comedy is pitched at the reader of the document rather than at a thumb on a 412 × ~360 px hero. Its scope is also about 1.6× what IL2 shipped. IL2's art plateaued at a critic score of 6.6, it hit perf trouble on the S22 once there were many businesses, and the playtest showed players never found half its verbs. This proposal adds more verbs, more actors, more bespoke props, voice and music on top of that.
The two things that make or break this game are both under-designed:
1. **Can the player SEE that they own the town?**
2. **Do the jokes still land on the 50th repetition?**

---

## 1. Is it funny on a phone, or only in the doc?

### 1.1 The physical frame
On an S22 in portrait (412 × 915 css px), the hero zone is roughly 360–400 px tall. In the clay ref (`docs/art/scratch/r1_clay_hero.png`) the street runs straight away from the camera. A chibi at mid-street is 40–60 px tall, and one at the far end is about 15 px. Three consequences follow:
- **False-front signs face the street, so this camera sees them edge-on.** In the clay ref you can't read a single sign, yet the proposal's gags lean heavily on sign text ("WATER CHANGED TUESDAYS", "FOR SALE · CHEAP · SMELLS"). Signs need perpendicular hanging shingles, a camera yawed about 20–30° off the street axis, or both. Sign text has to be confined to card shots, which frame the facade straight on.
- **Small props at 40 px are invisible.** That rules out eyebrows, tape measures, a hat worn backwards, gold teeth and a can-can line seen through a window.
- **Big silhouettes and big motion read**, as do arcs, squash and stretch, and anything as large as a hat.

### 1.2 Gag readability audit
| Gag | Reads wordless in the hero? | Needs | 50th-repetition risk |
|---|---|---|---|
| Body thrown through the saloon doors | **Yes**: a big arc, doors swinging, a dust puff | Nothing. A yelp helps | **High.** At 25–45 s it fires about 150 times in a 90-minute session. It needs escalation (§1.4) |
| Sheriff in a barrel that walks off | Yes, the walking barrel is a silhouette gag | Nothing | Low if it's rare (it's ambient) |
| Hat size as status | **Yes. This is the best visual idea in the doc** | Nothing | None; it's a progress meter |
| Bird nesting on the Hundred-Gallon hat, Mulligans carrying the brim | Yes | Nothing | Low |
| Horse stares at the camera | Yes. It's cheap and genuinely funny | Nothing | Low if rare |
| Pickles somewhere new | Only if he's big and close. On a far roof he's 15 px | A glint, or place him only in near-camera spots | Low (it's a collectible) |
| Mortimer measuring passers-by | No. The tape is a few pixels | Voice (the height said aloud) | **High**: "a lovely six-foot-two" on loop |
| Gentleman leaving the Garter with his hat on backwards | **No.** At 40 px a hat reversed looks the same | Replace it (§4) | n/a |
| Can-can line through a window | No in the hero, maybe in the card | The card only | Low |
| Dolores with no eyebrows | No | Replace it with a soot-black face and smoking hair after each blast | Low |
| Elixir beard growth or green glow | The glow, yes. The beard, only in the card | Nothing | Low |
| Boot Hill epitaphs, wanted posters | No (text) | Card or popup close-ups | None (read on demand) |
| Five aces at poker | No (cards are text) | A close-up insert shot | Fine, it's one-time |
| Lulu's accent slipping to Ohio | No | Voice. **This is the best voiced gag** | Medium |
| Wendell "deputising" someone | No | Voice | High |

**Rule to adopt:** every ambient gag must read **with the sound off at 40 px**. If it can't, it lives only in a card or plays only with voice. The current §4.1 ambient list fails this test on 4 of its 12 items.

### 1.3 Barks: the repetition maths
DP §6.1 caps barks at 1 every 8 s with no line repeated within 10 minutes, from about 85 lines. The cap is not the real problem. **Trigger-bound pools are**:
- Mabel has 8 lines, and her natural trigger is the ejection, which fires about 2 times a minute. Her pool runs dry in about 4 minutes. After that, the 10-minute lockout either silences her or forces repeats.
- Over a 90-minute session, each of the 85 lines would play roughly 6–9 times if the system talks at its cap.
- Six-word bubbles over a moving 40 px head are fine one at a time and noise two at a time.

Fixes:
1. **Layer the audio.** A cheap **vocalisation layer** of grunts, "hic", "YEE-HAW", the Wilhelm-style yelp, a horse whinny and Mabel's "HUP!" can fire often. Sentence barks are rare, and the rarity is what makes them land.
   - Target about 1 sentence every 30–45 s of ambient play.
   - Barks on player taps get a per-character 20 s cooldown. Inside the cooldown the character falls back to a vocalisation.
2. **Weight the pools by trigger frequency, not by importance.**
   - Mabel, Pickles and Pomfrey (all high-frequency) need about 20 lines each.
   - Thrupp and Clank need 3.
   - A total of about 130 lines is still only about 2 MB.
3. **Show one bubble at a time**, give a sentence bubble priority over a vocalisation, and never put a bubble over an event actor.
4. **Use first-time lines.** Each character has 2–3 lines that play only once ever, the first time something happens. These carry the best jokes ("I'm eight. I got a business. You?"). After that they leave the pool.

### 1.4 What makes it funny moment to moment (the doc underweights this)
Comedy in a 3D toy comes from **physics, escalation, and player-caused chaos**. Copy is the smallest part. The doc has lots of copy and only one physical gag (ejection), and that gag repeats unchanged forever. Proposals:
- **Ejection escalation tied to Saloon level.**
  - L1: one drunk.
  - L25: two at once, or one who takes the door with him.
  - L50: the piano player, still playing.
  - L100: Mabel throws a whole table with people still sitting at it.
  - Landing outcomes vary: trough splash, hitching rail spin, a horse's back (the horse leaves), a passing wagon, Pomfrey (his hat flattens).
  - The landing comes from a 6–8 outcome table with no repeat among the last 3.
- **Anticipation via the blob shadow.** The shadow of a falling body grows on the ground before it lands. That's comedy timing for free, and blob shadows are the perf choice anyway (§6).
- **The player causes the chaos.** See pitch A (the Fling) in §7.

### 1.5 Discovery: IL2's playtest already warned us
IL2's fresh-eyes player never found couriers, merges, tickets→Crew or Rush Hour, and emoji-only toasts were unreadable. DP adds more hero tap verbs:

hustle, pile, hurry, piano, townsperson bark, ejection coin, tumbleweed, duel, brawl, stagecoach steer, robbery, gunman, posse hats, free sample, purse, building→card.

That's 16 meanings for a tap in a 360 px box. Two consequences:
- **Mis-taps.** IL2's rule that tapping a building scrolls the page to its card is **hostile in a tap-heavy hero**: you hustle-tap the street, clip the saloon, and the page jumps away.
  - Building→card should move to the floating plot label (or a double tap).
  - Raw taps should resolve in this order: event actor (generous radius) → piano → construction site → hustle.
  - Townsperson barks happen only outside a hustle combo.
- **Too many event types to learn.** Cut v1 to 5 specials (§3).

---

## 2. Built, not bought: will it feel great and stay visible?

### 2.1 Waiting wall?
- **Mostly no.** Other lines keep earning, and T ranges from 6 to 180 s.
- **Real risks:**
  1. **Forced cut fatigue.** Five director cuts per build × 9 builds is 45 forced hero cuts, on top of ejections, duels and hat promotions. Cut to the lot on **frame-up** and **sign-raised** only. The other stages show only if the player is already looking.
  2. **Tap-to-hurry is a chore at the top end.** Saving 60 s on a 180 s build at 0.5 s per tap takes 120 taps. Taps on the site share the hustle cap, so hurrying is income-neutral and exists purely for feel. Keep it, but make each tap *visibly* advance something: a plank snaps on, or a beam drops into place. A bare countdown won't do.
  3. **Construction is front-loaded and then stops.** There are about 9 real builds per life, and gen 2+ "rebrands" in 3 s. After minute 55 the town stops visibly growing. That's the opposite of the fantasy.
     - Fix: **every milestone tier (Lv 25 / 50 / 100) is a real Mulligan build**: scaffold, then a second storey, porch, balcony or annex.
     - Owned buildings also accrete **your stuff**: your colour of bunting, a hat-logo flag on the roof, and a gilded sign at Lv 100.

### 2.2 Does "own half the town" come through in the hero view?
**Not as written.** "You own 7/24" is a ribbon in the Town tab. In the hero, nothing tells your buildings from Pomfrey's, and the 12 empty lots are never described. The street can't *visibly* fill up unless it visibly starts sparse.
- **From frame one, the street must read as two colour camps plus empty lots.**
  - **Pomfrey's frontages:** pompous purple and gold paint, his oversized hat crest on every sign, and a little doorman.
  - **Empty lots:** weeds, a tumbleweed snagged on a "RESERVED — POMFREY" stake.
  - **Your buildings:** your colour (player-chosen from 4 at the poker win?) plus your hat crest.
- **The hat ratio is the scoreboard.** Pomfrey's hat should **shrink** as yours grows (see pitch B). The comparison then plays in every frame where both of you appear, and he rides past regularly anyway.
- **The establishing shot has to show the ratio.** The Town-tab crane-up should colour the frontages like a board game, with your colour spreading down the street.

### 2.3 Construction cost to build
Five stage kits × 12 plots, each bespoke, is the IL2 art lane's nightmare: that lane took four rounds to reach 6.6.
- **Build a generic parametric construction kit** sized to each plot's footprint: stakes and string, a timber frame, a plank cladding shader-wipe, and scaffold.
- **Only the last stage is bespoke:** the false front swings up, revealing the real finished plot.
- Use one material set, compile and warm it once, and keep it hidden on every plot.

---

## 3. Scope: v1 cut list

Aaron's must-haves, all kept:
- bar fights and ejections
- duels in the main view
- exaggerated hats
- a brothel
- a tappable piano
- hold-to-look
- businesses built on screen
- Qwen voices
- ACE-Step music

| Area | v1 | v1.1 |
|---|---|---|
| Blocks / lines | **3 blocks, 9 lines:** Lower Street, Saloon Row, Bank Block. "Half the Town" = 9 of 18 frontages | Railroad End (Elixir, Mine, Depot) as a block that grows onto the street end |
| Prestige | **Fake Your Death on Boot Hill**, available after Bank Block. Mortimer stages it: the coffin is carried up the hill, and at night a hand pokes out of the grave wearing a new moustache. No train needed | The train departure variant when the Depot arrives |
| Characters | Stranger, Mabel, Fingers, Mulligans (one model ×3), Nubbin, Pickles, Hortense, Pliers Pete, Lulu, Mortimer, Wendell, Thrupp, Pomfrey, Bart = 14 rigs, all costume kits on one rig | Quackenbush, Dolores, Clank |
| Voiced cast | Mabel, Pomfrey, Pickles, Lulu, Wendell, Mortimer, Bart, Nubbin, plus Stranger grunts. About 130 lines weighted per §1.3 | Pete, Hortense, Thrupp, plus the Railroad End three |
| Specials | Golden Tumbleweed, **Duel**, **Bar Brawl**, Stagecoach (×7), Bank Robbery (the gear source) | Rooftop Gunman, Free Sample, Posse, Dropped Purse (these duplicate the v1 set) |
| Block verbs | Saloon Row: **ejections**. Bank Block: **robbery bounty** (a captured Bart pays 🦷) | The Feud, After Dark |
| Gag links | 3 walkers: Tubs→Saloon, Saloon→Pull & Pray, Garter→Bank | The other 5 |
| Hats | Your hat ladder (9 tiers mapped to 9 lines), Pomfrey's shrinking hat, keepsake hats from season ranks | Manager hat visuals by item rarity |
| Equipment | The IL2 port as is (6 items, merge, auto-equip), with **no per-rarity models** | Visible gear on managers |
| Season | **Ghost Town as an overlay on the main street** (§5.2) with 8 ranks and 5 keepsake hats, with a hard ship-by date | A full side world, if the season is ever re-run |
| Gold teeth | Yes. It's only a rename of 🎟️ | n/a |
| Sunday School toggle | Text swap only. Garter copy plus the 15 rudest barks muted rather than re-voiced | Clean re-voiced alternates |
| Gristle Gulch, Pomfrey Buyout, Christmas | No | v1.1+ |

Reasoning:
- IL2 shipped 12 lines, but with the art critic stuck at 4.5–7. Western plots carry more bespoke character props per plot, plus construction, plus voice, plus music.
- With 9 lines the art lane can take **every plot to 8/10**, instead of 12 plots at 6.
- 9 lines still makes the run about 60 minutes on the IL2 curve. Re-tune the Deed costs; don't stretch the lines.

---

## 4. The M15 line: risky enough, not crude?

The register is right: innuendo, cowardice, greed, slapstick death. The **Velvet Garter's stock pile of hats left behind by gentlemen in a hurry** is the gold standard. It's risky and visual, and it's never explicit. More jokes should look like that one.

**Too far, or the wrong kind of risky:**
- **Pomfrey's "Southern-plantation-colonel drawl."** "Plantation" drags slavery connotations into the rival's voice brief. That isn't "risky" in the way Aaron means; it's a liability. Make him a **pompous East-Coast blue-blood or an English remittance-man baritone** (a Foghorn-Leghorn-free zone).
- **Ghost Town using Día de los Muertos** (marigolds, sugar-skull token, a "Marigold Sombrero" keepsake). The doc bans Mexican gags, then puts a sombrero and a living religious holiday on a comedy skin about duel losers' ghosts. Drop it. Use a **classic Western ghost town** instead: cobwebs, green lanterns, a phantom stagecoach, Headless Hank, and a token of 👻 **ectoplasm** or 🪙 **cursed coins**.

**Too safe:**
- **"No real swearing at all."** For an M15 Western, "damn" and "hell" are period-authentic and mild, and **donkey/ass puns** are the classic Western double entendre. Allow those, rarely, and keep the euphemisms as the house style. The Sunday School toggle mutes them.
- **The Garter has no visual farce.** Add the **window exit**: a man in long johns climbs out of the upstairs window, drops into a hay cart and is wheeled away as a woman with a rolling pin storms in the front door. It reads wordless at 40 px, it's risky, and it's not crude. It replaces "hat on backwards", which doesn't read.

**Flat lines to replace:**
| Line | Problem |
|---|---|
| Mabel: "Glass is clean. Ish." | Generic |
| Wendell: "The law is on its lunch break." | Generic |
| Wendell: "I've drawn my gun! ...It's in the drawer." | The pun doesn't land in speech |
| Mortimer: "Another satisfied customer. Well... customer." | Weak tag |
| Lulu: "Welcome, cowboy. Wipe your boots... and your hopes." | Soft |
| Lulu: "A respectable establishment. Mostly. Tuesdays." | Also uses up the Tuesday gag |
| Pomfrey: "Some inherit. Others... shovel." | Unclear |

**Over-used:** "Tuesday" appears 3 times (the Tubs, Lulu, Bart). Keep it for the Tubs only, because that one is a mechanic.

**Keep, they're the best:**
- "Pine or oak? Oak's for people with friends."
- "Whiskey's a dollar. Water's two. It's rarer."
- "You spill it, you lick it."
- "Back so soon, Sheriff? Your wife was asking."
- "I'm not hidin'. I'm surveillin'. From a barrel."
- "Satisfaction guaranteed, or your funeral's half price!"
- "Don't worry, I've done this twice."
- "My hat stays on, sir. It's load-bearing."
- "Getaway horse! ...HORACE!"

**Nubbin rule:** it's correct as written. Also keep him **off the Tubs and long-johns sightlines** in the Lower Street layout, not only away from the Garter.

---

## 5. Economy: reskin, or Western?

### 5.1 Honest assessment
It's IL2 with renamed lines, plus a few small multipliers. That's *fine*: IL2's economy was sim-proven, and re-proving a new one burns a lane. But the Western-specific additions mostly add complexity without changing a decision:
- **Hat multiplier** (×1–×1.5 by lines owned): fine. It costs nothing to understand and it's visible. Keep it.
- **Gag links** (+10% at Lv 25): economically invisible next to ×2 milestones. The **walker** is the value, so treat links as cosmetic ambient you unlock, with a token +5%. Keep only 3 in v1.
- **The Feud** (a purchase giving ×1.5 on one line, plus ambient duels every 90 s): it's a reskinned boost, and its ambient duels **dilute the signature duel**: about 60 ambient duels per session against roughly 5 real ones. Cut it to v1.1.
- **After Dark:** a copy of Night Shift. It goes to v1.1 with Railroad End.

### 5.2 Where Western mechanics would actually help
1. **Gates as showdowns with Pomfrey** (pitch B). IL2's playtest found contracts blocking the permit while $941M piled up, and a courier contract stuck at 0/4.
   - Keep the contracts as availability: 3 of 4, auto-claimed.
   - Make the Deed a **scene**: a poker hand, an auction shouting match or a duel against Pomfrey's hired gun. The outcome is always a win; only the score scales the bonus.
   - Each win tears down his sign on a frontage that becomes your empty lot.
2. **The duel as a real, short skill moment**, tuned for phones:
   - DP's thresholds (Gold < 250 ms, Silver < 400 ms) are **near-impossible on a phone**. Median visual reaction is about 250 ms, and touch plus display latency adds another 50–100 ms.
   - Use Gold < 380 ms and Silver < 550 ms, measured from the first rAF frame that shows DRAW. Calibrate with a hidden median of the player's own taps.
   - Never a loss (DP's boot-shot gag stays).
3. **Robbery bounty** as the Bank Block verb: a captured Bart pays 🦷 and adds to a "Bart caught: 7" counter with an escalating poster. Bart's costume improves each time: a moustache, a fake beard, dressed as a woman. That's a running gag with a ladder.

### 5.3 Ghost Town timing
- It's 4 Oct and the season ends 2 Nov.
- IL2 built Hollow's Eve in parallel, and it cost a whole lane plus art rounds, with critic complaints that it was "monochrome purple".
- Western v1 is more work than IL2, so a full **side world** with 3 variant lines will either slip core or ship ugly.
- Instead, ship Ghost Town as an **overlay on the main street**:
  - green lantern relight
  - ghosts of past duel losers drifting about
  - ghost duels (both shoot, nothing happens, they shrug)
  - an ectoplasm token from tapping ghosts
  - 8 ranks of keepsake hats
- **Hard rule:** if core isn't integrated by about 20 Oct, cut the season. Don't slip core for it.

---

## 6. Performance on the S22 in portrait

IL2's record:
- "slow/jerky with many businesses"
- the fix: a scrolling hero, 57vh cards, ≤ 3 visible views, a 0.5 Mpx card budget, a full warm-up, plots built up front
- art rounds 3–4 regressed CPU4× rAF p95 to about 21 ms before the perf pass

| Threat in the DP | Why | Mitigation |
|---|---|---|
| "The hat is a scaled mesh, adds no draw calls" | **False** unless the crowd is instanced. Thirty chibis × (body parts + hat) as separate meshes is 60–150 draws | **Instanced crowd:** body parts instanced by colour attribute, **hats instanced per hat type** (about 8 types). Named characters are unique meshes, with ≤ 6 on screen |
| Brawl (7 bodies) + construction dust + gag walkers + ejection + 30 crowd + Pomfrey procession at once | DP has one-at-a-time for *specials* only. Ambient, construction and walkers are unbounded | **A single "stage" slot** in the hero director, with a hard **actor budget**: ≤ 6 hero-animated actors plus crowd ≤ 24 (not 30). Ambient pauses during specials. **One instanced particle mesh, ≤ 256 particles** |
| Moving actors in the cached shadow map | IL2 cached shadows per view because the scene was static. Flying bodies would force shadow re-renders every frame | **Movers never cast into the shadow map.** They get blob shadows, which also serve as the landing anticipation in §1.4 |
| Construction props: 12 × 5 bespoke stages built at boot | Boot time, memory, warm-up | A generic parametric kit (§2.3): one material set, one warm-up |
| Duel/brawl "in main view" while the hero is scrolled off-screen | IL2's hero now scrolls away. Jumping the page to the hero mid card-tap is hostile, and rendering the hero off-screen costs a view | **Specials wind up instead of jumping.** The bell tolls, a chip offers "⤒ Duel!", and the special starts only once the hero is visible. Otherwise it expires gracefully after 20 s. The brawl can also play in the Saloon card, which is the view you're already looking at |
| Audio decode: 8 music loops at 60–90 s stereo | Each decoded 90 s stereo loop is about 30 MB of float PCM. Several decoded together is 100–200 MB on a phone, plus decode stalls | **Music streams through a single `<audio>` element** via MediaElementSource, never decodeAudioData. Barks and riffs are decoded lazily and cached by LRU (cap about 20 MB). ≤ 8 concurrent voices. Ship mp3/m4a, because Ogg on iOS is patchy, even though the S22 is fine |
| Speech bubbles anchored to 3D heads | IL2's `ui.update` was a rAF p95 hotspot | ≤ 2 DOM bubbles, transform-only, positions updated at 30 Hz, no layout reads per frame |
| A street receding to infinity | Long draw distances and fog. Railroad End at the far end is tiny but still drawn | The camera slides down the street (DP does this). Cull blocks behind the camera, and impostor the far end |
| Day/night plus green ghost relight | Shader variants mean program churn (IL2 fixed exactly this) | Relighting by uniforms only. No new material variants for the season |

**Gate:** port IL2's `test-scroll` with the phone CPU4× profile **with a brawl, a construction and an ejection firing together**. Then falsify it by disabling the actor budget and confirming the gate fails.

---

## 7. Pitches (where I think an alternative wins)

**A. The Fling: you're the bouncer.** When an ejection fires, Mabel holds the drunk by the collar in the doorway for up to 2 s. **Swipe to throw him**, with the swipe direction setting the arc.
- Targets with outcomes:
  - **Trough:** splash, coins.
  - **Pull & Pray door:** feeds the dentist. It's the gag link made playable.
  - **Jail:** Wendell catches him and faints.
  - **Pomfrey's window:** glass breaks, his hat flattens, and a little 🦷 drops.
- Ignored for 2 s, Mabel throws him herself, and the ejection still pays.
- Why it wins: it's phone-native, physical, emergent and player-caused, and it's Aaron's "thrown through the doors into the street" made into **your** verb. It replaces "tap the airborne drunk", which is just a tumbleweed in a hat.

**B. The hat war: Pomfrey's hat shrinks as yours grows.**
- Your hat ladder runs from Squashed Derby to Hundred-Gallon. Pomfrey's runs the other way, from Hundred-Gallon down to a **thimble**.
- Every Deed is a showdown scene against him, and every win tears down one of his signs and paints that frontage your colour.
- Fake Your Death resets the street, and Pomfrey is smug again with his giant hat back.
- Why it wins: it makes "own half the town" a picture rather than a number. He rides past regularly, so the score is in the hero all the time, and it gives the rival an arc.

**C. A piano you actually play.** Each tap plays **the next phrase** of a public-domain Joplin rag ("The Entertainer", "Maple Leaf Rag", "Elite Syncopations", all 1899–1902 and out of copyright). Tempo follows your tapping: mash it and Fingers goes double-time, the bar dances faster, and a frenzy turns into a **brawl choreographed to the beat**.
- Implementation: WebAudio with 3–5 detuned piano multisamples (about 150 KB), with phrases stored as note lists.
- Latency is zero, which ACE-Step slices can't promise. A diffusion piano also tends to smear transients and drift tempo, so bar-cutting 24 riffs out of it is a risky audio lane.
- ACE-Step does what it's good at: the background loops and the honky-tonk bed.
- Why it wins: "you're playing the piano" beats "you pressed play on a riff".

**D. The Leone duel, built for portrait.**
- Portrait suits **depth**, so shoot over the shoulder from behind your duellist, with the opponent down the street.
- On the bell, cut to an extreme close-up of the eyes (a camera move only), and a tumbleweed crosses between you.
- **Spoilers** add variety at no cost:
  - a horse wanders into the line
  - Pickles staggers between you
  - the bell-ringer falls off the tower
  - a fly lands on the opponent's nose
  - Mortimer is measuring both of you mid-standoff
- The opponent comes from a rotating pool: Bart, Pomfrey's hired gun, Mortimer's "nephew", a nun who turns out to be Bart.
- Losers slump, get measured and walk off bandaged.
- Real specials should be **≥ 8 minutes apart**.

**E. The Wanted Poster postcard.**
- IL2's 📷 postcard becomes a **WANTED** poster: your current hat, moustache, the bounty figure and three stats ("Ejected: 212 · Duels won: 14 · Baths taken: 0"), saved as a PNG.
- Offered at a hat promotion and at Fake Your Death.
- Every past self's poster stays on the walls in later runs (DP §1.1 #8 already wants this).
- It's cheap, shareable and on-theme.

---

## Ranked list: the 10 changes I would make

1. **Make ownership visible in the hero.**
   - Two colour camps (yours vs Pomfrey's purple and gold) plus empty "RESERVED — POMFREY" lots from frame one.
   - Your colour and hat crest spread down the street. Signs are perpendicular hanging shingles, with the camera yawed off the street axis so they read.
   - Pair this with **Pomfrey's hat shrinking as yours grows**, and make each Deed a showdown that tears down one of his signs (pitch B).
2. **Cut v1 to 3 blocks / 9 lines / 14 rigs / 5 specials.**
   - Prestige moves to **Boot Hill** after Bank Block. Railroad End, the Feud, After Dark, Gunman, Free Sample, Posse and Purse go to v1.1.
   - Spend the saved capacity getting **every plot to 8/10**, not 12 plots to 6.
3. **The "40 px, sound off" rule for gags.**
   - Replace the unreadable ones: hat-on-backwards becomes the **Garter window exit**, eyebrows become a soot face, and tape-measure gags are voice-only.
   - Sign-text jokes live in cards only.
   - Ejections **escalate with Saloon level** and use a landing-outcome table with no recent repeats.
4. **Rebuild the bark economy.**
   - A frequent wordless vocalisation layer; sentence barks about every 30–45 s.
   - Pools weighted by trigger frequency (about 20 lines for Mabel, Pickles and Pomfrey; about 130 total).
   - One bubble at a time, one-time "first" lines, and a 20 s per-character tap cooldown.
5. **Replace "tap the airborne drunk" with the Fling** (swipe to throw from Mabel's grip into the trough, dentist, jail or Pomfrey's window). Also fix the tap hierarchy: building→card moves to the label, and an event actor beats a hustle tap.
6. **Re-cut Ghost Town** as a main-street overlay with a classic Western ghost-town look. Drop Día de los Muertos, the sombrero and the sugar skulls, and use an ectoplasm token. Ship it **only if core is integrated by ~20 Oct**; core never slips for it.
7. **The Leone duel for portrait.**
   - Over-the-shoulder depth framing and an ECU on the eyes.
   - Random spoilers and an opponent pool.
   - Phone-calibrated thresholds (Gold < 380 ms, Silver < 550 ms, from the DRAW frame).
   - ≥ 8 minutes between real specials, and no Feud ambient duels diluting it.
8. **Specials wind up instead of yanking the page.**
   - A chip plus the bell toll, and the special starts only when the hero is visible; otherwise it expires gracefully.
   - The brawl can also play in the Saloon card.
   - The director cuts only on frame-up and sign-raise for construction.
9. **A perf contract before any art.**
   - An instanced crowd with per-type instanced hats (the "no extra draw calls" claim is false as written).
   - A single spectacle slot with an actor budget (≤ 6 animated plus ≤ 24 crowd plus ≤ 256 particles).
   - Movers get blob shadows only.
   - A generic parametric construction kit, with milestone extensions as ongoing builds.
   - Music streamed via `<audio>` and never decoded, with mp3/m4a assets.
   - Bubbles as transform-only DOM at 30 Hz.
   - A falsified CPU4× gate with a brawl, a build and an ejection running together.
10. **The playable Joplin piano** (pitch C). Taps advance a public-domain rag phrase by phrase, the tempo follows the player, and a frenzy becomes a brawl on the beat. ACE-Step does the loops and beds. Alongside it:
    - Fix the voice and line issues: Pomfrey's "plantation" brief becomes a blue-blood or remittance-man voice; replace the flat lines; keep "Tuesday" to one use; allow rare "damn"/"hell" and donkey puns behind the Sunday School toggle.
    - Add the **Wanted Poster postcard** (pitch E).
