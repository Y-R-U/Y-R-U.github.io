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
