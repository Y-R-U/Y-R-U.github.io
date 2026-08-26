# MUSIC_NOTES

Soundtrack for SKYHAMMER. Generated on **Suno v5.5** in Aaron's logged-in browser, 2026-08-26.
Everything is **instrumental** (Suno's Lyrics → Instrumental mode). 22 tracks shipped.

## Account state

| | |
|---|---|
| Credits at start | **2,252** |
| Credits at end | **2,027** |
| Spent | **225** (~10 per generation, 2 takes each) |
| Model | v5.5, Advanced mode, Weirdness 50%, Style Influence 50% |
| Duration control | `More Options → Duration`, dragged off Auto. Min **0:10**, used **2:00** for tracks and **0:10** for stings |

Nothing was published, shared, purchased or changed on the account. No login was ever required —
the session was already authenticated. The Suno tab was closed at the end of the session.

Credits are **not** the constraint here — there is room for ~200 more generations. Wall-clock time
and the download/curation pass are what cost.

## How to generate more (recipe that worked)

1. `suno.com/create`, **Advanced** tab.
2. Collapse the **Lyrics** panel — then Styles / Song Title / Create all sit on one screen and you
   can chain several generations in a single `browser_batch` with no scrolling.
3. `More Options → Lyrics → Instrumental`.
4. Put the whole description in **Styles** (not Lyrics). Always state **"fully instrumental, no vocals"**,
   the **key**, and **"tempo exactly N BPM"** — Suno honours the BPM well (see measurements below).
5. Set **Song Title** to `SH <track_id>` so downloads are identifiable.
6. Click **Create**. ~60–90 s per generation, 2 takes.

**Gotcha:** `cmd+a` only selects the Styles text if the click genuinely landed inside the textarea.
If it lands on the page background instead, `cmd+a` selects *every clip in the workspace* and puts
checkboxes on all of them. Harmless, but do not follow it with anything destructive. Verify the
Styles box content in a screenshot before hitting Create.

**Downloading:** do not use the per-clip UI download — 40+ clips is unbearable. Read the
`/song/<uuid>` hrefs out of the clip list with `read_page` (the list is virtualised, so scroll and
re-read), then fetch each one directly:

```
curl -L -o out.mp3 https://cdn1.suno.ai/<uuid>.mp3
```

That returns the real MP3 with no auth. The workspace clip list can also be filtered with the
search box (match the full title, e.g. `SH title`) when you need to find a specific pair.

## Pipeline

```
raw take  ->  assets/audio/music/raw/<id>.mp3       (Suno original, 44.1 kHz stereo)
          ->  ./tools/compress_music.sh             (radio profile for *radio*/*hangar*/*brief*, else full)
          ->  assets/audio/music/<id>.mp3           (shipped)
          ->  edit assets/audio/music/tracks.json   (metadata only the music agent knows)
          ->  node tools/build_music_manifest.mjs   (writes js/data/music.js)
          ->  node tools/build_music_manifest.mjs --check
```

Compression result: **54,251 KB → 15,278 KB (3.5x)**. Full profile ~3.3x (56 kbps mono @ 32 kHz),
radio profile ~4.6x (40 kbps mono @ 22 kHz). Radio treatment verified by measurement:
`hangar_radio` sits at **-54.8 dB above 4 kHz** vs **-34.8 dB** for a full-profile track — a 20 dB
gap, so the wireless band-limiting is really landing.

> 15 MB of music is a lot for a browser game. If it needs to come down, the honest lever is
> dropping tracks, not bitrate — 56 kbps mono is already near the floor for orchestral material.
> Because every track is a settings toggle, shipping a smaller default set and lazy-loading the
> rest is the cheaper fix.

## Matched march/heavy pairs

Aaron's ask was for the music to **drop** into something heavier mid-level, so these are generated
as pairs at a shared BPM and key for a live crossfade. Measured tempo below is from onset-envelope
autocorrelation constrained near the target (resolves octave ambiguity) — **measured, not heard**.

| pairId | key | target | march measured | heavy measured | drift | verdict |
|---|---|---|---|---|---|---|
| `battle_chrome` | Em | 140 | 139.5 | 139.5 | **0.0** | locked |
| `boss` | Fm | 140 | 139.5 | 139.5 | **0.0** | locked |
| `battle_ww2` | Dm | 128 | 127.7 | 130.4 | 2.7 | usable, see below |
| `battle_drift` | Am | 130 | 130.4 | 133.3 | 2.9 | usable, see below |

`battle_chrome` and `boss` are dead-on and will crossfade at a bar line cleanly.

`battle_ww2` and `battle_drift` drift ~2.7–2.9 BPM. **For a crossfade this is fine** — over a 1–2 s
handover the ear reads it as a gear change, not a clash. It is only a problem if the engine tries to
play both halves *simultaneously and locked* for any length of time: the bar grids slide ~1.3 s
(about two thirds of a bar, bar ≈ 1.85 s) over 60 s of parallel playback. So: **crossfade quickly,
do not beat-sync-layer these two pairs.** If a longer overlap is wanted, regenerate the heavy half
of `battle_ww2` — it is the pair Aaron cares most about and it is the one worth another attempt.

`battle_ww2_heavy` is the "grown teeth" version of the act 1–2 workhorse and the closest thing to
what Aaron described.

## Track list

`intensity` is `march` or `heavy`; non-battle contexts are all tagged `march` (the field is only
consulted for the crossfade).

| id | name | context | int. | acts | bpm | key | pair | len | shipped |
|---|---|---|---|---|---|---|---|---|---|
| `title_theme` | Before the Scramble | title | march | any | 100 | Dm | — | 119 s | 816 KB |
| `title_chrome` | Cold Start | title | march | any | 100 | Em | — | 120 s | 820 KB |
| `battle_ww2_march` | Dawn Patrol | battle | march | 1,2 | 128 | Dm | battle_ww2 | 119 s | 812 KB |
| `battle_ww2_heavy` | Dawn Patrol Redline | battle | heavy | 1,2,3 | 128 | Dm | battle_ww2 | 120 s | 822 KB |
| `battle_drift_march` | Compass Spinning | battle | march | 3 | 130 | Am | battle_drift | 120 s | 817 KB |
| `battle_drift_heavy` | Compass Spinning Overdrive | battle | heavy | 3,4 | 130 | Am | battle_drift | 119 s | 812 KB |
| `battle_chrome_march` | Chrome Sky Anthem | battle | march | 4,5 | 140 | Em | battle_chrome | 119 s | 814 KB |
| `battle_chrome_heavy` | Chrome Sky Overload | battle | heavy | 4,5 | 140 | Em | battle_chrome | 120 s | 818 KB |
| `boss_march` | The Big One | boss | march | any | 140 | Fm | boss | 120 s | 819 KB |
| `boss_heavy` | The Big One Unchained | boss | heavy | any | 140 | Fm | boss | 120 s | 818 KB |
| `battle_tense` | Nothing on the Horizon | battle | march | 1,2 | 110 | Gm | — | 119 s | 816 KB |
| `battle_grim` | Mud and Magnesium | battle | march | 2,3 | 120 | Cm | — | 119 s | 813 KB |
| `battle_triumph` | Wings Over Everything | battle | march | 1,2 | 138 | Bb | — | 118 s | 803 KB |
| `battle_groove_heavy` | Low and Heavy | battle | heavy | 3,4 | 112 | Dm | — | **76 s** | 523 KB |
| `battle_thrash_heavy` | Full Throttle | battle | heavy | 4,5 | 160 | Em | — | 120 s | 821 KB |
| `battle_bigbeat_heavy` | Newsreel Breakbeat | battle | heavy | 3,4,5 | 128 | Am | — | 125 s | 855 KB |
| `hangar_radio` | Hangar Wireless | hangar | march | any | 97 | — | — | 120 s | 584 KB |
| `hangar_radio_swing` | Grease and Swing | hangar | march | any | 94 | — | — | 124 s | 604 KB |
| `hangar_radio_ballad` | Last Dance Before Dawn | hangar | march | any | 73 | — | — | 120 s | 585 KB |
| `hangar_brief` | The Briefing | hangar | march | any | 111 | — | — | 119 s | 579 KB |
| `victory` | Victory Roll | sting_win | march | any | — | Bb | — | 7.5 s | 52 KB |
| `defeat` | Down in the Drink | sting_lose | march | any | — | Dm | — | 9.4 s | 64 KB |

Every shipped file was checked with `ffprobe` + `volumedetect`: all real audio, mean volume between
-15.4 and -20.4 dB, nothing silent, nothing truncated except the one noted below.

## Looping notes

Suno does not produce loop-ready material. Measured tail level (last 2 s) tells you which stop dead:

**Ends abruptly at full volume — needs a trim or a fade in a later pass:**
`battle_ww2_march`, `battle_ww2_heavy`, `battle_chrome_march`, `battle_chrome_heavy`,
`boss_march`, `boss_heavy`, `battle_drift_heavy`, `battle_grim`, `battle_triumph`,
`battle_groove_heavy`, `battle_thrash_heavy`, `battle_bigbeat_heavy`,
`hangar_radio_swing`, `hangar_radio_ballad`.

**Resolve or fade out naturally — safe to loop with a short crossfade:**
`title_theme`, `title_chrome`, `battle_drift_march`, `battle_tense`, `hangar_radio`,
`hangar_brief` (ends in true digital silence, -85 dB), `victory`, `defeat`.

`title_theme` also starts quiet (head -33.8 dB) — it has an intro ramp, so a naive loop will dip in
volume every pass. Trim the first ~2 s if it loops.

No audio was edited; trimming is deliberately left as a later pass.

## Weak spots / what to redo first

1. **`battle_groove_heavy` is only 76 s** — Suno cut it short. It is fine musically as far as the
   measurements go but it is half the length of everything else. Regenerate it first.
2. **`battle_ww2_heavy` tempo drift (130.4 vs 127.7)** — the pair Aaron cares about is the loosest
   pair. Worth one more attempt at 128 BPM before shipping.
3. **The stings are 7.5 s and 9.4 s**, against a 15 s / 12 s brief. Suno's minimum duration is 0:10
   and it undershoots. They read as stings, but if a longer one is wanted it must be built by
   extending, not by asking for a shorter track.
4. **Selection was by measurement, not by ear.** Two takes were generated for almost every track and
   the kept one was chosen on full duration + closest measured tempo. Nobody has listened to these.
   A human listening pass may well prefer the discarded take for some tracks — the Suno workspace
   still has every take under its `SH <id>` title.
5. One `SH victory` take failed generation and Suno auto-refunded the credits; the surviving take is
   the one shipped. `SH hangar_brief` was generated twice (four takes) because a browser-extension
   disconnect re-fired the request — ~10 credits wasted, no other effect.

## Prompts used (verbatim)

All were preceded by nothing else — the entire prompt went in the Styles box.

- **title_theme** — `anticipatory World War Two orchestral menu theme, fully instrumental, no vocals, key of D minor, tempo exactly 100 BPM, sparse noble brass melody over sustained strings, distant rolling military snare, restrained and spacious with room to breathe, loops under a menu screen, 1940s cinematic score`
- **title_chrome** — `brooding retro sci-fi menu theme, fully instrumental, no vocals, key of E minor, tempo exactly 100 BPM, slow analogue synth arpeggio under distant brass, sparse gated snare, wide and patient, chrome and jet fuel, loops under a menu screen, cinematic`
- **battle_ww2_march** — `heroic World War Two orchestral military march, fully instrumental, no vocals, key of D minor, tempo exactly 128 BPM, stern four-note descending brass motif repeated as the main theme, bold brass fanfare, rolling military snare drums, sweeping strings, timpani, driving and triumphant, 1940s newsreel score, cinematic`
- **battle_ww2_heavy** — `heavy metal war anthem, fully instrumental, no vocals, key of D minor, tempo exactly 128 BPM, the same stern four-note descending motif now carried by downtuned distorted guitars, thick kicking bassline, hard driving rock groove, double kick drums, military snare turned into a heavy backbeat, soaring lead guitar over brass stabs, groovy and punishing, cinematic`
- **battle_drift_march** — `orchestral military march drifting out of the 1940s into something stranger, fully instrumental, no vocals, key of A minor, tempo exactly 130 BPM, brass fanfare and rolling military snare joined by warm analogue synth pads and electric bass, retro-futurist, tense and forward-moving, cinematic`
- **battle_drift_heavy** — `heavy industrial rock war march, fully instrumental, no vocals, key of A minor, tempo exactly 130 BPM, downtuned distorted guitars over warm analogue synth pads, thick kicking bassline, hard driving groove with double kick drums, military snare turned into a rock backbeat, retro-futurist, cinematic`
- **battle_chrome_march** — `chrome-plated future war march, fully instrumental, no vocals, key of E minor, tempo exactly 140 BPM, synthetic brass fanfare, gated electronic snare rolls, huge orchestral hits, arpeggiated synth bass, sleek and militaristic, retro sci-fi score, cinematic`
- **battle_chrome_heavy** — `industrial metal jet-age war anthem, fully instrumental, no vocals, key of E minor, tempo exactly 140 BPM, downtuned distorted guitars over synthetic brass, thick kicking electronic bassline, relentless double kick drums, gated snare, sleek and brutal, retro sci-fi metal, cinematic`
- **boss_march** — `dark heroic orchestral military march, fully instrumental, no vocals, key of F minor, tempo exactly 140 BPM, ominous low brass, thunderous timpani, relentless military snare, dissonant choir stabs, huge and menacing, 1940s newsreel score gone wrong, cinematic`
- **boss_heavy** — `dark heavy metal boss battle, fully instrumental, no vocals, key of F minor, tempo exactly 140 BPM, downtuned chugging guitars, thick kicking bassline, relentless double kick drums, dissonant choir stabs over the riff, ominous low brass, huge and menacing, cinematic`
- **battle_grim** — `grim grinding wartime orchestral battle music, fully instrumental, no vocals, key of C minor, tempo exactly 120 BPM, heavy low strings grinding away, muted funeral brass, plodding relentless timpani and snare, bleak attritional trench warfare, no triumph, cinematic`
- **battle_tense** — `tense sparse aerial reconnaissance music, fully instrumental, no vocals, key of G minor, tempo exactly 110 BPM, quiet ticking snare, lone muted trumpet, held dissonant strings, lots of empty space, waiting for something to happen, creeping unease, 1940s cinematic score`
- **battle_triumph** — `all out triumphant aerial victory march, fully instrumental, no vocals, key of B flat major, tempo exactly 138 BPM, blazing full brass section, soaring high strings, thunderous snare and timpani, cymbal crashes, unashamedly heroic 1940s newsreel finale, cinematic, huge`
- **battle_groove_heavy** — `fat groove metal war riff, fully instrumental, no vocals, key of D minor, tempo exactly 112 BPM, huge downtuned palm muted guitar riff with swagger, enormous kicking bassline right up front, hard swung kick drum pattern and cracking snare backbeat, head-nodding groove, dirty and confident, cinematic`
- **battle_thrash_heavy** — `fast thrash metal dogfight, fully instrumental, no vocals, key of E minor, tempo exactly 160 BPM, galloping downtuned riffs, relentless double kick drums, driving bass, shredding lead guitar, aggressive and airborne, cinematic`
- **battle_bigbeat_heavy** — `big beat electronic metal hybrid, fully instrumental, no vocals, key of A minor, tempo exactly 128 BPM, enormous kicking four on the floor beat, filthy distorted synth bassline, downtuned guitar stabs, brass hits sampled off an old newsreel, breakbeat fills, dancefloor energy with teeth, cinematic`
- **hangar_radio** — `1940s big band swing broadcast heard through an old valve wireless set, fully instrumental, no vocals, warm muffled lo-fi radio sound, brushed drums, upright bass walking, muted trumpet and clarinet section, gentle sentimental wartime dance number, vinyl crackle and hiss, mono, nostalgic`
- **hangar_radio_swing** — `upbeat 1940s big band swing jump number on a crackling valve wireless, fully instrumental, no vocals, warm muffled lo-fi mono broadcast, snappy brushed and stick drums, walking upright bass, punchy trumpet and trombone section trading riffs, hot clarinet solo, cheerful and bouncy hangar dance, tube warmth, hiss and crackle`
- **hangar_radio_ballad** — `slow sentimental 1940s wartime dance ballad on a crackling valve radio, fully instrumental, no vocals, warm muffled lo-fi mono broadcast, soft brushed drums, upright bass, lonely muted trumpet lead over lush saxophone section, last dance before the boys ship out, tender and wistful, tube warmth and hiss`
- **hangar_brief** — `1940s military briefing room newsreel underscore heard on an old wireless, fully instrumental, no vocals, warm muffled lo-fi mono broadcast, brisk clipped march rhythm on snare, businesslike brass, plain and purposeful, background music under a mission briefing, tube warmth and crackle`
- **victory** — `very short triumphant brass victory sting, fully instrumental, no vocals, key of B flat major, rising heroic fanfare with cymbal crash and timpani hit, resolves onto a big major chord and stops, 1940s newsreel stinger` (duration 0:10)
- **defeat** — `very short deflating minor sting, fully instrumental, no vocals, key of D minor, brass and strings sagging downward, a lone snare roll dying away, ends on a hollow unresolved minor chord, 1940s newsreel bad news stinger` (duration 0:10)

## Suno clip IDs

Both takes were downloaded for most tracks; the **bold** one is what shipped. Fetch any of them
again with `https://cdn1.suno.ai/<uuid>.mp3`.

| id | take A | take B |
|---|---|---|
| battle_ww2_march | **ec220c80-6308-4a86-853e-83aefab362c9** | a057aff7-a9a0-4a26-b1c7-9e9013f1524a |
| battle_ww2_heavy | efcb5e17-4a7c-43e3-b6ce-a391507a749c (87 s, short) | **9fdfcc35-9c0d-466c-99b5-299c5305b5f8** |
| boss_march | **a43ae084-b4a1-4cd5-9c67-a04d3937312d** | d7697aae-f134-4336-8b24-40afc5ab2d16 |
| boss_heavy | e1ed3afc-24ad-47c8-b7e1-831cc4a7794e | **05d97efd-1551-4026-bdd7-3342f37a4b62** |
| battle_drift_march | **78717f6e-eae5-48bc-b990-83368e4f41a4** | f1f59b30-799d-4284-a431-bea86ab243a9 |
| battle_drift_heavy | **68128cb3-ed9c-4d42-8757-1d4d1155ef27** | (not captured) |
| battle_chrome_march | **257fd8e1-ecd2-48e1-8c6a-c40293ecc695** | (not captured) |
| battle_chrome_heavy | bf2488df-5d1a-42a5-b06d-1393bb6b1efe | **3a1f3312-fe09-46de-8850-3e5f85daa022** |
| title_theme | **68fa7fb8-9ac3-407f-b5fe-09f8bd0342b5** | 34b11fb3-252d-4a54-a6a9-a5b73b2c17b3 |
| title_chrome | **8bb86031-463a-4334-b0be-9615426a2909** | 52fab76a-ad6f-43b3-91d6-4f5b1c7c418b |
| battle_grim | 70d570b3-25b8-4648-98b1-d64e1b12b04b | **bd1a434d-58a6-49c8-a87f-03e754f8943f** |
| battle_tense | **16036ee2-7578-4871-9d09-4e2b1a4f092d** | a0d40a60-76b0-4d7b-a8f8-bbbeb3af5732 |
| battle_triumph | **ea7da3b6-295d-4362-a5fe-32935023d647** | (not captured) |
| battle_groove_heavy | **9fc2405f-6ed3-4fa8-8165-ca9342dd5092** | (not captured) |
| battle_thrash_heavy | 344456d1-692b-4a09-9dff-f8fdb480bfef (72 s, short) | **83bd6f7b-8385-4675-8fed-4cebbb8ccfda** |
| battle_bigbeat_heavy | **cd871a7d-1b9c-44f8-9a3e-c976deea29f4** | 030e4f25-b6ef-495d-b89b-e655dd2a03a5 |
| hangar_radio | 5679beff-259e-4f49-9234-7053e9511cb1 | **85696a68-5431-49bc-b986-0af7c6bac550** |
| hangar_radio_swing | 1d948239-3aaa-4f4e-ab6c-c946d12c8322 | **80c9250f-3ce8-4c5a-a63a-5665dd8ebaf3** |
| hangar_radio_ballad | b1ed9928-7293-4efd-a585-1884de169fb5 | **7673bbf5-cd53-49ac-93b5-8b5db617d9be** |
| hangar_brief | 594fc634-95f5-43cc-a445-acd24aaca2f8 | **698c1f8e-ef00-4136-987a-4d5bd1b2ab80** |
| victory | **78de5dde-6f5f-4c5b-adf1-1e77ab8b7f04** | 268d782b-… (failed, refunded) |
| defeat | beee4d1e-5e86-49df-9f79-c4d53e472839 | **7cf530ff-4a28-469c-bdf0-005feb826490** |
