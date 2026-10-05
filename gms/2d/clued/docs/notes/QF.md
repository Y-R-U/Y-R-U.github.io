# Lane QF: fact-check and media QA

Data only: pack sources in `tools/c1_src/`, `tools/c2_src/` + the C2 builders, `tools/c2c_src/`, then each lane's build
script. No generated JSON was hand-edited and nothing under `js/` was touched. `movie-moments` was left alone.

## Headline numbers (2026-10-05)

| audit | checked | factual / answer errors | wording or template faults | kids-suitability |
|---|---|---|---|---|
| Generated questions, round 1 (seed `qf1`, before fixes) | 300 | **10** (3.3%) | 21 | 1 |
| Generated questions, round 2 (seed `qf2`, after fixes) | 140 | **1** (0.7%, a lane I generator rule) | 11 | 0 |
| Hand-written `questions[]` (two samples) | 230 | **0** | 2 | 0 |

"Error" means a careful quizmaster would mark the question wrong or unfair: a wrong stated answer, a second option that is
also right, an answer given away, or a question that can't be answered as asked. Round 1 errors, by pack:
dishes 2/6, inventions 2/7, gems 1/6, jellyfish 1/4, sea 1/12, elements 1/5, tv 1/5, explorers 1/10 (a lane I `type`
rule). Round 1 errors by format: odd 2/22, fake 2/22, connect 2/22, type 2/22, order 1/22, sort 1/22; mc, tf, hilo,
match, number, quote, ladder and chain (14) had none. The one round 2 error is the same `type` rule (leaders).

The hand-written banks are in good shape: 0 wrong answers in 230 (general 54, kids 28, sport 22, plus 3 from every other
pack), checked against Wikipedia/Wikidata where there was any doubt.

**Risky packs** (where the errors cluster, and why):
- **inventions**: "invented in <country>" is often contested (jet engine, helicopter, light bulb). Fixed by dropping the
  country fact for those three; any new invention needs the same test.
- **gems**: Gemstone / Mineral / Rock is not a clean partition. Now `exclusive: false`.
- **cats / dogs**: country of origin is genuinely disputed for several breeds (Poodle, Bloodhound, Shih Tzu, Abyssinian,
  Birman, Turkish Van, Oriental Shorthair). These now carry every defensible country (arrays); distractors and odd/connect
  already skip any value an item holds.
- **reptiles / spiders**: yes/no facts (venomous, catches prey in a web) have edge cases (monitor lizards, newts,
  net-casting spider). Fixed the ones found.
- **elements**: states of matter for superheavy elements are predictions, not facts. Removed past einsteinium.
- **fake (made-up names)**: any formatting that only the fakes carry (a year, a country) gives the answer away.

## What I changed

### Facts
| where | change | why |
|---|---|---|
| c1_src/elements.mjs | `state` only for Z ≤ 99, not 85 (At) or 87 (Fr) | no bulk sample has ever been seen; PubChem's "Solid" for Sg etc. is a prediction (blurbs follow) |
| c1_src/inventions.mjs | jet engine, helicopter, incandescent light bulb: no `country` | von Ohain's German jet (1939), Germany's Fw 61 helicopter (1936), Joseph Swan's British bulb |
| c1_src/gems.mjs | `kind` → `exclusive: false` | rose quartz/malachite are gems, ruby/amethyst are minerals; odd/connect/tf could not be fair |
| c1_src/jellyfish.mjs | kind "Jellyfish" → "True jellyfish" | connect grouped "Jellyfish" while box jellyfish and crystal jelly sat in other groups |
| c1_src/sea.mjs | red king crab: no `lengthM` | 1.8 m is its leg span, not a length |
| c1_src/reptiles.mjs | lace monitor `venomous: true`; perentie and great crested newt: left out | monitor venom glands (Komodo was already true); newt skin toxin is real but mild |
| c1_src/spiders.mjs | net-casting spider `web: true` | it throws a silk net (its own clues said so); tf said it "hunts without a web" |
| c1_src/dogs.mjs | Poodle [France, Germany], Bloodhound [Belgium, France, UK], Shih Tzu [China, Tibet]; Giant = ≥ 50 kg | Wikipedia lists these origins; Rottweiler, Cane Corso, Bloodhound, Bernese (45 kg) are Large |
| c1_src/cats.mjs | Abyssinian [Ethiopia, UK], Birman [Myanmar, France], Turkish Van [Turkey, UK], Oriental Shorthair → US; Manx question reworded | Wikipedia breed infoboxes; many Manx have stumps or tails |
| c1_src/body.mjs | rib cage `count` 1 (was 24) | "Rib cage: how many does a person have?" → 24 was wrong (24 ribs, one cage) |
| c1_src/flowers.mjs | "Corpse flower" → "Rafflesia" | the titan arum (also in the pack) is the plant most people call the corpse flower |
| c1_src/insects.mjs | antlion `sci` Myrmeleontidae → Myrmeleon | family-level photos were owlflies (yellow-and-black wings) |
| c2_src/tv.mjs | Top Gear 1977 (was the 2002 relaunch) | "first shown 2002" is wrong for a show that began in 1977 |
| c1_src/dishes.mjs, inventions.mjs | fakes lose "(Peru)", "(1874)" | only the fakes had them, so they gave the answer away |
| c2_build_movies.mjs | fake "The Clockmaker's Daughter" → "Midnight Over Marrowby" | a real 2018 Kate Morton novel |

Checked and left alone (they are right): numbat Near threatened (IUCN 2026 downgrade), Pacman frog Vulnerable
(IUCN 2025), fire salamander Vulnerable, snowy owl Vulnerable, Syria's new flag, all 22 chain links in the samples.

### Wording / templates (data side)
- `matchPrompt` on dishes country, words origin and namedAfter, tv year, currencies ISO code, space order from the Sun
  ("Match each one to its comes from" etc.).
- `askNumber` on body count, space fromSun, dinosaurs mya, history year, tv year, languages and currencies country counts
  ("What is the how many you have of Humerus?", "Everest is climbed…: year (year)?").
- Labels: space year "Launched", dinosaurs mya "How long ago it lived", dishes country "Country", words origin
  "Language of origin".
- People packs: "Who of these died first?" → "Which of these people died first?" (born too).
- Books `kids` stmt ("The Little Prince: children's book." → "… is a children's book."); first lines cut at a comma
  now end with "…".
- Inventions templates: "The the microwave oven…" (lname already carries "the").
- `pack.noun` (singular, for type's "Name the …") + `pack.fakePrompt` on bees, body, dinosaurs, dishes, gems,
  jellyfish, mushrooms, reptiles, space (C1) and countries, currencies, history, leaders, people, quotes, tv, words
  (C2, via `PACK_NOUNS` in `c2_lib.writePack`), sport (C2c). c1_build now passes `noun`/`fakePrompt` through.
- quotes pack `quotePrompt: "Who said or wrote it?"` ("Off with her head!" → Lewis Carroll).
- "comes from United Kingdom" → `theC()` in `c1_src/_common.mjs` (cats, dogs, dishes, inventions clues) and
  `theName` for currency clues/blurbs.
- `c2_lib.writePack` tidies "Mamma Mia!." / "D.C.." double punctuation (13 strings).

## For lane I (generator rules; I did not edit js/)
1. **BC years in mc explains.** `mc.js` num questions build `explain` with `registry.factText`, which prints negative years
   raw. Repro: `factText({ type: 'year' }, -323)` → `"-323"`; seen in `mc:num:died:lo:alexander-the-great,augustus,cleopatra,theodore-roosevelt`
   ("Alexander the Great: -323"). hilo/order/number already print "323 BC".
2. **IUCN questions in kids mode.** `mc.generate({ kids: true, difficulty: 1, packs: [kidsView(birds)], opts: { source: 'facts' } })`
   yields `mc:rev:status:birds/superb-fairywren` ("Which of these is listed as 'Least concern' by the IUCN?").
   odd.js skips status unless difficulty 3; c1_build strips `hard` from factsMeta, so mc/tf/sort/match/connect can't see it.
   Suggest the same rule as odd (label matches /conservation|iucn/ → only at difficulty 3, never kids).
3. **`type` asks for bins as free text.** `type:era:explorers/zheng-he` "When was Zheng He born?" accepts only
   "Middle Ages"; `type:era:leaders/indira-gandhi` accepts only "1900s or later". Nobody can type those. Suggest type
   skips cat facts whose values are ranges/bins (era, decade, century, size, danger…) or adds `typeable: false` support;
   also accept aliases (Chris Hoy: "Great Britain" is rejected, only "United Kingdom" accepted).
4. **Names mid-sentence.** hilo and number use `item.name`: "Is United Kingdom higher or lower?"
   (`hilo:areaKm2:countries/peru:countries/united-kingdom`), "What is the typical length of Southern stingray?"
   (`number:lengthM:sea/southern-stingray`). mc/tf use `{lname}`; hilo/number should too (with "the" for animals).
5. **`{value}` country names lack "the".** tf stmt "The Persian breed comes from United States." Templates can't fix it;
   `fill()` could offer `{theValue}` (same list as `theC` in `tools/c1_src/_common.mjs`).
6. **Order/hilo wording for sizes and time.** "Put these in order: diameter, highest first"; hilo "How long ago it lived:
   Woolly mammoth is 0.3 million years ago. Is Tyrannosaurus rex higher or lower?" Use `meta.higherLabel`
   (Bigger/Longer/Older) → "biggest first", "lived longer ago or more recently?".
7. **match lower-cases labels**: "Match each one to its conservation status (iucn)". Keep acronyms (or use matchPrompt).
8. **sort prompts with "or" inside a value**: "Born in: 1900s or later or Ancient world?", "Sort them: venomous or
   poisonous or harmless?". Suggest "A / B?" or "Sort into: A | B".
9. **noun clash.** type uses `pack.noun` as a singular ("Name the …"), fake uses it as a plural ("Which of these … is
   made up?"). I set `fakePrompt` wherever I set `noun`, but fake should prefer `pack.nounPlural || pack.title`.
10. Cheap guard for connect/odd: skip a cat fact if one value is contained in another ("Jellyfish" ⊂ "Box jellyfish").

## Media (task 4)
**Link check.** `node tools/linkcheck.mjs <all 61 packs except movie-moments>`: 4,158 media URLs (packs + data/music).
The first full run reported 646 failures, every one an HTTP **429** from upload.wikimedia.org because my contact-sheet
downloads were running at the same time. linkcheck counted those as real failures, so a second throttled run would
have marked hundreds of healthy files `mirror`. I changed `tools/linkcheck.mjs`: a 429 now backs off (3/6/12/24 s) and
is never counted towards `fails`/`mirror`. Final state after re-runs: **all media OK, 0 marked `mirror`**, so
`tools/mirror.mjs` had nothing to mirror (it reported 0 files, 0 packs rewritten).

**Licences.** Walked every `media.img/audio` (and `flagImages`) in all packs + music: 0 entries missing credit,
licence or page; licences are only Public domain / PD / PDM, CC0, CC BY 2.0–4.0 (incl. ported), CC BY-SA 1.0–4.0
(incl. ported), and Apple previews (streamed, not stored). The new files I added are CC BY-SA 2.0/3.0/4.0.

**Photo review.** Contact sheets of the first image of every item (and every question picture) in all 33 picture packs
(about 2,000 images), plus every photo (not just the first) in the iNaturalist-heavy packs, because formats pick a random
photo per item (`imageOf(item, rng)`): bees, sharks, sea, spiders, jellyfish, reptiles, insects, birds, mammals,
mushrooms. dogs and snakes were already fully reviewed by C1. 141 photos rejected through `tools/c1_src/_skip.json`
(`node tools/c1_skip.mjs`); where a rejection pulled in another bad photo, the item is capped (`id=N`) at the photos I
had actually seen. Rejections by pack: mammals 46 (incl. caps), birds 36, sea 33, sharks 27, insects 22, spiders 17,
jellyfish 17, reptiles 13, mushrooms 11, elements 10, space 9, bees 5, inventions 5, dinosaurs 3, dishes/gems/flowers 1.

Found and fixed:
- **Bees: the person's face** is `giant-ichneumon-wasp` photo 2 (iNat 137922066, a man's face filling the frame, the
  wasp tiny on a tree behind him). Rejected. Also potter wasp (nest only), mud dauber (tiny), a pinned-specimen sheet.
- Wrong subject: a raccoon as "veiled chameleon", a wading bird as "painted lady", a painted lady as "red admiral",
  owlflies as "antlion" (sci changed to *Myrmeleon*), glowing UV-lit mushrooms as "sulphur tuft" (which conflicts with
  its `glows: false` fact), a blue poison frog as "glass frog", a vertebral column as "thresher shark", cookiecutter
  bite wounds on other animals as "cookiecutter shark" (now no photo), egg cases as "small-spotted catshark", an orca
  type diagram, a museum statue as "grey heron", a cat as "Virginia opossum".
- Name printed in the picture (answer given away): Ne/Ar/Kr/Xe discharge tubes, the "35 Br" cube, the "Fr 87" box,
  constellation photos and charts labelled ORION/CRUX/…, Polaris and Betelgeuse charts, "CINÉMATOGRAPHE LUMIÈRE",
  the labelled nylon diagram, "iPhone, iPhone Plus…" lineup, the "WWW" street sign, "FLIGHT RECORDER" box,
  the Vegemite logo, a funnel-web museum card. Orion, Crux and the iPhone got new unlabelled Commons photos
  (`files:` in the source); the World Wide Web is now difficulty 2 instead (no honest picture exists).
- Not showing the thing: skeletons/skulls (hippo, aardvark, red deer, badger, giant anteater), footprints (wolverine,
  little penguin), empty water/forest (bonobo, numbat, zebra shark, rock pools), nests/eggs, trail-camera frames,
  dead animals in markets (several sharks), silhouettes (great horned owl, sperm whale), a Gagarin portrait as
  "Vostok 1", duplicates of the same photo (tiger, red squirrel, ladybird).
- Landmarks (C2 builder): Sheikh Zayed Grand Mosque and Hassan II Mosque leads are sunset silhouettes; no free daytime
  replacement found in the time available, so `LM_NO_IMG` in `tools/c2_build_geo.mjs` drops their picture.
- Poor fits left in place on purpose: dried fossil slabs were removed (minmi, meganeura, leaellynasaura slabs) but
  museum mounts/models stay; botanical illustrations (lavender, buttercup, holly, rubber tree) stay; the 194 flags
  were all checked against the country (Syria's 2025 flag is correct; Afghanistan stays excluded).

## Tests (task 5)
All run after the last rebuild (2026-10-05):

| test | result |
|---|---|
| `node tools/c1_test.mjs` | 109 checks, 0 failures (it caught 4 kids-pack pictures I had removed; fixed with new photos / difficulty) |
| `node tools/c2_test.mjs` | all 18 C2 packs pass, self-test caught every broken copy |
| `node tools/c2c_test.mjs` | 0 errors, 0 warnings |
| `node tools/au_test.mjs` | all passed (6 warnings, unchanged) |
| `node tools/f_test.mjs` | 1,680,964 passed, 0 failed |
| `node tools/a_test.mjs` | 449 passed, 0 failed |
| `node tools/build_index.mjs` | 71 packs indexed, 0 errors (885 warnings, same as before) |
| `node tools/linkcheck.mjs` (all packs + music) | all media OK, 0 to mirror |

Rebuilt with: `node tools/c1_build.mjs` (bees birds body cats dinosaurs dishes dogs elements flowers gems insects
inventions jellyfish mammals mushrooms reptiles sea sharks space spiders kids-nature), `c2_build_geo / movies / people /
books / words / history / tv / art / quotes`, `node tools/c2c_build.mjs`. HTTP caches meant every rebuild was
deterministic apart from the edits.

## How to repeat this audit
- Generated sample: `node tools/qf_sample.mjs 300 qf1` (round 2: `140 qf2`) loads every format module + pack JSON exactly like `tools/f_test.mjs`,
  generates 8 questions per (format, pack, difficulty 0–3 + kids view) cell with `rngFrom('<seed>:<fmt>:<pack>:<d>')`,
  drops explicit-question items (`refs` containing `/q:`), then takes an equal share per format, round-robin over packs.
  Formats: mc (source facts), tf, hilo, odd, order, match, number, type, fake, quote, connect, sort, ladder, chain.
  Picture-only formats (reveal, lookalike, silhouette) and map/listen formats were covered by the photo review instead.
- Hand sample: 3 random questions from every pack's `questions[]`, 24 from general, 18 from kids, 10 from sport, then a
  second draw of 30 general / 10 kids / 12 sport.

## Round 1: 300 generated questions (seed qf1, before fixes)
| # | question id | format | pack | diff | verdict | fix |
|---|---|---|---|---|---|---|
| 1 | `mc:rev:status:birds/superb-fairywren` | mc | birds | kids | KIDS | IUCN-status question served in kids mode; lane I (skip status facts for kids/easy, as odd.js already does) |
| 2 | `mc:cat:edibility:mushrooms/turkey-tail` | mc | mushrooms | 1 | OK |  |
| 3 | `mc:cat:family:languages/lao` | mc | languages | 3 | OK |  |
| 4 | `mc:cat:origin:words/yoga` | mc | words | 1 | OK |  |
| 5 | `mc:cat:status:mammals/mandrill` | mc | mammals | 2 | OK |  |
| 6 | `mc:num:countries:hi:english,italian,turkish` | mc | languages | kids | OK |  |
| 7 | `mc:cat:artist:paintings/ophelia` | mc | paintings | 2 | OK |  |
| 8 | `mc:bool:flightless:birds/kakapo:cockatiel,greater-flamingo,wild-turkey` | mc | birds | 0 | OK |  |
| 9 | `mc:rev:diet:dinosaurs/thylacoleo` | mc | dinosaurs | 0 | OK |  |
| 10 | `mc:cat:kind:body/skull` | mc | body | 1 | OK |  |
| 11 | `mc:bool:flightless:birds/emperor-penguin:common-starling,toco-toucan,w` | mc | birds | 1 | OK |  |
| 12 | `mc:num:died:lo:alexander-the-great,augustus,cleopatra,theodore-rooseve` | mc | leaders | 2 | WORDING | "Who of these died first?" → "Which of these people…" (c2_build_people). Explain shows "-323": lane I (factText BC years) |
| 13 | `mc:cat:century:books/david-copperfield` | mc | books | 3 | OK |  |
| 14 | `mc:cat:nation:sport/serena-williams` | mc | sport | 1 | OK |  |
| 15 | `mc:cat:system:body/biceps` | mc | body | kids | OK |  |
| 16 | `mc:cat:country:dishes/ceviche` | mc | dishes | 2 | OK |  |
| 17 | `mc:cat:coat:cats/ragdoll` | mc | cats | 0 | OK |  |
| 18 | `mc:rev:origin:dogs/leonberger` | mc | dogs | 3 | OK |  |
| 19 | `mc:cat:country:inventions/radio` | mc | inventions | 1 | OK |  |
| 20 | `mc:cat:continent:flags/iceland` | mc | flags | kids | OK |  |
| 21 | `mc:cat:continent:capitals/tokyo` | mc | capitals | kids | OK |  |
| 22 | `mc:rev:danger:jellyfish/bluebottle` | mc | jellyfish | kids | OK |  |
| 23 | `tf:cat:century:history/the-titanic-sinks:20th century` | tf | history | 1 | OK |  |
| 24 | `tf:cat:kind:jellyfish/crystal-jelly:Hydrozoan` | tf | jellyfish | 3 | OK |  |
| 25 | `tf:bool:complete:insects/emperor-dragonfly` | tf | insects | 0 | OK |  |
| 26 | `tf:cat:drivingSide:countries/comoros:right` | tf | countries | 3 | OK |  |
| 27 | `tf:cat:century:history/president-kennedy-is-assassinated:2nd century` | tf | history | 2 | OK |  |
| 28 | `tf:cat:century:books/things-fall-apart:19th century` | tf | books | 3 | OK |  |
| 29 | `tf:img:flags/iceland:iceland` | tf | flags | 1 | OK |  |
| 30 | `tf:cat:continent:countries/philippines:Asia` | tf | countries | 0 | OK |  |
| 31 | `tf:cat:decade:movies/top-gun-maverick:2020s` | tf | movies | 2 | OK |  |
| 32 | `tf:cat:status:sea/ocean-sunfish:Data deficient` | tf | sea | 2 | OK |  |
| 33 | `tf:img:elements/carbon:oxygen` | tf | elements | kids | OK |  |
| 34 | `tf:cat:decade:tv/the-muppet-show:2000s` | tf | tv | 0 | OK |  |
| 35 | `tf:cat:period:dinosaurs/pteranodon:Cretaceous` | tf | dinosaurs | kids | OK |  |
| 36 | `tf:cat:planetType:space/earth:Rocky` | tf | space | kids | OK |  |
| 37 | `tf:cat:artist:paintings/the-swing:Édouard Manet` | tf | paintings | 2 | OK |  |
| 38 | `tf:img:explorers/james-cook:james-cook` | tf | explorers | kids | OK |  |
| 39 | `tf:cat:continent:countries/united-kingdom:South America` | tf | countries | 1 | OK |  |
| 40 | `tf:cat:runnerUp:sport/world-cup-1986:Germany` | tf | sport | 2 | OK |  |
| 41 | `tf:img:leaders/elizabeth-i:augustus` | tf | leaders | 1 | OK |  |
| 42 | `tf:cat:artist:paintings/tiger-in-a-tropical-storm-surprised:Henri Rous` | tf | paintings | 1 | OK |  |
| 43 | `tf:cat:era:artists/francisco-goya:Middle Ages` | tf | artists | 3 | OK |  |
| 44 | `tf:bool:kids:books/the-little-prince` | tf | books | 2 | WORDING | "The Little Prince: children's book." → stmt "{name} is a children's book." (c2_build_books) |
| 45 | `hilo:year:books/where-the-wild-things-are:books/treasure-island` | hilo | books | 1 | OK |  |
| 46 | `hilo:areaKm2:countries/peru:countries/united-kingdom` | hilo | countries | 1 | WORDING | "Is United Kingdom higher…" (no article): lane I (hilo uses name, not lname) |
| 47 | `hilo:massKg:dogs/australian-kelpie:dogs/irish-setter` | hilo | dogs | 2 | OK |  |
| 48 | `hilo:massKg:mammals/dromedary:mammals/dingo` | hilo | mammals | kids | OK |  |
| 49 | `hilo:died:artists/pablo-picasso:artists/raphael` | hilo | artists | kids | OK |  |
| 50 | `hilo:died:actors/gene-kelly:actors/paul-newman` | hilo | actors | 3 | OK |  |
| 51 | `hilo:built:landmarks/forbidden-city:landmarks/christ-the-redeemer` | hilo | landmarks | 0 | OK |  |
| 52 | `hilo:lengthM:snakes/eastern-coral-snake:snakes/green-anaconda` | hilo | snakes | 1 | OK |  |
| 53 | `hilo:year:paintings/young-hare:paintings/the-night-watch` | hilo | paintings | kids | OK |  |
| 54 | `hilo:massKg:mammals/sugar-glider:mammals/numbat` | hilo | mammals | 3 | OK |  |
| 55 | `hilo:year:space/international-space-station:space/parker-solar-probe` | hilo | space | 0 | WORDING | label "Launched or happened" → "Launched" (c1_src/space) |
| 56 | `hilo:born:artists/jackson-pollock:artists/roy-lichtenstein` | hilo | artists | 0 | OK |  |
| 57 | `hilo:year:tv/seinfeld:tv/blackadder` | hilo | tv | 0 | OK |  |
| 58 | `hilo:lengthM:sea/atlantic-bluefin-tuna:sea/peacock-mantis-shrimp` | hilo | sea | 3 | OK |  |
| 59 | `hilo:mohs:gems/pearl:gems/diamond` | hilo | gems | kids | OK |  |
| 60 | `hilo:mya:dinosaurs/woolly-mammoth:dinosaurs/tyrannosaurus-rex` | hilo | dinosaurs | kids | WORDING | label "Lived about (million years ago)" → "How long ago it lived" + askNumber (c1_src/dinosaurs); higher/lower for time-ago: lane I |
| 61 | `hilo:year:inventions/hills-hoist:inventions/phonograph` | hilo | inventions | 2 | OK |  |
| 62 | `hilo:died:explorers/matthew-henson:explorers/zheng-he` | hilo | explorers | 3 | OK |  |
| 63 | `hilo:died:people/karl-marx:people/emmeline-pankhurst` | hilo | people | 3 | OK |  |
| 64 | `hilo:born:explorers/robert-falcon-scott:explorers/yuri-gagarin` | hilo | explorers | 0 | OK |  |
| 65 | `hilo:lengthM:dinosaurs/woolly-rhinoceros:dinosaurs/megatherium` | hilo | dinosaurs | 0 | OK |  |
| 66 | `hilo:legSpanCm:spiders/mexican-red-knee-tarantula:spiders/indian-ornam` | hilo | spiders | 3 | OK |  |
| 67 | `odd:cat:era:actors/fred-astaire:helen-mirren,jackie-chan,lupita-nyong-` | odd | actors | 0 | OK |  |
| 68 | `odd:cat:era:leaders/angela-merkel:franklin-d-roosevelt,mao-zedong,theo` | odd | leaders | 2 | OK |  |
| 69 | `odd:bool:dinosaur:dinosaurs/brontosaurus:smilodon,woolly-mammoth` | odd | dinosaurs | kids | OK |  |
| 70 | `odd:cat:planetType:space/jupiter:mars,mercury,venus` | odd | space | 1 | OK |  |
| 71 | `odd:bool:conifer:trees/japanese-cherry:coast-redwood,norway-spruce` | odd | trees | kids | OK |  |
| 72 | `odd:cat:continent:capitals/moscow:brasilia,buenos-aires,santiago` | odd | capitals | 1 | OK |  |
| 73 | `odd:cat:origin:words/chocolate:igloo,kayak` | odd | words | kids | OK |  |
| 74 | `odd:cat:branch:languages/albanian:amharic,arabic,hebrew` | odd | languages | 0 | OK |  |
| 75 | `odd:bool:complete:insects/green-tree-ant:common-pond-skater,house-cric` | odd | insects | 2 | OK |  |
| 76 | `odd:cat:danger:spiders/brazilian-wandering-spider:christmas-spider,div` | odd | spiders | 2 | OK |  |
| 77 | `odd:cat:era:leaders/abraham-lincoln:john-f-kennedy,margaret-thatcher,n` | odd | leaders | 0 | OK |  |
| 78 | `odd:cat:century:history/the-boston-tea-party:martin-luther-s-ninety-fi` | odd | history | 2 | OK |  |
| 79 | `odd:cat:diet:mammals/black-rhinoceros:cougar,eurasian-lynx,eurasian-ot` | odd | mammals | 3 | OK |  |
| 80 | `odd:cat:habitat:sharks/megamouth-shark:bonnethead,small-spotted-catsha` | odd | sharks | 3 | OK |  |
| 81 | `odd:cat:edibility:mushrooms/jack-o-lantern-mushroom:amethyst-deceiver,` | odd | mushrooms | 2 | OK |  |
| 82 | `odd:cat:kind:gems/tigers-eye:halite,rose-quartz,talc` | odd | gems | 2 | ERROR | Gemstone vs Mineral is not exclusive (rose quartz is a gem, ruby is a mineral): gems kind → exclusive:false |
| 83 | `odd:cat:era:explorers/charles-lindbergh:hernan-cortes,ibn-battuta,zhen` | odd | explorers | 3 | OK |  |
| 84 | `odd:cat:country:inventions/jet-engine:benz-patent-motorwagen,diesel-en` | odd | inventions | 0 | ERROR | Jet engine 'United Kingdom' is contested (von Ohain's German jet flew first): country fact dropped; also helicopter, light bulb |
| 85 | `odd:cat:country:landmarks/burj-khalifa:empire-state-building,grand-can` | odd | landmarks | 1 | OK |  |
| 86 | `odd:bool:flightless:birds/kakapo:crimson-rosella,noisy-miner,satin-bow` | odd | birds | 3 | OK |  |
| 87 | `odd:cat:coat:cats/savannah:birman,ragdoll,turkish-angora` | odd | cats | 0 | OK |  |
| 88 | `odd:cat:danger:sharks/bull-shark:blacktip-reef-shark,nurse-shark` | odd | sharks | kids | OK |  |
| 89 | `order:year:paintings/irises,paintings/the-hay-wain,paintings/the-night` | order | paintings | 0 | OK |  |
| 90 | `order:diameterKm:space/europa,space/jupiter,space/neptune,space/venus` | order | space | 2 | OK |  |
| 91 | `order:lengthM:reptiles/american-alligator,reptiles/common-frog,reptile` | order | reptiles | 0 | OK |  |
| 92 | `order:lengthM:sharks/spiny-dogfish,sharks/thresher-shark,sharks/whale-` | order | sharks | 0 | OK |  |
| 93 | `order:year:history/king-charles-i-is-executed,history/the-battle-of-th` | order | history | 3 | OK |  |
| 94 | `order:lengthM:sharks/basking-shark,sharks/frilled-shark,sharks/scallop` | order | sharks | 2 | OK |  |
| 95 | `order:areaKm2:countries/albania,countries/cape-verde,countries/monaco,` | order | countries | 3 | OK |  |
| 96 | `order:massKg:dogs/bedlington-terrier,dogs/cane-corso,dogs/leonberger,d` | order | dogs | 3 | OK |  |
| 97 | `order:born:explorers/christopher-columbus,explorers/hernan-cortes,expl` | order | explorers | 0 | OK |  |
| 98 | `order:lengthM:sea/giant-pacific-octopus,sea/loggerhead-sea-turtle,sea/` | order | sea | 3 | ERROR | Red king crab 'typical length 1.8 m' is its leg span: lengthM dropped (c1_src/sea) |
| 99 | `order:died:leaders/abraham-lincoln,leaders/elizabeth-i,leaders/george-` | order | leaders | 1 | OK |  |
| 100 | `order:group:elements/caesium,elements/livermorium,elements/roentgenium` | order | elements | 3 | OK |  |
| 101 | `order:diameterKm:space/earth,space/moon,space/sun,space/uranus` | order | space | 1 | OK |  |
| 102 | `order:lengthM:sea/eastern-blue-groper,sea/magnificent-sea-anemone,sea/` | order | sea | 0 | OK |  |
| 103 | `order:lengthM:dinosaurs/argentinosaurus,dinosaurs/megatherium,dinosaur` | order | dinosaurs | 0 | OK |  |
| 104 | `order:year:movies/captain-america-civil-war,movies/men-in-black,movies` | order | movies | 2 | OK |  |
| 105 | `order:massKg:mammals/chimpanzee,mammals/dingo,mammals/hippopotamus,mam` | order | mammals | 1 | OK |  |
| 106 | `order:lengthM:sea/american-lobster,sea/common-hermit-crab,sea/orca,sea` | order | sea | 1 | OK |  |
| 107 | `order:year:inventions/barometer,inventions/electric-drill,inventions/k` | order | inventions | 3 | OK |  |
| 108 | `order:lengthM:sharks/dwarf-lanternshark,sharks/megamouth-shark,sharks/` | order | sharks | 3 | OK |  |
| 109 | `order:year:history/alexander-fleming-discovers-penicillin,history/bara` | order | history | 2 | OK |  |
| 110 | `order:year:history/england-and-scotland-unite,history/the-first-modern` | order | history | 0 | OK |  |
| 111 | `match:img:spiders/daddy-long-legs-spider,spiders/gooty-sapphire-tarant` | match | spiders | 0 | OK |  |
| 112 | `match:img:explorers/charles-lindbergh,explorers/hernan-cortes,explorer` | match | explorers | 3 | OK |  |
| 113 | `match:img:paintings/the-creation-of-adam,paintings/the-great-wave-off-` | match | paintings | kids | OK |  |
| 114 | `match:img:gems/amethyst,gems/gold,gems/jade,gems/pyrite,gems/sapphire` | match | gems | 1 | OK |  |
| 115 | `match:img:space/crux,space/jupiter,space/mercury,space/milky-way,space` | match | space | 1 | OK |  |
| 116 | `match:country:dishes/banh-mi,dishes/black-forest-gateau,dishes/bobotie` | match | dishes | 3 | WORDING | "Match each one to its comes from" → matchPrompt + label "Country" (c1_src/dishes) |
| 117 | `match:decade:movies/avengers-age-of-ultron,movies/shrek-2,movies/spide` | match | movies | 0 | OK |  |
| 118 | `match:namedAfter:words/cardigan,words/diesel,words/guillotine,words/pa` | match | words | 3 | WORDING | "its named after" → matchPrompt (c2_build_words) |
| 119 | `match:img:birds/andean-condor,birds/atlantic-puffin,birds/common-night` | match | birds | 0 | OK |  |
| 120 | `match:kind:sea/big-belly-seahorse,sea/common-hermit-crab,sea/humpback-` | match | sea | 1 | OK |  |
| 121 | `match:host:sport/summer-1912,sport/summer-1980,sport/summer-1996,sport` | match | sport | 0 | OK |  |
| 122 | `match:period:dinosaurs/dimetrodon,dinosaurs/diprotodon,dinosaurs/gigan` | match | dinosaurs | 0 | OK |  |
| 123 | `match:img:insects/christmas-beetle,insects/common-earwig,insects/emper` | match | insects | 0 | OK |  |
| 124 | `match:author:books/fahrenheit-451,books/little-women,books/the-time-ma` | match | books | 2 | OK |  |
| 125 | `match:year:tv/blackadder,tv/grey-s-anatomy,tv/seinfeld,tv/the-x-files,` | match | tv | 3 | WORDING | "its first shown" → matchPrompt + askNumber (c2_build_tv) |
| 126 | `match:inventor:inventions/airplane,inventions/draisine,inventions/nylo` | match | inventions | 0 | OK |  |
| 127 | `match:img:bees/common-carder-bee,bees/emerald-cockroach-wasp,bees/gian` | match | bees | 3 | OK |  |
| 128 | `match:img:spiders/black-widow,spiders/goliath-birdeater,spiders/huntsm` | match | spiders | 1 | OK |  |
| 129 | `match:img:reptiles/american-bullfrog,reptiles/gharial,reptiles/gila-mo` | match | reptiles | 2 | OK |  |
| 130 | `match:edibility:mushrooms/destroying-angel,mushrooms/lions-mane,mushro` | match | mushrooms | 0 | OK |  |
| 131 | `match:img:sharks/blue-shark,sharks/dwarf-lanternshark,sharks/goblin-sh` | match | sharks | 0 | OK |  |
| 132 | `match:author:books/a-bear-called-paddington,books/alice-s-adventures-i` | match | books | 1 | OK |  |
| 133 | `number:year:history/everest-is-climbed-for-the-first-time` | number | history | 1 | WORDING | "…: year (year)?" → askNumber "In what year did this happen: …?" (c2_build_history) |
| 134 | `number:lengthM:sea/southern-stingray` | number | sea | 0 | WORDING | "typical length of Southern stingray" (no article, capital): lane I (number uses name) |
| 135 | `number:fromSun:space/mars` | number | space | 2 | WORDING | "What is the order from the sun of Mars?" → askNumber (c1_src/space) |
| 136 | `number:year:books/the-secret-garden` | number | books | 1 | OK |  |
| 137 | `number:count:body/humerus` | number | body | 2 | WORDING | "What is the how many you have of Humerus?" → askNumber (c1_src/body) |
| 138 | `number:died:explorers/christopher-columbus` | number | explorers | 1 | OK |  |
| 139 | `number:boxOfficeUSD:movies/toy-story` | number | movies | 1 | OK |  |
| 140 | `number:lengthM:sharks/angelshark` | number | sharks | 0 | OK |  |
| 141 | `number:legSpanCm:spiders/chilean-rose-tarantula` | number | spiders | 1 | OK |  |
| 142 | `number:lengthM:reptiles/eastern-blue-tongued-lizard` | number | reptiles | 1 | OK |  |
| 143 | `number:lengthM:reptiles/southern-corroboree-frog` | number | reptiles | 3 | OK |  |
| 144 | `number:year:books/the-grapes-of-wrath` | number | books | 3 | OK |  |
| 145 | `number:died:leaders/golda-meir` | number | leaders | 3 | OK |  |
| 146 | `number:massKg:mammals/black-rhinoceros` | number | mammals | 2 | OK |  |
| 147 | `number:lengthM:sharks/great-hammerhead` | number | sharks | 1 | OK |  |
| 148 | `number:count:body/lungs` | number | body | 1 | WORDING | same as #137 (fixed) |
| 149 | `number:born:artists/georges-seurat` | number | artists | 0 | OK |  |
| 150 | `number:legSpanCm:spiders/indian-ornamental-tarantula` | number | spiders | 3 | OK |  |
| 151 | `number:areaKm2:countries/austria` | number | countries | 0 | OK |  |
| 152 | `number:massKg:dogs/samoyed` | number | dogs | 0 | OK |  |
| 153 | `number:heightM:trees/olive-tree` | number | trees | 1 | OK |  |
| 154 | `number:fromSun:space/mars` | number | space | 0 | WORDING | same as #135 (fixed) |
| 155 | `type:size:dogs/english-springer-spaniel` | type | dogs | 2 | OK |  |
| 156 | `type:century:history/abraham-lincoln-is-assassinated` | type | history | 2 | OK |  |
| 157 | `type:clue:explorers/valentina-tereshkova` | type | explorers | 1 | OK |  |
| 158 | `type:continent:capitals/athens` | type | capitals | 1 | OK |  |
| 159 | `type:img:dishes/lasagne` | type | dishes | 0 | OK |  |
| 160 | `type:state:elements/seaborgium` | type | elements | 3 | ERROR | Seaborgium 'solid at room temperature' is a prediction, never observed: state dropped for Z>99, At, Fr (c1_src/elements) |
| 161 | `type:clue:inventions/typewriter` | type | inventions | 2 | OK |  |
| 162 | `type:country:landmarks/wieliczka-salt-mine` | type | landmarks | 3 | OK |  |
| 163 | `type:decade:movies/toy-story-3` | type | movies | 1 | OK |  |
| 164 | `type:img:paintings/the-school-of-athens` | type | paintings | 2 | OK |  |
| 165 | `type:img:paintings/the-potato-eaters` | type | paintings | 0 | OK |  |
| 166 | `type:img:countries/dominica` | type | countries | 0 | OK |  |
| 167 | `type:era:explorers/zheng-he` | type | explorers | 0 | ERROR | type asks "When was Zheng He born?" expecting the typed bin "Middle Ages": not a fair free-text question: lane I |
| 168 | `type:order:insects/deaths-head-hawkmoth` | type | insects | 2 | OK |  |
| 169 | `type:nation:sport/chris-hoy` | type | sport | 3 | WORDING | type accepts only "United Kingdom" for Chris Hoy ("Great Britain" rejected): lane I |
| 170 | `type:img:dinosaurs/mosasaurus` | type | dinosaurs | 1 | OK |  |
| 171 | `type:symbol:elements/manganese` | type | elements | 2 | OK |  |
| 172 | `type:clue:bees/velvet-ant` | type | bees | 0 | WORDING | "Name the wasps, bees & hornet" → pack.noun 'insect' (+ fakePrompt) |
| 173 | `type:img:actors/daniel-radcliffe` | type | actors | 1 | OK |  |
| 174 | `type:clue:landmarks/empire-state-building` | type | landmarks | 0 | OK |  |
| 175 | `type:continent:capitals/chisinau` | type | capitals | 0 | OK |  |
| 176 | `type:drivingSide:countries/nicaragua` | type | countries | 2 | OK |  |
| 177 | `fake:snakes:spotted tiger cobra` | fake | snakes | 2 | OK |  |
| 178 | `fake:movies:operation thunderbolt rising` | fake | movies | 2 | OK |  |
| 179 | `fake:bees:crimson mason hornet` | fake | bees | 3 | OK |  |
| 180 | `fake:flowers:blue lantern daisy` | fake | flowers | 2 | OK |  |
| 181 | `fake:snakes:desert ghost mamba` | fake | snakes | 0 | OK |  |
| 182 | `fake:gems:draconite` | fake | gems | 2 | OK |  |
| 183 | `fake:space:vulcanis` | fake | space | 1 | WORDING | "Which of these space is made up?" → fakePrompt (c1_src/space) |
| 184 | `fake:books:winter at hollowmere` | fake | books | 1 | OK |  |
| 185 | `fake:inventions:pneumatic hat 1874` | fake | inventions | 2 | ERROR | fake "Pneumatic hat (1874)": only the fakes carried a year, giving the answer away; years removed |
| 186 | `fake:gems:starmoon beryl` | fake | gems | 1 | OK |  |
| 187 | `fake:sharks:spotted ribbon shark` | fake | sharks | 3 | OK |  |
| 188 | `fake:spiders:thunder orb weaver` | fake | spiders | 3 | OK |  |
| 189 | `fake:mushrooms:velvet ghost chanterelle:amethyst-deceiver,common-morel` | fake | mushrooms | 2 | OK |  |
| 190 | `fake:birds:golden eyed storm finch` | fake | birds | 3 | OK |  |
| 191 | `fake:dishes:sunberry dumplings peru:croissant,hot-dog,ramen` | fake | dishes | 1 | ERROR | fake "Sunberry dumplings (Peru)": only fakes carried a country; countries removed |
| 192 | `fake:dogs:persian water mastiff` | fake | dogs | 0 | OK |  |
| 193 | `fake:dinosaurs:thunderclawdon` | fake | dinosaurs | 1 | WORDING | "these dinosaurs & prehistoric life is" → fakePrompt |
| 194 | `fake:sharks:crimson finned mako` | fake | sharks | 1 | OK |  |
| 195 | `fake:dogs:golden moor collie` | fake | dogs | 1 | OK |  |
| 196 | `fake:sea:golden ribbon turtle` | fake | sea | 2 | OK |  |
| 197 | `fake:trees:silver thorn cedar` | fake | trees | 3 | OK |  |
| 198 | `fake:snakes:moonlight krait` | fake | snakes | 3 | OK |  |
| 199 | `quote:first:books/the-wonderful-wizard-of-oz:dorothy lived in the mid` | quote | books | kids | OK |  |
| 200 | `quote:first:books/great-expectations:my fathers family name b` | quote | books | 2 | OK |  |
| 201 | `quote:first:books/les-miserables:in 1815 m charles franco` | quote | books | 0 | OK |  |
| 202 | `quote:quote:movies/shrek-2:are we there yet` | quote | movies | kids | OK |  |
| 203 | `quote:quote:quotes/malala-yousafzai:one child one teacher on` | quote | quotes | 2 | OK |  |
| 204 | `quote:quote:quotes/rosa-parks:only tired i was was tir` | quote | quotes | 3 | OK |  |
| 205 | `quote:quote:movies/enter-the-dragon:dont think feel` | quote | movies | 3 | OK |  |
| 206 | `quote:quote:quotes/barack-obama:yes we can` | quote | quotes | 0 | OK |  |
| 207 | `quote:quote:movies/aladdin:phenomenal cosmic powers` | quote | movies | 1 | OK |  |
| 208 | `quote:quote:movies/terminator-2-judgment-day:hasta la vista baby` | quote | movies | 2 | OK |  |
| 209 | `quote:quote:quotes/muhammad-ali:i am the greatest` | quote | quotes | kids | OK |  |
| 210 | `quote:quote:quotes/barack-obama:yes we can` | quote | quotes | 1 | OK |  |
| 211 | `quote:first:books/david-copperfield:whether i shall turn out` | quote | books | 3 | OK |  |
| 212 | `quote:first:books/the-wonderful-wizard-of-oz:dorothy lived in the mid` | quote | books | 1 | OK |  |
| 213 | `quote:quote:movies/furious-7:i dont have friends i go` | quote | movies | 0 | OK |  |
| 214 | `quote:first:books/the-wind-in-the-willows:mole had been working ve` | quote | books | kids | OK |  |
| 215 | `quote:first:books/sense-and-sensibility:family of dashwood had l` | quote | books | 2 | OK |  |
| 216 | `quote:first:books/black-beauty:first place that i can w` | quote | books | 0 | OK |  |
| 217 | `quote:quote:movies/titanic:im the king of the world` | quote | movies | kids | OK |  |
| 218 | `quote:quote:quotes/percy-bysshe-shelley:look on my works ye migh` | quote | quotes | 2 | OK |  |
| 219 | `quote:quote:quotes/mahatma-gandhi:weak can never forgive f` | quote | quotes | 3 | OK |  |
| 220 | `quote:quote:movies/the-sixth-sense:i see dead people` | quote | movies | 3 | OK |  |
| 221 | `connect:mammals:american-bison,black-rhinoceros,bornean-orangutan,capy` | connect | mammals | 3 | OK |  |
| 222 | `connect:artists:albrecht-durer,diego-velazquez,edvard-munch,francisco-` | connect | artists | 0 | OK |  |
| 223 | `connect:spiders:black-house-spider,black-widow,brown-recluse,christmas` | connect | spiders | 2 | OK |  |
| 224 | `connect:explorers:amelia-earhart,christopher-columbus,david-livingston` | connect | explorers | 3 | OK |  |
| 225 | `connect:dishes:crepe,croissant,fairy-bread,fish-and-chips,full-english` | connect | dishes | 1 | OK |  |
| 226 | `connect:space:betelgeuse,cassiopeia,crux,europa,ganymede,io,neptune,po` | connect | space | 2 | OK |  |
| 227 | `connect:jellyfish:blue-button,blue-ringed-octopus,bluespotted-ribbonta` | connect | jellyfish | 3 | OK |  |
| 228 | `connect:artists:albrecht-durer,caravaggio,francisco-goya,frida-kahlo,j` | connect | artists | 3 | OK |  |
| 229 | `connect:sea:american-lobster,atlantic-bluefin-tuna,atlantic-cod,bumphe` | connect | sea | 0 | OK |  |
| 230 | `connect:leaders:alexander-the-great,angela-merkel,augustus,barack-obam` | connect | leaders | 0 | OK |  |
| 231 | `connect:mushrooms:chicken-of-the-woods,deadly-webcap,death-cap,destroy` | connect | mushrooms | 0 | OK |  |
| 232 | `connect:tv:blackadder,breaking-bad,coronation-street,dad-s-army,easten` | connect | tv | 2 | ERROR | Top Gear 'first shown 2002' (2002 relaunch; the show began 1977): year → 1977 (c2_src/tv) |
| 233 | `connect:cats:american-shorthair,birman,british-shorthair,devon-rex,exo` | connect | cats | 0 | OK |  |
| 234 | `connect:insects:blue-morpho,bullet-ant,common-eastern-firefly,common-p` | connect | insects | 1 | OK |  |
| 235 | `connect:flags:brazil,chile,china,iceland,india,ireland,japan,norway,pe` | connect | flags | 1 | OK |  |
| 236 | `connect:sea:american-lobster,atlantic-bluefin-tuna,beluga,chambered-na` | connect | sea | 1 | OK |  |
| 237 | `connect:sharks:basking-shark,blacktip-reef-shark,epaulette-shark,frill` | connect | sharks | 3 | OK |  |
| 238 | `connect:dinosaurs:allosaurus,archaeopteryx,argentinosaurus,deinonychus` | connect | dinosaurs | 3 | OK |  |
| 239 | `connect:leaders:abraham-lincoln,akbar,alexander-the-great,angela-merke` | connect | leaders | 1 | OK |  |
| 240 | `connect:jellyfish:barrel-jellyfish,blue-blubber-jellyfish,blue-ringed-` | connect | jellyfish | 2 | ERROR | connect group "Kind: Jellyfish" while box jellyfish/crystal jelly sit in other groups: value → "True jellyfish" |
| 241 | `connect:leaders:alexander-the-great,angela-merkel,augustus,barack-obam` | connect | leaders | 2 | OK |  |
| 242 | `connect:tv:coronation-street,frasier,friends,grey-s-anatomy,lost,neigh` | connect | tv | 1 | OK |  |
| 243 | `sort:fake::dishes/bobotie,dishes/bratwurst,dishes/ceviche,dishes/kung-` | sort | dishes | 3 | ERROR | same giveaway as #191 (sort real/fake) |
| 244 | `sort:bool:breathesAir:sea/beluga,sea/green-sea-turtle,sea/guineafowl-p` | sort | sea | kids | OK |  |
| 245 | `sort:fake::dinosaurs/dunkleosteus,dinosaurs/gallimimus,dinosaurs/paras` | sort | dinosaurs | 0 | OK |  |
| 246 | `sort:cat:sport:sport/cristiano-ronaldo,sport/diego-maradona,sport/lion` | sort | sport | 1 | OK |  |
| 247 | `sort:fake::books/around-the-world-in-eighty-days,books/pride-and-preju` | sort | books | 1 | OK |  |
| 248 | `sort:cat:century:books/a-bear-called-paddington,books/alice-s-adventur` | sort | books | kids | OK |  |
| 249 | `sort:fake::crimson moon puffball,mushrooms/amethyst-deceiver,mushrooms` | sort | mushrooms | 2 | OK |  |
| 250 | `sort:cat:era:leaders/angela-merkel,leaders/augustus,leaders/cleopatra,` | sort | leaders | 0 | WORDING | "Born in: 1900s or later or Ancient world?": lane I (sort prompt) |
| 251 | `sort:cat:state:elements/aluminium,elements/gold,elements/hydrogen,elem` | sort | elements | 1 | OK |  |
| 252 | `sort:cat:decade:movies/avatar,movies/harry-potter-and-the-philosopher-` | sort | movies | kids | OK |  |
| 253 | `sort:bool:venomous:reptiles/central-bearded-dragon,reptiles/common-toa` | sort | reptiles | 0 | WORDING | "venomous or poisonous or harmless?": lane I (sort prompt) |
| 254 | `sort:bool:venomous:reptiles/cane-toad,reptiles/central-bearded-dragon,` | sort | reptiles | kids | OK |  |
| 255 | `sort:fake::crimson sea mole,golden ribbon turtle,sea/atlantic-horsesho` | sort | sea | 2 | OK |  |
| 256 | `sort:cat:status:reptiles/fire-salamander,reptiles/lace-monitor,reptile` | sort | reptiles | 2 | OK |  |
| 257 | `sort:cat:era:artists/edvard-munch,artists/gustav-klimt,artists/henri-m` | sort | artists | 1 | OK |  |
| 258 | `sort:cat:century:history/atomic-bombs-are-dropped-on-japan,history/ind` | sort | history | 2 | OK |  |
| 259 | `sort:fake::apollo 21,planet nibiru,space/betelgeuse,space/europa,space` | sort | space | 0 | OK |  |
| 260 | `sort:cat:era:people/antonio-vivaldi,people/jane-austen,people/johann-s` | sort | people | 2 | OK |  |
| 261 | `sort:fake::movies/aladdin,movies/jaws,movies/star-wars,movies/the-empi` | sort | movies | 1 | OK |  |
| 262 | `sort:fake::bees/bald-faced-hornet,bees/blue-banded-bee,bees/eastern-ci` | sort | bees | 3 | OK |  |
| 263 | `sort:cat:continent:countries/albania,countries/antigua-and-barbuda,cou` | sort | countries | 3 | OK |  |
| 264 | `sort:cat:size:dogs/bernese-mountain-dog,dogs/chinese-crested,dogs/engl` | sort | dogs | 2 | OK |  |
| 265 | `ladder:reptiles/common-frog` | ladder | reptiles | kids | OK |  |
| 266 | `ladder:dinosaurs/megalodon` | ladder | dinosaurs | kids | OK |  |
| 267 | `ladder:spiders/money-spider` | ladder | spiders | 0 | OK |  |
| 268 | `ladder:books/the-da-vinci-code` | ladder | books | 0 | OK |  |
| 269 | `ladder:body/skull` | ladder | body | kids | OK |  |
| 270 | `ladder:landmarks/statue-of-liberty` | ladder | landmarks | 1 | OK |  |
| 271 | `ladder:books/diary-of-a-wimpy-kid` | ladder | books | kids | OK |  |
| 272 | `ladder:gems/ruby` | ladder | gems | 1 | OK |  |
| 273 | `ladder:sharks/greenland-shark` | ladder | sharks | 0 | OK |  |
| 274 | `ladder:paintings/young-hare` | ladder | paintings | 0 | OK |  |
| 275 | `ladder:leaders/winston-churchill` | ladder | leaders | 0 | OK |  |
| 276 | `ladder:mushrooms/ghost-fungus` | ladder | mushrooms | 2 | OK |  |
| 277 | `ladder:mushrooms/giant-puffball` | ladder | mushrooms | kids | OK |  |
| 278 | `ladder:cats/russian-blue` | ladder | cats | 0 | OK |  |
| 279 | `ladder:people/thomas-edison` | ladder | people | kids | OK |  |
| 280 | `ladder:flowers/dandelion` | ladder | flowers | kids | OK |  |
| 281 | `ladder:people/katherine-johnson` | ladder | people | 3 | OK |  |
| 282 | `ladder:cats/scottish-fold` | ladder | cats | 1 | WORDING | "The breed comes from United Kingdom." → theC() article helper (cats, dogs, dishes, inventions, currencies) |
| 283 | `ladder:bees/eastern-cicada-killer` | ladder | bees | 3 | OK |  |
| 284 | `ladder:body/appendix` | ladder | body | 3 | OK |  |
| 285 | `ladder:insects/bogong-moth` | ladder | insects | 3 | OK |  |
| 286 | `ladder:movies/the-lord-of-the-rings-the-two-towers` | ladder | movies | 2 | OK |  |
| 287 | `chain:Gal Gadot>Dwayne Johnson>Jack Black>Jackie Chan` | chain | actors | 2 | OK |  |
| 288 | `chain:Cillian Murphy>Leonardo DiCaprio>Cate Blanchett>Elijah Wood` | chain | actors | 0 | OK |  |
| 289 | `chain:Natalie Portman>Samuel L. Jackson>Chris Pratt>Vin Diesel` | chain | actors | 1 | OK |  |
| 290 | `chain:Ian McKellen>Emma Thompson>Kate Winslet>Leonardo DiCaprio` | chain | actors | 3 | OK |  |
| 291 | `chain:Leonardo DiCaprio>Jennifer Lawrence>Hugh Jackman>Zendaya` | chain | actors | 2 | OK |  |
| 292 | `chain:Jack Nicholson>Leonardo DiCaprio>Cillian Murphy>Robert Downey Jr` | chain | actors | 0 | OK |  |
| 293 | `chain:Emma Thompson>Hugh Grant>Kate Winslet>Leonardo DiCaprio` | chain | actors | 1 | OK |  |
| 294 | `chain:Daniel Craig>Judi Dench>Cate Blanchett>Timothée Chalamet` | chain | actors | 3 | OK |  |
| 295 | `chain:Michelle Yeoh>Jackie Chan>Jack Black>Dwayne Johnson` | chain | actors | 2 | OK |  |
| 296 | `chain:Paul Newman>Tom Cruise>Jack Nicholson>Leonardo DiCaprio` | chain | actors | 0 | OK |  |
| 297 | `chain:Bruce Willis>Samuel L. Jackson>Chris Pratt>Vin Diesel` | chain | actors | 1 | OK |  |
| 298 | `chain:Robert De Niro>Meryl Streep>Timothée Chalamet>Zendaya` | chain | actors | 3 | OK |  |
| 299 | `chain:Brad Pitt>Leonardo DiCaprio>Timothée Chalamet>Anne Hathaway` | chain | actors | 2 | OK |  |
| 300 | `chain:Jackie Chan>Jack Black>Dwayne Johnson>Vin Diesel` | chain | actors | 0 | OK |  |

## Round 2: 140 generated questions (seed qf2, after fixes)
| # | question id | format | pack | diff | verdict | fix |
|---|---|---|---|---|---|---|
| 1 | `mc:cat:era:artists/claude-monet` | mc | artists | 1 | OK |  |
| 2 | `mc:cat:continent:flags/barbados` | mc | flags | 0 | OK |  |
| 3 | `mc:num:born:hi:alexander-the-great,augustus,george-washington,julius-c` | mc | leaders | 3 | WORDING | explain "Julius Caesar: -100": lane I (factText BC years) |
| 4 | `mc:num:countries:hi:central-african-cfa-franc,euro,serbian-dinar,swiss` | mc | currencies | 2 | OK |  |
| 5 | `mc:cat:era:people/martin-luther` | mc | people | 3 | OK |  |
| 6 | `mc:cat:country:landmarks/st-peter-s-basilica` | mc | landmarks | 0 | OK |  |
| 7 | `mc:cat:edibility:mushrooms/giant-puffball` | mc | mushrooms | kids | OK |  |
| 8 | `mc:cat:origin:cats/abyssinian` | mc | cats | 2 | OK |  |
| 9 | `mc:cat:origin:cats/bengal` | mc | cats | kids | OK |  |
| 10 | `mc:rev:size:dogs/bullmastiff` | mc | dogs | 3 | OK |  |
| 11 | `tf:cat:kind:body/thyroid:Cell` | tf | body | 3 | OK |  |
| 12 | `tf:cat:decade:movies/shrek-2:2000s` | tf | movies | kids | OK |  |
| 13 | `tf:cat:runnerUp:sport/world-cup-1990:Brazil` | tf | sport | 2 | OK |  |
| 14 | `tf:cat:decade:movies/furious-7:2010s` | tf | movies | 2 | OK |  |
| 15 | `tf:cat:century:history/sputnik-the-first-satellite-is-launched:20th ce` | tf | history | 2 | OK |  |
| 16 | `tf:img:insects/magnetic-termite:magnetic-termite` | tf | insects | 0 | OK |  |
| 17 | `tf:cat:origin:cats/tonkinese:Egypt` | tf | cats | 3 | OK |  |
| 18 | `tf:cat:country:inventions/microwave-oven:China` | tf | inventions | kids | WORDING | "The the microwave oven was invented in China." (lnamePrefix 'the ' + template 'The {lname}') → templates fixed (c1_src/inventions) |
| 19 | `tf:img:spiders/peacock-spider:peacock-spider` | tf | spiders | 1 | OK |  |
| 20 | `tf:img:trees/dragons-blood-tree:holly` | tf | trees | 3 | OK |  |
| 21 | `hilo:lengthM:snakes/olive-python:snakes/dugite` | hilo | snakes | 3 | OK |  |
| 22 | `hilo:born:actors/angelina-jolie:actors/anthony-hopkins` | hilo | actors | 2 | OK |  |
| 23 | `hilo:built:landmarks/blue-mosque:landmarks/trevi-fountain` | hilo | landmarks | 2 | OK |  |
| 24 | `hilo:year:books/les-miserables:books/the-time-machine` | hilo | books | 2 | OK |  |
| 25 | `hilo:year:books/the-hobbit:books/the-gruffalo` | hilo | books | kids | OK |  |
| 26 | `hilo:legSpanCm:spiders/goliath-birdeater:spiders/mexican-red-knee-tara` | hilo | spiders | 2 | OK |  |
| 27 | `hilo:massKg:dogs/bloodhound:dogs/dachshund` | hilo | dogs | 1 | OK |  |
| 28 | `hilo:born:people/pele:people/michael-jordan` | hilo | people | 0 | OK |  |
| 29 | `hilo:born:actors/robin-williams:actors/margot-robbie` | hilo | actors | 1 | OK |  |
| 30 | `hilo:built:landmarks/empire-state-building:landmarks/gateway-arch` | hilo | landmarks | 0 | OK |  |
| 31 | `odd:bool:venomous:snakes/common-garter-snake:common-krait,mangrove-sna` | odd | snakes | 0 | OK |  |
| 32 | `odd:cat:cls:reptiles/goliath-frog:gila-monster,leopard-gecko,tuatara` | odd | reptiles | 2 | OK |  |
| 33 | `odd:cat:system:body/white-blood-cell:skull,spine` | odd | body | kids | OK |  |
| 34 | `odd:cat:diet:mammals/polar-bear:brown-throated-sloth,common-wombat,red` | odd | mammals | 1 | OK |  |
| 35 | `odd:cat:era:actors/humphrey-bogart:angelina-jolie,keira-knightley,leon` | odd | actors | 0 | OK |  |
| 36 | `odd:cat:era:leaders/mahatma-gandhi:barack-obama,nelson-mandela` | odd | leaders | kids | OK |  |
| 37 | `odd:cat:drivingSide:countries/new-zealand:belgium,denmark,iceland` | odd | countries | 1 | OK |  |
| 38 | `odd:cat:continent:capitals/dublin:cairo,nairobi,pretoria` | odd | capitals | 1 | OK |  |
| 39 | `odd:cat:era:artists/paul-gauguin:jackson-pollock,roy-lichtenstein,yayo` | odd | artists | 3 | OK |  |
| 40 | `odd:cat:kind:sea/magnificent-sea-anemone:beluga,harbour-seal,sperm-wha` | odd | sea | 0 | OK |  |
| 41 | `order:lengthM:snakes/lowlands-copperhead,snakes/scrub-python,snakes/sm` | order | snakes | 3 | OK |  |
| 42 | `order:population:countries/antigua-and-barbuda,countries/cyprus,countr` | order | countries | 3 | OK |  |
| 43 | `order:built:landmarks/chateau-frontenac,landmarks/gateway-of-india,lan` | order | landmarks | 3 | OK |  |
| 44 | `order:lengthM:sea/blue-tang,sea/ocellaris-clownfish,sea/orca,sea/sea-o` | order | sea | 1 | OK |  |
| 45 | `order:year:history/germany-is-reunified,history/the-battle-of-marathon` | order | history | 0 | OK |  |
| 46 | `order:built:landmarks/burj-al-arab,landmarks/gateway-arch,landmarks/sy` | order | landmarks | 2 | OK |  |
| 47 | `order:year:inventions/cochlear-implant,inventions/electric-drill,inven` | order | inventions | 3 | OK |  |
| 48 | `order:areaKm2:countries/pakistan,countries/rwanda,countries/sudan,coun` | order | countries | 2 | OK |  |
| 49 | `order:lengthM:snakes/african-rock-python,snakes/eastern-green-mamba,sn` | order | snakes | 2 | OK |  |
| 50 | `order:boxOfficeUSD:movies/grease,movies/harry-potter-and-the-half-bloo` | order | movies | 2 | OK |  |
| 51 | `match:danger:spiders/bold-jumping-spider,spiders/brown-widow,spiders/i` | match | spiders | 3 | OK |  |
| 52 | `match:status:sea/common-cuttlefish,sea/giant-pacific-octopus,sea/hawks` | match | sea | 3 | WORDING | "its conservation status (iucn)": match lower-cases labels: lane I |
| 53 | `match:artist:paintings/a-sunday-afternoon-on-the-island-of-la-grande-j` | match | paintings | 2 | OK |  |
| 54 | `match:continent:flags/colombia,flags/ethiopia,flags/laos,flags/malawi,` | match | flags | 2 | OK |  |
| 55 | `match:img:cats/american-shorthair,cats/exotic-shorthair,cats/maine-coo` | match | cats | 0 | OK |  |
| 56 | `match:code:currencies/indian-rupee,currencies/mexican-peso,currencies/` | match | currencies | 1 | WORDING | "its iso code" → matchPrompt (c2_build_geo) |
| 57 | `match:img:birds/mallard,birds/ostrich,birds/red-junglefowl,birds/ruby-` | match | birds | kids | OK |  |
| 58 | `match:img:body/brain,body/red-blood-cell,body/skull,body/tongue` | match | body | kids | OK |  |
| 59 | `match:img:dishes/fairy-bread,dishes/falafel,dishes/pavlova,dishes/taco` | match | dishes | 1 | OK |  |
| 60 | `match:img:bees/asian-hornet,bees/european-paper-wasp,bees/leafcutter-b` | match | bees | 2 | OK |  |
| 61 | `number:born:explorers/ibn-battuta` | number | explorers | 3 | OK |  |
| 62 | `number:died:leaders/alexander-the-great` | number | leaders | 0 | OK |  |
| 63 | `number:countries:languages/urdu` | number | languages | 2 | WORDING | "What is the countries where it is a main language of Urdu?" → askNumber (c2_build_geo) |
| 64 | `number:countries:currencies/czech-koruna` | number | currencies | 3 | WORDING | "Czech koruna: countries using it?" → askNumber (c2_build_geo) |
| 65 | `number:heightM:trees/kauri` | number | trees | 3 | OK |  |
| 66 | `number:year:movies/the-lion-king` | number | movies | 0 | OK |  |
| 67 | `number:lengthM:sea/chambered-nautilus` | number | sea | 2 | WORDING | "typical length of Chambered nautilus": lane I (number uses name) |
| 68 | `number:countries:currencies/japanese-yen` | number | currencies | 1 | WORDING | same as #64 (fixed) |
| 69 | `number:heightM:trees/horse-chestnut` | number | trees | 1 | OK |  |
| 70 | `number:year:paintings/the-birth-of-venus` | number | paintings | 0 | OK |  |
| 71 | `type:planetType:space/neptune` | type | space | 0 | OK |  |
| 72 | `type:img:dinosaurs/megatherium` | type | dinosaurs | 0 | OK |  |
| 73 | `type:orbits:space/triton` | type | space | 3 | OK |  |
| 74 | `type:img:trees/golden-wattle` | type | trees | 0 | OK |  |
| 75 | `type:clue:tv/twin-peaks` | type | tv | 3 | OK |  |
| 76 | `type:clue:body/gallbladder` | type | body | 0 | OK |  |
| 77 | `type:img:flowers/spear-thistle` | type | flowers | 2 | OK |  |
| 78 | `type:clue:currencies/bahamian-dollar` | type | currencies | 2 | WORDING | "Name the currencie" → pack noun 'currency' (also 'countrie') |
| 79 | `type:host:sport/summer-2008` | type | sport | 1 | OK |  |
| 80 | `type:era:leaders/indira-gandhi` | type | leaders | 3 | ERROR | type asks "When was Indira Gandhi born?" expecting the typed bin "1900s or later": unanswerable as free text: lane I |
| 81 | `fake:mammals:golden maned tapir` | fake | mammals | 1 | OK |  |
| 82 | `fake:space:apollo 21` | fake | space | 3 | OK |  |
| 83 | `fake:snakes:velvet tailed cobra` | fake | snakes | 2 | OK |  |
| 84 | `fake:reptiles:golden marsh tuatara:goliath-frog,perentie,veiled-chamel` | fake | reptiles | 3 | OK |  |
| 85 | `fake:space:comet brightwater` | fake | space | 1 | OK |  |
| 86 | `fake:inventions:steam powered umbrella:hot-air-balloon,mobile-phone,te` | fake | inventions | 1 | OK |  |
| 87 | `fake:cats:highland curlpaw` | fake | cats | 1 | OK |  |
| 88 | `fake:trees:velvet leaf mountain gum` | fake | trees | 1 | OK |  |
| 89 | `fake:movies:midnight at the paradise diner` | fake | movies | 2 | OK |  |
| 90 | `fake:insects:northern thunder moth` | fake | insects | 1 | OK |  |
| 91 | `quote:first:books/around-the-world-in-eighty-days:mr phileas fogg live` | quote | books | kids | WORDING | first line cut at a comma ("…Burlington Gardens,") → trailing , ; : become … (c2_build_books) |
| 92 | `quote:quote:movies/the-avengers:puny god` | quote | movies | 0 | OK |  |
| 93 | `quote:quote:movies/the-sixth-sense:i see dead people` | quote | movies | 3 | OK |  |
| 94 | `quote:quote:movies/grease:tell me about it stud` | quote | movies | 2 | OK |  |
| 95 | `quote:first:books/anna-karenina:happy families are all a` | quote | books | 3 | OK |  |
| 96 | `quote:quote:movies/avengers-endgame:i love you 3000` | quote | movies | kids | OK |  |
| 97 | `quote:quote:quotes/lewis-carroll:off with her head` | quote | quotes | kids | WORDING | "Off with her head!" Who said it? → Lewis Carroll (the Queen of Hearts says it) → quotes.quotePrompt "Who said or wrote it?" |
| 98 | `quote:first:books/wuthering-heights:1801 i have just returne` | quote | books | 2 | OK |  |
| 99 | `quote:quote:movies/frozen:some people are worth me` | quote | movies | 1 | OK |  |
| 100 | `quote:quote:quotes/jean-jacques-rousseau:man is born free and eve` | quote | quotes | 2 | OK |  |
| 101 | `connect:spiders:australian-golden-orb-weaver,black-house-spider,black-` | connect | spiders | 1 | OK |  |
| 102 | `connect:insects:bullet-ant,colorado-potato-beetle,common-eastern-firef` | connect | insects | 0 | OK |  |
| 103 | `connect:people:anne-frank,antonio-vivaldi,carl-sagan,charlie-chaplin,f` | connect | people | 0 | OK |  |
| 104 | `connect:capitals:andorra-la-vella,apia,basseterre,djibouti-city,honiar` | connect | capitals | 3 | OK |  |
| 105 | `connect:artists:albrecht-durer,caravaggio,edgar-degas,edvard-munch,fra` | connect | artists | 2 | OK |  |
| 106 | `connect:countries:bahamas,bahrain,bhutan,dominica,lithuania,maldives,m` | connect | countries | 3 | OK |  |
| 107 | `connect:dinosaurs:baryonyx,diprotodon,gallimimus,megalania,meganeura,m` | connect | dinosaurs | 0 | OK |  |
| 108 | `connect:mushrooms:deadly-webcap,death-cap,destroying-angel,field-mushr` | connect | mushrooms | 0 | OK |  |
| 109 | `connect:countries:burundi,dominican-republic,guatemala,israel,malawi,n` | connect | countries | 2 | OK |  |
| 110 | `connect:dishes:crepe,croissant,fish-and-chips,full-english-breakfast,g` | connect | dishes | 1 | OK |  |
| 111 | `sort:bool:venomous:snakes/carpet-python,snakes/common-european-adder,s` | sort | snakes | kids | OK |  |
| 112 | `sort:fake::crimson funnel web,shadow wolf tarantula,spiders/brazilian-` | sort | spiders | 2 | OK |  |
| 113 | `sort:fake::crimson starbell,flowers/common-morning-glory,flowers/kanga` | sort | flowers | 0 | OK |  |
| 114 | `sort:fake::books/a-christmas-carol,books/gulliver-s-travels,books/moby` | sort | books | 0 | OK |  |
| 115 | `sort:cat:country:landmarks/big-ben,landmarks/great-pyramid-of-giza,lan` | sort | landmarks | kids | OK |  |
| 116 | `sort:cat:status:reptiles/fire-salamander,reptiles/leopard-gecko,reptil` | sort | reptiles | 0 | OK |  |
| 117 | `sort:fake::golden widows veil,mushrooms/amethyst-deceiver,mushrooms/ch` | sort | mushrooms | 0 | OK |  |
| 118 | `sort:cat:size:dogs/airedale-terrier,dogs/basenji,dogs/bedlington-terri` | sort | dogs | 3 | OK |  |
| 119 | `sort:cat:era:explorers/amelia-earhart,explorers/charles-lindbergh,expl` | sort | explorers | 2 | OK |  |
| 120 | `sort:cat:kind:body/clavicle,body/femur,body/humerus,body/large-intesti` | sort | body | 2 | OK |  |
| 121 | `ladder:insects/acorn-weevil` | ladder | insects | 0 | OK |  |
| 122 | `ladder:currencies/jamaican-dollar` | ladder | currencies | 1 | OK |  |
| 123 | `ladder:cats/devon-rex` | ladder | cats | 2 | OK |  |
| 124 | `ladder:sharks/spotted-wobbegong` | ladder | sharks | 0 | OK |  |
| 125 | `ladder:elements/sodium` | ladder | elements | 1 | OK |  |
| 126 | `ladder:gems/garnet` | ladder | gems | 2 | OK |  |
| 127 | `ladder:dogs/staffordshire-bull-terrier` | ladder | dogs | 2 | OK |  |
| 128 | `ladder:mammals/american-black-bear` | ladder | mammals | 2 | OK |  |
| 129 | `ladder:actors/jackie-chan` | ladder | actors | kids | OK |  |
| 130 | `ladder:dogs/siberian-husky` | ladder | dogs | 1 | OK |  |
| 131 | `chain:Daniel Radcliffe>Emma Watson>Ian McKellen>Elijah Wood` | chain | actors | 3 | OK |  |
| 132 | `chain:Leonardo DiCaprio>Meryl Streep>Robert De Niro>Natalie Portman` | chain | actors | 0 | OK |  |
| 133 | `chain:Emma Watson>Emma Thompson>Kate Winslet>Leonardo DiCaprio` | chain | actors | 1 | OK |  |
| 134 | `chain:Cillian Murphy>Robert Downey Jr.>Tom Holland>Zendaya` | chain | actors | 2 | OK |  |
| 135 | `chain:Margot Robbie>Al Pacino>Natalie Portman>Anthony Hopkins` | chain | actors | 3 | OK |  |
| 136 | `chain:Gal Gadot>Vin Diesel>Robert Downey Jr.>Chris Hemsworth` | chain | actors | 0 | OK |  |
| 137 | `chain:Benedict Cumberbatch>Tom Holland>Robert Downey Jr.>Cillian Murph` | chain | actors | 1 | OK |  |
| 138 | `chain:Anne Hathaway>Hugh Jackman>Nicole Kidman>Tom Cruise` | chain | actors | 2 | OK |  |
| 139 | `chain:Marlon Brando>Al Pacino>Natalie Portman>Idris Elba` | chain | actors | 3 | OK |  |
| 140 | `chain:Daniel Craig>Judi Dench>Cate Blanchett>Elijah Wood` | chain | actors | 0 | OK |  |

## Hand-written questions (230; A = first draw, B = second draw of general/kids/sport)
| # | pack | question id | kind | diff | verdict | fix |
|---|---|---|---|---|---|---|
| A1 | actors | `who-meryl-streep` | mc | 2 | WORDING | "…in Mamma Mia!." double punctuation (13 strings in actors/artists/countries/landmarks/paintings/words) → tidy pass in c2_lib.writePack |
| A2 | actors | `who-kate-winslet` | mc | 2 | OK |  |
| A3 | actors | `born-robert-downey-jr` | mc | 3 | OK |  |
| A4 | artists | `who-grant-wood` | mc | 3 | OK |  |
| A5 | artists | `who-henri-matisse` | mc | 1 | OK |  |
| A6 | artists | `born-rembrandt` | mc | 3 | OK |  |
| A7 | bees | `q11` | mc | 1 | OK |  |
| A8 | bees | `q13` | tf | 1 | OK |  |
| A9 | bees | `q3` | tf | 1 | OK |  |
| A10 | birds | `q1` | mc | 1 | OK |  |
| A11 | birds | `q2` | mc | 2 | OK |  |
| A12 | birds | `q14` | mc | 2 | OK |  |
| A13 | body | `q32` | order | 2 | OK |  |
| A14 | body | `q22` | mc | 1 | OK |  |
| A15 | body | `q17` | mc | 2 | OK |  |
| A16 | books | `auth-d968c99d` | mc | 1 | OK |  |
| A17 | books | `year-crime-and-punishment` | mc | 3 | OK |  |
| A18 | books | `auth-cdbed143` | mc | 3 | OK |  |
| A19 | capitals | `capr-phnom-penh` | mc | 2 | OK |  |
| A20 | capitals | `capr-lima` | mc | 1 | OK |  |
| A21 | capitals | `capr-n-djamena` | mc | 2 | OK |  |
| A22 | cats | `q5` | mc | 2 | OK |  |
| A23 | cats | `q12` | mc | 1 | OK |  |
| A24 | cats | `q2` | mc | 1 | WORDING | "born without a tail" overstated (many Manx have stumps/tails) → "famous for often having no tail" |
| A25 | countries | `top-population-europe-2` | mc | 2 | OK |  |
| A26 | countries | `cont-iceland` | mc | 1 | OK |  |
| A27 | countries | `cont-comoros` | mc | 3 | OK |  |
| A28 | currencies | `cur-bahrain` | mc | 3 | OK |  |
| A29 | currencies | `cur-dominica` | mc | 3 | OK |  |
| A30 | currencies | `curr-china` | mc | 2 | OK |  |
| A31 | dinosaurs | `q3` | tf | 2 | OK |  |
| A32 | dinosaurs | `q8` | mc | 2 | OK |  |
| A33 | dinosaurs | `q5` | mc | 1 | OK |  |
| A34 | dishes | `q9` | mc | 2 | OK |  |
| A35 | dishes | `q10` | mc | 3 | OK |  |
| A36 | dishes | `q2` | mc | 1 | OK |  |
| A37 | dogs | `q12` | mc | 1 | OK |  |
| A38 | dogs | `q5` | mc | 1 | OK |  |
| A39 | dogs | `q1` | mc | 1 | OK |  |
| A40 | elements | `q13` | mc | 2 | OK |  |
| A41 | elements | `q2` | mc | 2 | OK |  |
| A42 | elements | `q10` | number | 2 | OK |  |
| A43 | explorers | `born-yuri-gagarin` | mc | 3 | OK |  |
| A44 | explorers | `born-roald-amundsen` | mc | 3 | OK |  |
| A45 | explorers | `who-ibn-battuta` | mc | 3 | OK |  |
| A46 | flags | `f-cyprus` | mc | 2 | OK |  |
| A47 | flags | `f-stars-us` | mc | 1 | OK |  |
| A48 | flags | `f-cedar` | mc | 2 | OK |  |
| A49 | flowers | `q5` | mc | 2 | OK |  |
| A50 | flowers | `q8` | tf | 1 | OK |  |
| A51 | flowers | `q6` | mc | 2 | OK |  |
| A52 | gems | `q2` | mc | 2 | OK |  |
| A53 | gems | `q11` | mc | 1 | OK |  |
| A54 | gems | `q8` | mc | 1 | OK |  |
| A55 | general | `gen-his-a5b8db` | mc | 1 | OK |  |
| A56 | general | `gen-math-5fb5f5` | number | 2 | OK |  |
| A57 | general | `gen-geo-f731c4` | mc | 2 | OK |  |
| A58 | general | `gen-art-5a52d3` | mc | 2 | OK |  |
| A59 | general | `gen-body-871788` | number | 2 | OK |  |
| A60 | general | `gen-math-c92cc8` | number | 2 | OK |  |
| A61 | general | `gen-ani-384c3c` | mc | 3 | OK |  |
| A62 | general | `gen-pop-26a557` | number | 2 | OK |  |
| A63 | general | `gen-tech-e3b8ea` | mc | 3 | OK |  |
| A64 | general | `gen-tech-cc7b93` | mc | 2 | OK |  |
| A65 | general | `gen-ani-00ea7a` | tf | 2 | OK |  |
| A66 | general | `gen-body-d8d681` | tf | 1 | OK |  |
| A67 | general | `gen-art-0890f2` | mc | 3 | OK |  |
| A68 | general | `gen-his-0f152e` | mc | 1 | OK |  |
| A69 | general | `gen-math-72620d` | mc | 1 | OK |  |
| A70 | general | `gen-geo-2a2d83` | mc | 1 | OK |  |
| A71 | general | `gen-lang-205e22` | mc | 3 | OK |  |
| A72 | general | `gen-pop-ea916a` | number | 1 | OK |  |
| A73 | general | `gen-space-42049a` | mc | 1 | OK |  |
| A74 | general | `gen-sci-944e13` | number | 1 | OK |  |
| A75 | general | `gen-space-bae9d8` | number | 3 | OK |  |
| A76 | general | `gen-math-281d87` | number | 2 | OK |  |
| A77 | general | `gen-geo-24bf18` | mc | 3 | OK |  |
| A78 | general | `gen-body-6a43c3` | mc | 2 | OK |  |
| A79 | history | `num-the-first-iphone-goes-on-sale` | number | 3 | OK |  |
| A80 | history | `year-the-battle-of-the-somme` | mc | 2 | OK |  |
| A81 | history | `first-the-gunpowder-plot-the-channel-tunnel-opens` | mc | 1 | OK |  |
| A82 | insects | `q16` | mc | 3 | OK |  |
| A83 | insects | `q2` | number | 2 | OK |  |
| A84 | insects | `q18` | mc | 3 | OK |  |
| A85 | inventions | `q3` | mc | 1 | OK |  |
| A86 | inventions | `q1` | mc | 1 | OK |  |
| A87 | inventions | `q13` | mc | 2 | OK |  |
| A88 | jellyfish | `q5` | tf | 2 | OK |  |
| A89 | jellyfish | `q11` | tf | 1 | OK |  |
| A90 | jellyfish | `q8` | mc | 1 | OK |  |
| A91 | kids-nature | `snd1` | mc | 1 | OK |  |
| A92 | kids-nature | `pic4` | mc | 1 | OK |  |
| A93 | kids-nature | `f21` | mc | 1 | OK |  |
| A94 | kids-nature | `f29` | mc | 1 | OK |  |
| A95 | kids-nature | `f18` | mc | 1 | OK |  |
| A96 | kids-nature | `pic32` | mc | 1 | OK |  |
| A97 | kids | `kid-ani-d79906` | mc | 1 | OK |  |
| A98 | kids | `kid-space-fb2147` | mc | 1 | OK |  |
| A99 | kids | `kid-world-35601c` | mc | 1 | OK |  |
| A100 | kids | `kid-tale-3535f4` | mc | 1 | OK |  |
| A101 | kids | `kid-count-7be2a9` | mc | 1 | OK |  |
| A102 | kids | `kid-body-ad2618` | mc | 1 | OK |  |
| A103 | kids | `kid-shape-0a55b6` | mc | 1 | OK |  |
| A104 | kids | `kid-ani-3f650c` | mc | 1 | OK |  |
| A105 | kids | `kid-ani-9ae9e4` | tf | 1 | OK |  |
| A106 | kids | `kid-ani-a7e0c5` | mc | 1 | OK |  |
| A107 | kids | `kid-tale-9b5466` | mc | 1 | OK |  |
| A108 | kids | `kid-body-e6712c` | mc | 1 | OK |  |
| A109 | kids | `kid-tale-4f1f10` | mc | 1 | OK |  |
| A110 | kids | `kid-count-22ef67` | mc | 1 | OK |  |
| A111 | kids | `kid-shape-260414` | mc | 1 | OK |  |
| A112 | kids | `kid-weather-98bbfc` | mc | 1 | OK |  |
| A113 | kids | `kid-world-338695` | mc | 1 | OK |  |
| A114 | kids | `kid-weather-0d307c` | mc | 1 | OK |  |
| A115 | landmarks | `lmc-great-barrier-reef` | mc | 2 | OK |  |
| A116 | landmarks | `lmc-the-little-mermaid` | mc | 2 | OK |  |
| A117 | landmarks | `lmc-uluru` | mc | 2 | OK |  |
| A118 | languages | `langc-burmese` | mc | 3 | OK |  |
| A119 | languages | `langc-bengali` | mc | 2 | OK |  |
| A120 | languages | `langc-icelandic` | mc | 2 | OK |  |
| A121 | leaders | `who-akbar` | mc | 3 | OK |  |
| A122 | leaders | `who-franklin-d-roosevelt` | mc | 2 | OK |  |
| A123 | leaders | `who-qin-shi-huang` | mc | 2 | OK |  |
| A124 | mammals | `q5` | tf | 1 | OK |  |
| A125 | mammals | `q13` | mc | 1 | OK |  |
| A126 | mammals | `q2` | mc | 1 | OK |  |
| A127 | movies | `top-1986` | mc | 2 | OK |  |
| A128 | movies | `top-2018` | mc | 2 | OK |  |
| A129 | movies | `year-star-wars-the-force-awakens` | mc | 2 | OK |  |
| A130 | mushrooms | `q3` | tf | 2 | OK |  |
| A131 | mushrooms | `q12` | mc | 1 | OK |  |
| A132 | mushrooms | `q1` | tf | 1 | OK |  |
| A133 | paintings | `artist-the-hay-wain` | mc | 2 | OK |  |
| A134 | paintings | `name-mr-and-mrs-andrews` | mc | 3 | OK |  |
| A135 | paintings | `artist-the-milkmaid` | mc | 2 | OK |  |
| A136 | people | `who-mary-anning` | mc | 3 | OK |  |
| A137 | people | `born-mark-twain` | mc | 3 | OK |  |
| A138 | people | `born-mother-teresa` | mc | 3 | OK |  |
| A139 | quotes | `who-margaret-thatcher-0` | mc | 2 | OK |  |
| A140 | quotes | `who-isaac-newton-0` | mc | 2 | OK |  |
| A141 | quotes | `mis-903eaf3d` | tf | 1 | OK |  |
| A142 | reptiles | `q9` | mc | 2 | OK |  |
| A143 | reptiles | `q3` | mc | 2 | OK |  |
| A144 | reptiles | `q4` | mc | 1 | OK |  |
| A145 | sea | `q1` | mc | 1 | OK |  |
| A146 | sea | `q10` | mc | 2 | OK |  |
| A147 | sea | `q3` | tf | 1 | OK |  |
| A148 | sharks | `q10` | mc | 2 | OK |  |
| A149 | sharks | `q8` | mc | 1 | OK |  |
| A150 | sharks | `q5` | mc | 2 | OK |  |
| A151 | snakes | `q6` | mc | 2 | OK |  |
| A152 | snakes | `q4` | tf | 2 | OK |  |
| A153 | snakes | `q1` | mc | 1 | OK |  |
| A154 | space | `q20` | tf | 1 | OK |  |
| A155 | space | `q8` | mc | 1 | OK |  |
| A156 | space | `q7` | mc | 1 | OK |  |
| A157 | spiders | `q2` | tf | 1 | OK |  |
| A158 | spiders | `q7` | tf | 1 | OK |  |
| A159 | spiders | `q4` | mc | 2 | OK |  |
| A160 | sport | `spt-rules-35fd1f` | number | 3 | OK |  |
| A161 | sport | `spt-rules-ea9485` | number | 2 | OK |  |
| A162 | sport | `spt-football-5e4846` | mc | 2 | OK |  |
| A163 | sport | `spt-olympics-7a5906` | order | 3 | OK |  |
| A164 | sport | `spt-rules-cb0edf` | number | 1 | OK |  |
| A165 | sport | `spt-rules-683f9f` | number | 2 | OK |  |
| A166 | sport | `spt-rules-aa4e2d` | mc | 2 | OK |  |
| A167 | sport | `spt-rules-d20fdb` | number | 2 | OK |  |
| A168 | sport | `spt-rules-c63b2d` | number | 3 | OK |  |
| A169 | sport | `spt-rules-6a1812` | order | 3 | OK |  |
| A170 | trees | `q5` | mc | 1 | OK |  |
| A171 | trees | `q8` | mc | 2 | OK |  |
| A172 | trees | `q7` | mc | 2 | OK |  |
| A173 | tv | `tvq-b8b42044` | mc | 3 | OK |  |
| A174 | tv | `tvq-4c2e199d` | mc | 2 | OK |  |
| A175 | tv | `tvq-bee9570b` | tf | 1 | OK |  |
| A176 | words | `origin-yoga` | mc | 1 | OK |  |
| A177 | words | `wq-269f58b2` | tf | 2 | OK |  |
| A178 | words | `named-teddy-bear` | mc | 1 | OK |  |
| B1 | general | `gen-tech-fa3d42` | mc | 2 | OK |  |
| B2 | general | `gen-pop-fcb56c` | mc | 2 | OK |  |
| B3 | general | `gen-his-2e685b` | mc | 2 | OK |  |
| B4 | general | `gen-geo-1247c8` | order | 2 | OK |  |
| B5 | general | `gen-art-248a9c` | mc | 2 | OK |  |
| B6 | general | `gen-food-cc276b` | mc | 1 | OK |  |
| B7 | general | `gen-body-d604b6` | mc | 1 | OK |  |
| B8 | general | `gen-lang-278ff8` | tf | 2 | OK |  |
| B9 | general | `gen-math-12092d` | number | 1 | OK |  |
| B10 | general | `gen-tech-98fe07` | number | 3 | OK |  |
| B11 | general | `gen-sci-944e13` | number | 1 | OK |  |
| B12 | general | `gen-body-d660cc` | mc | 2 | OK |  |
| B13 | general | `gen-geo-f26d35` | mc | 2 | OK |  |
| B14 | general | `gen-nat-3fb104` | mc | 3 | OK |  |
| B15 | general | `gen-sci-345738` | mc | 2 | OK |  |
| B16 | general | `gen-his-4d8458` | mc | 1 | OK |  |
| B17 | general | `gen-math-c92cc8` | number | 2 | OK |  |
| B18 | general | `gen-ani-9c8df0` | mc | 3 | OK |  |
| B19 | general | `gen-geo-fb2493` | tf | 2 | OK |  |
| B20 | general | `gen-tech-55c7bd` | mc | 1 | OK |  |
| B21 | general | `gen-sci-670056` | mc | 1 | OK |  |
| B22 | general | `gen-tech-938b86` | mc | 2 | OK |  |
| B23 | general | `gen-body-b0be94` | mc | 3 | OK |  |
| B24 | general | `gen-tech-55d490` | mc | 1 | OK |  |
| B25 | general | `gen-tech-2a6f00` | mc | 1 | OK |  |
| B26 | general | `gen-body-fe293e` | mc | 3 | OK |  |
| B27 | general | `gen-sci-315450` | mc | 3 | OK |  |
| B28 | general | `gen-pop-851e4a` | mc | 2 | OK |  |
| B29 | general | `gen-his-0d4e0b` | mc | 1 | OK |  |
| B30 | general | `gen-his-7ecf7c` | mc | 2 | OK |  |
| B31 | kids | `kid-space-9537e4` | mc | 2 | OK |  |
| B32 | kids | `kid-ani-8189d3` | mc | 1 | OK |  |
| B33 | kids | `kid-body-e6712c` | mc | 1 | OK |  |
| B34 | kids | `kid-world-e8fb27` | mc | 1 | OK |  |
| B35 | kids | `kid-space-e2d858` | tf | 2 | OK |  |
| B36 | kids | `kid-shape-a56b42` | mc | 1 | OK |  |
| B37 | kids | `kid-ani-aba6f3` | mc | 1 | OK |  |
| B38 | kids | `kid-body-2002ab` | mc | 1 | OK |  |
| B39 | kids | `kid-shape-a93bc3` | mc | 1 | OK |  |
| B40 | kids | `kid-shape-82e218` | mc | 1 | OK |  |
| B41 | sport | `spt-records-2145e0` | mc | 2 | OK |  |
| B42 | sport | `spt-football-b9de82` | mc | 1 | OK |  |
| B43 | sport | `spt-rules-5305e6` | mc | 3 | OK |  |
| B44 | sport | `spt-records-6899ba` | number | 2 | OK |  |
| B45 | sport | `spt-records-4cf3a4` | tf | 3 | OK |  |
| B46 | sport | `spt-rules-519f3e` | number | 2 | OK |  |
| B47 | sport | `spt-rules-f54495` | mc | 1 | OK |  |
| B48 | sport | `spt-rules-2c1047` | number | 2 | OK |  |
| B49 | sport | `spt-rules-62095b` | mc | 3 | OK |  |
| B50 | sport | `spt-rules-73e0e6` | mc | 1 | OK |  |
| B51 | sport | `spt-rules-b654ba` | mc | 3 | OK |  |
| B52 | sport | `spt-rules-ce1551` | mc | 2 | OK |  |
