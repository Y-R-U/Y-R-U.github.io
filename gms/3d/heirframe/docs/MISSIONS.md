# HEIRFRAME — Mission Generator (planner-owned)

Status: v1, 2026-09-26. **Audience:** systems (`js/sim/missions.js`, `js/data/missions.js`) and world (sites). Everything is deterministic from a seeded RNG. There are no three.js imports.

`L(lvl) = 1.09^(lvl-1)` throughout (ECONOMY §1).

---

## 1. The mission object (output of the generator)

```js
{
  id: 'c_000123',            // board-unique
  seed: 918273,              // seeds the in-mission spawns
  archetype: 'courier',
  grade: 'street',           // street | pro | elite | black | story
  threat: 'tense',
  district: 'aurum_plaza',
  level: 4,                  // mission level (enemy level, item level)
  title: 'Moon Cheese, Handle With Care',
  blurb: 'Oriel Pask of Pask & Daughters needs a crate of artisanal moon cheese taken to the Fountain Terrace. Quietly.',
  client: { name:'Oriel Pask', org:'Pask & Daughters', faction:'nexus', portrait:{kind:'civ_gold', seed:77} },
  target: null | { name, epithet, kind, faction, rank, seed },
  steps: [ {type:'goto', site:'s_locker_03'}, {type:'pickup', item:'crate'}, ... ],
  modifiers: ['timed'],
  timeLimit: 234,            // seconds or null
  parTime: 180,
  twist: null | { id:'T4', atStep:2 },  // hidden from the card
  enemies: [ {pack:'syndicate_street', atStep:2, site:'s_alley_02', budget:7} ],
  payout: { credits: 210, xp: 95, rep: {nexus:+4, syndicate:-2}, cache:'tuned+' },
  bonuses: ['stealth','flawless','speed','clean']
}
```

## 2. Step vocabulary (the engine implements each step type once)

| step | params | complete when | engine notes |
|---|---|---|---|
| `goto` | site, radius=4 | player within radius | marker plus off-screen arrow |
| `pickup` | item (`parcel`/`crate`/`case`/`data`/`hostage`) | interact 1 s | `crate` = heavy: −25% move, no dodge or attack while carried; tap Drop to put it down |
| `deliver` | site | interact at site with the item | |
| `kill` | target ref, or `all` (the zone's hostiles) | target(s) dead | named target: boss-bar HUD |
| `killCount` | n, faction | n kills | |
| `destroy` | objs: [{site, kind:'generator'|'relay'|'crane_motor'|'billboard_node'|'nest'}] | all destroyed | objects have HP = 40 × L × 3 |
| `hack` | site(s), time=4 s (Ghost 2 s) | hold interact; progress pauses while damaged | a sequence of 1–4 terminals |
| `photo` | target, shots=1–3, holdTime=2.5 s | target in "lens" (≤ 14 m, line of sight, target not alerted) for holdTime per shot | a lens reticle UI; the camera button replaces Attack |
| `tail` | target, minD=5, maxD=22, duration 90–150 s | survive the duration without being spotted and without being > maxD for 8 s | a distance band HUD |
| `escort` | npc, path:[sites] | NPC reaches the end alive | NPC walks at 3 m/s and stops when enemies are within 8 m |
| `defend` | site, waves, duration | timer ends and the object survives | the object has HP; waves come from 2–3 spawn sites |
| `race` | checkpoints:[sites], par | all checkpoints in order | rivals optional |
| `capture` | target | target < 20% HP, then interact 1.5 s | the target is knocked down, not killed |
| `exfil` | site | reach site | often paired with Heat |
| `choose` | options:[{label, outcome}] | UI choice | used by twists (dialogue panel) |
| `survive` | seconds | timer ends | twist ambushes |

## 3. Site tags (the world agent provides these)

The world exposes `world.sites = [{id, tag, x, z, r, indoor?:bool, district}]`. The generator picks sites by tag and prefers a **distance of 40–120 m** between consecutive `goto` steps.

| tag | description | district presence (P1 = Aurum Plaza) |
|---|---|---|
| `plaza` | open paved area | plaza, boulevard |
| `fountain` | waterfall or fountain terrace | plaza, terraces |
| `park` | trees, grass, benches | plaza (P1: one planter park), terraces |
| `market` | kiosks and stalls | plaza, boulevard, stacks |
| `locker` | Nexus parcel lockers (pickups and drops) | every surface district (P1: 3+) |
| `alley` | narrow service lane, dumpsters | plaza, boulevard, stacks |
| `rooftop` | raised ledge or terrace reached by stairs or ramp | plaza (P1: 2+ upper terraces), boulevard |
| `warehouse` | loading bay, crates | plaza (P1: one service yard), portside |
| `lobby` | building entrance or atrium | boulevard, arcology |
| `interior` | office floor, lab, server hall | arcology |
| `vault` | secure room | arcology, portside |
| `dock` | quay edge, cranes | portside |
| `pad` | landing pad | portside, hull |
| `garden` | memorial garden | terraces |
| `pods` | pod rows | stacks |
| `catwalk` | machinery walkway over a drop | spine |
| `hull` | exterior plating | hullside, meridian |
| `spawn_edge` | where enemy waves enter | all |
| `relay` | Transit Relay kiosk | all |

**P1 minimum (Aurum Plaza):** 3 lockers, 2 alleys, 2 rooftops, 1 warehouse, 1 park, 2 fountains, 1 market, 1 relay, and 4 spawn_edges.

## 4. Archetypes

`pay` and `xp` multiply the base formula (§7). `combat` scales the enemy budget. `grades` lists which board grades can roll the archetype. **P1** marks the P1 subset.

| id | name | unlock lvl | grades | pay | xp | combat | par s | steps template | typical sites |
|---|---|---|---|---|---|---|---|---|---|
| `courier` **P1** | Courier | 1 | S P E B | 1.0 | 1.0 | 0.6 | 180 | goto(A:locker) → pickup(parcel) → goto(B) → deliver(B) · ambush 40% between A and B | locker, plaza, market, rooftop |
| `pest` **P1** | Pest Control | 1 | S P | 0.9 | 1.1 | 1.3 | 150 | goto(zone) → kill(all Scrap) → destroy(nest) | alley, warehouse, park |
| `retrieve` **P1** | Retrieval | 1 | S P E | 1.1 | 1.0 | 1.0 | 200 | goto(A:guarded) → kill or sneak → pickup(case) → deliver(client site) | warehouse, alley, rooftop, vault |
| `surveil` **P1** | Surveillance | 2 | S P E B | 1.1 | 1.0 | 0.5 | 200 | goto(area) → photo(target ×1–3) → exfil | plaza, market, fountain, lobby |
| `bounty` | Bounty | 3 | S P E B | 1.4 | 1.3 | 1.1 | 300 | 3 informant pings (search circle 40 → 25 → 12 m) → kill or capture(target, +30% if captured) | any |
| `escort` | Escort | 3 | S P E | 1.3 | 1.2 | 1.0 | 240 | goto(npc) → escort(npc, 3–4 sites) · 2–3 ambushes | plaza, park, boulevard, dock |
| `sabotage` | Sabotage | 4 | P E B | 1.2 | 1.2 | 1.0 | 240 | goto → destroy(2–4 objs) → exfil | warehouse, dock, rooftop, interior |
| `hack` | Uplink | 4 | S P E B | 1.1 | 1.1 | 0.8 | 220 | hack(2–4 terminals, in order) with interrupt waves | lobby, interior, relay, rooftop |
| `tail` | Shadow | 5 | P E B | 1.2 | 1.1 | 0.3 | 180 | goto → tail(target 90–150 s) → photo(meeting) | boulevard, market, park |
| `infiltrate` | Infiltration | 5 | P E B | 1.3 | 1.2 | 0.7 | 260 | goto(restricted) → hack(bug, 3 s) → exfil · alarm = −50% pay and +1 Heat (fail only with noAlarm) | interior, warehouse, vault |
| `transport` | Heavy Haul | 6 | S P E | 1.2 | 1.1 | 0.9 | 260 | goto → pickup(crate) → goto(B) with 2 ambushes → deliver | warehouse, dock, market |
| `defend` | Hold the Line | 6 | S P E | 1.2 | 1.3 | 1.5 | 150 | goto → defend(object, 3–5 waves, 90–150 s) | market, fountain, dock, pods |
| `repo` | Repossession | 6 | S P | 1.0 | 1.0 | 0.8 | 200 | bounty-style search → capture(deadbeat frame) (it flees and blinks) | any; comic clients (HireFrame) |
| `race` | Street Run | 7 | S P | 0.9 | 0.9 | 0.2 | par by route | race(6–10 checkpoints, 2 rival frames) · +50% for 1st place | rooftop, plaza, boulevard |
| `assassinate` | Wetwork | 8 | P E B | 1.5 | 1.4 | 1.2 | 300 | goto → kill(target: vet or elite, plus bodyguards) → exfil · the target flees to a car at 50% HP (30%) | lobby, rooftop, dock, vault |
| `rescue` | Extraction | 9 | P E B | 1.4 | 1.3 | 1.2 | 280 | goto → hack(cuffs 4 s) → escort(hostage) → defend(evac 30 s) | warehouse, interior, pods |
| `heist` | Heist | 12 | P E B | 2.2 | 1.8 | 1.4 | 480 | photo(case the vault) → hack(2) → pickup(case from vault) → exfil (+2 Heat) · checkpoint after each stage | vault, interior, dock |
| `wetwork` | Wetwork, with a Twist | 14 | E B | 1.8 | 1.6 | 1.2 | 320 | same as assassinate, **twist 100%** from the T5/T2/T6/T12 pool | any |

**Archetype weights on board rolls:** courier 14, pest 10, retrieve 10, surveil 8, bounty 9, escort 7, sabotage 7, hack 7, tail 5, infiltrate 6, transport 6, defend 6, repo 4, race 4, assassinate 6, rescue 5, heist 3, wetwork 3. Filter by unlock level and the district's available site tags. **Never roll the same archetype more than twice on one board.**

**Frame-bias rule:** 1 card per board is weighted ×3 toward the archetypes that favour your *current* frame. Brawler: defend, pest, assassinate. Gunner: bounty, escort, sabotage. Ghost: infiltrate, tail, surveil, hack. That card gets a badge: "Suits your Brawler".

## 5. Name tables

### 5.1 Clients (people)
- **First names:** Oriel, Cassia, Benedikt, Ysolde, Marlo, Priya, Tobiah, Vesna, Haruto, Ludmila, Ignatius, Soraya, Dace, Fennimore, Imani, Quill*, Octavia, Rasmus, Juno, Hollis, Anouk, Emeric, Zadie, Corvin, Pell, Isadora, Kasimir, Nia, Thaddeus, Wilhelmina, Bram, Selah, Ottavio, Linnea, Mercer, Saffi, Aurelio, Delphine, Kip, Maren (*excluded: do not use Quill, Vael, Dray, Hale or Okafor for random names)
- **Surnames:** Pask, Everly, Montclair, Oduya, Strand, Kovač, Halvorsen, Ashdown, Merriweather, Tanaka-Bell, Lucento, Brightwater, Farrow, Iyer, Castellane, Quint, Oyelaran, Sorrel, Vantongeren, Whitlock, Delacroix, Mbeki, Rennick, Solberg, Varga, Lindqvist, Achebe, Fontaine, Greaves, Harrow
- **Orgs** (the client's company; faction in brackets): Pask & Daughters Fine Foods [nexus], Lumen Couriers [nexus], Brightwater Estates [concord], Aurelian Insurance [nexus], HireFrame Collections [nexus], Castellane Gallery [concord], Freehaul Local 9 [freehaul], The Silver Table [syndicate], Kovač Salvage [syndicate], Quint Securities [concord], Unity Youth Choir [concord], Sorrel Botanicals [nexus], Pod-Row Mutual Aid [unlinked], Lindqvist Robotics [nexus], The Gilt Lounge [syndicate], Harrow & Achebe Legal [concord], Mbeki Hydroponics [freehaul], No-Name Friend [unlinked], "A Concerned Citizen" [concord], Merriweather Moving Co. [freehaul]

### 5.2 Targets
- **Robot designations:** `{A-Z}{A-Z}-{10-99}` plus a nickname. Nicknames: Tinsel, Buckle, Gristle, Lamplight, Sprocket, Velvet, Harpy, Doorstop, Jubilee, Nines, Halo, Crowbar, Gossamer, Marrow, Pewter, Sundae, Brass Tacks, Mister Polish, Whisper, Tuesday, Kingfisher, Rattle, Solace, Glint, Two-Step.
- **Human-rider names:** reuse the client tables.
- **Epithets** (for bounty, assassinate and wetwork): the Smiling, Knuckles, of the Silver Table, Twice-Wrecked, the Accountant, Slick, the Choirboy, Gilt-Tooth, the Landlord, No-Face, Seven Pods, the Undertaker, Glass Jaw, the Auditor, Uncle, the Poet, Cold Coffee, Last Call.
- **Gangs** (Syndicate crews by district): Plaza: *The Gilt Grins* · Boulevard: *Neon Saints* · Terraces: *Greenhouse Boys* · Arcology: *Floor Thirteen* · Portside: *Silverhand Dockers* · Stacks: *Pod Wolves* · Spine: *Rust Choir* (Scrap cult).

### 5.3 Cargo and objects
- **Parcels:** a crate of artisanal moon cheese · a wedding ring that isn't paid for · 3 kg of vintage vinyl · a sealed Concord ballot box · a cat (it's a robot cat, it's fine) · a data slate marked DO NOT READ · a replacement heart valve · a frame's severed hand (still twitching) · a box of Renewal Day fireworks · an urn · a ukulele · 40 counterfeit Harmony plushies · a very angry bonsai · someone's grandmother's recipe cards · a prototype optics lens · coolant (leaking) · a love letter, handwritten (antique) · Kettle's lunch
- **Case items (retrieve and heist):** a Nexus prototype core · a Voice's signet · ledger shards · a stolen frame licence · a memory shard · an evidence locker drive · a crate of Outer Farms seed (Act 3+)
- **Sabotage objects:** generator, relay, crane_motor, billboard_node, nest, turret_array, pump.

### 5.4 Story-driven table additions (unlocked by story flags)

| flag | adds |
|---|---|
| R1 | clients: "A Concerned Citizen" posts bounties on *you*. There is a 10% chance an ambush pack is a Concord "Unperson Sweep" (Wardens hunting Vaels) |
| R2 | targets: "Voice agent" (civ_gold, armed, elite rank) · the org "Office of the Chair" |
| A3 done | clients: the Unlinked (No-Name Friend, Pod-Row Mutual Aid) post ×2 as often; Mara's own cards are "Quill Specials" (+10% pay, Unlinked rep) |
| R5 | Hullside district contracts; the cargo "vacuum-sealed", the object "hull clamp" |
| finale | Landfall contracts: the orgs "Landfall Survey Corps" and "First Settlers' Co-op"; targets: escaped Voices (the rotating boss) |

### 5.5 Title templates (by archetype; `{}` slots filled from the tables)
- courier: "{Parcel}, Handle With Care" · "Special Delivery for {Surname}" · "No Questions, Just Legs" · "Before the Ice Melts"
- pest: "Something's Chewing the Cables" · "Rats in the {Site}" · "Nest Eviction"
- retrieve: "Lost & Found: {CaseItem}" · "Borrowed Without Asking" · "Get It Back"
- surveil: "Smile for the Camera" · "Who's {Surname} Meeting?" · "Candid Shots"
- bounty: "{Nickname} {Epithet}" · "Wanted: {Name}" · "Dead or (Preferably) Alive"
- escort: "Walk {First} Home" · "A Very Important Stroll" · "Bodyguard for Hire"
- sabotage: "Lights Out at the {Site}" · "Accidents Happen" · "Industrial Relations"
- hack: "Plug In, Plug Out" · "Signal Boost" · "Borrowed Bandwidth"
- tail: "Where Does {First} Go?" · "Two Steps Behind" · "Footnotes"
- infiltrate: "Floor {10–99}, After Hours" · "Leave No Fingerprints" · "A Bug in the System"
- transport: "Heavy Is the Crate" · "Lift With Your Legs" · "Freehaul Overflow"
- defend: "Hold the {Site}" · "Nobody Touches the {Object}" · "Last Stand at the Kiosk"
- repo: "HireFrame Wants Its Frame Back" · "Overdue Rental" · "Late Fees Apply"
- race: "Rooftop Sprint" · "Beat the Tram" · "Checkpoint Charlie"
- assassinate: "Retire {Nickname}" · "An Early Retirement" · "Quiet Exit"
- rescue: "Get {First} Out" · "Extraction at {Site}" · "Ransom Declined"
- heist: "The {Surname} Job" · "Vault of the {Org}" · "Thirteen Minutes"
- wetwork: "Simple Job" · "Nothing Personal" · "Easy Money" (the joke is that they never are)

**Blurb template per archetype:** `"{client} {needs_verb} {object_phrase} {place_phrase}. {tagline}"`. The taglines come from a 20-entry pool: "Quietly." · "No questions." · "Don't be a hero." · "Try not to break the fountain again." · "Harmony isn't watching. Probably." · "Paid on delivery." · "Tip included (maybe)." · "Mind the Wardens." · "Discretion is the whole job." · "Bring it back in one piece." · "It's not what it looks like." · "Tell no one. Especially Mara." · "Time is money; you are both." · "Rain or shine." · "Keep it clean." · "Do not open the box." · "The client insists." · "You didn't hear this from me." · "Smile, you're on a job." · "For a brighter future!"

## 6. Modifiers

Roll count: Street 0–1 (40% chance of 1) · Pro 1 · Elite 1–2 · Black 2. No conflicting pairs (such as noAlarm with defend).

| id | label | effect | pay + | allowed archetypes | unlock |
|---|---|---|---|---|---|
| `timed` **P1** | Timed | time limit = par × 1.3 | +15% | all except defend, tail | 1 |
| `noAlarm` **P1** | Ghost Job | fail if an alarm is raised | +30% | courier, retrieve, surveil, infiltrate, heist, tail, hack | 2 |
| `elitePack` **P1** | Hired Muscle | +1 elite pack | +25% | combat ≥ 0.8 | 3 |
| `fragile` | Fragile | the carried item breaks after 3 hits taken while carrying | +15% | courier, transport, retrieve | 3 |
| `watched` | Watched | extra Warden Eyes; being spotted = +1 Heat | +15% | all | 5 |
| `jammed` | Jammer Field | skills cost +50% energy | +20% | all | 8 |
| `reinforced` | Reinforcements | +1 wave or ambush | +20% | combat ≥ 0.8 | 6 |
| `collateral` | Glass House | prop damage penalty ×2 | +10% | all | 4 |
| `noSwap` | Locked Link | no frame swap | +5% | all | 10 |
| `broadcast` | Live on Harmony | Heat +1 on completion; +10 rep with the client's rivals' enemies | +25% | assassinate, sabotage, heist, bounty | 12 |
| `night` | After Dark | night lighting; detection range −35% | +10% | all | P4 (needs day/night) |
| `rain` | Rain | detection −20%; visibility | +10% | all | P4 (weather) |
| `vip` | Crowded | more civilians; props everywhere | +10% | all | 3 |

**Bonuses** (always evaluated, credits only, added together): stealth +25% (no alarm) · flawless +15% (no HP lost) · speed +10% (under par) · clean +10% (zero collateral).

## 7. Formulas

```
missionLevel = clamp(riderLvl + threat.lvlOff + floor(danger/2) + gradeOff + randInt(-1,0),
                     district.minLvl, district.maxLvl + 5),  min 1
   gradeOff: street 0, pro +1, elite +2, black +3; story missions use their gate level + threat.lvlOff

credits = round5( 120 × L(missionLevel) × arch.pay × grade.pay × threat.credits
                  × (1 + Σmods.pay) × repMul(clientFaction) × (1 + player.creditsAffix) )
   grade.pay: street 1.0, pro 1.6, elite 2.6, black 4.0, story 2.0
   repMul: wary 0.9, neutral 1.0, friendly 1.05, trusted 1.10, honored 1.20
   final credits × (1 + Σbonuses) at completion; rental: −10% Limited Warranty surcharge

xp      = round( 70 × L(missionLevel) × arch.xp × grade.xp × threat.xp )
   grade.xp: street 1.0, pro 1.3, elite 1.8, black 2.2, story 2.5
   over-level penalty: × clamp(1 − 0.1 × (riderLvl − missionLevel − 2), 0.1, 1)

rep     = client +3..+8 (by grade 3/5/7/8); target faction −4..−10; rivals ±half

enemy budget = min(24, (6 + 0.25 × missionLevel)) × arch.combat × grade.combat(1, 1.2, 1.4, 1.6)
   point costs: grunt 1 · veteran 2.5 · elite 6 · champion 12 (elite grade adds one champion "target")
   packs of 2–6 points each, placed at the archetype's ambush steps or guard sites
   veteran chance per unit = 10% + 1% × missionLevel (cap 40%)
   elite pack chance       = 4% + 1.5% × danger (+5% pro, +10% black)

twist chance = min(0.30, 0.10 + 0.005 × riderLvl) + (black ? 0.20 : 0) ; wetwork = 1.0 ; story = 0
   first 3 contracts ever: 0 (onboarding), 4th contract: forced T10 (a pleasant twist)

cache (end-of-mission guaranteed item): street tuned+ · pro custom+ · elite custom+ (25% prototype)
   · black custom+ (40% prototype, 5% relic) · story custom+ (plus the story item)
```

**Enemy faction by archetype and client:** the pack's faction is the *target* faction. It is chosen from the district's enemy pool (§9), excluding the client's own faction. Pest control always uses Scrap.

## 8. Twists ("the client lied")

A twist is picked from the pool allowed for the archetype, fires at the listed step, and shows a HUD sting ("TWIST — …") plus a Mara or HIRA comm line.

| id | name | fires | effect | archetypes | P1 |
|---|---|---|---|---|---|
| T1 | Double-Cross | at deliver | the recipient's crew ambushes you (1 elite + 4 grunts); on survival, loot the recipient's case: pay × 1.5 | courier, transport, retrieve, rescue | ✓ |
| T2 | Wrong Target | at kill or photo | the target was a decoy; the real one flees to a new site 60–100 m away | surveil, assassinate, bounty, wetwork | |
| T3 | Rival Crew | at mission start | a mirror rider crew (2 frames, your archetypes) goes for the objective; beat them to it | retrieve, heist, race, sabotage | |
| T4 | It's Ticking | 30 s after pickup | the parcel is a bomb: 30 s timer; dump it in water (fountain site) or at a disposal chute; +40% pay | courier | ✓ |
| T5 | The Innocent | at kill | the target is a pod-rider being framed. `choose`: kill (full pay, −8 Unlinked) or fake it (interact to plant proof; 60% pay, +10 Unlinked, and a 30% chance of a later gift contract with a Prototype cache) | assassinate, wetwork, bounty | |
| T6 | Fall Guy | at the final step | the client tips off the Wardens: Heat +2 and survive(45 s) or exfil; pay × 2 through a Syndicate fence (−5 client rep) | heist, infiltrate, sabotage, wetwork | |
| T7 | Stowaway | at pickup | the crate holds a person; the mission becomes `escort` to a safe site; +30% | transport, courier | |
| T8 | Upgraded | at the first combat | the target's bodyguard is a champion | assassinate, bounty, rescue | |
| T9 | Stiffed | at payout | the client refuses to pay; auto-adds a "Collect" bounty card on the client's goon at the top of the board (pay × 1.6) | any non-story | |
| T10 | Harmony Watching | at a random goto | a billboard glitches toward you and drops a lore Echo clue (or 3× credits if none are left) | any | ✓ |
| T11 | Double Booking | at mid-mission | a second client calls: `choose` which side (defend or sabotage the same object) | defend, sabotage | |
| T12 | Loose Tongue | when the target is below 30% HP | the target offers a bribe: `choose`: take 80% of pay now (mission fails, −5 client rep) or finish the job | assassinate, wetwork, bounty | |

## 9. District enemy pools (faction → packs)

| district | factions (weight) | pack examples |
|---|---|---|
| aurum_plaza | syndicate 5, scrap 4, concord 1 (Heat only) | `syndicate_street`: Knuckle × 2–3 + Popper × 1–2 · `scrap_swarm`: Scrap Rat × 4–8 · `warden_patrol`: Warden Eye + Warden × 2 (level 8+) |
| brightline | syndicate 5, concord 3, scrap 2 | adds `chromehead_duo` |
| terraces | scrap 3, syndicate 3, concord 4 | `sweeper_squad`: Warden × 3 + Eye |
| arcology | concord 6, syndicate 2, turret | `security_floor`: Warden × 2 + Sentry Turret × 2 + Enforcer (level 14+) |
| portside | syndicate 6, freehaul 0 (never), concord 2, unlinked 2 (contract-dependent) | `dockers`: Chromehead + Popper × 3 |
| stacks | scrap (rustkin) 6, syndicate 2, concord 2 | `rust_pack`: Rustkin × 3 → a Hulk merge |
| spine | scrap (wights) 7, concord 3 | `wight_crawl`: Hull Wight × 4 + a Keeper at 30+ |
| hullside / meridian | scrap 5, choir 5 | `choir_trine`: Choir Angel × 3 |
| helm / landfall | concord voices 6, choir 4 | `gilded_court`: Gilded Guard × 2 + a Sovereign Construct |

## 10. Board generation algorithm

```
board(shiftIndex):
  rng = seeded(hash(save.seed, shiftIndex))
  slots = 6 (+1 at lvl 10, +1 at lvl 20)
  if storyReady: pin STORY card (not counted in slots)
  grades: slot 0..1 street; 2..3 street or pro (pro if lvl ≥ 5); 4 pro or elite (elite if lvl ≥ 15);
          5 street; extra slots are random; if Heat ≥ 3, turn one slot into black
  districts: 60% the current district, 40% other unlocked districts (weighted to newest)
  for each slot: archetype = weighted pick (§4 filters, the frame-bias card, max 2 of each)
                 → level (§7) → sites (§3) → steps (template) → enemies (budget)
                 → modifiers (§6) → twist (§8, hidden) → names (§5) → title and blurb → payout (§7)
  reroll: new shift sub-seed, costs 25 × L(riderLvl) cr
```

**Acceptance (the systems sim test):** generate 10,000 boards across levels 1–60. No card may lack sites or have an invalid step. Payouts at level 1 Street Tense must fall between 90 and 250 cr. The median pro payout must be about 1.6× the median street payout (±15%). Every archetype must appear at least once in 200 boards at level 20.
