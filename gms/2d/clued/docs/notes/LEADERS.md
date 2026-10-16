# Lane LEADERS (2026-10-16)

Leaders pack 34 → 258. Additive: `node tools/c2_leaders_add.mjs` patches `data/packs/leaders.json` on disk (strips its own
earlier additions first, keeps the 34 builder items and their questions), then reruns c2_gender. `c2_build_people.mjs`
calls the same `extendLeaders()`, so a full rebuild gives the same pack. Afterwards: build_index, local_tags.

- Rows: `tools/c2_src/leaders_more.mjs` (`LEADERS_MORE`, `LEADERS_FACTS` for the 34 originals, `LEADERS_IMG` portrait
  overrides, `''` = no picture). Report: `tools/c2_reports/leaders.txt`.
- New facts: `country` (cat, "Country led"; blank when a ruler held several realms that could appear as wrong options),
  `role` (Monarch / President / Prime minister; blank when someone held two of them, e.g. Putin, Nasser, Chirac),
  `start` (year, "Came to power", first time they led that country; must match a Wikidata P39 start or the infobox).
  Dates before 800 BC are left out (chronology-dependent).
- Difficulty = fame: mean percentile of Wikidata sitelinks and English Wikipedia pageviews (Sep 2025–Aug 2026);
  ≥ 0.80 easy, ≥ 0.45 medium. The 34 originals keep their hand levels. Local leaders (Australian PMs) are hard
  globally; LOCAL easing handles "I live here".
- Hat-trick: `TRIO.leaders` in js/formats/trio.js (portrait → leader / country / came to power, near [15, 40, 80]).
- Local tags: nationality demonyms added to `NATIONALITY_EXTRA` in tools/local_names.mjs (Zulu, Malian, Hawaiian …).
- Pictures: Wikidata P18 unless overridden; checked by eye for names in the image (captions, coin legends, stamps).
  11 leaders have no picture. All new pictures go through Aaron's review page.
