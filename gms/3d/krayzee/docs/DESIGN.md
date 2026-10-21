# The Kingdom of Krayzee — game design (lane DESIGN)

Source of truth: `docs/BRIEF.md`. World frame and voice ids: `docs/CONTRACT.md`. Airport geometry: `js/world/layout.js`.
Data that code should read rather than hard-code lives in `data/`:

| file | what |
|---|---|
| `data/ranks.js` | rank ladder, thresholds, forms of address, room-rank assignment |
| `data/rules.js` | infractions (detection + points), outrage meter, protection modes, difficulty, scoring constants |
| `data/modes.js` | Free Flight, Story settings, online room types and host options |
| `data/story.js` | campaign missions, rival family, recurring controllers |
| `data/aircraft.js` | aircraft roster: C172 full stats, the rest planned placeholders |
| `data/voices.json` | per voice: name, card blurb, gender, style, Qwen3-TTS design prompt, picker sample line |
| `data/barks/script.json` | every pre-generated line: pilot barks, tower lines, callsign splice clips |
| `data/barks/build_script.py` | the source the JSON is generated from (edit there, re-run, never hand-edit the JSON) |

---

## 0. The pitch in one paragraph

You are a minor royal in a kingdom where aviation was invented by aristocrats for aristocrats, and the rules were
written afterwards by commoners who keep hoping someone will follow them. Every aircraft, yours included, flies itself
on autopilot and obeys Air Traffic Control. Touch the controls and you take over; let go and the autopilot takes back
(after a short ease-in). Points come from **breaking the rules with style**: cutting in on final, taking off out of
turn, buzzing the tower, landing on the taxiway. The tower tries to stay calm. It fails. You climb the peerage.

---

## 1. Core loop

```
spawn at stand ──► taxi (auto) ──► hold short ──► take off ──► pattern / task ──► final ──► land ──► taxi in ──► BANK
       ▲                 ▲ override anywhere: every rule you break adds PENDING Privilege + Outrage ▲          │
       └──────────────────────────────────────── next circuit (or next mission objective) ◄─────────────────┘
```

* **Autopilot is the baseline.** It follows the ATC plan exactly: taxi route, hold short, line up when cleared, fly the
  pattern at `PATTERN_ALT`, land, vacate, taxi to the assigned stand. A plane left alone never earns a point.
* **Override:** any control input above a 0.08 dead-zone hands control to the player instantly. On release the autopilot
  waits **1.5 s**, then blends back over **2.0 s** and re-plans from wherever the plane now is (it does not try to undo
  your crime; it carries on from it, e.g. if you are now lined up on 27 uncleared, it asks for takeoff clearance).
* **Pending vs banked points.** Points earned during a sortie are **Pending** (shown in gold, ticking). They are
  **Banked** when the plane comes to a stop (< 2 kt for 2 s) on any paved surface after a landing, or at a stand.
  A destroying crash (Realistic) or a Royal Scandal forfeits part of the pending pot (see §1.5). This is the core
  risk/reward: one more outrageous stunt before you land, or bank now?

### 1.1 ATC sequencing model (what "the rules" are)

The ATC sim (P2, lane FLIGHT/ATC) holds one ordered list per runway: the **departure queue** (planes at or approaching
the hold line, in order of arrival at the hold line) and the **arrival sequence** (planes in the pattern, ordered by
along-track distance to the threshold). Every plane has a **clearance** state:

| clearance | allows |
|---|---|
| `taxi` | moving on taxiways/apron to the hold line |
| `hold` | stop at the hold line (50 m from the runway centreline on stubs A1–A4) |
| `lineup` | enter the runway and stop on the threshold |
| `takeoff` | takeoff roll |
| `pattern` | fly the circuit, number N in sequence |
| `land` | land on the active runway |
| `goaround` | climb out, rejoin the pattern |
| `vacate` | leave the runway at the next stub, taxi to stand |

Active runway: `27` by default (land/take off westbound), `09` when the session wind is easterly. `04/22` is "closed"
except in missions that open it. Right-hand pattern for 27 (south side, away from the terminal), left-hand for 09.

**Separation rules** the tower enforces (and which define infractions):
* only one plane may be on a runway (anywhere within its paved rectangle + 30 m) unless it is the same runway and the
  second is behind a plane that has already lifted off;
* departing planes go in queue order; an arrival on final inside 3 km has priority over a departure lining up;
* minimum airborne separation 150 m (traffic advisory at < 600 m converging).

### 1.2 Infractions — detection and scoring

The infraction detector runs at 10 Hz over sim state. Inputs it needs per plane: `pos`, `vel`, `heading`, `agl`,
`onGround`, `phase`, `clearance`, `surfaceAt(pos)`, queue/sequence position, and which runway rectangle (if any) the
plane is inside. Each infraction has a **cooldown** per plane so it cannot be farmed (same infraction: 30 s unless
noted). All values below are mirrored in `data/rules.js` (`INFRACTIONS`).

**Privilege points (PP)** — the score. "Royal Privilege" is the in-fiction name; the HUD shows `PP`.

| id | name (HUD) | detected when | base PP | outrage |
|---|---|---|---|---|
| `queue_jump` | Pushed In | player crosses a hold line (enters runway rect) while ≥1 other plane is ahead of them in that runway's departure queue | 150 × planes jumped | +10 |
| `unauth_takeoff` | Didn't Ask | player groundspeed > 35 kt on a runway rect with clearance ≠ `takeoff` | 200 | +12 |
| `cut_in_final` | Cut In | player enters the final cone (≤ 3 km from threshold, track within 20° of runway heading, AGL < 250 m) while a plane sequenced ahead of them is also in the cone and the player is now closer to the threshold | 300, ×1.5 if gap to the victim < 400 m | +15 |
| `forced_goaround` | Sent Round | an AI plane is given `goaround` because of the player (player on runway or in cone ahead within 1 km) | 250 per victim | +8 |
| `runway_steal` | Runway Thief | player enters a runway rect while another plane is on its takeoff roll or on short final (< 1.2 km) to it | 350 | +15 |
| `taxiway_landing` | Taxiway Touchdown | touchdown (`onGround` goes true from airborne) with `surfaceAt = 'taxiway'` | 400 | +20 |
| `grass_landing` | Country Squire | touchdown on `'grass'`, survives (not destroyed) | 250 | +10 |
| `apron_landing` | Valet Parking | touchdown on `'apron'` | 600 | +25 |
| `wrong_way` | Wrong Way, Your Grace | touchdown or takeoff roll on the active runway with heading > 120° off the active direction | 350 | +15 |
| `closed_runway` | Private Runway | touchdown on `04/22` while it is closed | 200 | +8 |
| `tower_buzz` | Tower Buzz | airborne, horizontal distance to `TOWER.position` < 80 m and altitude < tower height + 40 m | 300, ×2 if < 30 m (cab-level) | +15 |
| `terminal_buzz` | Window Rattler | airborne over the `TERMINAL` footprint with AGL < 40 m | 200 | +10 |
| `low_pass` | Royal Flypast | over a runway rect, AGL 1–6 m, speed > 1.2 × Vr, no touchdown, for ≥ 400 m | 250 | +8 |
| `formation` | Uninvited Formation | airborne within 40 m of another plane for ≥ 3 s continuous (cooldown per victim) | 100 + 30 per extra second (cap 400) | +5 |
| `near_miss` | Near Miss | closest approach between player and another plane < 25 m, both airborne, no contact | 200 (×1.5 under Realistic) | +12 |
| `taxi_speeding` | Taxi Speeding | groundspeed > 30 kt on taxiway/apron for ≥ 2 s | 80 | +4 |
| `stand_steal` | Stand Steal | player stops (< 2 kt, 3 s) on a stand assigned to another plane | 150 | +6 |
| `ignored_instruction` | Selective Hearing | player has `goaround` or `hold` and is still violating it 8 s later | 120 | +10 |
| `double_occupancy` | Shared Runway | two planes on the same runway rect simultaneously, at least one moving > 40 kt, player is one of them | 300 | +15 |
| `intersection_dash` | Crossroads | player crosses the 09/27 × 04/22 intersection while another plane is on either runway | 200 | +10 |

**Multipliers** (applied in order, rounded to 10):

* **Style**: infractions chained within **20 s** of the previous one build a combo: ×1.0, ×1.25, ×1.5, ×2.0, ×2.5 (cap).
  HUD shows `COMBO ×1.5` with a draining ring.
* **Audacity**: ×(1 + victimRankDiff × 0.1) when the victim plane belongs to a higher-ranked royal (AI planes carry
  ranks too). Cutting in front of a Duke as a Baron is worth more. Min ×1.0, max ×1.8.
* **Outrage heat**: ×(1 + outrage/200) — the angrier the tower, the more each crime is worth (max ×1.5).
* **Aircraft handicap**: `aircraft.ppMult` (slow/awkward aircraft earn more: Bathtub ×1.6, C172 ×1.0, jets ×0.8).

**Clean flying** earns a trickle so a careful player is not at zero: a by-the-book landing (on centreline ±5 m, within
first 450 m, sink < 300 fpm) = +50 PP "Impeccable", and the tower occasionally says something nice (and is suspicious
of it).

**Banter points**: answering in a response window (§5) = +40 PP "Riposte"; a `priority` bark answering a tower scold =
+60 PP but +5 outrage.

### 1.3 Tower Outrage meter

`0–100`, per tower (one tower per airport; online it is per player — each player has their own outrage, so one
hooligan doesn't spoil the meter for everyone).

| outrage | tier | tower behaviour |
|---|---|---|
| 0–24 | 1 Professional | textbook phraseology, small sigh |
| 25–49 | 2 Strained | over-precise, pointed pauses, "for the *second* time" |
| 50–79 | 3 Cracking | voice wobbles, sarcasm, mentions their therapist / tea |
| 80–99 | 4 Meltdown | shouting, then catching themselves and apologising |
| 100 | Royal Scandal | see below |

Decay: −1 per 3 s of rule-abiding flight with the autopilot engaged; −10 on a banked Impeccable landing.

**Royal Scandal** (outrage hits 100): the newspapers find out. A "THE KRAYZEE HERALD" headline card slides in
(non-blocking, 3 s). Effects: 25 % of Pending PP is forfeited; the tower issues "return to stand immediately"; for 60 s
every infraction is worth ×0 (the press are watching, nothing counts); outrage resets to 60. In Story, some missions
fail on Scandal (§3.2).

### 1.4 Near-misses and collisions by protection mode

Contact is any overlap of plane bounding capsules, or a plane with a `colliders` box, or ground contact outside the
gear envelope (pitch/bank too big, sink > 900 fpm, or touchdown on `'building'`/`'water'` for non-seaplanes).
**Impact speed** = relative speed along the contact normal, in knots.

* **Rubber** (impossiRubber, full protection): no damage, ever. Elastic bounce: restitution 0.55, plus a comical
  spin (random yaw rate up to 120°/s, decaying). Autopilot takes over after 2 s if the player isn't steering. Each
  bounce: −15 % of Pending PP ("dignity lost"), +8 outrage, and a `bump` bark. A bounce off the tower is still a
  `tower_buzz` ×2 if it qualifies (yes, really).
* **Partial**: you start with **Protection 100 %**. Each contact removes `clamp(impactKt × 0.8, 5, 60)` %. While
  Protection > 0 the contact behaves like Rubber but with restitution scaled by Protection (100 % → 0.55, 10 % → 0.1).
  At 0 % the plane is **Realistic** for the rest of the sortie. Protection refills to 100 % only on a banked landing at a
  stand (+25 % on any banked landing). HUD: a rubber-duck-yellow pill gauge next to the PP counter.
* **Realistic**: contact > 15 kt (plane-plane or plane-building), or a ground hit outside gear limits, = destroyed.
  Gear limits: sink > 900 fpm, bank > 25°, pitch < −5° (nosewheel first at speed) or > 18° (tail strike) at touchdown.
  Contact ≤ 15 kt (taxi bumps) = "prang": 1.5 s shake, −10 % Pending, +10 outrage. Destroyed = Pending PP lost
  entirely, a 4 s canopy-and-parachute gag, respawn at a stand (online) or mission retry (story).

**Near-miss** (§1.2) never damages in any mode; it is the reward for getting close without touching. Under Realistic
it is worth ×1.5 because you actually risked something.

### 1.5 Rank ladder (`data/ranks.js`)

Career rank is driven by **Lifetime banked PP** (Free Flight + Story + Online all count). Male / female titles chosen
by the profile's gender; the player picks their starting title form on the profile screen.

| # | title (m / f) | lifetime PP | radio address | notes |
|---|---|---|---|---|
| 1 | Baron / Baroness | 0 | "my Lord / my Lady" | start |
| 2 | Viscount / Viscountess | 2 000 | "my Lord / my Lady" | ≈ 2 sorties of mischief |
| 3 | Earl / Countess | 6 000 | "my Lord / my Lady" | |
| 4 | Marquess / Marchioness | 14 000 | "my Lord / my Lady" | |
| 5 | Duke / Duchess | 28 000 | "Your Grace" | |
| 6 | Archduke / Archduchess | 50 000 | "Your Imperial Highness" (they insist) | the optional rank: slots between Duke and Prince — a jumped-up Duke |
| 7 | Prince / Princess | 80 000 | "Your Highness" | |
| 8 | Crown Prince / Crown Princess | 120 000 | "Your Royal Highness" | the optional rank: heir apparent, right below the throne |
| 9 | King / Queen | 180 000 | "Your Majesty" | |
| 10 | Emperor / Empress | 260 000 | "Your Imperial Majesty" | top; also unlocks the Royal Bathtub's gold taps |

Rationale: thresholds grow ~1.5–2.2× per step so early ranks come in the first session (Viscount in ~15 minutes) and
Emperor is a long-term goal (~25–35 hours). Story mode is tuned so finishing the campaign on Medium lands you at about
Prince; King and Emperor come from online and Free Flight.

Each rank unlocks something concrete (`unlocks` in ranks.js): liveries/patterns, aircraft, and online host privileges
(Duke+ can host ranked rooms; King+ can set "Royal Decree" room modifiers).

### 1.6 Online room rank ("the Court")

Within a room your **career** title is shown on your profile card, but **on the radio and the leaderboard you hold a
Court rank**, recomputed every time anyone banks points:

* Players sorted by **room PP** (banked this session; ties broken by earlier time-to-reach).
* **1st place holds the Crown**: Court rank = King/Queen, a crown icon above their plane and on their name tag, and the
  tower addresses them "Your Majesty". If 1st has already **earned Emperor/Empress in their career** (D2), they hold
  the Crown as **Emperor/Empress** and 2nd place is King/Queen (DECISIONS D4 — no points-ratio rule).
* Remaining players take ranks downward one rung per place (Crown Prince/Princess, Prince/Princess, Archduke, Duke,
  Marquess, Earl, Viscount, Baron — one rung per position; positions beyond 10th are all Baron.
* Anyone with 0 room PP is Baron regardless.
* **Coronation** moment: when the Crown changes hands, every player hears a 1.5 s fanfare stinger and the tower says
  the `crown_change` line; the new monarch gets a free response window to gloat.
* AI traffic never holds Court rank (they keep their fixed AI ranks for Audacity).

Callsigns change with Court rank ("Baron Four-Two" becomes "Majesty Four-Two") — the splice system handles it (§5.4).

---

## 2. Protection modes

| mode | id | fiction | when it's used |
|---|---|---|---|
| Rubber | `rubber` | impossiRubber airframe | Story Easy, Free Flight default, kids/casual rooms |
| Partial | `partial` | an impossiRubber "lite" airframe that wears out | Story Medium, default online |
| Realistic | `realistic` | ordinary aluminium and courage | Story Hard, "Strict Tower" rooms |

### impossiRubber (loading-screen / mode card blurb)

> In 1907 the Royal Chemist, attempting to invent a self-buttering crumpet, instead produced a substance that could not
> be dented, pierced, scratched or reasoned with. He named it **impossiRubber**. The King had a biplane made of it the
> same afternoon, flew it straight into the cathedral, bounced off, and declared aviation "perfectly safe". Every royal
> aircraft since has been made of the stuff. The cathedral has not been the same.

Short variant (mode-select chip): "impossiRubber: invented by accident, bounces on purpose."

### Story difficulty mapping

| difficulty | protection | outrage gain | AI behaviour | Scandal | mission PP targets |
|---|---|---|---|---|---|
| Easy | Rubber | ×0.75 | AI yields when you cut in (slows to open a gap) | never fails a mission | ×0.7 |
| Medium | Partial (refills each mission) | ×1.0 | AI holds its line, goes around when forced | fails only "stay below Scandal" missions | ×1.0 |
| Hard | Realistic | ×1.25 | AI rivals actively block you (rival family planes contest the runway) | fails the mission | ×1.3 |

---

## 3. Modes

### 3.1 Free Flight

Pick aircraft (any unlocked), protection mode, traffic density (`none / light 4 / busy 8 / chaos 14` AI planes), time
of day, active runway (or "let the wind decide"). Infinite session; PP banks to career at full rate. The attract-mode
traffic is Free Flight at `light` with no player.

### 3.2 Story: "The Peerage" (13 missions)

**The setup.** You are the most junior Baron(ess) of House [your name]. The Queen has announced that the next heir to
the Royal Hangar will be whichever family shows the most *Royal Privilege* in one season at Krayzee Royal Aerodrome.
Your rivals are **the House of Pomfrey-Smythe** — Lord Rupert Pomfrey-Smythe (voice `toff`) and his mother the
Dowager Duchess Hyacinth (voice `duchess`) — who have won every season for 200 years and fly matching mauve aircraft.

**Recurring tower controllers** (one per shift; the mission says who is on):
* **Gerald Calloway** (`tower_m`) — 31 years in the tower, three of them calm. Collects ceramic owls. Will retire at the
  end of the season "whatever happens, *whatever* happens".
* **Imogen Frost** (`tower_f`) — icy, flawless phraseology, has never once raised her voice (until mission 12).
* **Tobias "Toby" Wren** (`tower_trainee`) — on his first week; reads from laminated cards; thinks you are all
  wonderful, which is worse.

Each mission: briefing card (2–3 lines, text only, no VO in P3), objectives (PP target + a twist), optional "Royal
Flourish" bonus objective. Completing grants a star; 13 stars = finale. Data in `data/story.js`.

| # | title | tower | rank on start | twist / objective |
|---|---|---|---|---|
| 1 | First Solo, Sort Of | Toby | Baron | Tutorial. Fly one circuit on autopilot, then take over and land. Then: push in at the hold line once. |
| 2 | Queue Is a Commoner's Word | Toby | Baron | Busy departure queue of 5. Get airborne first. PP 600. |
| 3 | The Pomfrey-Smythe Welcome | Gerald | Baron | Rupert cuts in on *you*. Cut back in front of him on final before he lands. Respond to his insult (response window). |
| 4 | Tea at Altitude | Gerald | Viscount | Deliver the Duchess's forgotten teapot: land on the apron in front of the terminal ("Valet Parking"). Rubber bounces cost the teapot (lose). |
| 5 | Tower Tour | Imogen | Viscount | Buzz the tower 3 times without Scandal. Imogen never cracks past tier 2 here — make her reach tier 3 for the Flourish. |
| 6 | The Crosswind Runway Is Closed | Gerald | Earl | Land on 04/22 (closed) while 27 is in use, then cross the intersection under traffic. |
| 7 | Formation, Uninvited | Toby | Earl | Hold formation on the Dowager Duchess for 30 s total across the sortie while she complains. |
| 8 | Rush Hour | Imogen | Marquess | `chaos` traffic, 14 AI. Bank 3 000 PP in 6 minutes. |
| 9 | Wrong Way Round | Gerald | Marquess | The wind changes mid-mission; everyone switches to 09. You keep landing on 27. Force 3 go-arounds. |
| 10 | The Royal Flypast | Imogen | Duke | Perform a low pass down the runway during the Queen's garden party, then a terminal buzz, then land clean — no collisions at all. |
| 11 | Sabotage | Toby | Duke | The Pomfrey-Smythes have bribed Toby to sequence you last forever. Get every clearance you want anyway (queue jump, unauth takeoff, runway steal). |
| 12 | Imogen Snaps | Imogen | Archduke | Get Imogen to tier 4 before Rupert does (he's racing you for outrage). First to Meltdown wins. Scandal = fail. |
| 13 | Coronation Day | all three (handover mid-mission) | Prince | Finale: head-to-head season decider vs both Pomfrey-Smythes in the Royal Bathtub (unlocked). Out-score them over 8 minutes; Gerald retires live on the radio at the end. |

Finishing 13 on any difficulty awards the career rank floor of **Prince/Princess** (if lower) and unlocks the Royal
Bathtub for Free Flight.

### 3.3 Online rooms

Architecture: see `docs/ONLINE.md`. Rooms are **browser-hosted**: the host player's browser runs ATC, AI traffic,
scoring, the radio timeline and the Court; each player's browser flies its own plane and reports its own infractions.
The small Go room server only holds membership, voice claims, callsign numbers, room options and relay. Up to
**8 players** per room (host can lower); AI traffic fills to the chosen density. Room-type ids below are shared with
the ONLINE lane: `court, rumble, coronation, strict, garden, joust, open`.

**Room types** (`data/modes.js` `ROOM_TYPES`; a type sets defaults, the host may change those marked *).

| type | summary | protection | aircraft | traffic | length | win |
|---|---|---|---|---|---|---|
| Court Session | standard free-for-all | Partial* | any unlocked* | busy* | 10 min* | most room PP holds the Crown at the end |
| Royal Rumble | silly chaos | Rubber (fixed) | any | chaos | 8 min | most PP |
| Coronation | race to the throne | Partial* | any* | busy* | first to 5 000 PP* | first past target crowned |
| Strict Tower | for the brave | Realistic (fixed) | light only* | light* | 12 min* | most PP; crash = −500 room PP |
| Garden Party | gentle, family | Rubber (fixed) | ultralight + light (fixed) | light | 10 min | most PP; outrage gain ×0.5 |
| Joust | 1v1 runway duel | Rubber* | same type for both (host picks) | none | best of 5 landings | each "round" = first to land and bank wins |
| Open Court | sandbox | any* | any* | any* | none | no winner; Crown still tracked |

**Host options** (`HOST_OPTIONS`): room name (24 chars), public/private (6-char code), max players 2–8, allowed
aircraft classes (multi-select over `ultralight, light, vintage, sea, aerobatic, utility, bizjet, airliner, silly`) or a
single fixed type, protection mode, partial start % (50/75/100), traffic density, active runway / wind, time limit,
PP target, outrage gain (×0.5/1/1.5), "Royal Decree" modifiers (King+ hosts only: `all_bathtubs`, `tower_on_strike`
(no ATC, pure chaos), `crosswind_open`, `double_points_final_minute`), voices `first_come` (default) or `duplicates_allowed`.

**Voice allocation:** first come, first served — join order. In the lobby, taken voices show the taker's name greyed
on the voice card; if your saved voice is taken you are offered the next free voice in your **profile's preference
list** (players can star up to 3 favourites), otherwise the first free one. 15 pilot voices ≥ 8 players + 7 AI voices.
AI traffic uses only voices no human holds; if more AI than free voices, AI repeat voices (never a human's voice).

---

## 4. Aircraft roster (`data/aircraft.js`)

C172 is fully specced now; the rest are `status: 'planned'` placeholders with class, speed band and handling notes
so the roster UI and room filters work today. Speeds are knots (IAS).

| id | name | class | cruise | Vr / approach | handling notes | ppMult |
|---|---|---|---|---|---|---|
| `c172` | Skyhawk "Royal Runabout" (C172) | light | 120 | 55 / 65 | stable, forgiving, the everyman | 1.0 |
| `flexwing` | Hang-Glider-with-Opinions (flex-wing microlight) | ultralight | 55 | 35 / 45 | weight-shift: sluggish roll, blown about by wake | 1.4 |
| `cub` | Piper Cub "Butter Cub" | light | 75 | 40 / 50 | tailwheel ground-loops, lands in 100 m, grass-friendly | 1.3 |
| `tiger` | Tiger Moth "Grandfather's Moth" | vintage | 80 | 45 / 55 | biplane, open cockpit, scarf physics, draggy | 1.3 |
| `sopwith` | Sopwith-ish "Jolly Camel" | vintage | 90 | 45 / 55 | vicious torque roll to the right, rotary engine | 1.4 |
| `spitfire` | Spitfire "Teatime" | vintage | 260 | 90 / 100 | fast, no forward view on the ground, wingco's favourite | 0.9 |
| `pitts` | Pitts Special "Show-Off" | aerobatic | 140 | 60 / 80 | 240°/s roll, unstable, short wings | 1.1 |
| `extra` | Extra 300 "Extra Extra" | aerobatic | 180 | 65 / 85 | precise, fast roll, hard to slow down | 1.0 |
| `beaver` | DHC-2 Beaver floatplane "Damp Duchess" | sea | 115 | 55 / 65 | lands on water; on runway sits on its floats' wheels | 1.2 |
| `catalina` | Catalina-ish flying boat "Soggy Monarch" | sea | 110 | 70 / 80 | huge, slow roll, lands on water only (or very sorry) | 1.3 |
| `caravan` | Cessna Caravan "Royal Removals" | utility | 170 | 70 / 80 | heavy, stable, big turbine whine | 0.9 |
| `twinotter` | Twin Otter "Twin Toff" | utility | 160 | 65 / 75 | STOL, two engines, asymmetric if one quits | 1.0 |
| `baron58` | Beechcraft Baron "The Baron's Baron" | light | 200 | 85 / 95 | twin piston, fast for the circuit | 0.9 |
| `bizjet` | Learjet-ish "Monogrammed Lear" | bizjet | 430 | 120 / 130 | fast, overshoots the pattern, 3× circuit size | 0.8 |
| `gulf` | Gulfstream-ish "The Gilded Gulf" | bizjet | 470 | 130 / 140 | long runway needed, very smooth | 0.8 |
| `dash8` | Dash 8 "Commoner Shuttle" | airliner | 270 | 110 / 120 | AI-only at first; the plane you most often cut in front of | 0.8 |
| `a320` | Airbus-ish "Peasant Express" | airliner | 450 | 145 / 140 | heavy, wake turbulence flips light planes (Rubber: flips them gleefully) | 0.8 |
| `jumbo` | 747-ish "Royal Jumbo" | airliner | 490 | 160 / 150 | needs the full 1400 m, barely; wake is catastrophic | 0.8 |
| `autogyro` | Autogyro "Spinning Jenny" | silly | 70 | 30 / 35 | lands almost vertically, can't hover | 1.4 |
| `bathtub` | Royal Flying Bathtub | silly | 60 | 40 / 45 | clawfoot tub, propeller on the taps, rubber duck co-pilot, wobbles in roll; unlocks at story end | 1.6 |
| `throne` | Flying Throne "Divine Right" | silly | 90 | 50 / 55 | Emperor-only; a gilded throne with a jet pack; handles like a shopping trolley | 1.5 |
| `balloon` | Hot-air balloon "Hot Air" (not a plane) | silly | 15 | — / — | altitude only, drifts with wind; online Royal Decree only; landing anywhere counts | 2.0 |

Cockpits (answers the brief's question): one **high-quality generic GA cockpit** reused across light/utility/sea, plus
bespoke cockpits only for the ones that sell the joke (bathtub, throne, open biplane). Jets and airliners get a generic
glass cockpit. That's 4–5 cockpits total rather than 22.

---

## 5. Radio and bark system

### 5.1 Principles

* Every audible line is a **pre-generated clip** per voice (Qwen3-TTS). Nothing is synthesised at runtime.
* **One radio channel**, half-duplex like real radio: one clip plays at a time. Short squelch click + 80 ms radio
  band-pass/crackle wraps every clip (makes splices invisible, §5.4).
* **Priority queue:** tower (priority 3) > player (2) > other humans (2) > AI pilots (1). A queued clip older than
  **3 s** is dropped (stale banter is worse than none), except tower clearances, which wait up to 8 s.
* **Subtitles** always show the line with the speaker's **real name and title** (the audio doesn't need it).
* Global AI chatter budget: at most one AI pilot bark every **6 s** (busy) / **10 s** (light), so the radio is lively
  but never a wall.

### 5.2 Pilot bark intents

15 intents. Every pilot voice has 2–3 variants of each; a variant is picked at random excluding the last one used by
that voice.

| intent | used by | trigger | target |
|---|---|---|---|
| `greeting` | AI + player | first radio call of a sortie (start taxi) | tower |
| `req_takeoff` | AI + player | arriving at the hold line | tower |
| `req_land` | AI + player | joining the pattern / entering 5 km | tower |
| `takeoff` | AI + player | rotation (Vr) | all |
| `cut_in` | AI + player | after `cut_in_final` / `runway_steal` committed by speaker | victim |
| `queue_jump` | AI + player | after `queue_jump` / `unauth_takeoff` | all |
| `apology` | player (response) | apology-not-apology after a scold | tower |
| `insult` | AI + player | victim of a crime / random banter vs rival | pilot |
| `retort` | AI + player (response) | someone insulted you | pilot |
| `complain` | AI + player | you were the victim (cut in, sent round) | tower |
| `priority` | AI + player | "do you know who I am" — demand priority | tower |
| `near_miss` | AI + player | near-miss involving speaker | the other |
| `landing_brag` | AI + player | banked landing (esp. after infractions) | all |
| `go_around` | AI + player | speaker forced to go around | all |
| `bump` | AI + player | collision/bounce involving speaker | all |

**AI pilots** fire intents automatically (probability per trigger: victim-complaints 60 %, insults 35 %, routine
requests 100 % but suppressed under the chatter budget). Rival-family AI planes insult the player at 70 %.

### 5.3 The player's bark picker

The player never types. A **bark tray** offers 3–4 chips. Each chip = an intent shown as a short label + icon; the
exact variant line is chosen at play time (so the chip label is stable and the result is a surprise).

**Initiate windows** (always available, context-sorted; tray shows the 4 most relevant, cooldown 6 s per bark,
same intent 15 s):

| context | chips offered |
|---|---|
| at stand / taxiing | Greeting · Do you know who I am · Insult nearest pilot |
| at hold line | Request takeoff · Queue-jump boast · Do you know who I am · Insult the queue |
| airborne, pattern | Request landing · Insult nearest pilot · Do you know who I am |
| just committed a crime | Boast (cut_in / queue_jump) · Apology-not-apology · Insult the victim |
| after landing | Landing brag · Insult nearest · Greeting |

**Response windows** (a chip set slides up with a **5 s** draining ring; the tray pulses; ignoring it is fine):

| someone just… | chips | bonus |
|---|---|---|
| tower scolded you | Apology-not-apology · Do you know who I am · Complain · (silence) | +40 Riposte; `priority` +60 / +5 outrage |
| a pilot insulted you | Retort · Insult back · Complain to tower | +40 Riposte (+80 if within 2 s) |
| you were cut in on / sent round | Complain · Insult · Go-around grumble | +40 |
| near miss | Near-miss reaction · Insult · Apology | +40 |
| Crown changed to you (online) | Landing brag · Insult the room | +40 |

Online: barks aimed at a player give *that* player a response window (rate-limited: max one inbound window per 8 s per
player). Barks are sent as `{voice, intent, variantIndex, target}` — 4 small values, every client plays the same clip.

### 5.4 Names on the radio: the callsign splice (decision)

Player names can't be pre-generated. Options considered:

1. **Generic address only** ("Your Grace", "Baron") — safe but the tower can't distinguish 8 Barons online.
2. **Registration phonetics** ("Kilo Delta India Romeo Kilo") — authentic but slow (3 s of callsign before every line)
   and joyless.
3. **Title + two-digit flight number, spliced** — e.g. **"Baroness Four-Two"**. Chosen.

Why 3: it's real-ATC-shaped (airline callsigns are word + number), the title *is* the joke and it updates as you rank
up, numbers make it unique per room (2-digit numbers 11–99, unique in the room, never ending in 0, assigned by the room server), and the splice set is tiny.
Each tower voice pre-generates:
* **23 title words** (10 ranks × m/f, plus `Majesty`/`Highness`/`Grace` for Court addresses where funnier) — clip ids
  `cs_title_<word>`;
* **digits** `zero one two three four five six seven eight niner` — clip ids `cs_digit_<n>`;
* **runway suffixes** "runway two seven / zero niner / two two / zero four" — `rwy_27` etc.

A tower line with `"callsign": "pre"` plays `[title][digit][digit]` then the body; with `"rwy": "post"` it appends the
active runway clip. The 80 ms crackle and a 40 ms crossfade hide the joins; titles are generated with a trailing
level intonation ("Baroness…") and digits in a flat list intonation (the VOICE lane should generate digits as one
read of "four, two, seven…" and cut, not as isolated words).

Pilot barks never say names; they address people by attitude ("you there", "darlin'", "old bean"), and the subtitle
shows who was meant: **"Lord Rupert → Baroness Dirk: Do move, old bean."** The player's typed name appears on the plane,
leaderboard, subtitles and Herald headlines — everywhere except audio.

Tower lines without `callsign` are broadcasts ("All stations…") or follow a callsign already spoken in the same
exchange (a scold right after a clearance).

### 5.5 Tower lines

Two families:

* **Routine** (`tier` absent) — real-ish phraseology with a twist of weariness: `taxi`, `hold_short`, `lineup`,
  `clear_takeoff`, `clear_land`, `go_around`, `traffic`, `sequence_1..4`, `extend`, `vacate`, `welcome`,
  `impeccable` (the rare compliment), `crown_change`, `scandal`.
* **Scolds** (`tier` 1–4) — per infraction group: `scold_queue`, `scold_takeoff`, `scold_cut`, `scold_runway`,
  `scold_landing` (taxiway/grass/apron/closed/wrong way), `scold_buzz`, `scold_near_miss`, `scold_bump`,
  `scold_generic`, and `reply_priority` (tower answering "do you know who I am"). Tier = current outrage tier at the
  moment the line fires.

**Timing:** infraction → tower scold after **0.6–1.2 s** (reaction delay, feels live), then the player's response
window opens as soon as the scold finishes. A second infraction within 4 s replaces the pending scold with the newer,
higher-tier one rather than stacking.

`tower_trainee` (Toby) is used for missions and as the "night shift" in Free Flight; his tiers are panic levels rather
than anger (tier 4 = he's hiding under the desk).

### 5.6 Clip budget (actual counts in script.json)

| set | per voice | voices | clips |
|---|---|---|---|
| pilot barks (15 intents: 3 variants of cut_in/insult/retort, 2 of the rest) | 33 | 15 | 495 |
| tower routine (17 intents) + scolds (10 groups × 4 tiers) | 74 | 3 | 222 |
| splice clips (23 titles, 10 digits, 4 runways) | 37 | 3 | 111 |
| picker sample (`data/voices.json`) | 1 | 18 | 18 |
| **total** | | | **846** |

At ~2.5 s average, Opus mono 24 kbps ≈ 7.5 KB/clip → ~6.5 MB total. Load per session only the player's voice, the
voices in use, and the active tower (≈ 1 MB). Suggested path: `audio/voices/<voice>/<id>.ogg` (or `.m4a` for iOS
fallback — VOICE lane's call), indexed by the `id` in script.json (`<voice>.<intent>.<n>`, scolds `<voice>.<group>.t<tier>`).

Tower scold tiers 1–2 carry `callsign: "pre"`; tiers 3–4 deliberately don't (a controller who has lost it stops using
callsigns). Lines are capped at 4.5 s by the generator's estimate (words / 2.9 + 0.6 s).

---

## 6. HUD and UX: bark picker, radio log, subtitles

**Bark tray**
* A single **radio button** (🎙 icon, 56 px) docked bottom-centre-ish where thumbs don't fly: portrait = bottom centre,
  above the throttle strip; landscape = right edge, vertically centred between the stick and the top-right view /
  fullscreen buttons.
* Tapping it opens the tray: 3–4 chips, each ≥ 48 px tall, max 18 characters + icon ("📢 Do you know who I am?" is
  allowed to wrap to two lines). Portrait: chips stack as a 2×2 grid above the button. Landscape: a vertical column
  of 4 chips to the left of the button (so the right thumb reaches them without leaving the stick side).
* Response windows auto-open the tray with the countdown ring around the radio button and a soft chime; it auto-closes
  at 0 s. Choosing a chip closes it. The tray never blocks the flight controls: it has `pointer-events` only on chips,
  and flying input under the tray area is not captured by it.
* The autopilot keeps flying while the tray is open, so barking never costs control (unless you were overriding:
  then override continues on the other thumb).
* Desktop: keys **1–4** pick chips, **R** opens the tray.

**Subtitles / radio log**
* The current line shows as a subtitle pill at the top-centre (portrait: below the PP/combo bar; landscape: top
  centre between HUD clusters): speaker colour dot (their company primary colour), `Title Name → Target:` in small
  caps, line text, max 2 lines, 3.5 s or clip length + 0.8 s.
* Tower lines use a fixed slate-blue pill with a tiny tower icon; the outrage tier tints it (1 none, 2 amber edge,
  3 orange, 4 red with a 2 px shake).
* **Radio log**: swipe down on the subtitle pill (or press **L**) to expand the last 20 lines, scrollable, semi-
  transparent, auto-collapses after 6 s idle. In Settings: subtitles on/off, radio volume, chatter density
  (quiet / normal / chatty → AI budget 12 s / 6 s / 3 s).

**PP and outrage**
* Top-left: Pending PP (gold, ticking), Banked PP (white, small), combo ring. Infraction toasts slide in under it
  ("CUT IN +450 ×1.5"), max 2 visible.
* Top-right (below view toggle): the Outrage meter as a small tower icon filling from green to red; tier changes pop
  the icon. Partial mode adds the yellow rubber-duck protection pill beside it.
* Online: a compact Court ladder (top 3 + you) under the PP readout; the Crown holder's row has the crown.

---

## 7. Open questions for Aaron

1. **Callsigns:** OK with "Baroness Four-Two" style spliced title-and-number callsigns on the tower radio, with your
   typed name shown in subtitles/on the plane only (never spoken)?
2. **Rank thresholds:** Viscount in ~15 minutes and Emperor at ~30 hours of play — about right, or should Emperor be
   much rarer (or reachable only by holding the Crown online)?
3. **Online Court:** does the room leader becoming "King/Queen" (and Emperor if they double 2nd place) match what you
   meant by "the person with most points gets to rank"?


## Manager notes
- Circuits: layout.js CIRCUIT is authoritative (09 R, 27 L, 04 R, 22 L — all south/east of the field); §1.1's handedness is superseded.
- Departures release when arrivals are > 2.2 km out (js/atc/rules.js), not 3 km.
- ATC also emits unauth_landing and runway_incursion (0 PP, outrage only, for now).

## Aaron's rulings override this document
See docs/DECISIONS.md (D2: Emperor gated on 10 online wins as well as points; D3: unlocked titles selectable in Settings).
