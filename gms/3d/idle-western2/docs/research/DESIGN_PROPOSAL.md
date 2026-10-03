# Idle Western 2: design proposal (P0-A)

Lead designer's proposal. It is opinionated on purpose, so the P0b challenger has something firm to attack.
It reuses everything Idle Life 2 proved: the line model, the R1 pile/σ rulings, the tap cap, walk-ins, return harvest, the permit-contract gate, the scrolling hero, 57vh cards, hold-to-look, per-view scheduling and warm-up. **Where this doc says nothing, the IL2 rule stands.**
The changes are three: the theme, **construction**, and the **life system swapped for a hat-and-infamy system**.

---

## 0. One line and pillars

**You get thrown out of the saloon face-first into the mud. Ninety minutes later you own half the town, wear a hat the size of a wagon wheel, and fake your own death to do it all again.**

Pillars:
1. **Every number has a body.** This is IL2's pillar, and here it is usually a body flying through saloon doors.
2. **One street.** The whole game is one main street that grows. The hero view is the street, and the cards are its buildings.
3. **Built, not bought.** You watch new businesses go up, plank by plank. Owning more of the town is something you see.
4. **Never punish.** Every event is an opportunity. A missed duel still pays something. Nothing is ever taken away.
5. **Every joke is a mechanic, and every mechanic gets a joke.** If a system has no gag, cut it or find one. If a gag has no system, it plays as ambient flavour in the hero view.

IL2's pillar 6 ("life outranks business") becomes **"spectacle outranks the tour"**. When something fires (a construction stage, a duel, an ejection, a robbery or a hat promotion), the director cuts to it, even while the view is pinned.

---

## 1. Tone and comedy bible

**Register:** a Looney Tunes Western with a pub-quiz mouth. The tone is cheeky, rude and slapstick. It is M15+ through innuendo, drunkenness, cowardice and greed, never through explicitness.

| Allowed | Banned |
|---|---|
| Innuendo and double entendres (the Velvet Garter writes itself) | Nudity, undressing beyond period can-can bloomers, any sexual act on screen or in text |
| Slapstick violence: hats shot off, people flung through doors, trough dunks, cartoon slumps with the tongue out, dust puffs | Blood, gore, suffering, guns pointed at the player's face |
| Drunks, hangovers, spittoons, horse dung, bathwater | Slurs, ethnic caricature, a "Natives" or "Mexicans" gag of any kind |
| Greed, cowardice, vanity, petty crime, fake deaths | Real swearing. Use Western euphemisms ("sufferin' sidewinders", "horse-apples", "son of a biscuit") |
| Rude barks aimed at the player and at each other | The child character (Lil' Nubbin) anywhere near the Garter or its jokes |

**Death is a joke, never a loss.** Duel losers slump theatrically, Mortimer measures them, and two seconds later they are back in the crowd with a bandage, sometimes in the next duel. Boot Hill fills up with headstones whose epitaphs are punchlines.

**"Sunday School" setting** (off by default, one toggle): the Garter becomes "The Velvet Garter Dance Hall" with neutral copy, and the ~15 rudest barks are swapped for clean alternates. It is cheap, and it lets Aaron share the game with anyone.

### 1.1 Running gags
1. **The swinging doors.** Someone gets thrown out of the Thirsty Gizzard about every 40 s, forever. The thrown body is different each time (the dentist, the sheriff, a goat, once in a long while the piano player still playing). The game opens with **you** being thrown out.
2. **Pickles is always somewhere new.** The town drunk wakes up in the horse trough, on a roof, inside a coffin, in the bank vault, in the jail (by choice). Spotting him is a hidden achievement ladder (10 locations).
3. **The coward sheriff's barrel.** Any danger makes Sheriff Wendell dive into the nearest barrel. The barrel then walks away on legs.
4. **Mortimer's tape measure.** The undertaker measures everyone who walks past, including the player, kids and horses, and says their height aloud with obvious joy.
5. **Pomfrey's hat.** The rival's hat is so big it needs two men to carry the brim. Your hat catches up as you own more of the town (§1.3).
6. **"Water changed Tuesdays."** The bathhouse's water is carted to the saloon as "house beer". This is a real synergy (§2.3).
7. **Black Bart never gets away.** The robber hits a hitching post, a low sign or his own horse. He is always back next week.
8. **Wanted posters of you.** After your first fake death, posters of your past selves cover every wall, and townsfolk squint at your new disguise ("Ain't you...?" "No.").

### 1.2 Recurring characters (the townsfolk)
Every character is a manager or a recurring event actor. Each one is built from the IL2 procedural chibi rig with a Western costume kit and a hat-size parameter.

| Character | Role | Personality / gag |
|---|---|---|
| **Big Mabel Boggs** | Barkeep, Saloon manager | Six-foot-four with forearms like hams. She throws drunks out personally and keeps the doors on a spring she installed "for the distance". |
| **Sheriff Wendell Pryce** | Sheriff, Jail manager | A born coward with a badge as big as a dinner plate. He "deputises" anyone nearby and leaves at once. Hides in barrels. |
| **Mortimer Grimsby** | Undertaker, Boot Hill manager | Cheerful and loves a duel. Sells tickets to funerals. Calls corpses "clients". |
| **Madame Lulu LaRue** | Madam, Velvet Garter manager | Her outrageous French accent slips into Ohio whenever she is surprised. Ruthless businesswoman. Knows everyone's secrets and invoices for them. |
| **Ezekiel "Pickles" McGurk** | Town drunk, Tuppenny Tubs manager | Has never used the baths. A Greek chorus of one: he comments on everything, wrongly. |
| **"Doctor" Cornelius Quackenbush** | Snake-oil man, Elixir manager | His elixirs glow, fizz and sometimes give you a beard. The diploma is from "Harvard (Nebraska)". |
| **"Pliers" Pete Pettigrew** | Barber-dentist-surgeon, Pull & Pray manager | One tool for all three jobs. Collects gold teeth, which are the premium currency (§5.6). |
| **Lil' Nubbin** | Shoeshine kid, Spit & Shine manager | Eight years old and more of a capitalist than you. Rude to adults in a clean way. |
| **Hortense Hoofnagle** | Livery manager | Talks to horses and translates them. The horses are ruder than she is. |
| **Ebenezer Thrupp** | Banker, Bank manager | A miser who counts the same coin twice and faints at robberies. |
| **"Dynamite" Dolores Dunn** | Mine manager | No eyebrows, shouts everything, deaf in both ears. |
| **Conductor Cyrus Clank** | Depot manager | Obsessed with punctuality. Times everything, including duels and kisses. |
| **Colonel Augustus Pomfrey** | Rival tycoon (not a manager) | Owns the other half of the street. Has the biggest hat in the territory, and a sneer to match. |
| **Black Bart Bumbleton** | Recurring outlaw | Incompetent and polite. His getaway horse Horace has more sense than he does. |
| **"Fingers" Fontaine** | Saloon pianist | Never stops playing, even mid-air while being thrown out. The tappable piano is his. |
| **The Mulligan Brothers** | Construction crew | Three identical brothers (Mick, Mick and Other Mick) who build everything. Their hammers are the "tap to hurry" verb. |
| **You, "the Stranger"** | Player character | Silent apart from grunts. Starts with a squashed derby and ends with a Hundred-Gallon hat. Gets a new false moustache every run. |

### 1.3 Hats as a system ("Big Hat Energy")
Hats are the game's status language. Each of the three layers does one job.

**1. Your hat = your share of the town.** The street has 24 frontages: 12 can become yours, 10 are Pomfrey's, and 2 are civic (the church and town hall). Your hat tier follows the businesses you own:

| Lines owned | 0 | 1 | 3 | 5 | 7 | 9 | 11 | 12 ("Half the Town") |
|---|---|---|---|---|---|---|---|---|
| Hat | Squashed Derby | Bowler | Stetson | Ten-Gallon | Twenty-Gallon | Fifty-Gallon | Seventy-Gallon (equals Pomfrey) | **Hundred-Gallon** |
| Global income | ×1 | ×1.05 | ×1.10 | ×1.16 | ×1.22 | ×1.28 | ×1.34 | ×1.50 |

- A promotion plays a 3 s hero beat: the old hat is tossed, the new one drops onto your head from off-screen, and the townsfolk tip their (smaller) hats.
- Physical gags: at Fifty-Gallon you turn sideways to fit through doors; at Seventy-Gallon the brim casts a visible shadow on the street; at Hundred-Gallon a bird nests on it and two Mulligans walk alongside holding the brim.
- Cost: the hat is a separately scaled mesh on the shared rig, so it adds no draw calls.

**2. Manager hats = equipment.** The **Hat** slot item raises σ ("customers trust a big hat"). Its rarity changes the hat's model on the manager in their card, from a Common bowler to an Epic gilded sombrero-stetson.

**3. Keepsake hats = permanent collectibles.** Season ranks and achievements award named hats. A hat can be worn by You, a line or a manager, the same way as IL2 keepsakes. A worn hat is visible wherever that character appears. This gives hats a reason to collect them, and a reason to look at them.

---

## 2. The town is the map

### 2.1 Layout
**Dribble Creek** is one main street that runs away from the camera, with boardwalks, false fronts and hitching posts. It has four **blocks**, each opened by a **Deed**. A Deed is the permit, gated as in IL2 by 3 of the 4 contracts from the previous block. Contracts finished but not claimed still count.

The hero view opens on Lower Street. As the town grows, the director's establishing shot slides down the street. A **fogged teaser** of the next town, **Gristle Gulch**, sits across the creek at the far end of Railroad End (v1.1; see §5.8).

**Town tab:** the hero camera cranes up to show the whole street. Pins mark each block, and a **"You own 7/24"** ribbon sits next to Pomfrey's sneering counter.

### 2.2 The 12 businesses (Dribble Creek)
Rates and costs follow IL2's proven line curve (§5.2). **Acquired by** sets which cutscene plays when you pay the unlock cost.

| # | Block | Business | How acquired | What you see | Stock pile | Manager |
|---|---|---|---|---|---|---|
| 1 | Lower Street | 🥾 **Spit & Shine** (shoeshine) | Built (a crate and a stool; Nubbin builds it himself) | Boots on the box, and spit | Tip jar | Lil' Nubbin |
| 2 | Lower Street | 🛁 **Tuppenny Tubs**: "Water Changed Tuesdays" | Built | Steaming tubs, men in long johns, a rubber duck | Barrels of used bathwater ("house beer") | Pickles |
| 3 | Lower Street | 🐴 **Hoof & Mouth Livery** | Built | Horses, a blacksmith's anvil sparking, a mule kicking the wall | Manure heap (sold as "prairie fertiliser") | Hortense |
| 4 | Saloon Row | 🥃 **The Thirsty Gizzard Saloon** | **Won at poker** | Swinging doors, Fingers at the piano, ejections | Crates of rotgut | Big Mabel |
| 5 | Saloon Row | 💈 **Pull & Pray** (barber, dentist, surgeon) | Built | A barber's chair that reclines too far, a pole, a jar of teeth | A jar of pulled teeth (glints gold) | Pliers Pete |
| 6 | Saloon Row | 🎀 **The Velvet Garter**: "A Gentlemen's Social Parlour" | Built (Lulu funds the furniture, you fund the building) | Pink lanterns, a balcony with feather boas, gentlemen leaving with their hats on backwards, a can-can kick line seen through the window | **A pile of hats left behind by gentlemen in a hurry** | Madame Lulu |
| 7 | Bank Block | ⚰️ **Boot Hill Undertakers** | **Takeover**: the old undertaker fell into his own grave, and you buy the business from his widow (at a discount) | Coffins standing upright, Mortimer with his tape, a hearse, vultures on the sign | Coffins stacked like dominoes | Mortimer |
| 8 | Bank Block | ⭐ **Sheriff's Office & Jail** | **Bought from a coward**: Wendell sells you the franchise "for safety reasons" and stays as manager | Cells full of singing drunks, a badge-shaped weather vane, the barrel | Sacks of bail money | Sheriff Wendell |
| 9 | Bank Block | 🏦 **First & Last Bank of Dribble Creek** | **Bought after a robbery**: Bart cleaned it out, and Thrupp sells it to you while still fainting | A vault door, teller cages, a "NO GUNS" sign full of bullet holes | Money bags | Ebenezer Thrupp |
| 10 | Railroad End | 🧪 **Quackenbush's Miracle Elixir** | Built (it grows from a wagon into a factory) | Bubbling vats, a glowing smokestack, test subjects growing beards | Crates of glowing bottles | Quackenbush |
| 11 | Railroad End | ⛏️ **Lucky Strike Mine** | Built (the headframe goes up with dynamite "for the foundations") | Ore carts, a blast every ~20 s, Dolores eyebrow-free | Ore carts | Dolores |
| 12 | Railroad End | 🚂 **Iron Horse Depot** | Built (the longest build: track laid in rail by rail) | A train pulls in and passengers spill out in silly hats | Freight crates | Cyrus Clank |

**Acquisition rule.** Every acquisition costs the same formula. "Won", "takeover" and "bought" are 6–8 s cutscenes in place of construction:
- **Poker:** you reveal five aces. Slick Vinnie: "That's... five aces." You: "Hrm."
- **Takeover:** the widow, Mrs Grimsby (in black, delighted), hands over the keys.
- **Bought:** a signature scrawled under a quivering sheriff.

Three of the twelve are built in the first 10 minutes, so the player learns that construction is the normal way.

### 2.3 Gag links: synergies that are jokes
Each link has a **walker**, an actor who visibly carries the joke between the two buildings along the street. A link turns on when both lines are owned and the giver is Lv 25 or higher. It is worth **+10% to the receiving line**, and permanent. A link can only add income, so it can never be a negative return.

| Link | Walker | Joke |
|---|---|---|
| Tubs → Saloon | A barrel cart | Bathwater sold as "house beer". Mabel: "Locally sourced." |
| Livery → Spit & Shine | A cowboy who stepped in it | The horses make the business. |
| Saloon → Pull & Pray | A staggering drunk holding his jaw | Bar fights supply the dentist. |
| Saloon → Jail | A drunk frog-marched by Wendell (from behind) | Bar fights supply the cells. |
| Velvet Garter → Bank | A sweating married man with a deposit slip | Hush money is a deposit too. |
| Elixir → Undertaker | A man with a glowing beard, then a coffin | "Side effects." |
| Mine → Pull & Pray | A miner with no eyebrows | Dynamite is a growth industry for surgeons. |
| Depot → Velvet Garter | Travelling salesmen in bowlers | "Business trip." |

**Block verbs.** Each block adds one new verb, mirroring IL2's district verbs:

| Block | Verb | Rule |
|---|---|---|
| Saloon Row | **Ejections** | Every 25–45 s a drunk is flung through the saloon doors in a high arc and lives about 3 s in the air. Tapping him mid-air pockets his loose change, worth 6 s of income. A missed drunk lands in the trough, and Pickles says hello. This replaces IL2's couriers. |
| Bank Block | **The Feud** | One purchase (2× the Undertaker's unlock) hires the Hatfield-ish twins, Clem and Lem, to hate each other. While the feud runs, the Undertaker earns ×1.5, and the twins walk out to duel about every 90 s as ambient spectacle. This replaces the supply link. |
| Railroad End | **After Dark** | Pick two lines to earn ×2 from 18:00 to 06:00 local time. The Saloon and the Garter are the obvious picks, and the copy says so. This replaces Night Shift. |

---

## 3. Built, not bought: construction

### 3.1 Stages (all in 3D, crew visible, about 3 s minimum each)
| Stage | What you see | Sound |
|---|---|---|
| 1. **Survey** | A Mulligan hammers stakes and string, and another squints through a theodolite at the wrong building | A tape whistle and a mallet |
| 2. **Frame** | The timber skeleton rises, with a brother hanging off a beam | A hammer rhythm (the construction music cue) |
| 3. **Walls** | Planks clad the frame from the bottom up, and the windows go in | A saw and a hammer |
| 4. **False front** | The tall Western facade swings up on ropes, and someone nearly gets flattened | A rope creak and a THUMP |
| 5. **Sign raised** | The painted sign is hoisted, a brother hits it level with his hat, and the owner (the manager character) runs out to admire it | A short fanfare and the business's sting |

Each stage is a kit of additive prop groups on the plot, rendered by the plot module. Stage props are built at boot along with the finished plot, following the S22 lesson (build everything up front, warm-up, no shader churn). A stage change is a visibility swap plus a 0.4 s squash-and-stretch "pop". There is no geometry work at runtime.

### 3.2 Economy mapping
- **Paying the unlock cost starts construction.** The line produces nothing until the sign is up. Everything else keeps earning, so construction never stops income.
- **Build time T** (total, with stages equal in length):

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T (s) | 6 | 15 | 20 | 8 (poker) | 30 | 45 | 8 (takeover) | 8 (bought) | 8 (bought) | 90 | 120 | 180 |

- **Tap to hurry:** each tap on the site (hero or card) takes 0.5 s off T. A Mulligan swings a hammer at the tap point, and splinters fly. Taps on a construction site count toward the hustle-tap cap, so they can't be double-dipped. At 3 taps/s a build runs 2.5× faster.
- **Construction while away** finishes offline. The "while you were away" card shows "🔨 Pull & Pray opened while you were out".
- **Card UI:** a lot under construction gets a full card. It shows the live building site, a badge `🔨 Walls · 12 s`, a bottom-border progress bar for the build, and a single glyph `🔨 hurry`. No other glyphs appear until the sign is up. Then the card flashes, a stamp reads **OPEN FOR BUSINESS**, and the normal glyphs appear.
- **Director:** each stage change cuts the hero to the lot for 2.5 s. The sign-raised stage outranks everything except a mini-game in progress.
- **Renovations at visual tiers** (Lv 25 and Lv 100) play a 4 s crew bustle on the card and the hero: scaffolding, then a second storey, a balcony or a bigger sign. They never block anything.
- **After the first fake death (prestige):** a building you've built before is **rebranded**, not rebuilt. Pomfrey's sign is torn down and yours is raised in 3 s. Gen 2 runs stay fast, and you see what you get back.
- **Sim rule:** the typical and idle profiles never tap construction. The sim must still pass IL2's 4-minute dead-gap limit with T counted.

---

## 4. Main-street spectacle (hero view)

### 4.1 Ambient (no reward, director-scheduled, one at a time, every 15–30 s)
- Tumbleweeds blow across.
- A chicken crosses, with a second chicken chasing it.
- Pickles asleep in his current spot.
- Mortimer measures a passer-by.
- Wendell's barrel shuffles across the street.
- Pomfrey's hat procession goes by.
- Vultures circle over Boot Hill.
- A horse stares at the camera.
- A gentleman leaves the Garter with his hat on backwards.
- Ambient ejections (unrewarded) before Saloon Row opens. Fingers's piano can be heard from the saloon.
- A dust devil.
- From Lv 100 on the Elixir, a man with a glowing beard.

### 4.2 Events: timed opportunities, never a penalty
Rewards scale with `max(income, 0.6·gross)` and never fire offline, as in IL2.

| Event | Cadence | Window | Player verb | Reward | Where it feeds |
|---|---|---|---|---|---|
| 🌵 **Golden Tumbleweed** (the pigeon) | 90–180 s | 10 s | Tap it as it bounces past | 20 s of income. A 10% jackpot (a gold tooth in the weed) pays ×5 | n/a |
| 🤠 **High Noon Duel** (mini-game) | special | 20 s | 10 paces with the bell tolling, then a **DRAW!** flash. Tap within the window | Reaction under 250 ms gives a Gold strongbox, under 400 ms Silver, else Basic. Tapping early means your duellist shoots his own boot (slapstick, still Basic) | Undertaker ×3 for 60 s (a funeral procession down the street) |
| 🍺 **Bar Brawl** | special | 12 s | 4–7 bodies fly out of the doors and windows. Tap each one mid-air | Each tap pays 4 s of income. Five or more gives a Silver strongbox | Pull & Pray ×2 and Jail ×2 for 60 s |
| 🐎 **Stagecoach Arrival** (the limo) | special | 30 s | Tap a passenger in a silly hat to steer them to a business | That line ×7 for 30 s | n/a |
| 💰 **Bank Robbery Chase** (mini-game, Bank Block on) | special | 15 s | Bart and two goons gallop down the street dropping money bags. Tap bags and riders. Bart hits a low sign at the end | Score 0–24: 16+ Gold, 9+ Silver, else Basic, plus score/24 × 30 s of income | The main gear source (IL2's Rush Hour) |
| 🎯 **Rooftop Gunman** | special | 8 s | He pops up on a false front. Tap him and he falls into the water trough | 🦷 2 gold teeth (the bounty) | n/a |
| 🏇 **Posse Ride-Through** (the parade) | special | 60 s | None needed. Tap the riders' hats off for confetti | All lines ×2 for 60 s | n/a |
| 🧪 **Quackenbush's Free Sample** | special (Railroad End on) | 10 s | Tap to drink | A random effect: one line ×3–×10 for 30 s, plus a cosmetic effect (your beard grows for 2 minutes, or you glow green) | n/a |
| 👛 **Dropped Purse** (the wallet) | special | 10 s | Pickles drops it. Tap it | 🦷 2 | n/a |

Only one special runs at a time, every 240–420 s, weighted like IL2. The Duel is weighted 3, so it's the most common special, because it's the signature. **Strongboxes** are IL2's crates (Basic, Silver, Gold).

### 4.3 The piano
- **Where:** Fingers's upright sits just inside the saloon doors, framed in the Saloon card and visible from the hero when the saloon is in shot. It's tappable from the very first second (it's in the opening shot), long before you own the saloon. It's a toy, not an economy object.
- **Tap:** plays a random riff from the pool (§6.4), with no repeats among the last 6. Fingers hammers the keys, the lid bounces, and the patrons sway.
- **Tapping again mid-riff** cross-fades into the next riff.
- **Frenzy:** 8 taps within 6 s starts a Piano Frenzy. Fingers plays one long fast riff, the whole bar dances, and the frenzy ends in a free ambient ejection (once per 2 minutes).
- **Achievements:** "Fingers' Apprentice" (100 riffs) and "Encore!" (hearing every riff).
- **Money:** once you own the Saloon, a piano tap counts as a hustle tap at the Saloon. It's under the same cap, so it's never a better tap.

### 4.4 How the player participates
- **Tapping the street** is the hustle tap (IL2 values and cap: 0.12·P, combo ×2, crit 3%).
- **Tapping a building** in the hero scrolls to its card (IL2).
- **Tapping a townsperson** makes them tip their hat and bark (a voice line, rate-limited). It pays nothing, so there's no reason to farm it. This is the cheap fun verb.
- **Hold to look**, unchanged from IL2.

---

## 5. Economy

### 5.1 Model
**IL2's line model unchanged:**
- P, σ walk-in 0.35 to managed 0.60+, a shelf of 3 minutes, pile tap ×1.0, return harvest ×1.5, σ upgrades also ×1.1 price, milestones ×2 at the IL2 levels, and themed throughput/boost ladders.
- The tap cap gives active ≤ 2.5× idle.
- The sim, its falsification arms and the negative-return audit are ported as is.

**New multipliers in the stack:**
- `hat` (§1.3, ×1–×1.5)
- `gagLinks` (+10% per incoming link)
- `feud` (×1.5 on the Undertaker)
- `afterDark` (×2 on two lines)
- `bounty` (prestige, §5.5)
- `graves` (+1% each, §5.5)
- Construction T is applied when a line is unlocked.

### 5.2 Line table (IL2 CURVE renamed; costs in $)
| Line | Unlock | $/s per Lv | Growth | Throughput glyph (example) | Boost glyph (example) |
|---|---|---|---|---|---|
| 🥾 Spit & Shine | 50 | 1 | 1.100 | `+🧒` more shoeshine kids | `+🫙` better spit |
| 🛁 Tuppenny Tubs | 360 | 3 | 1.104 | `+🛁` another tub | `+🦆` rubber ducks |
| 🐴 Livery | 9K | 60 | 1.108 | `+🐴` stalls | `+🧲` horseshoes |
| 🥃 Saloon | 336K | 1.2K | 1.112 | `+🍺` taps | `+🎹` piano tuning ("it never was") |
| 💈 Pull & Pray | 10.1M | 24K | 1.116 | `+💺` chairs | `+🦷` gold fillings |
| 🎀 Velvet Garter | 269M | 480K | 1.120 | `+💃` hostesses | `+🪶` feather boas, `🍾` champagne |
| ⚰️ Undertaker | 6.9B | 9.6M | 1.124 | `+⚰️` gravediggers | `+🌹` "premium grief" |
| ⭐ Jail | 173B | 192M | 1.128 | `+🔒` cells | `+🎻` jail-cell choir (fines for noise) |
| 🏦 Bank | 4.0T | 3.84B | 1.132 | `+🧾` tellers | `+🔐` bigger vault |
| 🧪 Elixir | 88T | 76.8B | 1.136 | `+🫧` vats | `+🐍` "real" snake |
| ⛏️ Mine | 1.9Qa | 1.54T | 1.140 | `+🛒` carts | `+🧨` more dynamite |
| 🚂 Depot | 41.5Qa | 30.7T | 1.144 | `+🚃` carriages | `+🚂` a bigger engine |

- **Deeds** (permits): Saloon Row $504K, Bank Block $10.4B, Railroad End $132T, each gated 3/4 on the previous block's contracts (IL2).
- **Tickets:** the 🎟️ in IL2 becomes 🦷 **gold teeth**.
- Each line has 4 contracts, written as "Town Council Demands". None of them needs a hidden mechanic.

### 5.3 Bootstrap: the first business must be earned by tapping
- You start in the mud with no idle income.
- Each tap fishes one coin ($2) out of the mud, and the coin flips into your upturned hat.
- Tapping the hat pockets the coins, which teaches the pile verb. It's IL2's cans and bin, reskinned.
- 25 coins buys Spit & Shine for $50.

### 5.4 Pacing targets (life 1, measured by the ported sim, ±30%)
| Window | Beat | Target |
|---|---|---|
| First 2 min | Spit & Shine bought (6 s build) | 0:25–0:40 |
| | First tumbleweed | ~1:00, scripted |
| | Tubs built | ~1:20 |
| | Nubbin hired | ~1:45 |
| | Bowler hat | first line |
| | Stetson | ~2:30, on the Livery |
| First 10 min | Saloon Row Deed | ~5:00 |
| | Saloon won at poker | ~5:30, ends in the first scripted Bar Brawl |
| | Pull & Pray | ~6:30 |
| | First Duel | scripted ~7:00 |
| | Velvet Garter | ~9:00, Ten-Gallon hat |
| First hour | Bank Block Deed | 15–20 min |
| | Feud | ~22 min |
| | Railroad End Deed | 40–50 min |
| | Depot open | ~55 min |
| | **Fake Your Death available** | 45–60 min |
| | Recommended | 75–90 min |

There must be no stretch over 4 minutes without a new purchase type, construction stage or event in life 1.

### 5.5 Prestige: "Fake Your Death"
**Available** once Railroad End is open, because the coffin leaves town on the train. It glows "recommended" when the bounty would give at least +100%.

**The ceremony** (about 20 s, skippable after the first time):
1. A funeral procession goes down the street.
2. Mortimer is overjoyed.
3. Mabel blows her nose on the bar rag.
4. Pickles: "He owed me a dollar."
5. Pomfrey laughs, and his men tear down your signs.
6. The coffin goes on the train.
7. Cut to the depot: a stranger with a **new false moustache and spectacles** steps off. Mabel: "...Ain't you—" You: "No."

**Currency: Bounty 💀.** It's the dollar figure on your Wanted poster. `B = floor(10·(allTime/6e17)^0.15)`, and each point adds +10%. The first fake death always gives at least ×2, as in IL2. Starter cash is max($50, 100·B).

**What persists:**
- **Boot Hill graves.** Each fake death adds a headstone on the hill (+1% global) with a generated epitaph, for example "Here lies Slim. Wasn't." or "Died doing what he loved: lying."
- **Wanted posters** of every past identity.
- Managers with their levels and slots.
- Items, 🦷 gold teeth, keepsake hats, contracts (once per outlaw career), achievements, the season, and stats.

**What resets:** cash, lines, your hat tier, the Feud, After Dark and the gag links.

**Gen 2 speed:** buildings come back as 3 s **rebrands** (§3.2). The target is the Railroad End Deed in about 15 minutes in gen 2.

### 5.6 Managers and equipment
There are 12 named managers (§1.2) with levels 1–5 paid in cash and 🦷, as in IL2: slots are 1 at Lv 1 and 2 at Lv 3. Each trait is simple and in character:

| Manager | Trait |
|---|---|
| Nubbin | Speed +10% ("works for candy") |
| Pickles | Offline +1 h ("he's always here anyway") |
| Hortense | Shelf ×1.5 |
| Mabel | σ +10% ("nobody leaves without paying") |
| Pliers Pete | Every 50th sale drops 🦷 1 |
| Lulu | Events ×1.5 ("she hears everything first") |
| Mortimer | Duel rewards ×2 |
| Wendell | +25% while no event is active ("prefers it quiet") |
| Thrupp | Levels −5% |
| Quackenbush | Free Sample effects last ×2 |
| Dolores | Crit +2% |
| Clank | Auto-sells a full pile at ×1.0 ("on schedule") |

**Six items in three rarities**, each visible on the manager:

| Item | Effect |
|---|---|
| 🤠 Hat | σ |
| 🥾 Spurs | Speed |
| 🦷 Gold Tooth | Price |
| 👜 Saddlebags | Shelf |
| 🧲 Lucky Horseshoe | Crit |
| ⌚ Pocket Watch | Offline cap |

Merge 3 into 1 and use Auto-equip exactly as in IL2. Crit is capped at 15%.

### 5.7 Season: 💀 "Ghost Town" (Oct 1 to Nov 2, live now)
This must ship in v1, because the window is open now.
- **The side world:** Dribble Creek at night, with the same plots under a skin of candles, marigolds, cobwebs and green lantern light. The ghosts of everyone who ever lost a duel run three variant lines:
  - **The Spirits Saloon** ("we only serve spirits")
  - **Boot Hill Bone Orchard** (pumpkin coffins)
  - **The Phantom Stagecoach Line**
- **Token:** 💀 sugar skulls.
- **Witching Hour:** 18:00–24:00 gives ×2.
- **Oct 31:** ghost duels in the main town all day. Both ghosts fire, nothing happens, and they shrug and walk through each other.
- **Ranks:** 12. Rank 8 gives the seasonal manager **Headless Hank**, who carries his head in his hat. His trait is Nocturnal: +50% from 18:00 to 06:00, +2 h offline.
- **Keepsakes are hats:** Pumpkin Stetson, Ghostly Bowler, Candle-Brim Ten-Gallon, Marigold Sombrero, Bone Crown, Cobweb Derby, and the Phantom Top Hat (the top keepsake).
- **Cultural note:** Día de los Muertos imagery (marigolds, candles, sugar skulls) is used as a warm celebration of the dead. There are no caricatured people. The ghosts are the town's own duel losers.

### 5.8 Later progression (v1.1+, not v1)
- **Gristle Gulch:** a mining boomtown across the creek with 6 new lines. It's reached by the Depot after 3 fake deaths and is a second street using the same systems.
- **Christmas season "Silent Night at the Gizzard":** before Dec 1.
- **Pomfrey Buyout:** an endgame where, after Half the Town, you buy his frontages one by one. Each one is a sign tear-down, and he gets a smaller hat each time.

---

## 6. Audio and voice plan

### 6.1 Rules
- **Barks** are under 4 s, mono ogg at 48 kbps (about 15 KB each).
- **Rate limits:** at most one bark every 8 s overall, and the same line never within 10 minutes.
- **Subtitles:** each bark shows as a speech bubble of six words or fewer above the speaker.
- **Mute:** voices have their own mute toggle.
- **Pipeline:** Qwen Voice Studio (:7876) designs each voice once from the description below, saves it as a clone voice (the Lanternlight pipeline), then renders every bark with the clone so the character stays consistent.
- **Takes:** generate 3 takes per line, keep the best by loudness and duration (under 4 s), and run one listening pass.
- **Budget:** about 85 lines, about 1.3 MB in total.

### 6.2 Voiced characters (Qwen voice-design prompts, with sample barks)

**Big Mabel Boggs.** *Woman, mid-50s, deep booming chesty contralto, gravelly from whiskey and shouting, slow Texas drawl, amused menace.*
1. "And STAY out!" (the opening line)
2. "Out! And take yer teeth with ya!"
3. "I don't break up fights. I finish 'em."
4. "Whiskey's a dollar. Water's two. It's rarer."
5. "You spill it, you lick it."
6. "Glass is clean. Ish."
7. "Who threw that? ...Nice arm."
8. "Locally sourced, sugar. Don't ask where."

**Sheriff Wendell Pryce.** *Man, 40s, thin reedy tenor that cracks upward when scared, nasal, fast nervous Midwestern patter, tries to sound tough and fails.*
1. "I'm deputisin' you. Bye!"
2. "Nobody panic! ...Especially me."
3. "I'm not hidin'. I'm surveillin'. From a barrel."
4. "Halt! ...Or don't, I ain't fussy."
5. "The law is on its lunch break."
6. "Is he gone? Tell me when he's gone."
7. "I've drawn my gun! ...It's in the drawer."

**Mortimer Grimsby.** *Man, 60s, plummy soft baritone, slow and velvety, delighted undertaker's purr, faint English accent, smiles audibly.*
1. "Ooh, a duel! Fetch my tape."
2. "Stand still, sir. A lovely six-foot-two."
3. "Business is dead. Wonderful!"
4. "Pine or oak? Oak's for people with friends."
5. "Ten paces, gentlemen. Take your time."
6. "No refunds. Clients rarely complain."
7. "Another satisfied customer. Well... customer."

**Madame Lulu LaRue.** *Woman, 40s, smoky honeyed alto, theatrical fake French accent that slips into flat Ohio on surprise, teasing and knowing.*
1. "Welcome, cowboy. Wipe your boots... and your hopes."
2. "Ze conversation is one dollar. Ze eye contact, extra."
3. "Non non, chéri, ze hands stay on ze hat."
4. "Ze accent? Ohio, darling. Keep it quiet."
5. "Back so soon, Sheriff? Your wife was asking."
6. "A respectable establishment. Mostly. Tuesdays."
7. "Pay at ze door. Leave with dignity. Optional."

**Ezekiel "Pickles" McGurk.** *Old man, 70s, wet slurred rasp, hiccups, warbling pitch, rambling Appalachian drawl, cheerful and lost.*
1. "I ain't drunk. The street's movin'."
2. "*hic* Who moved the ground?"
3. "I'll have whatever I just had."
4. "This trough's taken."
5. "I seen a ghost! ...Oh. Mirror."
6. "That's my hat! ...That's a chicken."
7. "He owed me a dollar." (at your funeral)
8. "Finders keepers, stranger."

**"Doctor" Cornelius Quackenbush.** *Man, 50s, fast silver-tongued carnival-barker tenor, sing-song salesman cadence, old-timey Mid-Atlantic, overenthusiastic.*
1. "Cures baldness, gout AND bad decisions!"
2. "Side effects include: glowing."
3. "Drink it. Don't sniff it. NEVER light it."
4. "Genuine snake! ...Oil-adjacent."
5. "Shake well. Then run."
6. "Satisfaction guaranteed, or your funeral's half price!"

**"Pliers" Pete Pettigrew.** *Man, 30s, eager high cheerful tenor, slight lisp, giggly, Southern twang, alarmingly upbeat.*
1. "Shave, haircut or tooth? Why not all three!"
2. "Open wide. Wider. Bite this."
3. "That one's loose! ...Now it is."
4. "Don't worry, I've done this twice."
5. "Whiskey's the anaesthetic. And the tip."
6. "Gold tooth! Mine now."

**Colonel Augustus Pomfrey.** *Man, 60s, pompous booming aristocratic baritone, Southern-plantation-colonel drawl, sneering, lingering vowels.*
1. "Your hat, sir, is an embarrassment."
2. "I own this street. And that dog."
3. "Charming shack. I'll buy it for kindling."
4. "Money talks. Mine sings opera."
5. "My hat stays on, sir. It's load-bearing."
6. "Half the town? I have the better half."
7. "Some inherit. Others... shovel."

**Black Bart Bumbleton.** *Man, 30s, gruff put-on outlaw growl that keeps slipping into a polite, nervous, high voice, mumbly.*
1. "Hands up! ...Not that high, show-off."
2. "This is a robbery! Er, stick-up."
3. "All yer money! ...And a sandwich."
4. "They'll never catch— OW. Who put a pole there?"
5. "Everyone stay calm! I'm very nervous!"
6. "Getaway horse! ...HORACE!"
7. "You ain't seen the last of me! ...Tuesday."

**Lil' Nubbin.** *Child, about 9, scratchy confident boyish voice, fast streetwise Brooklyn-ish patter, deadpan and unimpressed. Clean lines only.*
1. "Shine yer boots? Can't help yer face."
2. "Two bits. Three if there's horse in it."
3. "That ain't mud, mister."
4. "Spit's free. Polish costs."
5. "I'm eight. I got a business. You?"
6. "You call that a hat?"

**"Dynamite" Dolores Dunn.** *Woman, 40s, ear-splitting shout, raspy, hard of hearing so everything is too loud, gleeful Scots-Irish lilt.*
1. "FIRE IN THE HOLE! ...Too early?"
2. "Eyebrows are overrated!"
3. "WHAT? Speak up, I blew up!"
4. "That's not a crater. That's a basement!"

**The Stranger (you):** grunts only. "Hrm." "Hrm?" "No." Generate one take set in a low dry male voice.

The other managers (Hortense, Thrupp, Clank) get 3 barks each in a v1.1 pass.

### 6.3 Music cues (ACE-Step :8001; ogg stereo 80 kbps, seamless loops, lazy-loaded)
| Cue | Length | Brief |
|---|---|---|
| **Main theme "Big Hat Energy"** | 90 s loop | Morricone pastiche: whistled melody, twangy baritone guitar, galloping snare, a cheeky muted trumpet, comic bassoon on the B section |
| **Saloon honky-tonk** | 60 s loop | Out-of-tune upright piano, stride bass, washboard, a drunk crowd murmur bed. Plays while a saloon card or shot is in focus |
| **Duel standoff** | 20 s stinger plus 8 s tail | Solo whistle, a church bell, a long ringing trumpet (Ecstasy of Gold parody), then silence before DRAW, then a crack and a comic tuba "wah-wah" |
| **Construction** | 45 s loop | Banjo and fiddle hoedown with hammer-on-beat percussion. Ducks under the main theme during a build |
| **Night** | 90 s loop | Harmonica, campfire guitar, crickets, a distant coyote. 18:00 to 06:00 local |
| **Robbery chase** | 30 s | Galloping William Tell-style strings and kazoo |
| **Fake Your Death** | 25 s | A solemn funeral march that turns halfway into a jaunty ragtime getaway |
| **Ghost Town season** | 90 s loop | Spooky mariachi: trumpet with vibrato, theremin, marigold-bright guitarra, slow waltz |
| **Stingers** (2–3 s each) | | Stagecoach horn, hat promotion fanfare, "Open for Business" sign raise, strongbox open |

### 6.4 Piano riff pool spec
- **Source:** generate 3 ACE-Step takes of about 2 minutes each: "solo honky-tonk upright piano, ragtime, slightly out of tune, no other instruments, 120–140 bpm, bright, playful, in C".
- **Slicing:** an offline script cuts them at bar boundaries using onset and beat detection into **24 riffs of 2.5–5 s**. Each riff gets a 30 ms fade-in and an 80 ms fade-out, is loudness-normalised to −16 LUFS, and ships as mono ogg at 64 kbps (about 30 KB each, about 0.7 MB in total).
- **Riff classes:** at least 6 "flourishes" (a run up the keys), at least 6 "vamps" (stride bass with a melody), at least 4 "endings" (a dum-da-dum-dum cadence) and at least 2 "wrong notes" (Fingers fluffs it and the crowd groans; this is a rare 5% pick).
- **Playback:** random with no repeats among the last 6. A frenzy plays a 12 s "long riff" slice. While a riff plays, the saloon loop ducks −8 dB.
- **Fallback:** if the ACE-Step slices sound mushy at this length, procedural ragtime through WebAudio with a small detuned piano sample set (3 multisamples, about 150 KB) is the backup. The decision is made by ear in the audio lane.

---

## 7. Name and the first session

### 7.1 Title options
1. **Idle Western 2: Big Hat Energy** ← **recommended.** It's short, rude-adjacent and names the signature system. It reads well on a projects tile.
2. Idle Western 2: Half the Town
3. A Fistful of Dollars Per Second (best as the **tagline** under the recommended title)
4. Dribble Creek
5. Idle Western 2: Boot Hill Tycoon

### 7.2 The first five minutes, beat by beat
| Time | Beat |
|---|---|
| 0:00 | Black screen. A honky-tonk piano tinkles, then a crash. The saloon doors burst open and **you** sail out in slow-motion, skid face-first along Main Street and stop in the mud. Fingers is still playing. Mabel (VO): "And STAY out!" Your squashed derby lands upside down beside you. |
| 0:03 | Coins glint in the mud. The coach says "Tap the mud". Each tap fishes up a coin that flips into the upturned hat with a *plink*. Pickles, from the trough: "Finders keepers, stranger." |
| 0:12 | Hat chip: coins pile in the hat. The coach says "Tap your hat". Coins whoosh to the cash counter. That teaches the pile verb. |
| 0:15 | Optional: the piano is in shot through the doors. A soft glint on it, and tapping it plays a riff. No coach yet; it's a discovery. |
| 0:30 | $50 is reached. A sign on the crate beside the boardwalk ("FOR SALE · CHEAP · SMELLS") glows, and a ghost card for Spit & Shine appears. Tap it: Nubbin builds his stand in 6 s (the coach says "Tap to hurry"). Sign up, then "I'm eight. I got a business. You?" Your hat pops to a **Bowler** (the first promotion beat). |
| 0:40 | Income starts with walk-ins. The coach points at the shoeshine card's ⬆. |
| 1:00 | The first **Golden Tumbleweed** bounces past (scripted). Tapping it gives a coin burst. |
| 1:05 | Tubs lot. The Mulligans arrive, and survey, frame, walls, false front and sign play out over 15 s, with the director cutting to each stage. The sign reads "TUPPENNY TUBS · WATER CHANGED TUESDAYS". |
| 1:45 | Manager offer: Nubbin (🕴 glyph) for "sells far more than walk-ins". |
| 2:30 | Livery built. A horse kicks the wall as the sign goes up. **Stetson.** Pomfrey rides past under his enormous hat: "Your hat, sir, is an embarrassment." The hat ribbon appears: You 3/24 · Pomfrey 10/24. |
| 3:00–4:30 | Levelling, the first throughput and boost glyphs, and a second tumbleweed. The Town Council's first Demands appear (the 🏆 tab is revealed). |
| ~5:00 | Saloon Row Deed. Tap the gate card. |
| ~5:30 | **The poker game.** You reveal five aces. Slick Vinnie: "That's... five aces." "Hrm." The saloon is yours and Mabel comes with it: "Huh. The mud fella. Fine." This ends in the first scripted **Bar Brawl** (bodies fly, you tap them), and the coach introduces the piano. Fun hook is set. |

---

## 8. Build notes for P1 (for the manager)
- **Fork IL2 wholesale:** host, kit, cameras, look.js, the UI shell, the state/economy modules and the sim. Rename lines, add construction (a state machine in `state/`, stage props in plots) and add hats (one mesh scale on the crowd rig, a ladder in `data/`).
- **Delete the life system:** housing, partner, kids and age. Replace it with hat tier, Boot Hill graves and the fake-death ceremony. This is a smaller system than the one it replaces.
- **New sim checks:**
  - construction T in the dead-gap limit;
  - no negative return from gag links or the Feud;
  - piano taps under the hustle cap;
  - gen-2 rebrand pacing;
  - falsification: set T to 10× and the dead-gap check must fail.
- **Perf budget per IL2 S22 lessons:**
  - Ejection, posse and robbery actors come from a pre-warmed pool of 24 chibis.
  - Dust and splinters are one instanced particle mesh.
  - Construction stage props are built at boot.
  - The hat is a scaled mesh with no new material.
  - The hero's crowd cap is 30.
- **Mini-games:** the Duel, Bar Brawl and Robbery all run in the hero, and jump the page to the hero first (IL2 rule).
