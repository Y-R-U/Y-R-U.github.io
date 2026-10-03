# Idle Western 2 — audio

Audio lane. Assets live in `audio/`, the manifest the playback lane reads is `audio/manifest.json`, scripts are in `tools/audio/`. Rejects and raw takes go to `docs/audio/scratch/` (do not commit).

**Source of truth:** `tools/audio/script.json` (barks, wordless, voice prompts, trigger list) and `tools/audio/music.json` (cue prompts). The tables below are generated: edit the JSON, then `python3 tools/audio/render_doc.py`.

## Status

- [x] Phase 1: bark script, wordless layer, voice prompts, cue list, piano plan (this doc).
- [x] Phase 2a: voices designed + saved as clones; barks rendered (151 lines + 58 wordless, all present, mono 48 kbps, −16 LUFS, sentence barks ≤ 3.9 s).
- [x] Phase 2b: music cues (12 files, stereo 96 kbps, loops −16 LUFS with crossfaded seams, one-shots −14.5 LUFS, true peak ≤ −0.4 dBFS, ASR found no sung words).
- [x] Phase 2c: piano pool (19 synth phrases: 16 tap phrases 1.9–4.9 s, 2 wrong-note, 1 frenzy `long` 8.7 s; plus 11 ACE riffs in `audio/piano/riffs/ace_*`, not yet judged by ear and not played by the UI).
- [x] manifest.json complete (9.3 MB total: VO 2.8, music 5.2, piano 1.4). Browser smoke test passed 2026-10-04 (manifest, bark + bubble, wordless, piano normal/wrong/frenzy, music stream, stingers, all 251 files 200, no console errors).

## Playback rules for the wiring lane (W5, W10, W11)

- Two layers. **Wordless** clips (`wordless`) may fire often (cap ~1 per 3 s globally, not the same clip twice in a row). **Sentence** barks (`lines`) are rare: one per 30–45 s ambient, only one bubble on screen.
- A **tap** on a character plays a line tagged `tap` with a 20 s per-character cooldown; inside the cooldown play one of that character's `wordless` clips instead.
- Event triggers (`eject`, `duel`, `robbery`, …) pick from lines carrying that trigger; a line with several triggers can serve any of them. Never repeat a line within 10 min if the pool has another option.
- `once: true` lines are the best jokes for a first occurrence: play once ever (persist the id), then drop from the pool. Prefer an unplayed `once` line when its trigger first fires.
- `rude: true` lines are skipped when Sunday School is on (bubble copy also swaps per W5). Nubbin has no rude lines and never will.
- Bubble text = the `text` field (≤ ~8 words; the `...` beats are part of the joke timing).
- Voices duck music −6 dB while playing. Barks and piano are small decoded buffers (LRU); music streams through one `<audio>` element.

## Trigger vocabulary
<!-- BEGIN:TRIGGERS -->
| trigger | when |
|---|---|
| `opening` | W15 opening: the Stranger is thrown out face-first into the mud (first session only) |
| `eject` | any saloon ejection (auto or flung) |
| `fling` | the player swipe-flung the drunk (any target) |
| `fling_trough` | fling landed in the trough |
| `fling_dentist` | fling landed at Pull & Pray |
| `fling_jail` | fling landed in the jail wagon |
| `fling_pomfrey` | fling went through Pomfrey's window |
| `tap` | player tapped this character (20 s per-character cooldown, wordless inside it) |
| `idle` | ambient sentence bark (global 30-45 s cadence) |
| `duel` | duel wind-up / standoff (speaker is a bystander or the opponent) |
| `duel_win` | player won the duel |
| `duel_boot` | player tapped early and shot their own boot |
| `brawl` | bar brawl special |
| `robbery` | bank robbery chase running |
| `robbery_crash` | Bart hits the low sign / pole at the end of the chase |
| `robbery_caught` | Bart captured (bounty paid) |
| `stagecoach` | stagecoach arrival special |
| `build` | a construction stage is in progress |
| `hurry` | player tapping a construction site |
| `sign_raise` | Open for Business sign raised on a new business |
| `acquire_saloon` | poker-win cutscene |
| `acquire_undertaker` | undertaker takeover cutscene |
| `acquire_jail` | jail bought from Wendell |
| `acquire_bank` | bank bought from a fainting Thrupp |
| `acquire_garter` | Velvet Garter opens |
| `deed` | Deed showdown with Pomfrey (his sign comes down) |
| `half_town` | 9/9 owned: Half the Town |
| `hat_promo` | player's hat promotion (Pomfrey's shrinks) |
| `hat_thimble` | Pomfrey's hat reaches the thimble |
| `pomfrey_pass` | Pomfrey's hat procession rides past |
| `fake_death` | Fake Your Death at Boot Hill |
| `strongbox` | a strongbox is opened |
| `piano` | the piano was tapped |
| `frenzy` | piano frenzy (8 taps in 6 s) |
| `wrong_note` | rare wrong-note riff |
| `first_business` | the first business is bought (Spit & Shine) |
| `levelup` | a line hits a Lv 25/50/100 milestone |
| `pickles_spot` | Pickles found in a new hiding spot |
| `garter_window` | the Garter window-exit gag plays |
| `link` | a gag-link walker arrives (Tubs->Saloon, Saloon->Pull & Pray, Garter->Bank) |
| `ghost` | Ghost Town season overlay event |
| `offline_return` | player returns after time away |
<!-- END:TRIGGERS -->

## Bark script (v1)
<!-- BEGIN:SCRIPT -->
151 sentence lines, 58 wordless clips. `once` = plays once ever; `rude` = muted by Sunday School.

### Big Mabel Boggs (`mabel`) — barkeep, Thirsty Gizzard manager

**Voice design:** _A big, loud woman in her mid-fifties with a husky, chesty alto voice, low for a woman but unmistakably female, gravelly from whiskey and years of shouting. Slow, lazy Texas drawl. Amused menace; she sounds like she could lift a horse and is mildly bored by it._

Audition text: “And stay out! Whiskey's a dollar, water's two, it's rarer. I don't break up fights, sugar. I finish 'em.”

| id | line | triggers | flags |
|---|---|---|---|
| mabel_01 | And STAY out! | opening, eject |  |
| mabel_02 | Out! And take yer teeth with ya! | eject |  |
| mabel_03 | I don't break up fights. I finish 'em. | brawl, tap |  |
| mabel_04 | Whiskey's a dollar. Water's two. It's rarer. | tap, idle |  |
| mabel_05 | You spill it, you lick it. | tap, idle |  |
| mabel_06 | Who threw that? ...Nice arm. | fling |  |
| mabel_07 | House beer. Locally sourced, sugar. Don't ask where. | link, tap |  |
| mabel_08 | Trough's that way. So's your dignity. | fling_trough |  |
| mabel_09 | Pete! You got a walk-in! | fling_dentist |  |
| mabel_10 | Sheriff, catch! ...He won't catch. | fling_jail |  |
| mabel_11 | Special delivery for his Lordship! | fling_pomfrey |  |
| mabel_12 | Them doors are on a spring. For the distance. | eject | once |
| mabel_13 | Last call was an hour ago. This is the throwin'-out call. | eject |  |
| mabel_14 | Tab's closed. So's your face. Out! | eject |  |
| mabel_15 | Hell of a throw, partner. | fling | rude |
| mabel_16 | Nobody leaves my bar on their feet. | eject, idle |  |
| mabel_17 | Chairs cost extra! Throw the cheap ones! | brawl |  |
| mabel_18 | Best rotgut in the territory. Also the only. | tap, idle |  |
| mabel_19 | Five aces? ...I like you. Don't do it again. | acquire_saloon | once |
| mabel_20 | Nice hat. Shame about what's under it. | hat_promo |  |
| mabel_21 | Play faster, Fingers, or you're next out the door! | frenzy |  |
| mabel_22 | Kiss my spittoon. | tap |  |

Wordless: `mabel_w1` HUP! (effort) · `mabel_w2` Hrrnngh... HUP! (effort) · `mabel_w3` Ha! Ha ha ha! (laugh) · `mabel_w4` Hmph. (grunt) · `mabel_w5` Oi! (shout)

### Ezekiel "Pickles" McGurk (`pickles`) — town drunk, Tuppenny Tubs manager

**Voice design:** _An old man in his seventies with a low, wet, slurred, raspy male voice and hiccups, an unsteady wobbly delivery, rambling rural Appalachian drawl. Very drunk but cheerful and friendly, completely lost._

Audition text: “I ain't drunk. The street's movin'. Who moved the ground? Put it back. I'll have whatever I just had.”

| id | line | triggers | flags |
|---|---|---|---|
| pickles_01 | I ain't drunk. The street's movin'. | tap, idle |  |
| pickles_02 | Who moved the ground? ...Put it back. | tap, eject |  |
| pickles_03 | I'll have whatever I just had. | tap |  |
| pickles_04 | Hey! This trough's taken. | fling_trough |  |
| pickles_05 | That's my hat! ...That's a chicken. | idle |  |
| pickles_06 | He owed me a dollar. Beautiful man. | fake_death |  |
| pickles_07 | Bath? Had one in sixty-one. Didn't take. | tap |  |
| pickles_08 | Water's changed Tuesdays. I'm changed never. | tap, link |  |
| pickles_09 | Who put a roof under me? | pickles_spot |  |
| pickles_10 | Comfy coffin. Bit drafty on top. | pickles_spot |  |
| pickles_11 | Bank vault's lovely this time o' year. | pickles_spot |  |
| pickles_12 | Jail's the only place that'll keep me. | pickles_spot |  |
| pickles_13 | My money's on the one that falls down. | duel |  |
| pickles_14 | Shoot him in the hat! It's bigger! | duel |  |
| pickles_15 | Lovely house. Can I sleep in it? | build, sign_raise |  |
| pickles_16 | Your hat's got a hat now. | hat_promo |  |
| pickles_17 | Robbery! ...Which way do I run? | robbery |  |
| pickles_18 | I ain't lost. Everything else is. | idle |  |
| pickles_19 | Is it mornin'? Is this Thursday? Is this my leg? | idle, offline_return |  |
| pickles_20 | Mabel threw me so hard I landed yesterday. | eject |  |
| pickles_21 | I was sober once. Terrible. Everything was so... clear. | tap | once |
| pickles_22 | I seen a ghost! ...Oh. Window. | ghost |  |
| pickles_23 | Kiss my donkey. No, really. He's lonely. | tap | rude |

Wordless: `pickles_w1` Hic! (hic) · `pickles_w2` Hic! ...Hic! (hic) · `pickles_w3` Hehehehe. (laugh) · `pickles_w4` Whoaaa... (wobble) · `pickles_w5` Mmmnnh... five more minutes. (snore) · `pickles_w6` Yeeeehaw... hic. (cheer)

### Colonel Augustus Pomfrey (`pomfrey`) — rival tycoon (not a manager)

**Voice design:** _A pompous English aristocrat in his sixties, a remittance man sent abroad by his family. Booming, plummy upper-class Received Pronunciation baritone, nasal and languid, drawn-out vowels, utterly condescending and pleased with himself. Theatrical, sneering, posh._

Audition text: “Your hat, sir, is an embarrassment. I own this street, and that dog. Money talks, old boy. Mine sings opera.”

| id | line | triggers | flags |
|---|---|---|---|
| pomfrey_01 | Your hat, sir, is an embarrassment. | pomfrey_pass, opening |  |
| pomfrey_02 | I own this street. And that dog. | pomfrey_pass, tap |  |
| pomfrey_03 | Charming shack. I'll buy it for kindling. | build |  |
| pomfrey_04 | Money talks, old boy. Mine sings opera. | tap, pomfrey_pass |  |
| pomfrey_05 | My hat stays on, sir. It's load-bearing. | tap |  |
| pomfrey_06 | Half the town? I have the better half. | deed |  |
| pomfrey_07 | Father sent me West to build character. I bought one. | tap, idle |  |
| pomfrey_08 | Mud suits you. Brings out the eyes. | opening | once |
| pomfrey_09 | My window! That was imported glass! | fling_pomfrey |  |
| pomfrey_10 | Is it me, or is my hat getting smaller? | hat_promo |  |
| pomfrey_11 | Cut the cards. Mine are marked, naturally. | deed |  |
| pomfrey_12 | Take it. I've plenty more... street. | deed |  |
| pomfrey_13 | Damn and blast. Fetch my other sign. | deed | rude |
| pomfrey_14 | Ghastly town. I adore owning it. | idle, pomfrey_pass |  |
| pomfrey_15 | Do stand downwind, there's a good fellow. | tap |  |
| pomfrey_16 | Mother writes. She says I'm winning. | idle |  |
| pomfrey_17 | Another one? Have you no shame? Have you any to sell? | sign_raise |  |
| pomfrey_18 | Dead, is he? Splendid. ...Why is the coffin winking? | fake_death |  |
| pomfrey_19 | Half the town. I shall tell Mother I kept the nice half. | half_town | once |
| pomfrey_20 | A thimble. I am wearing a thimble. | hat_thimble | once |
| pomfrey_21 | Ah. The help has arrived. How quaint. | pomfrey_pass |  |
| pomfrey_22 | Pick up the brim, Jenkins. It's dragging in the peasants. | pomfrey_pass |  |

Wordless: `pomfrey_w1` Hmph! (grunt) · `pomfrey_w2` Harrumph. (grunt) · `pomfrey_w3` Ha-ha-ha-ha. (laugh) · `pomfrey_w4` Good LORD! (gasp) · `pomfrey_w5` Ugh. Peasants. (sneer)

### Sheriff Wendell Pryce (`wendell`) — sheriff, Jail manager

**Voice design:** _A man in his forties with a thin, reedy, nasal tenor voice that cracks upward when frightened. Fast, nervous Midwestern patter. He tries very hard to sound tough and fails; jittery and cowardly._

Audition text: “Nobody panic! Especially me. I'm not hidin', I'm surveillin'. From a barrel. Is he gone? Tell me when he's gone.”

| id | line | triggers | flags |
|---|---|---|---|
| wendell_01 | I'm deputisin' you. Bye! | robbery, tap |  |
| wendell_02 | Nobody panic! ...Especially me. | brawl, robbery |  |
| wendell_03 | I'm not hidin'. I'm surveillin'. From a barrel. | tap, idle |  |
| wendell_04 | Halt! ...Or don't. I ain't fussy. | robbery |  |
| wendell_05 | Is he gone? Tell me when he's gone. | duel |  |
| wendell_06 | This badge stops bullets! ...Says so on the box. | tap |  |
| wendell_07 | Caught him! ...With my face. | fling_jail |  |
| wendell_08 | Sold! Here's the badge. Don't let it get shot. | acquire_jail | once |
| wendell_09 | Crime's gotta make an appointment. I'm booked till Christmas. | tap, idle |  |
| wendell_10 | Every fella in them cells sings. None of 'em in tune. | idle |  |

Wordless: `wendell_w1` Eep! (yelp) · `wendell_w2` Aaaaaah! (scream) · `wendell_w3` Oh no no no no. (panic) · `wendell_w4` Gulp. (gulp)

### Mortimer Grimsby (`mortimer`) — undertaker, Boot Hill manager

**Voice design:** _A man in his sixties with a soft, velvety, slow baritone, a delighted undertaker's purr. Gentle, unhurried, faintly old-fashioned American, smiling audibly, overly pleased by anything to do with death._

Audition text: “Ooh, a duel! Fetch my tape. Stand still, sir. A lovely six foot two. Pine or oak? Oak's for people with friends.”

| id | line | triggers | flags |
|---|---|---|---|
| mortimer_01 | Ooh, a duel! Fetch my tape. | duel |  |
| mortimer_02 | Stand still, sir. A lovely six-foot-two. | tap |  |
| mortimer_03 | Business is dead. Wonderful! | idle |  |
| mortimer_04 | Pine or oak? Oak's for people with friends. | tap |  |
| mortimer_05 | Ten paces, gentlemen. Take your time. | duel |  |
| mortimer_06 | No refunds. Clients rarely complain. | tap, idle |  |
| mortimer_07 | Lie still, he's not finished measuring you. | duel_win |  |
| mortimer_08 | A fake death? How thrilling. I'll invoice the real one. | fake_death |  |
| mortimer_09 | My predecessor fell in his own grave. Perfect fit. So proud. | acquire_undertaker | once |
| mortimer_10 | Measured the horse. One never knows. | idle |  |

Wordless: `mortimer_w1` Ooh! (delight) · `mortimer_w2` Mmm, lovely. (purr) · `mortimer_w3` Heh heh heh. (laugh) · `mortimer_w4` Tsk tsk. (tut)

### Madame Lulu LaRue (`lulu`) — madam, Velvet Garter manager

**Voice design:** _A woman in her forties with a smoky, honeyed alto voice and a theatrical, exaggerated fake French accent. Teasing, knowing, flirtatious and businesslike, a ruthless saleswoman with a wink in every word._

Audition text: “Bonjour, cowboy. Ze conversation is one dollar. Ze eye contact, extra. Pay at ze door, and leave with dignity. Optional.”

| id | line | triggers | flags |
|---|---|---|---|
| lulu_01 | Ze conversation is one dollar. Ze eye contact, extra. | tap | rude |
| lulu_02 | Non, non, chéri. Ze hands stay on ze hat. | tap | rude |
| lulu_03 | Ze accent? Ohio, darling. Keep it quiet. | tap | once |
| lulu_04 | Back so soon, Sheriff? Your wife was asking. | tap, idle | rude |
| lulu_05 | Pay at ze door. Leave with dignity. Optional. | tap | rude |
| lulu_06 | Bonjour, cowboy. Your wallet looks... lonely. | tap | rude |
| lulu_07 | Monsieur! Ze window is not ze exit! ...Fine. It is now. | garter_window | rude |
| lulu_08 | Oh my gosh, a robbery! ...I mean, sacré bleu. | robbery |  |
| lulu_09 | Zey leave in such a hurry. Zey forget ze hat. And ze wife. | idle | rude |
| lulu_10 | Ze piano is out of tune. Like ze clientele. | piano, tap |  |
| lulu_11 | A respectable parlour. Ze most respectable on ze whole block. | acquire_garter | once |

Wordless: `lulu_w1` Ooh la la. (tease) · `lulu_w2` Mmm-hmm. (purr) · `lulu_w3` Ha ha ha! (laugh) · `lulu_w4` Oh my gosh! (gasp)

### "Pliers" Pete Pettigrew (`pete`) — barber-dentist-surgeon, Pull & Pray manager

**Voice design:** _A man in his thirties with a medium-pitched, ordinary male speaking voice and a Southern twang. Upbeat and friendly like a smiling salesman, quick and chatty, cheerfully unbothered by blood._

Audition text: “Shave, haircut or tooth? Why not all three! Open wide. Wider. Don't worry, I've done this twice!”

| id | line | triggers | flags |
|---|---|---|---|
| pete_01 | Shave, haircut or tooth? Why not all three! | tap |  |
| pete_02 | Open wide. Wider. Bite this. | tap |  |
| pete_03 | That one's loose! ...Now it is. | tap, fling_dentist |  |
| pete_04 | Don't worry, I've done this twice. | tap |  |
| pete_05 | Whiskey's the anaesthetic. And the tip. | tap, idle |  |
| pete_06 | Gold tooth! Mine now. | strongbox, fling_dentist |  |
| pete_07 | A walk-in! Well, a fly-in! | fling_dentist, link |  |
| pete_08 | Keep swingin', boys! I got a mortgage! | brawl |  |

Wordless: `pete_w1` Hee hee hee! (giggle) · `pete_w2` Ooh! (delight) · `pete_w3` Nngh! Got it! (effort)

### Lil' Nubbin (`nubbin`) — shoeshine kid, Spit & Shine manager (always clean)

**Voice design:** _A nine-year-old boy with a scratchy, confident, boyish voice. Fast, streetwise New York newsboy patter, deadpan and unimpressed, a tiny businessman who thinks adults are slow._

Audition text: “Shine yer boots? Can't help yer face. Two bits. Three if there's horse in it. I'm eight. I got a business. You?”

| id | line | triggers | flags |
|---|---|---|---|
| nubbin_01 | Shine yer boots? Can't help yer face. | tap |  |
| nubbin_02 | Two bits. Three if there's horse in it. | tap |  |
| nubbin_03 | That ain't mud, mister. | tap, opening |  |
| nubbin_04 | Spit's free. Polish costs. | tap, idle |  |
| nubbin_05 | I'm eight. I got a business. You? | first_business | once |
| nubbin_06 | You call that a hat? | hat_promo, tap |  |
| nubbin_07 | Nice landin'. Six outta ten. | opening, eject |  |
| nubbin_08 | Prices went up. You got richer. I noticed. | levelup |  |

Wordless: `nubbin_w1` Hey! (shout) · `nubbin_w2` Pfft. (scoff) · `nubbin_w3` Heh. (laugh) · `nubbin_w4` Ooh, fancy. (whistle)

### Hortense Hoofnagle (`hortense`) — Hoof & Mouth Livery manager, horse translator

**Voice design:** _A sturdy farm woman in her fifties with a warm, hearty, slightly hoarse voice and a broad rural Western drawl. Matter-of-fact and kindly, she relays rude things very politely._

Audition text: “Buttercup says you smell like a mule. She means it nice. Don't feed him the hat, now, he's had three.”

| id | line | triggers | flags |
|---|---|---|---|
| hortense_01 | Buttercup says you smell like a mule. ...She means it nice. | tap |  |
| hortense_02 | He says you can ride him when you lose some weight. | tap |  |
| hortense_03 | Don't feed him the hat. He's had three. | tap, hat_promo |  |
| hortense_04 | That mule ain't kickin' the wall. He's knockin'. | idle |  |
| hortense_05 | Coach is in! Horses say the driver can't steer. | stagecoach |  |
| hortense_06 | Horace says Bart's a horse's... well. Rhymes with 'brass'. | robbery_caught | rude |
| hortense_07 | I don't speak donkey. Donkey speaks me. | tap, idle |  |

Wordless: `hortense_w1` Whoa there! (call) · `hortense_w2` Hyah! (call) · `hortense_w3` Ha! (laugh)

### Ebenezer Thrupp (`thrupp`) — banker, Bank manager

**Voice design:** _A thin, elderly miser in his seventies with a dry, wheezy, pinched voice. Fussy, fretful and stingy, prim old-fashioned New England diction, prone to swooning._

Audition text: “One coin. Two coin. One coin. Interest? Oh, I'm very interested. Withdrawals are Thursdays, and this is not Thursday.”

| id | line | triggers | flags |
|---|---|---|---|
| thrupp_01 | One coin. Two coin. ...One coin. | tap, idle |  |
| thrupp_02 | Interest? Oh, I'm very interested. | tap |  |
| thrupp_03 | A robbery! I'm going to faint. I'm fainting. I've fainted. | robbery |  |
| thrupp_04 | Withdrawals are Thursdays. It is never Thursday. | tap |  |
| thrupp_05 | Take it! Take the vault! Take my smelling salts! | acquire_bank | once |
| thrupp_06 | Another deposit from the Garter. A very discreet account. | link | rude |
| thrupp_07 | Don't open it! It's... unspent! | strongbox |  |

Wordless: `thrupp_w1` Ohhh... (swoon) · `thrupp_w2` Tsk. (tut) · `thrupp_w3` Oh! Oh my! (gasp)

### Black Bart Bumbleton (`bart`) — recurring outlaw

**Voice design:** _A man in his thirties putting on a gruff, growly outlaw voice that keeps slipping into a polite, nervous, higher-pitched voice. Mumbly, apologetic, incompetent and earnest._

Audition text: “This is a robbery! Er, a stick-up. Hands up! Not that high, show-off. Everyone stay calm, I'm very nervous!”

| id | line | triggers | flags |
|---|---|---|---|
| bart_01 | Hands up! ...Not that high, show-off. | robbery |  |
| bart_02 | This is a robbery! Er... stick-up. | robbery |  |
| bart_03 | All yer money! ...And a sandwich. | robbery |  |
| bart_04 | They'll never catch— OW. Who put a pole there? | robbery_crash |  |
| bart_05 | Everyone stay calm! I'm very nervous! | robbery |  |
| bart_06 | Getaway horse! ...HORACE! | robbery |  |
| bart_07 | You ain't seen the last of me! ...Probably next week. | robbery_caught |  |
| bart_08 | I'm in disguise. As a different Bart. | robbery, duel |  |
| bart_09 | Draw! ...Oh, you mean the gun. | duel |  |
| bart_10 | Fair cop. Nice poster, though? | robbery_caught |  |

Wordless: `bart_w1` Grrr! (growl) · `bart_w2` Ow! (oof) · `bart_w3` Yah! Yah! (ride) · `bart_w4` Oopsie. (slip)

### "Fingers" Fontaine (`fingers`) — saloon pianist

**Voice design:** _A wiry man in his forties with a laid-back, smoky, gravelly voice and a slow, laconic Southern drawl. Deadpan, unbothered, a musician who has seen everything and played through all of it._

Audition text: “Requests? I take 'em, I just don't play 'em. Been playin' this same song since eighteen seventy.”

| id | line | triggers | flags |
|---|---|---|---|
| fingers_01 | Requests? I take 'em. I don't play 'em. | piano, tap |  |
| fingers_02 | Faster? My fingers got fingers! | frenzy |  |
| fingers_03 | Same song since eighteen-seventy. Still workin' on it. | piano, idle |  |
| fingers_04 | Still playin'! Still playin'! | eject |  |
| fingers_05 | That note was jazz. Look it up in thirty years. | wrong_note |  |
| fingers_06 | Tip jar's the one on the left. Don't use the right. | tap |  |
| fingers_07 | Piano's out of tune. So's the bar. We match. | piano, tap |  |

Wordless: `fingers_w1` Yeah! (cheer) · `fingers_w2` Mm-hm. (hum) · `fingers_w3` Oops. (slip)

### The Mulligan Brothers (Mick, Mick and Other Mick) (`mulligan`) — construction crew

**Voice design:** _A burly man in his thirties with a deep, gruff, low male voice and a mild Irish-American accent, speaking at a normal conversational volume. Hearty, cheerful and a bit dim, a construction worker._

Audition text: “Measure twice, cut once, swear thrice. Mick! Hand me the hammer. No, the other Mick!”

| id | line | triggers | flags |
|---|---|---|---|
| mulligan_01 | Measure twice, cut once, swear thrice. | build |  |
| mulligan_02 | Mick! Hand me the hammer! ...No, the other Mick. | build |  |
| mulligan_03 | She's up! Mostly! | sign_raise |  |
| mulligan_04 | Tap faster, boss. We're paid by the bang. | hurry |  |
| mulligan_05 | Load-bearin'? Everythin's load-bearin' if you believe. | build, hurry |  |
| mulligan_06 | Who's got the nails? ...Who's got Mick? | build |  |

Wordless: `mulligan_w1` Heave! (effort) · `mulligan_w2` Hup, two, three! (effort) · `mulligan_w3` Ow, me thumb! (oof) · `mulligan_w4` Ha ha! (laugh)

### The Stranger (you) (`stranger`) — player character, grunts only

**Voice design:** _A man in his thirties with a very low, dry, gravelly baritone voice. Laconic, terse, a squinting gunslinger of very few words, almost a whisper-growl._

Audition text: “Hrm. No. Yep. Nice town. I'll take it. And the hat. Hrm.”

Wordless: `stranger_w1` Hrm. (grunt) · `stranger_w2` Hrm? (grunt) · `stranger_w3` No. (word) · `stranger_w4` Yep. (word) · `stranger_w5` Oof! (oof) · `stranger_w6` Pfft. (spit)
<!-- END:SCRIPT -->

## Music cues (v1)

ACE-Step 1.5 turbo via `:8001`, instrumental (`thinking=false`), 2–3 variants each, best kept. Loops get a crossfaded seam (tail blended into head) so `<audio loop>` is seamless. Stereo ~96 kbps mp3. Budget ≤ ~8 MB total. Ghost Town avoids anything Día de los Muertos / mariachi-coded (challenge §4).

Mix intent: `main` is the default bed; `saloon` when the Saloon card or saloon shot has focus; `build` ducks under main during a construction; `night` 18:00–06:00; `robbery` / `duel` / `fakedeath` own the bed during their special; `ghost` replaces `main` during the season overlay. Stingers are one-shots (decoded buffers OK — they are short).

<!-- BEGIN:CUES -->
| cue | file | len | loop | ACE-Step prompt |
|---|---|---|---|---|
| Main theme "Big Hat Energy" | `audio/music/main.mp3` | 90 s | yes | spaghetti western comedy theme, Morricone pastiche, whistled melody, twangy baritone electric guitar, galloping snare drum, cheeky muted trumpet, comic bassoon, whip crack, cowboy, playful, 112 bpm, A minor, instrumental |
| Saloon honky-tonk | `audio/music/saloon.mp3` | 60 s | yes | old west saloon honky-tonk, out-of-tune upright piano, stride bass, washboard, banjo, rowdy and jolly, ragtime, 132 bpm, C major, instrumental, no vocals |
| Construction hoedown | `audio/music/build.mp3` | 45 s | yes | bluegrass hoedown, fast banjo and fiddle, upright bass, hammer and anvil hits on the beat, foot stomps, cheerful work song, 140 bpm, G major, instrumental |
| Night | `audio/music/night.mp3` | 75 s | yes | quiet western campfire at night, slow harmonica melody, soft fingerpicked acoustic guitar, warm and lonesome, sleepy, gentle, 70 bpm, D major, instrumental, ambient |
| Robbery chase | `audio/music/robbery.mp3` | 30 s | yes | comic galloping chase music, frantic strings in the style of the William Tell overture, kazoo melody, snare gallop, slapstick cartoon western, 160 bpm, E minor, instrumental |
| Fake Your Death march | `audio/music/fakedeath.mp3` | 25 s | no | solemn slow funeral march on tuba and muffled drum that suddenly turns into a jaunty fast ragtime getaway on piano and banjo, comic, instrumental |
| Ghost Town overlay loop | `audio/music/ghost.mp3` | 75 s | yes | spooky haunted ghost town western, eerie theremin melody, slow waltz, reverb-drenched twangy guitar, musical saw, distant harmonica, wind, playful halloween, 84 bpm, D minor, instrumental |
| Duel standoff stinger | `audio/music/duel.mp3` | 20 s | no | spaghetti western duel standoff, lone whistle, church bell tolling, long ringing trumpet solo, rising tension, dramatic Morricone style, slow, instrumental |
| Stinger: sign raised fanfare | `audio/music/st_sign.mp3` | 3.2 s | no | short triumphant western brass fanfare with banjo strum and cymbal, ta-da, grand opening, instrumental |
| Stinger: hat promotion | `audio/music/st_hat.mp3` | 3.2 s | no | short silly triumphant fanfare, kazoo and trumpet, slide whistle up, comic coronation, western, instrumental |
| Stinger: strongbox open | `audio/music/st_box.mp3` | 3.0 s | no | short sparkling reveal jingle, glockenspiel and banjo, harp glissando, treasure found, western, instrumental |
| Stinger: stagecoach horn | `audio/music/st_coach.mp3` | 3.0 s | no | short post horn call, stagecoach arriving, galloping hooves, bright brass toot, western, instrumental |
<!-- END:CUES -->

## Piano plan (W11)

Fingers's upright is tappable from second 1. Each tap plays a random 2–5 s phrase, no repeat among the last 6, zero latency (all phrases pre-decoded or synthesised from pre-decoded samples on first user gesture).

Two sources, judged by ear; both may ship if both pass:

1. **(a) ACE-Step riffs.** 3 takes (~2 min) of "solo honky-tonk upright piano, ragtime, slightly out of tune, no other instruments", tempo-locked. Sliced offline at bar boundaries (onset/energy detection in numpy) into 2.5–5 s riffs, 20 ms fade-in / 80 ms fade-out, −16 LUFS, mono mp3 64 kbps. Classes: `flourish`, `vamp`, `ending`, `wrong` (crowd-groan), `long` (frenzy, ~10 s).
2. **(b) Sampled sequencer.** A compact honky-tonk sample set (a few multisampled notes, detuned unison for the honky-tonk beat) in `audio/piano/samples/`, plus `audio/piano/phrases.json`: note lists for public-domain rag phrases (Joplin's *The Entertainer* 1902, *Maple Leaf Rag* 1899, plus stride vamps and "shave and a haircut" endings) that a WebAudio sequencer plays by pitch-shifting the nearest sample. Tempo is a parameter, so the frenzy can genuinely speed up (W11 "rapid tapping makes Fingers play faster").

Frenzy (8 taps in 6 s) plays a `long` riff or a phrase chain at 1.4× tempo, then cues the ambient ejection. Wrong note: 5% pick from `wrong` (riff) or a phrase with `"wrong": true` (a deliberately clanged chord), plus the crowd-groan wordless clip.

## Regenerating

Scripts (`tools/audio/`): `common.py` (GPU gate, ASR, loudness), `vo.py`, `music.py`, `piano_synth.py`, `piano_ace.py`, `manifest.py`, `render_doc.py`.

```sh
cd gms/3d/idle-western2/tools/audio
# one-off venv for ASR + numpy (CPU only; whisper small.en is in ~/.cache/huggingface)
uv venv --python 3.12 /tmp/iw2asr && uv pip install --python /tmp/iw2asr/bin/python faster-whisper numpy scipy soundfile
PY=/tmp/iw2asr/bin/python
$PY vo.py design [char..]     # 3 designed auditions/char, ASR + F0 scored, best saved as a clone voice (voices.json)
$PY vo.py render [char..]     # every line + wordless with the clone; 2-4 takes; skips unchanged lines (vo_log.json)
$PY vo.py fit [char..]        # pitch-preserving atempo (≤1.25x) on sentence barks over 3.9 s, from the picked take
$PY music.py gen [cue..]      # ACE-Step variants -> docs/audio/scratch/music/
$PY music.py pick [cue..]     # score, cut seamless loops/stingers -> audio/music/ ; force: music.py pick main=2
$PY music.py piano            # 3 solo-piano ACE takes
$PY piano_ace.py 12           # slice them into riffs -> audio/piano/riffs/ace_*.mp3
$PY piano_synth.py            # synth samples + phrases.json + syn_* riffs (no GPU); tap phrases over 4.9 s get their bpm raised to fit
$PY manifest.py               # audio/manifest.json + sizes
python3 render_doc.py         # refresh the tables in this doc
```

Every GPU job first waits (60 s poll) until Flux `:7867` shows no running job, empty queue and a cold worker, LTX is cold, mlxcel is not running, no other TTS job is active and (for TTS) ACE-Step is unloaded. TTS and ACE-Step never overlap: run them as separate steps.

To change a line: edit `script.json`, then `vo.py render <char>` (only changed lines re-render), `manifest.py`, `render_doc.py`.

## Production log
- 2026-10-04 03:20 Phase 1 written (151 lines, 58 wordless, 12 `once`, 12 `rude`). Piano (b) synthesised: 9 samples + 19 phrases (`tools/audio/piano_synth.py`, CPU only).
- 2026-10-04 03:24 Voice design launched; GPU shared with the Flux image lane, every job waits for Flux idle (`common.wait_gpu`).
- 03:50 Voices designed: 4 seeds per character (11/23/37/51), scored by Whisper small.en WER on the audition text + median F0 inside a per-character range (`vo.py` `F0`) + pitch spread. Best saved in Voice Studio as "Idle Western 2 · <name>" clone voices (ids in `tools/audio/voices.json`).
  - Lesson: "giggly / eager / high / loud / jolly" in a design prompt pushes Qwen into falsetto (Pete 296–400 Hz, Mulligan 211–276 Hz). Saying "ordinary male speaking voice, normal volume" fixed Mulligan (146 Hz). Mabel needed "low for a woman but unmistakably female" (first pick was 123 Hz, male range).
- 06:00–06:45 (resumed run) Music picked: main v3, saloon v1, build v3, night v2, robbery v2, fakedeath v1, ghost v2, duel v1, st_sign v1, st_hat v2, st_box v1, st_coach v1 (`tools/audio/music_log.json`). `music.py` fixed for ACE's 48 kHz output; one-shots limited to 0.79 after mp3 overshoot pushed stingers over 0 dBFS. Night and ghost seams land after a natural ~0.5 s phrase break in the take (musical, not a gap).
- VO: 13 sentence barks were 3.92–4.78 s; `vo.py fit` sped them 1.02–1.24x (mortimer_09 is the most rushed). 5 wordless clips were missing: the clone returns "no audio" for very short text (wendell_w2, all of Lulu's wordless, 12+ seeds each). Fixed by rendering inside a carrier sentence and cutting at the word gap (wendell_w2, lulu_w1, lulu_w4) or, for lulu_w2/w3 where even carriers failed, design-mode with Lulu's original recipe and seed 23 (F0 213–222 Hz vs her 239 Hz clone). Remaining ASR mismatches are spelling only (hics, grunts, "Z" for "ze", "Load Baron" for load-bearin').
- Piano: 5 tunes ran 5.2–6.7 s; bpm raised to fit 4.9 s (Entertainer 92→127, can-can 152→195, Home on the Range 120→140, Clementine 96→103). ACE takes sliced to 11 riffs (6 vamp, 3 flourish, 2 long ~10 s); none came out as `ending`.
