# TINPOT 0.06 — the lads find the radio

148 original lines, six locally designed Qwen3-TTS 1.7B voices, 418 seconds of dialogue.
The **runtime MP3 payload is 2,165,076 bytes (2.17 MB / 2.06 MiB)** plus the manifest.
No live AI, server connection, cloud API, speech synthesis dependency or external request is
required to play the game. `audio/music/` is unchanged.

## Cast

- **Crumb:** weary, low British voice; dry objections to management.
- **Spud:** cheerful Yorkshire optimist; potatoes and poor judgement.
- **Peas:** precise, fastidious British clerk; war as an administrative error.
- **Titch:** lighter Scottish voice; nervous wit and tactical vibrating.
- **Headquarters:** pompous general, magnificently insulated from consequences.
- **Inspector Biscuit:** fussy official who thinks this war is bad for the tea.

Each recruit keeps a voice using `rosterId % 4` (initially Crumb/Spud/Peas/Titch). Promotions and
slot changes preserve that identity. Replacements reuse the four cast archetypes. Only living
soldiers answer; inspector lines require a living inspector. Nobody speaks in attract mode.

## What triggers a line

- Actual movement orders, blocked routes, hold/rejoin card toggles, and weapon changes.
- Grenade arming/cancellation; the arming voice comes from a living grenadier.
- Hits, friendly-fire complaints, being on fire, selected enemy kills and casualties.
- Enemy reinforcement waves, the last soldier, forest destruction and running short of time.
- Quiet idle intervals (roughly 20–32 seconds, after an initial 16–24 second delay).
- Mission-specific briefings, deployment, barracks, purchases, victory, defeat and campaign end.
- Inspector arrival, idle complaints and being left more than eight metres behind.

The death and hit observations do not alter game simulation. Friendly fire is inferred from the
existing hit/source-position data; no combat data or balance was changed. Commentary is flavour,
not a substitute for the objective display or grenade warnings.

## Plain replies and story lines (0.06)

Move, hold/rejoin, equipment and cancellation confirmations choose a plain pool 80% of the
time, with the existing personality pool used for the remainder. Each soldier has Yes sir,
Affirmative, Going now and Sure thing; Going now is movement-only. Every voice also has five
snarky movement takes. Fresh-line selection happens within the chosen pool, so adding more
jokes does not change the ratio. Plain replies can repeat after four seconds; jokes retain
the 45-second per-line cooldown. The seeded distribution gate also rejects a reversed 20/80
mutant. Nine new headquarters clips cover the story zones, depot and ending.

## Playback rules

`js/core/chatter.mjs` is pure and tests with Node. It owns priority, three-item queue limit,
category cooldowns, expiring acknowledgements, recent-line avoidance and speaker validity.
It uses its own random source and never consumes `world.random`.

`js/platform/speech.mjs` observes the world and plays decoded MP3s through Web Audio. Only one
voice source plays at once. Commands supersede idle/welcome commentary; fire/friendly-fire/
grenade warnings can interrupt ordinary replies. Dead speakers and stale queued orders are
cancelled. Pause, the grenade primer, changing scenes/worlds, backgrounding, and voice mute
stop speech and discard its queue. Reset preserves recent-line memory to avoid instant repeats.

Clips download **on demand**, with at most 16 decoded buffers retained. Fetches are not aborted
when a line is cancelled; an epoch check discards late results so they cannot play in the wrong
scene. A failed clip remains silent and does not stop the game. Title mode does not preload the
whole pack. Web Audio unlocks on a real pointer/key gesture.

Speech ducks the existing music bed by up to 72%, without changing its stored volume. The
separate **Radio chatter** slider in Sound settings defaults to 85%, persists in `tinpot.audio`,
and can be set to zero independently of music and battle effects. The speaking soldier's
existing card glows. There is no new caption panel over the play field; scripts/transcripts are
in the manifest and the audition page.

## Assets and reproduction

- `audio/voices/manifest.json`: every clip's ID, character, trigger, exact text, MP3 filename,
  duration, byte count, source job ID and content/settings signature.
- `tools/voice-source/script.json`: complete casting descriptions, reference text and line list.
- `tools/voice-source/write_script.py`: source for that list.
- `tools/generate-voices.py`: resumable local-Qwen API rendering and MP3 conversion.
- `tools/voice-source/*.wav`: local reference/production takes, intentionally ignored for release.
- `tools/voice-source/references.json`: local Qwen reference IDs; intentionally ignored.
- `tools/voices-audition.html`: browse transcripts and audition the shipped MP3s.

Generation uses the existing local service at `http://127.0.0.1:7876`. Six VoiceDesign reference
recordings are uploaded to it, then the Base model clones each character. Generation is serial,
waits if the service is busy, and resumes from signatures in the manifest. English, seed 42,
temperature 0.8, top P 1, top K 50, repetition penalty 1.05. The local service retains its own
source jobs as well. Runtime does not use the job IDs or reference IDs.

```sh
cd /Users/aaronair/cc/yru/site/gms/3d/tinpot
/Users/aaronair/cc/airon/qwen-tts/.venv/bin/python tools/generate-voices.py
```

To change a line, edit `script.json` (or edit and rerun `write_script.py`). Unchanged signatures
are skipped. If rebuilding on a fresh Qwen service, re-upload the six reference WAVs and update
`references.json`, or move that local bookkeeping file aside to design a fresh cast. Keep a
reviewed reference to retain exactly the same character.

FFmpeg processing: high-pass 110 Hz, low-pass 7,600 Hz, loudness target -18 LUFS / -2 dBTP,
mono 24 kHz **40 kbps MP3**. Original takes stay local; game requests use only the compressed files.

## Validation

```sh
node tools/voices-test.mjs
/Users/aaronair/cc/airon/qwen-tts/.venv/bin/python tools/audit-voices.py
~/.claude/bin/cdp start --port 9223 -- --use-angle=metal
node tools/voices-browser.mjs
```

Keep the Chrome start and browser invocation in the same shell execution. The browser driver
disables its cache. Use the existing site server on port 8888, never a server rooted at this game.

Evidence lives in `docs/evidence/voices-{unit,assets,browser}.json` and `voices-*.png`. The pure
suite rejects deliberately broken dead-speaker, priority and expiration variants. The initial
browser test also caught the real bug where deployment chatter starved the first move reply;
its failing snapshot is preserved in `voices-before-command-fix.json`.

The audio audit decodes every shipped MP3 and checks duration/rate/channel count, finite samples
and speech energy. These are technical checks, not proof of perfect accents or pronunciation.
Browser playback/gesture checks run in hardware-rendered Chrome with phone viewports. Physical
phone/Safari playback remains unverified.

The initial voice pass was prepared locally under the folder's standing no-git rule. Aaron
explicitly authorised committing and pushing this release on 2026-09-25; that instruction
overrides the standing rule for these Tinpot changes. Public test URL:
https://yru.br8t.com/gms/3d/tinpot/ (PATTERN 0.06).
