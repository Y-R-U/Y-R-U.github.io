# Fresh-eyes playtest 1 (2026-10-03, S22 412x915, ~4.4h game time)
Full text was returned to the manager; key findings:
- CRITICAL: card `.flash` class collides with global camera `.flash` rule (style.css) → card becomes position:absolute/pointer-events:none, stuck until reload (app.js restartAnim(card,'flash')).
- CRITICAL: age soft-lock — ageMax 72 (data/housing.js), first birth age+1 (state/life.js:53); Starter House bought late → no child → no teen → can never retire.
- Life beats only hit DESIGN targets on the sim's optimal path; typical player: partner age 37, Starter House age 71. Housing prices jump $2K→$1.5B→$800B→$120T. Life tab undiscovered ($500K before noticing $2K Bedsit).
- First stand earns $0/s for ~60s (stock fills shelf silently; pile hint late; "📦 1%" badge unexplained).
- Gold gate card ("Suburbs 🔓") only opens Town map; contracts block permit while cash piles up ($941M).
- Emoji-only toasts unreadable; never discovered tickets→Crew, couriers (contract stuck 0/4), merges, postcards, Rush ran unnoticed.
- Partner pick perk-first ("Luca: Income +10%" with 🚀 face) — needs face/name first.
- Truncated labels ("×10 $2.(", "Downto…"); bin moves with hero pan; duplicate 🥫 counters; hero label wrong ("🏠 Park Bench" over lemonade); white floats low-contrast at night; piles barely visible at low fill.
- Strengths: start understood in ~20s; brisk satisfying early pacing; charming life beats; 3D is the best asset; Town map lovely; no console errors.
Shots: /private/tmp/claude-501/il2-playtest/
