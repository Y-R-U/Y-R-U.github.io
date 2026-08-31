#!/usr/bin/env node
// Regenerates docs/SUNO.md from tools/music/jobs.json so the copy-paste sheet can never drift
// from what was actually generated. `prompt` is the Suno style string that made the shipped take;
// `acePrompt` is the longer local-fallback text ACE-Step wants.
//
//   node tools/music/build_suno_doc.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const jobs = JSON.parse(await readFile(path.join(ROOT, 'tools/music/jobs.json'), 'utf8'));
let results = {};
try { results = JSON.parse(await readFile(path.join(ROOT, 'tools/music/results.json'), 'utf8')); } catch {}

const HEADER = `# WHO FIGHTS — prompt and lyric record

**The record of what the music library is and how it was made.** Every track, its exact Styles
string, its exact lyrics, the Suno settings, and the clip ids of both takes. Regenerate any of it —
on Suno or locally on ACE-Step — from this file.

**All 25 shipped tracks were generated on Suno v5.5**, in Aaron's logged-in browser, 2026-08-31.
They replaced an ACE-Step library of the same 25 ids. Each track also carries an **\`acePrompt\`** in
\`tools/music/jobs.json\` — the longer, arrangement-shaped description ACE-Step responds to — so the
whole library is still re-makeable with no subscription. \`gen_music.mjs\` uses \`acePrompt\` when it
is present.

## Settings used (Suno, all 25 tracks)

| field | value |
|---|---|
| URL | \`suno.com/create\`, **Advanced** tab |
| model | **v5.5** |
| Weirdness / Style Influence | **50 % / 50 %** (defaults, untouched) |
| Styles | the whole prompt goes here — Suno gets **no** separate description field |
| Lyrics panel | **Instrumental** for the 17 beds and stings, **Write** for the 8 songs |
| Vocal Gender | \`More Options → Vocal Gender\` — Male / Female / unset, per track below |
| Duration | \`More Options → Duration → Custom\`, **never Auto** |
| Save to | My Workspace (nothing published, shared or purchased) |
| Song Title | \`WF <id>\` so the download pass can find the clip |

**Duration slider geometry** (1380 px window, More Options expanded and scrolled to the bottom):
the track runs from x≈250 to x≈425 at y≈383 and is linear, **\`x = 250 + (seconds − 10) / 2\`**.
Range 0:10 – 6:00, granular to 5 s. Drag the handle; arrow keys and \`form_input\` do nothing (it is
a div, not an \`<input type=range>\`).

## What Suno actually did with Duration

**Instrumentals honour it to within a second.** Asked 2:00, got 1:57–2:00, 34 times out of 34.
That is a real improvement on the skyhammer session's finding that Suno undershoots — the
difference is that **that session used the 0:10 minimum for its stings**. Ask for 0:20 or 0:30 and
you get 19.7 s / 29.7 s.

**Songs ignore it and fit the lyrics instead.** Same lyric block, same 2:10–2:15 request:
\`tavern_song_jig_01\` came back at 2:10 and \`tavern_song_boast_01\` at 1:33. If a song needs to be
longer, **add lyrics**, do not raise the slider.

## The vocal recipe — this is the new part

The skyhammer session was 100 % instrumental, so none of this existed in the house before.

1. **\`More Options → Lyrics → Write\`.** Switching to Write auto-expands the Lyrics panel and
   pushes everything else down; collapse it again with the **Lyrics** chevron once the words are in,
   and the Styles / Duration / Title / Create column comes back to the same coordinates the
   instrumental recipe uses.
2. **Lyrics go in the Lyrics panel, style in Styles.** Never both.
3. **\`(male)\` / \`(female)\` / \`(crowd)\` / \`(both)\` inline in the lyrics place the voices across
   sections.** They do not set the voice *character* — that comes from the Styles text.
4. **\`More Options → Vocal Gender\`** is a real, separate control and it is worth setting: Male for
   the four male-lead songs, Female for the two female-lead ballads, **left unset for the duet and
   the whole-tavern anthem** so Suno can use both.
5. **Carry the ACE-Step diction lesson over verbatim** — it is the single highest-leverage sentence
   in a sung prompt, and it reads the same on Suno: *ONE clear lead vocal, close-miked and mixed
   loud right at the front, every word crisp and clearly enunciated, a crowd only on the chorus and
   well behind the lead, plenty of space, no wall of noise, diction is the priority.*
6. **\`[Verse 1]\` / \`[Chorus]\` / \`[Outro]\` section tags work** and Suno respects the order.

**Gotcha, cost ~10 minutes each time:** typing a full lyric block through CDP takes longer than the
30 s \`Input.dispatchKeyEvent\` timeout, so the tool reports \`the renderer may be frozen\` **and the
text lands anyway**. Wait 10 s and screenshot before retrying — a blind retry doubles the lyrics.

**Gotcha:** \`cmd+a\` only selects the Styles text if the click genuinely landed inside the textarea.
If it lands on the page background it selects *every clip in the workspace* and puts checkboxes on
all of them. Harmless, but there is no visible "deselect all"; a page reload is the quick fix.
Verify the Styles box in a screenshot before hitting Create.

## Getting the audio out — the skyhammer download recipe is DEAD

\`curl -L https://cdn1.suno.ai/<uuid>.mp3\` now returns **403 MissingKey** from CloudFront: the CDN
wants signed cookies. Everything is behind auth. What works:

\`\`\`js
// in the page, which holds the Clerk session
const tok = await window.Clerk.session.getToken();
const j = await (await fetch('https://studio-api-prod.suno.com/api/download/clip/' + uuid,
  { credentials: 'include', headers: { Authorization: 'Bearer ' + tok } })).json();
// j.url is a signed S3 URL. It 404s on the first call or two while Suno renders the mp3 — poll.
const bytes = new Uint8Array(await (await fetch(j.url)).arrayBuffer());
\`\`\`

Clip ids come out of the workspace list — \`a[href^="/song/"]\` — but the list is **virtualised**, so
scroll its \`.clip-browser-list-scroller\` in steps and accumulate. \`/api/feed/v2?ids=a,b,c\` (same
Bearer header) returns \`metadata.duration\` and \`status\` for up to a dozen at a time, which is how
the two takes of each track were compared without listening to either.

**Then it gets awkward.** Suno's own multi-select *Download all* opens one popup per clip, Chrome's
popup blocker stops it, and **from then on Chrome blocks every download from suno.com** — including
the per-clip menu that worked a minute earlier. Do **not** use *Download all*. If you have already
tripped it, the escape hatch that needs no browser-settings change is the clipboard:

\`\`\`js
window.__b64 = btoa(binaryString);          // built from the Uint8Array above
// then, from a REAL click on an injected button (execCommand needs a user gesture):
const ta = document.createElement('textarea');
ta.value = window.__b64; document.body.appendChild(ta); ta.select();
document.execCommand('copy'); ta.remove();
\`\`\`

\`\`\`bash
pbpaste | base64 -d > audio/music/raw/<id>.mp3
\`\`\`

3 MB of base64 through the macOS pasteboard is fine and none of it passes through the model's
context. \`navigator.clipboard.writeText\` does **not** work here — it throws
*Document is not focused* under CDP; \`execCommand('copy')\` inside a real click does.

---
`;

const groups = [
  ['§1 — Instrumental beds', j => j.kind === 'instrumental' && j.seconds > 40],
  ['§2 — Instrumental stings (short, must resolve and stop)', j => j.kind === 'instrumental' && j.seconds <= 40],
  ['§3 — Tavern songs (with lyrics)', j => j.kind === 'song'],
];

let out = HEADER;
for (const [heading, pred] of groups) {
  out += `\n## ${heading}\n`;
  for (const j of jobs.filter(pred)) {
    const r = results[j.id];
    const s = j.suno || {};
    out += `\n### \`${j.id}\` — ${j.title}\n\n`;
    out += `*${j.mood} · asked Suno for ${s.duration || '?'} · got ${r ? r.secondsExact + ' s' : '?'}`;
    if (r) out += ` · ends **${r.ends}**, starts **${r.starts}**`;
    out += `*\n\n`;
    out += `**Styles**\n\n\`\`\`\n${j.prompt}\n\`\`\`\n\n`;
    if (j.lyrics) out += `**Lyrics** (Lyrics panel, mode Write)\n\n\`\`\`\n${j.lyrics}\n\`\`\`\n\n`;
    else out += `**Lyrics** — none. Lyrics panel set to *Instrumental*.\n\n`;
    out += `| | |\n|---|---|\n`;
    out += `| Vocal Gender | ${s.vocalGender ? s.vocalGender : '_unset_'} |\n`;
    out += `| Duration set | ${s.duration || '?'} |\n`;
    if (s.takes) out += `| Suno takes | ${s.takes.map(t => t === s.shipped ? `**${t}**` : t).join('<br>')} |\n`;
    out += `\n**ACE-Step fallback prompt**\n\n\`\`\`\n${j.acePrompt || j.prompt}\n\`\`\`\n\n`;
  }
}

out += `\n---\n\n_Generated by \`tools/music/build_suno_doc.mjs\` from \`tools/music/jobs.json\`. Edit the jobs file, not this._\n`;

await writeFile(path.join(ROOT, 'docs/SUNO.md'), out);
console.log(`docs/SUNO.md — ${jobs.length} entries`);
