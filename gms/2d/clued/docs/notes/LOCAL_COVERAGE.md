# Local focus coverage (2026-10-13)

Built by `tools/local_report.mjs` from the real question pools (`generate()` on each pack's local view, plus in-country
geography from `data/local/geo.json`). Tags: `data/local/tags.json` (`tools/local_tags.mjs`). "I live here" on throughout.

**Fill tests** (worst of two seeds, every round must reach its share): *Pub quiz* = the Classic Pub Quiz suggestion (general,
history, map, sport, music & screen clips; 5×10). *All themes* = five multiple-choice rounds on All themes (5×10).

## Headline

- **ALL works for a whole pub quiz**: United States.
- **ALL works on All-themes rounds**: United States, United Kingdom, Australia, Canada, India, Japan, Germany, France, Brazil (9 of 40).
- **Most (≈60%) works for a pub quiz**: United States, United Kingdom.
- **More (≈25%) works on All-themes rounds**: 12 of 40 countries (not: Ireland, South Africa, Nigeria, Kenya, Philippines, Singapore, Malaysia, China, South Korea, Italy, Netherlands, Belgium, Switzerland, Austria, Sweden, Norway, Denmark, Finland, Poland, Portugal, Greece, Turkey, Argentina, Mexico, Egypt, Indonesia, Thailand, Vietnam).
- **Thinnest areas** (countries of 40 with fewer than 10 local multiple-choice questions there; median count): Screen 36 (median 0) · Music 31 (median 2) · General 29 (median 5) · History 28 (median 4) · Food 28 (median 4) · Sport 27 (median 6) · People 25 (median 6) · Nature 23 (median 5) · Geography 0 (median 54).
- In-country geography (states, capitals, cities) exists for: Australia, United States, Canada, New Zealand, United Kingdom, India, Japan, Germany, France, Brazil.

## Countries

| Country | mc pool | Geography | People | Sport | Music | Screen | History | General | Nature | Food | Pub More | Pub Most | Pub ALL | All-themes More | Most | ALL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| United States | 2164 | 456 | 247 | 126 | 470 | 430 | 37 | 22 | 167 | 8 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| Australia | 1633 | 236 | 7 | 57 | 20 | 39 | 16 | 13 | 1097 | 18 | ✅ 15/50 | ❌ 26/50 | ❌ 44/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| United Kingdom | 1585 | 218 | 239 | 75 | 225 | 261 | 46 | 34 | 181 | 16 | ✅ 15/50 | ✅ 30/50 | ❌ 46/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| France | 768 | 192 | 99 | 40 | 8 | 0 | 15 | 17 | 141 | 20 | ❌ 12/50 | ❌ 24/50 | ❌ 40/50 | ✅ 15/50 | ❌ 29/50 | ✅ 50/50 |
| Germany | 692 | 263 | 75 | 31 | 22 | 0 | 19 | 9 | 114 | 13 | ❌ 12/50 | ❌ 24/50 | ❌ 39/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| New Zealand | 547 | 100 | 4 | 9 | 2 | 0 | 8 | 5 | 419 | 0 | ❌ 9/50 | ❌ 16/50 | ❌ 20/50 | ✅ 15/50 | ❌ 20/50 | ❌ 33/50 |
| Italy | 524 | 57 | 126 | 22 | 6 | 0 | 27 | 23 | 63 | 26 | ❌ 9/50 | ❌ 18/50 | ❌ 30/50 | ❌ 13/50 | ❌ 27/50 | ❌ 38/50 |
| Japan | 472 | 303 | 0 | 22 | 2 | 7 | 14 | 19 | 53 | 17 | ❌ 12/50 | ❌ 24/50 | ❌ 40/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| India | 454 | 333 | 29 | 14 | 2 | 0 | 10 | 21 | 2 | 12 | ❌ 12/50 | ❌ 24/50 | ❌ 40/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| Canada | 384 | 232 | 6 | 15 | 42 | 29 | 1 | 5 | 48 | 4 | ❌ 13/50 | ❌ 22/50 | ❌ 29/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| Brazil | 374 | 310 | 8 | 37 | 2 | 0 | 1 | 10 | 0 | 4 | ❌ 10/50 | ❌ 19/50 | ❌ 31/50 | ✅ 15/50 | ✅ 30/50 | ✅ 50/50 |
| China | 310 | 62 | 23 | 9 | 2 | 0 | 21 | 15 | 106 | 12 | ❌ 9/50 | ❌ 18/50 | ❌ 25/50 | ❌ 14/50 | ❌ 21/50 | ❌ 31/50 |
| Netherlands | 280 | 43 | 6 | 5 | 0 | 0 | 2 | 9 | 1 | 0 | ❌ 9/50 | ❌ 13/50 | ❌ 16/50 | ❌ 13/50 | ❌ 22/50 | ❌ 35/50 |
| Russia | 207 | 54 | 35 | 5 | 8 | 0 | 14 | 12 | 62 | 1 | ❌ 9/50 | ❌ 17/50 | ❌ 26/50 | ✅ 15/50 | ✅ 30/50 | ❌ 32/50 |
| Switzerland | 199 | 80 | 6 | 13 | 2 | 0 | 0 | 1 | 40 | 0 | ❌ 5/50 | ❌ 7/50 | ❌ 9/50 | ❌ 13/50 | ❌ 21/50 | ❌ 19/50 |
| Spain | 174 | 58 | 14 | 17 | 2 | 1 | 10 | 11 | 0 | 13 | ❌ 9/50 | ❌ 19/50 | ❌ 31/50 | ✅ 15/50 | ❌ 24/50 | ❌ 41/50 |
| Mexico | 147 | 56 | 1 | 4 | 2 | 6 | 5 | 5 | 42 | 10 | ❌ 9/50 | ❌ 16/50 | ❌ 14/50 | ❌ 13/50 | ❌ 19/50 | ❌ 28/50 |
| Austria | 139 | 62 | 24 | 5 | 10 | 6 | 1 | 6 | 0 | 4 | ❌ 8/50 | ❌ 11/50 | ❌ 12/50 | ❌ 10/50 | ❌ 20/50 | ❌ 30/50 |
| Ireland | 120 | 42 | 0 | 3 | 8 | 6 | 5 | 1 | 55 | 0 | ❌ 10/50 | ❌ 12/50 | ❌ 11/50 | ❌ 12/50 | ❌ 24/50 | ❌ 24/50 |
| Sweden | 120 | 28 | 0 | 5 | 14 | 0 | 0 | 3 | 0 | 0 | ❌ 6/50 | ❌ 8/50 | ❌ 8/50 | ❌ 7/50 | ❌ 10/50 | ❌ 19/50 |
| Denmark | 113 | 50 | 16 | 0 | 2 | 0 | 1 | 3 | 0 | 0 | ❌ 4/50 | ❌ 4/50 | ❌ 4/50 | ❌ 10/50 | ❌ 15/50 | ❌ 19/50 |
| South Africa | 106 | 73 | 9 | 8 | 0 | 0 | 5 | 5 | 0 | 4 | ❌ 9/50 | ❌ 16/50 | ❌ 18/50 | ❌ 9/50 | ❌ 17/50 | ❌ 17/50 |
| Egypt | 101 | 59 | 5 | 2 | 2 | 0 | 15 | 9 | 5 | 0 | ❌ 8/50 | ❌ 14/50 | ❌ 21/50 | ❌ 11/50 | ❌ 8/50 | ❌ 28/50 |
| Norway | 94 | 49 | 6 | 7 | 2 | 0 | 2 | 3 | 4 | 0 | ❌ 9/50 | ❌ 11/50 | ❌ 10/50 | ❌ 14/50 | ❌ 17/50 | ❌ 34/50 |
| Turkey | 94 | 64 | 0 | 0 | 0 | 0 | 6 | 2 | 12 | 4 | ❌ 5/50 | ❌ 8/50 | ❌ 8/50 | ❌ 11/50 | ❌ 17/50 | ❌ 28/50 |
| Argentina | 90 | 48 | 12 | 18 | 2 | 0 | 3 | 3 | 0 | 4 | ❌ 9/50 | ❌ 12/50 | ❌ 16/50 | ❌ 10/50 | ❌ 13/50 | ❌ 14/50 |
| Poland | 88 | 44 | 24 | 0 | 10 | 0 | 2 | 3 | 0 | 4 | ❌ 5/50 | ❌ 5/50 | ❌ 5/50 | ❌ 10/50 | ❌ 17/50 | ❌ 20/50 |
| Belgium | 87 | 41 | 1 | 7 | 2 | 0 | 1 | 2 | 26 | 0 | ❌ 6/50 | ❌ 7/50 | ❌ 10/50 | ❌ 11/50 | ❌ 14/50 | ❌ 24/50 |
| Greece | 86 | 40 | 12 | 6 | 2 | 0 | 8 | 7 | 0 | 8 | ❌ 9/50 | ❌ 18/50 | ❌ 21/50 | ❌ 12/50 | ❌ 19/50 | ❌ 20/50 |
| South Korea | 84 | 42 | 0 | 9 | 10 | 8 | 4 | 2 | 0 | 9 | ❌ 8/50 | ❌ 12/50 | ❌ 12/50 | ❌ 11/50 | ❌ 22/50 | ❌ 21/50 |
| Portugal | 77 | 32 | 14 | 5 | 2 | 0 | 4 | 1 | 19 | 0 | ❌ 5/50 | ❌ 8/50 | ❌ 10/50 | ❌ 9/50 | ❌ 17/50 | ❌ 26/50 |
| Thailand | 69 | 46 | 0 | 1 | 2 | 0 | 0 | 1 | 9 | 10 | ❌ 2/50 | ❌ 2/50 | ❌ 2/50 | ❌ 13/50 | ❌ 19/50 | ❌ 24/50 |
| Kenya | 64 | 47 | 0 | 6 | 2 | 6 | 1 | 1 | 0 | 0 | ❌ 5/50 | ❌ 4/50 | ❌ 4/50 | ❌ 7/50 | ❌ 14/50 | ❌ 18/50 |
| Vietnam | 62 | 48 | 0 | 0 | 2 | 0 | 2 | 2 | 0 | 8 | ❌ 4/50 | ❌ 4/50 | ❌ 4/50 | ❌ 13/50 | ❌ 17/50 | ❌ 20/50 |
| Indonesia | 61 | 42 | 0 | 0 | 2 | 0 | 2 | 3 | 0 | 12 | ❌ 5/50 | ❌ 5/50 | ❌ 5/50 | ❌ 9/50 | ❌ 16/50 | ❌ 20/50 |
| Philippines | 51 | 47 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | ❌ 2/50 | ❌ 2/50 | ❌ 2/50 | ❌ 9/50 | ❌ 15/50 | ❌ 13/50 |
| Singapore | 50 | 40 | 0 | 0 | 2 | 0 | 2 | 0 | 6 | 0 | ❌ 2/50 | ❌ 2/50 | ❌ 2/50 | ❌ 8/50 | ❌ 11/50 | ❌ 18/50 |
| Nigeria | 46 | 39 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 0 | ❌ 5/50 | ❌ 4/50 | ❌ 5/50 | ❌ 8/50 | ❌ 10/50 | ❌ 17/50 |
| Finland | 46 | 36 | 0 | 2 | 2 | 0 | 1 | 2 | 0 | 0 | ❌ 5/50 | ❌ 5/50 | ❌ 5/50 | ❌ 10/50 | ❌ 10/50 | ❌ 13/50 |
| Malaysia | 44 | 35 | 0 | 0 | 2 | 6 | 1 | 0 | 0 | 0 | ❌ 1/50 | ❌ 1/50 | ❌ 1/50 | ❌ 8/50 | ❌ 11/50 | ❌ 17/50 |

Area columns count local multiple-choice questions (pack pools by theme; Geography includes in-country questions).

## Per pack and format

Local questions per format; packs listed by size (multiple choice), `home` = in-country geography.

- **United States** (USA): mc 1815 · tf 2872 · number 316 · type 903 · order 2352 · reveal 149 · home: mc 349, tf 48, number 40, map-click 102. mc by pack: actors 262, music-artists 182, people 177, tv 168, sport 126, inventions 113, cats 84, hits-2000s 80, dogs 77, landmarks 62, hits-1980s 56, hits-2020s 44, hits-2010s 42, history 37, leaders 36, artists 35, explorers 34, countries 33, hits-1970s 28, quotes 24, general 22, hits-1960s 20, books 17, hits-1990s 16, dishes 8, paintings 8, flags 6, capitals 5, insects 2, kids 2, snakes 2, anthems 2, birds 1, currencies 1, mushrooms 1, space 1, words 1.
- **Australia** (AUS): mc 1465 · tf 1380 · number 121 · type 465 · order 1937 · reveal 126 · home: mc 168, tf 8, number 31, map-click 16. mc by pack: trees 178, birds 154, reptiles 147, spiders 141, dinosaurs 134, inventions 119, snakes 119, mammals 111, dogs 78, sport 57, actors 30, landmarks 28, countries 27, flowers 25, dishes 18, history 16, general 13, tv 9, music-artists 8, people 6, words 6, capitals 5, flags 5, kids 5, mushrooms 4, hits-1980s 4, kids-film-tv 4, cats 3, jellyfish 2, languages 2, anthems 2, hits-2000s 2, currencies 1, explorers 1, gems 1.
- **United Kingdom** (GBR): mc 1454 · tf 2312 · number 237 · type 783 · order 2158 · reveal 107 · home: mc 131, tf 4, number 32, map-click 8. mc by pack: people 162, tv 149, dogs 143, books 126, actors 112, inventions 100, music-artists 89, sport 75, leaders 53, hits-1970s 48, history 46, landmarks 42, cats 36, countries 34, general 34, quotes 32, hits-2020s 32, explorers 24, hits-1960s 18, dishes 16, paintings 16, hits-1980s 14, artists 12, hits-2010s 12, flags 5, capitals 4, kids 4, hits-1990s 4, hits-2000s 4, kids-film-tv 4, currencies 2, dinosaurs 1, flowers 1.
- **France** (FRA): mc 656 · tf 871 · number 62 · type 234 · order 1084 · reveal 44 · home: mc 112, tf 13, number 26, map-click 26. mc by pack: dogs 133, inventions 132, leaders 69, paintings 48, artists 42, sport 40, landmarks 35, countries 34, people 24, dishes 20, general 17, history 15, cats 8, explorers 6, words 6, books 4, capitals 4, flags 4, music-artists 4, kids 3, languages 2, anthems 2, hits-2010s 2, currencies 1, quotes 1.
- **Germany** (DEU): mc 479 · tf 816 · number 61 · type 192 · order 1007 · reveal 35 · home: mc 213, tf 13, number 40, map-click 32. mc by pack: inventions 116, dogs 114, people 56, sport 31, landmarks 21, countries 19, history 19, leaders 19, classical-piano 14, dishes 13, general 9, paintings 8, artists 6, books 6, words 6, classical-recordings 6, capitals 4, flags 4, quotes 4, anthems 2, currencies 1, languages 1.
- **New Zealand** (NZL): mc 502 · tf 188 · number 11 · type 58 · order 50 · reveal 9 · home: mc 45, number 21. mc by pack: birds 274, trees 125, countries 32, reptiles 20, sport 9, history 8, landmarks 7, languages 6, capitals 5, general 5, explorers 4, flags 4, anthems 2, currencies 1.
- **Italy** (ITA): mc 524 · tf 690 · number 36 · type 204 · order 487 · reveal 32. mc by pack: leaders 100, inventions 83, dogs 63, paintings 44, history 27, dishes 26, countries 25, artists 24, general 23, sport 22, landmarks 21, words 16, people 14, explorers 12, capitals 4, flags 4, kids 4, languages 2, quotes 2, anthems 2, classical-piano 2, classical-recordings 2, books 1, currencies 1.
- **Japan** (JPN): mc 240 · tf 379 · number 17 · type 137 · order 86 · reveal 16 · home: mc 232, tf 17, number 40, map-click 94. mc by pack: dogs 50, landmarks 28, countries 22, sport 22, general 19, dishes 17, history 14, words 12, artists 11, languages 10, paintings 8, tv 7, flags 5, capitals 4, kids 4, cats 3, currencies 2, anthems 2.
- **India** (IND): mc 194 · tf 379 · number 17 · type 129 · order 109 · reveal 13 · home: mc 260, tf 30, number 40, map-click 72. mc by pack: countries 29, words 27, landmarks 25, general 21, leaders 17, sport 14, dishes 12, people 12, history 10, languages 8, flags 5, capitals 4, currencies 2, kids 2, anthems 2, books 1, flowers 1, quotes 1, snakes 1.
- **Canada** (CAN): mc 207 · tf 459 · number 21 · type 82 · order 72 · reveal 13 · home: mc 177, tf 12, number 32, map-click 26. mc by pack: dogs 33, countries 29, actors 24, hits-2010s 20, sport 15, landmarks 14, cats 13, hits-1990s 8, music-artists 8, people 6, capitals 5, flags 5, general 5, tv 5, dishes 4, hits-2020s 4, anthems 2, books 1, currencies 1, history 1, insects 1, kids 1, languages 1, trees 1.
- **Brazil** (BRA): mc 135 · tf 273 · number 5 · type 76 · order 0 · reveal 6 · home: mc 239, tf 25, number 40, map-click 54. mc by pack: countries 44, sport 37, landmarks 14, general 10, people 8, capitals 5, flags 5, dishes 4, kids 2, languages 2, anthems 2, currencies 1, history 1.
- **China** (CHN): mc 310 · tf 392 · number 23 · type 125 · order 373 · reveal 22. mc by pack: dogs 106, inventions 53, countries 25, landmarks 25, history 21, general 15, dishes 12, leaders 11, sport 9, explorers 7, people 5, capitals 4, flags 4, currencies 3, kids 3, words 3, anthems 2, languages 1, quotes 1.
- **Netherlands** (NLD): mc 280 · tf 301 · number 23 · type 108 · order 377 · reveal 20. mc by pack: inventions 107, paintings 80, countries 25, artists 18, general 9, words 9, landmarks 7, explorers 6, sport 5, capitals 4, flags 4, history 2, languages 2, currencies 1, flowers 1.
- **Russia** (RUS): mc 207 · tf 340 · number 29 · type 104 · order 171 · reveal 17. mc by pack: dogs 55, countries 21, landmarks 21, history 14, general 12, leaders 12, people 12, explorers 11, cats 7, artists 6, classical-recordings 6, sport 5, capitals 4, flags 4, words 3, books 2, currencies 2, languages 2, space 2, classical-piano 2, dishes 1, elements 1, kids 1, quotes 1.
- **Switzerland** (CHE): mc 199 · tf 149 · number 8 · type 41 · order 51 · reveal 6. mc by pack: countries 68, inventions 56, dogs 40, sport 13, people 6, capitals 5, flags 5, anthems 2, books 1, currencies 1, general 1, languages 1.
- **Spain** (ESP): mc 174 · tf 336 · number 19 · type 102 · order 169 · reveal 15. mc by pack: countries 32, artists 24, sport 17, paintings 16, landmarks 14, dishes 13, general 11, history 10, explorers 7, people 6, words 6, capitals 5, flags 4, languages 2, anthems 2, books 1, currencies 1, kids 1, leaders 1, tv 1.
- **Mexico** (MEX): mc 147 · tf 217 · number 6 · type 68 · order 0 · reveal 10. mc by pack: dogs 41, countries 33, landmarks 14, dishes 10, words 9, actors 6, artists 5, flags 5, general 5, history 5, sport 4, capitals 2, kids 2, anthems 2, currencies 1, explorers 1, insects 1, languages 1.
- **Austria** (AUT): mc 139 · tf 210 · number 17 · type 52 · order 140 · reveal 10. mc by pack: countries 53, people 24, paintings 16, actors 6, general 6, classical-piano 6, sport 5, artists 4, dishes 4, flags 4, capitals 2, languages 2, anthems 2, classical-recordings 2, books 1, currencies 1, history 1.
- **Ireland** (IRL): mc 120 · tf 142 · number 7 · type 32 · order 2 · reveal 6. mc by pack: dogs 55, countries 24, landmarks 7, actors 6, flags 5, history 5, capitals 4, hits-1980s 4, sport 3, anthems 2, music-artists 2, currencies 1, general 1, languages 1.
- **Sweden** (SWE): mc 120 · tf 133 · number 7 · type 33 · order 30 · reveal 4. mc by pack: inventions 70, countries 16, hits-1970s 8, sport 5, capitals 4, flags 4, music-artists 4, general 3, currencies 2, languages 2, anthems 2.
- **Denmark** (DNK): mc 113 · tf 123 · number 10 · type 42 · order 41 · reveal 6. mc by pack: inventions 40, countries 23, people 16, languages 9, landmarks 7, flags 5, capitals 4, general 3, currencies 2, anthems 2, history 1, quotes 1.
- **South Africa** (ZAF): mc 106 · tf 147 · number 10 · type 51 · order 0 · reveal 5. mc by pack: countries 30, languages 29, leaders 9, sport 8, landmarks 7, general 5, history 5, capitals 4, dishes 4, flags 2, quotes 2, currencies 1.
- **Egypt** (EGY): mc 101 · tf 112 · number 6 · type 54 · order 0 · reveal 7. mc by pack: countries 33, history 15, landmarks 15, general 9, cats 5, leaders 5, capitals 4, flags 4, kids 4, languages 2, sport 2, anthems 2, currencies 1.
- **Norway** (NOR): mc 94 · tf 160 · number 10 · type 48 · order 0 · reveal 6. mc by pack: countries 32, paintings 8, languages 7, sport 7, artists 6, explorers 6, words 6, capitals 4, cats 4, flags 4, general 3, currencies 2, history 2, anthems 2, inventions 1.
- **Turkey** (TUR): mc 94 · tf 153 · number 7 · type 44 · order 10 · reveal 8. mc by pack: countries 33, landmarks 21, cats 12, history 6, words 6, capitals 5, dishes 4, flags 3, general 2, currencies 1, languages 1.
- **Argentina** (ARG): mc 90 · tf 177 · number 6 · type 45 · order 21 · reveal 6. mc by pack: countries 29, sport 18, people 12, landmarks 7, flags 5, capitals 4, dishes 4, general 3, history 3, languages 2, anthems 2, currencies 1.
- **Poland** (POL): mc 88 · tf 170 · number 13 · type 44 · order 217 · reveal 7. mc by pack: people 24, countries 18, languages 9, classical-piano 8, landmarks 7, capitals 4, dishes 4, flags 4, general 3, currencies 2, history 2, anthems 2, quotes 1.
- **Belgium** (BEL): mc 87 · tf 110 · number 7 · type 34 · order 3 · reveal 6. mc by pack: dogs 26, countries 22, landmarks 7, sport 7, artists 6, capitals 4, flags 4, languages 3, general 2, anthems 2, books 1, currencies 1, history 1, people 1.
- **Greece** (GRC): mc 86 · tf 151 · number 6 · type 54 · order 0 · reveal 8. mc by pack: countries 16, landmarks 14, dishes 8, history 8, general 7, people 7, sport 6, leaders 5, capitals 4, flags 4, paintings 2, anthems 2, currencies 1, languages 1, quotes 1.
- **South Korea** (KOR): mc 84 · tf 156 · number 6 · type 43 · order 0 · reveal 5. mc by pack: countries 24, dishes 9, sport 9, tv 8, landmarks 7, flags 5, capitals 4, history 4, hits-2020s 4, music-artists 4, general 2, anthems 2, currencies 1, languages 1.
- **Portugal** (PRT): mc 77 · tf 90 · number 6 · type 30 · order 0 · reveal 5. mc by pack: countries 21, dogs 19, people 8, explorers 6, sport 5, capitals 4, flags 4, history 4, languages 2, anthems 2, currencies 1, general 1.
- **Thailand** (THA): mc 69 · tf 175 · number 3 · type 38 · order 0 · reveal 8. mc by pack: countries 26, dishes 10, cats 9, landmarks 7, languages 5, flags 4, capitals 2, currencies 2, anthems 2, general 1, sport 1.
- **Kenya** (KEN): mc 64 · tf 54 · number 3 · type 22 · order 0 · reveal 3. mc by pack: countries 37, actors 6, sport 6, capitals 4, flags 4, anthems 2, currencies 1, general 1, history 1, kids 1, languages 1.
- **Vietnam** (VNM): mc 62 · tf 108 · number 4 · type 33 · order 0 · reveal 5. mc by pack: countries 20, languages 13, dishes 8, capitals 5, landmarks 5, flags 4, general 2, history 2, anthems 2, currencies 1.
- **Indonesia** (IDN): mc 61 · tf 141 · number 3 · type 33 · order 0 · reveal 6. mc by pack: countries 18, dishes 12, languages 8, landmarks 7, capitals 4, flags 4, general 3, history 2, anthems 2, currencies 1.
- **Philippines** (PHL): mc 51 · tf 51 · number 3 · type 19 · order 0 · reveal 2. mc by pack: countries 29, languages 9, capitals 4, flags 4, sport 2, anthems 2, currencies 1.
- **Singapore** (SGP): mc 50 · tf 68 · number 4 · type 18 · order 0 · reveal 4. mc by pack: countries 23, landmarks 7, cats 6, flags 4, languages 3, capitals 2, history 2, anthems 2, currencies 1.
- **Nigeria** (NGA): mc 46 · tf 37 · number 3 · type 18 · order 0 · reveal 2. mc by pack: countries 28, capitals 5, flags 4, general 2, anthems 2, books 1, currencies 1, history 1, languages 1, sport 1.
- **Finland** (FIN): mc 46 · tf 69 · number 3 · type 22 · order 0 · reveal 2. mc by pack: countries 17, languages 10, capitals 4, flags 4, words 3, general 2, sport 2, anthems 2, currencies 1, history 1.
- **Malaysia** (MYS): mc 44 · tf 70 · number 4 · type 22 · order 0 · reveal 4. mc by pack: countries 21, actors 6, landmarks 5, capitals 4, flags 4, anthems 2, currencies 1, history 1.

## Reading it

- A ❌ means at least one round fell short; the game still fills the round with normal questions and the host sees
  "📍 only N of 10 local" on that round card.
- Music and screen are mostly US/UK: the hits packs follow the US charts and the movies pack is Hollywood. The planned
  music/screen wave (country charts, local films) is the fix there; this report decides which countries go first.
- People: the people/actors/leaders packs are ~70% US/UK, so most countries have a handful of famous names at most.
