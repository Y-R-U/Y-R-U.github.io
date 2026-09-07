# WHO FIGHTS — where this is up to

Read this first on resume. This file is what the game **is**; `docs/DECISIONS.md` is **why**, and
`docs/DEV_CONTRACT.md` is binding and comes before both.

Everything is committed. The per-pass narrative lives in the git log — `git log --oneline -- .` —
which is where a changelog belongs; this file is kept in the present tense on purpose, because a
resume document that has to be read chronologically and diffed in your head is one that will
quietly start lying.

---

## 1. What it is

A third-person browser RPG in the He Who Fights With Monsters shape. You walk into the Adventure
Society, pass a proving, take three essences and are given the fourth, and then work a contract
board up four ranks while buying gear, waking abilities and unpicking a side story.

**The loop.** Read a board → take a contract → get walked out to an arena dressed for it → clear it
or last it out → get paid in marks and experience → spend the marks on the square → wake abilities
with the stones you find → earn four stars → be promoted.

| | |
|---|---|
| Contracts | **47**, all walkable — iron 18, bronze 16, silver 8, gold 5 |
| Monsters | **14 kinds × 6 variants = 84**, drawn as 4 silhouettes |
| Essences | 12 × 10 abilities, **claim 5 each**, 20 in all |
| Confluences | **220** — one for every triple, 17 authored and the rest composed |
| Conversations | 92 nodes, 13 characters |
| Weapons | 7 buyable, 35 to 1,600 marks; the Weaponry stocks 8 rows from 18 |

---

## 2. Running it, and proving it still works

```bash
node tools/devserver.mjs            # then open http://127.0.0.1:8796/
node tools/test.mjs                 # 609 across 52 files
node tools/shot.mjs --shot=hall     # and OPEN the png — see DECISIONS §10
```

Driven tests. Each one `rsync`s the project to a scratch copy and serves *that* — never the working
tree (DEV_CONTRACT §11). **Every driven test belongs in this list**; one of them rotted for two
passes because it was not in it.

```bash
node js/dev/proving.uitest.mjs    # register, fight, choose essences
node js/dev/contract.uitest.mjs   # take a contract, cast, earn a star, be promoted
node js/dev/stair.uitest.mjs      # climb, be refused, climb to the top, come down
node js/dev/controls.uitest.mjs   # jump, attack, the interact menu
node js/dev/gear.uitest.mjs       # the knife bug, the bag, equip, absorb, potion, rope
node js/dev/shop.uitest.mjs       # walk into all three shops, the purse, buying, loot
node js/dev/bar.uitest.mjs        # the bar, the number row, reordering, the Bronze gate, dying
node js/dev/story.uitest.mjs      # the boards, the new monsters, the Long Count end to end
node js/dev/convo/uitest.mjs      # the Conversations tab writes a file the game can read
```

Dev tools are behind the gate at `` ` `` or ctrl-shift-D. The tabs that matter here are
**Conversations** (reads `data/conversations.json` whole, so anything authored by hand is editable
in it), **Characters**, **Level editor**, and **Debug → Economy**, which is every pacing number on
a live slider with a *Copy as defaults* button.

---

## 3. Where things live

```
data/
  levels/society.json      the five-storey Society, the square, the three shops
  levels/proving.json      the walled yard — the only level that LENDS a weapon
  levels/arena.json        one room, patched per contract by js/game/missions.js
  essences.json            12 essences × 10 abilities, 17 authored confluences
  characters.json          13 bodies    conversations.json   92 nodes

js/game/          the game layer — nothing here is built under ?shot= or in the editor
  session.js        holds the save, the screens and the frame; the hub everything hangs off
  combat.js foe.js vitals.js ground.js weapons.js bestiary.js      the fight
  essences.js confluence.js spells.js casting.js                   what you are
  contracts.js missions.js progress.js                             the ladder
  items.js economy.js loot.js shop.js inventory.js                 the economy
  slots.js actionbar.js                                            twenty keys
  tour.js                                                          the tour of the square
  noticeboard.js sheet.js essencesheet.js missionpanel.js          the parchment screens
  game.css                ONE stylesheet for a dozen screens — see DECISIONS §7

js/world/         the world layer, shared with the editor and the shot tool
  interior.js       rooms, including the shop dressing (p.shop)
  doors.js climb.js grandstair.js stairplan.js hallplan.js
  elemental.js      one body, four builds, every monster in the game

js/dev/           the tools. js/editor/ is the level editor and the scene schema.
```

---

## 4. The Long Count

The one side story, running the whole length of the ladder, built out of contracts that were
already pointing at each other by accident:

**Sit With the Ledger Until It Stops** (iron) → **Count the Barrows Out of the Clay Pit** (iron) →
**The Same Hand Is Writing in Marrowgate** (bronze) → **The Thing Under Coldbrook Is Awake and
Counting** (silver) → **Stop the Bells at Marrowgate Ringing Themselves** (silver) → **Break the
Procession at Winterbourne** (silver) → **Close the Ledger** (gold).

Ninety years, two books, one hand, and a number that goes down. **Archivist Wren** on the ground
floor keeps what the clerks throw away and is the whole arc — one hotspot, seven gated choices, each
step requiring the one before it to have been heard, so a player who cleared the board before ever
speaking to her still gets it in order.

Contracts carry a `story: { arc, step }` marker. Nothing reads it yet — the arc runs entirely off
`contract.done.<id>`, which `finishContract()` has always written — but it is there for when a
board wants to group one.

---

## 5. What is open

- **Gold pay has nothing to buy.** A gold contract pays up to 9,000 marks and the dearest thing in
  the game is a 1,600-mark maul. Either gold should pay in something else or there should be a rack
  above the maul.
- **Nothing gates an individual contract.** Any row on a board you can reach is takeable, which is
  why the Long Count is driven by what you have *finished* rather than by what you may *take*.
- **The four new monsters have been fought by a test and not by a person**, and the whole economy
  was tuned by arithmetic rather than by watching anybody play. Both are what the Economy panel and
  a wet afternoon are for.
- **Nothing is sold back.** A player who buys the wrong weapon keeps it.
- **The player's body renders black indoors** — the crowd rig's material is not lit by the
  interior's lights. Pre-existing, and much more visible now there are four rooms to stand in.
- **The proving room is a walled yard, not a roofed room**, and Vail's line calls it "one room".
- **One Suno tavern track still says "the Academy"** in its lyrics, and the music set id `academy_hall`
  is unchanged — it is threaded through a manifest builder, three dev UI tests and a fixture, and
  never appears on screen.
- Some conversation lines have no `vo` because their text changed. `data/vo.json` keeps the old
  records; regenerate from the Characters tab or `tools/vo/gen_lines.mjs`.

---

## 6. Additions to DEV_CONTRACT.md made here

Recorded in that file too (§10, §10.1); listed here so one page has all of them.

- **Verbs**: `screen`, `promote`, `purse`.
- **Hotspots** gain `y` + `yr`, a storey band, alongside `attach`.
- **Objects** gain `o.floor`, the `plot` type, and `p.floors` / `p.shop` on a house.
- **The level document** gains `foes` and `loaner`.
- **`at`** gains `inside: <doorIndex>`, and `goto` swaps in place instead of reloading.
- **Save v2**: `doc.essences`, `doc.gear`, `doc.slots`. Ids only, dropped silently against a table
  that has moved on.
- **Controls**: Space is jump, left button attacks, right button and long-press open the interact
  menu, and the number row is twenty ability keys.
