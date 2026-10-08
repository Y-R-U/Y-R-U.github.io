# Decisions (manager) — newest last

D1 Title: **Garfield: Hungry Heist**. Chapter One: Food. Personal, non-commercial fan game; unlisted (projects.js
   entry `hidden:true`); small footer "Fan-made, non-commercial. Garfield © Paws, Inc. — not affiliated."
D2 Proper names Garfield / Jon by default; Settings → Character names lets the player rename both (subtitles/UI use
   the names; voiced lines that speak a name get a name-free alternate take used when a custom name is set).
D3 Art: soft movie-style 3D (Aaron). Warm late-afternoon/evening interior lighting, soft shadows, AO feel, gentle
   bloom on lamps. Original models, no official assets.
D4 Garfield's lines are thought bubbles (Jon can't hear them) and voiced deadpan/lazy/sarcastic (Aaron). Jon speaks
   aloud: cheerful, nerdy, easily flustered. Voices are DESIGNED in Qwen Voice Studio, not imitations of real actors.
D5 Lots of cheeky random barks (Aaron): idle, context, chase, success, etc.
D6 Music: ACE-Step for instrumental loops (fast, MIT); YuE2 allowed (non-commercial) e.g. for a sung title song with
   ORIGINAL lyrics. Never the Garfield theme. Settings default music volume 0.35, music on.
D7 Hosting: game lives at repo `mal/garfield/` → deployed to br8t.com/mal/garfield/ (Caddy static root
   /srv/apps/br8thome/site; br8t/deploy.sh's rsync excludes protect mal/). Also loads on the Pages mirror.
   Self-contained: vendored three 0.180 inside the folder.
D8 No build step; ES modules; landscape; desktop > tablet > phone.
D9 Space = interact when an interactable is highlighted (brief: "press space/click on food when standing on it"),
   otherwise jump. Click/tap on a highlighted interactable also interacts.
D10 Belly: grows when eating level food, shrinks slowly with running/jumping; saved; cosmetic + ±10% speed.
D11 Cutscenes are skippable (Skip button / Esc hold) EXCEPT nothing — even the first intro can be skipped; intro
   auto-plays only on first launch; "Replay intro" in Settings.
D12 Jon cannot jump onto furniture: high ground is Garfield's escape during a chase.
D13 Start gate (Aaron): 'Tap to Play' card after loading on every visit, all platforms — unlocks audio (and fullscreen/landscape on touch) before intro/menu. ?skip/?level bypass it.

## Wave 3 — Brief 2 (2026-10-08): Ch1 Free Play, Chapter Two "Odie and Lyman", Arena
D14 Unlock ladder: Ch1 all 10 done → (next visit to Ch1 screen) 'Coming Soon' unlock-anims into 'Free Play'; AND (next
    visit to main menu) Ch1's neighbour 'Coming Soon' unlock-anims into 'Chapter Two: Odie and Lyman' with a new locked
    'Coming Soon' beside it. Ch2 all 10 done → Ch2 'Free Play' unlocks (same anim). Ch2 L7 → 'Arena Unlocked' toast and
    an 'Arena' button on the main menu (unlock anim on next menu visit). Existing saves that already finished Ch1 get the
    animations on their next visit. Save migrates garfield_hh_v1 additively (no reset).
D15 Ch2 opening cutscene plays automatically the FIRST time Ch2 is opened, then fades to the Ch2 level select; a small
    '▶ Story' button on the Ch2 screen replays it. Skippable like every cutscene.
D16 New cast: Lyman (Jon's rig + new head: black hair, moustache; own clothes; 'disco' variant = white disco suit),
    Odie (new quadruped dog on Garfield's sculpt/rig pipeline: pale yellow, black ears/tail/nose, one black spot on his
    side, huge goofy tongue, long legs, dopey eyes), delivery man (Jon-rig variant: cap + uniform), mice (tiny, cheap,
    instanced), bald Garfield (material/variant switch: pink skin, no stripes, still the same shape).
D17 Lyman's bedroom = new upstairs room next to Jon's (replaces the decorative bathroom door); under-stair cupboard
    becomes an enterable room with a door (Ch2 L2). Jon's room gets a dresser with a sock drawer + a breakable drawer.
D18 Multi-human AI: jonAI generalises to humans (Jon + Lyman) — both chase together in Ch2 ("Naughty Garfield!"),
    10 s, same no-climbing rule; catch → whack cutscene as in Ch1.
D19 Arena: always in Jon's bedroom; scratch hit = point to Garfield, Odie's tackle hit = point to Odie; first to 20.
    Ch2 L7 = guided tutorial vs very easy Odie; Arena from the main menu = replayable with difficulty select (Easy now,
    others 'coming soon' — "harder things to fight in the future"). Either result completes L7.
D20 Bald Garfield after L8 is a one-level gag; he is furry again from L9 (fur "grew back" joke bark).
D21 Free Play (both chapters): no objectives; random events from that chapter's mechanics only, each with a chance;
    contradictory variants are mutually exclusive per session/interval (e.g. Lyman in the disco suit vs normal).
    Knockouts recover after 10 s; trapped person escapes after 60 s or when Garfield opens the door. Garfield can open
    and close the bedroom door and the fridge (fridge: nothing happens). Ch1 Free Play: Jon wanders, sometimes sits at
    the table NOT eating; vine swing over him + scratch = face hit → fall_back_chair (same as L2 chair fall).
D22 Wave 3 lanes (cap 4): cast, world, media, game. Same rules as before.
