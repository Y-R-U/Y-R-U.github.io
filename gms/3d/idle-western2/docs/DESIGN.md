# Idle Western 2: Big Hat Energy — binding design

The base design is `research/DESIGN_PROPOSAL.md`. These rulings override it, and where neither says anything, the Idle Life 2 rule stands. `research/DESIGN_CHALLENGE.md` is accepted except where a ruling below says otherwise.

Tagline: *A Fistful of Dollars Per Second.* The town is **Dribble Creek**.

## Rulings

**W1 Scope for v1.**
- 3 blocks with 9 businesses:
  - **Lower Street:** Spit & Shine, Tuppenny Tubs, Hoof & Mouth Livery.
  - **Saloon Row:** Thirsty Gizzard, Pull & Pray, Velvet Garter.
  - **Bank Block:** Boot Hill Undertakers, Sheriff & Jail, Bank.
- Railroad End (Elixir, Mine, Depot) is **v1.1, planned soon after**. Keep the data and plot API open for it.
- The street has 18 frontages: 9 can be yours, 7 are Pomfrey's, and 2 are civic.
- "Half the Town" is reached at 9 out of 9.
- Pacing targets scale to a ~60 min first run.
- Cut from v1: the Feud, After Dark, Rooftop Gunman, Free Sample, Posse, Dropped Purse, Gristle Gulch and the Pomfrey Buyout.

**W2 Prestige.** "Fake Your Death" happens at Boot Hill once Bank Block is open; the coffin leaves on the stagecoach.
- The currency is Bounty, and graves and epitaphs persist.
- In gen 2, businesses come back as 3 s rebrands.

**W3 Ownership must be visible in the hero.**
- From frame 1 the street reads as two colour camps: yours (warm teal and brass) and Pomfrey's (purple and gold, with his crest).
- Empty lots carry "RESERVED · POMFREY" or "FOR SALE" stakes.
- Signs hang perpendicular to the street, plus the false-front signs.
- The default hero camera sits 20–30° off the street axis, so the facades read.
- Every purchase re-skins a frontage into your colours.
- Pomfrey's hat shrinks as yours grows, all the way down to a thimble.
- Opening a Deed is a 3 s showdown in which his sign comes down.

**W4 Gags must read with the sound off at about 40 px.**
- Ejections escalate with the Saloon's level, drawing from a no-repeat landing table (trough, hay cart, dentist's chair, jail wagon, Pomfrey's window).
- The Garter's visual gag is the window exit: a man in long johns drops into a hay cart while a wife with a rolling pin storms in the front.
- Jokes that depend on text live only on cards and in bubbles.

**W5 Barks.**
- There are two layers.
  - The wordless layer is frequent: grunts, "hic", yelps, "oof", laughs and gasps.
  - Sentence barks are limited to one every 30–45 s, and only one bubble shows at a time.
- Tapping a character triggers a bark with a 20 s cooldown per character.
- Some lines play only once, ever.
- About 130 lines in total: Mabel, Pickles and Pomfrey get ~20 each, and the rest 6–10 each.
- Allowed rarely: "damn", "hell" and donkey/ass puns. The Sunday School toggle mutes those lines and the Garter innuendo, and swaps the copy.
- Pomfrey's voice is an English remittance-man or East-Coast blue-blood, never a plantation colonel.
- Replace the challenge's flat lines.

**W6 Fling.** The ejection verb is **swipe to fling**.
- Mabel holds the drunk at the doors and you swipe to throw him.
- The swipe direction picks the target (trough, dentist, jail wagon or Pomfrey's window), and each target pays a different joke and a small bonus.
- Unflung drunks get thrown by Mabel automatically for no bonus. Nothing is ever lost.

**W7 Hero tap priority, highest first:**
1. An active mini-game.
2. An event actor.
3. A fling grab.
4. The piano.
5. A character, which barks.
6. A construction site, which hurries the build.
7. The street, which is a hustle tap.

Tapping a building does **not** scroll the page; the floating label/badge does. Holding still for 300 ms starts look-around, exactly as in IL2.

**W8 The duel** is a Leone parody for portrait.
- Over-the-shoulder framing, then an extreme close-up on the eyes, then DRAW.
- Gold is under 380 ms and Silver under 550 ms, measured from the DRAW frame. Tapping early shoots your own boot, which still pays Basic.
- Random interruptions: a horse, Pickles staggering through, or a fly on a nose.
- There is a pool of opponents.
- Real specials (Duel, Brawl, Robbery, Stagecoach) come ≥ 8 minutes apart, and ambient non-reward duels play in between.

**W9 Specials wait for the player.**
- A chip plus a bell toll announces the special, and it starts only once the hero is visible; otherwise it expires gracefully.
- A brawl can also play in the Saloon card.
- Construction cuts the hero to the lot only on frame-up and sign-raise.

**W10 Performance contract.** Agree this before any art.
- The crowd is instanced, and the hats are instanced per hat type.
- The hero has one spectacle slot and an actor budget: ≤ 6 animated actors + ≤ 24 crowd + ≤ 256 particles.
- Moving actors use blob shadows.
- Construction uses one generic stage kit sized to each lot. Lv 25 and Lv 100 extensions are built by the crew.
- Music streams through one `<audio>` element and is never decoded in full. Barks and piano are small decoded buffers.
- Speech bubbles only transform; they never re-layout.
- The gate is a CPU 4× S22 profile with a brawl, a build and a fling all running at once. It must be shown to FAIL when the actor budget is disabled.

**W11 The piano** is Fingers's upright, tappable from second 1.
- Each tap plays a **random short phrase** (2–5 s) with no repeat among the last 6.
- The phrase pool mixes public-domain ragtime phrases (Joplin and others, played on a WebAudio honky-tonk sampled or synthesised piano) with ACE-Step-cut riffs if they pass by ear.
- Rapid tapping makes Fingers play faster. A frenzy (8 taps in 6 s) ends in a brawl on the beat (an ambient ejection, at most once per 2 minutes).
- A rare "wrong note" makes the crowd groan.
- Zero tap latency is required.

**W12 Ghost Town season** is a main-street overlay, not a side world.
- Green lantern relight, cobwebs, ghosts of past duel losers, and ghost duels (both shoot, nothing happens, they shrug).
- The token is 👻 ectoplasm, earned by tapping ghosts.
- 8 ranks of keepsake hats. Headless Hank is rank 8.
- No Día de los Muertos imagery.
- Deadline: if core isn't integrated by **20 Oct**, the season is cut. Core never slips for it.

**W13 Construction** follows proposal §3, with these changes:
- 5 stages, built by the Mulligan Brothers.
- Tapping hurries the build (−0.5 s per tap, counted under the tap cap).
- Builds continue offline.
- Acquisition cutscenes: the Saloon is won at poker, the Undertaker is a takeover, and the Jail and Bank are bought.
- Hero cuts are limited to the two moments in W9.

**W14 Hats** are status (proposal §1.3, rescaled to 9 lines), equipment (a manager item), and keepsakes. The first promotion happens on the first business.

**W15 Opening:** you are thrown out of the saloon face-first, then tap mud for coins into your hat, and tap the hat to bank them. Spit & Shine costs $50.

**W16 Extras:**
- **Wanted Poster postcard**, saved as a PNG: your hat, moustache, bounty and joke stats. v1 if it's cheap, otherwise v1.1.
- **Gold teeth 🦷** are the premium currency.
- **Strongboxes** are the crates.

**W17 Tone** follows the proposal's allowed/banned table. No caricature of ethnic groups, and the kid is never near the Garter.

**W18 Time of day** is a compressed in-game cycle, not the phone's clock (IL2's local-time nights read as a lilac wash at 4 am).
- One cycle lasts about 20 minutes: ~60% day, ~15% golden hour, ~25% night.
- Night is warm and lantern-lit, with luma ≥ 0.30. It is never a lilac wash.
- Golden hour is the default boot look: a fresh save starts at golden hour.
- Economy hooks that need "night" (night music cue, Witching Hour) read the game clock, not the real one. The season date window still uses the real date.
