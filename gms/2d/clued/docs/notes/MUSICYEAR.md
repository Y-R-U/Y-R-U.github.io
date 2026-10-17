# MUSICYEAR lane: first-release years for songs

Aaron's rule: a song released or charted more than once by the SAME act (re-release, re-chart, remaster, re-recording,
reissue, film or TikTok revival) answers "when was it released?" with the FIRST release year. A cover by a different act
keeps the cover's own year.

The song years came from year-end chart years (au_pick → au_resolve), so a re-chart carried the later year, and a single
released in November/December carried the next year (it makes the next year's year-end chart).

## Pipeline
```
tools/music_firstyear.mjs [--write] [--only hits-1970s]   audit → tools/au_lists/firstyear.check.json (+ --write: tools/music_firstyear.json)
tools/au_resolve.mjs                                      applies tools/music_firstyear.json on every build
node tools/musicyear_test.mjs                             regression test
```
- **Wikidata**: the song's QID comes from the chart page link (au_pick groups → `~/.cache/clued-au/redirects.json`;
  1,837 of 1,857 rows have one). Year = earliest P577 (publication date, year precision or better), plus earlier editions
  the item points to (P629 edition of, P144 based on, P155 follows) when they have the same title and performer. The
  Wikidata year only counts as "same act" when the item's performer (P175, label + aliases, `en`/`mul`) is the act.
- **MusicBrainz**: recording search `recording:"T" AND artist:"lead act"`, keep recordings with the same title, a
  matching artist credit, no video, and no live/demo/remix/edit/version/etc. in the title or disambiguation; year =
  earliest `first-release-date`. 1.1 s between calls, User-Agent sent.
- Caches: `~/.cache/clued-au/firstyear/wd.json`, `mb.json` (a rerun is offline and takes seconds).
- **Corrected only when both sources give the same earlier year** (and Wikidata credits the act). Everything else is
  listed in `firstyear.check.json` (`disagree`, `later`, `cover`) and left alone.

## Override file (tools/music_firstyear.json)
`songs["Artist — Title"]` (the .txt row's artist and title, like acts.json `songs`) → `{ year, was, charted, why }`,
optional `blurb` (a hand first sentence) and `hand: true` (the audit never rewrites it). `--write` only ever adds
entries: a rerun sees the corrected years, so nothing is removed automatically; delete an entry by hand to undo it.
au_resolve (songs lists only; `note=keepyear` still wins) sets `facts.year`, `facts.decade`, `group` and the blurb:
`"Song" by Act, released in 1975; year-end charts 1992: the UK #1.` (`charted` = the year-end years of that chart run,
e.g. `1996–1997`). The Apple verification still uses the row's chart year, so previews resolve exactly as before.

## Result (2026-10-17)
80 pack items corrected = 76 songs (5 are in both a decade pack and one-hit-wonders).

Re-releases, re-charts, revivals (2+ years):
| Song | Year | Pack before |
|---|---|---|
| Kate Bush — Running Up That Hill (A Deal with God) | 2022 → 1985 | hits-2020s → hits-1980s |
| Elvis vs JXL — A Little Less Conversation | 2001 → 1968 | hits-2000s → hits-1960s |
| Cliff Richard & The Young Ones — Living Doll | 1986 → 1959 | hits-1980s (stays: no 1950s pack) |
| Run–D.M.C. vs. Jason Nevins — It's Like That | 1997 → 1983 | hits-1990s → hits-1980s |
| Charlene — I've Never Been to Me | 1982 → 1976 | hits-1980s → hits-1970s |
| Roxette — It Must Have Been Love | 1990 → 1987 | hits-1990s → hits-1980s |
| Los del Río — Macarena | 1996 → 1993 | hits-1990s, one-hit-wonders |
| Lizzo — Good as Hell | 2019 → 2016 | hits-2010s |

The three team-up/remix credits (Elvis vs JXL, Run–D.M.C. vs. Jason Nevins, Cliff Richard & The Young Ones) are a
judgement call: the clip is the later remix/re-recording, but it is the same act's song, so the rule gives the first
year. They carry a hand blurb ("first released by Elvis Presley in 1968; the JXL remix made it a hit again in 2002.").
Delete their entries in music_firstyear.json (and move the rows back) if Aaron prefers the remix year.

Late-year singles (1 year earlier than the chart year): Running Bear, What in the World's Come Over You, El Paso,
Peter Gunn, Beyond the Sea, Handy Man (1960 → 1959); Wheels (1961 → 1960); Hey Paula, Rhythm of the Rain (1963 → 1962);
Glad All Over (1964 → 1963); Spirit in the Sky, Venus (Shocking Blue), I Want You Back (1970 → 1969); The Night the
Lights Went Out in Georgia (1973 → 1972); Go Your Own Way (1977 → 1976); Please Don't Go, Coward of the County, Escape
(The Piña Colada Song) (1980 → 1979); Key Largo, Golden Brown (1982 → 1981); Up Where We Belong (1983 → 1982); Neutron
Dance (1984 → 1983); Shout, You Spin Me Round (1985 → 1984); When the Going Gets Tough, Rock Me Amadeus (1986 → 1985);
Hands to Heaven (1988 → 1987); Black Velvet, Sacrifice, Janie's Got a Gun (1990 → 1989); Crazy (Seal), Because I Love
You (The Postman Song) (1991 → 1990); What Is Love, All That She Wants, Informer (1993 → 1992); I Like to Move It
(1994 → 1993); Scatman, Set You Free, Be My Lover (1995 → 1994); Because You Loved Me, Children (1996 → 1995); I Believe
I Can Fly, To the Moon and Back (1997 → 1996); High (1998 → 1997); Blue (Da Ba Dee), We Like to Party! (1999 → 1998);
Never Be the Same Again (2000 → 1999); Rollin' (2001 → 2000); Beautiful, '03 Bonnie & Clyde (2003 → 2002); Cupid's
Chokehold (2006 → 2005); In My Head (2010 → 2009); Am I Wrong, Budapest, Elastic Heart (2014 → 2013); Hold Back the
River (2015 → 2014); Cheap Thrills, Panda (2016 → 2015); Wow (2019 → 2018); Before You Go, Everything I Wanted, Roxanne
(2020 → 2019); Heat Waves (2021 → 2020); Until I Found You (2022 → 2021); Made You Look, Players, Golden Hour
(2023 → 2022); Austin (2024 → 2023).

## Pack moves (decision)
A decade pack holds its own decade's songs: its title says the decade, trio year rows keep to the pack's years, and
listen.js no longer asks "Which decade?" in a single-decade round. So a song whose corrected decade has a pack MOVES
there: the row goes to that `hits-*.txt` with its chart-year YEAR column unchanged (au_resolve verifies Apple against
it) and `note=first released YYYY, moved from hits-…`. au_pick keeps the row there (existing rows always stay, and
its re-entry check stops it re-adding the song to the old decade).
- Moved by the correction (19): Spirit in the Sky, Venus, I Want You Back, A Little Less Conversation → 1960s;
  Please Don't Go, Coward of the County, Escape, I've Never Been to Me → 1970s; It Must Have Been Love, Black Velvet,
  Sacrifice, Janie's Got a Gun, It's Like That, Running Up That Hill → 1980s; Never Be the Same Again → 1990s;
  In My Head → 2000s; Before You Go, Everything I Wanted, Roxanne → 2010s.
- Already misplaced before this lane (curated rows with a correct year in the next decade's pack), moved too (9):
  Crazy Little Thing Called Love, Rock with You → 1970s; Maria Maria → 1990s; Hey, Soul Sister, TiK ToK → 2000s;
  Don't Start Now, Watermelon Sugar, Adore You, Circles → 2010s.
- Kept with corrected facts: the 1959 songs (no 1950s pack): six 1959 singles + He'll Have to Go and Theme from
  "A Summer Place" stay in hits-1960s, Living Doll in hits-1980s. Faith Hill's "Breathe" (1999) stays in hits-2000s:
  hits-1990s has The Prodigy's "Breathe", and au_resolve's same-title rule would drop one.
Pack sizes now: 1960s 254, 1970s 253, 1980s 261, 1990s 255, 2000s 262, 2010s 270, 2020s 144 (total 1,699, unchanged).

## Question formats
Every music year/decade question reads `facts.year` / `facts.decade` (factsMeta `year` type → number, hilo, order,
trio year row, years.js; `decade` → mc/odd/listen "Which decade"), and `group` for distractor grouping; nothing reads
the chart year (`item.charts` holds positions only, no year). au_resolve now derives all three from the corrected year.

## Disagreements (not changed; full list in tools/au_lists/firstyear.check.json `disagree`, 273 songs)
Most are covers whose Wikidata item is the composition (Unchained Melody 1955, I Will Always Love You 1974) or
MusicBrainz noise (Bon Jovi "It's My Life" 1993). Ones that look like genuine same-act earlier releases, worth a hand
override (add `{ "year": …, "hand": true, "why": … }`): Ned Miller — From a Jack to a King (1957), Roberta Flack —
The First Time Ever I Saw Your Face (1969 album; 1972 film revival), Don McLean — Crying (1978), Katrina and the Waves —
Walking on Sunshine (1983), Men at Work — Down Under (1980/81), Glenn Medeiros — Nothing's Gonna Change My Love for You
(1986), Nu Shooz — I Can't Wait (1984/85), Salt-n-Pepa — Push It (1987), Terry Jacks — Seasons in the Sun (1973),
Gloria Gaynor — Never Can Say Goodbye (1974), The Shirelles — Dedicated to the One I Love (1959), Dion and the
Belmonts — Where or When (1959), Shaggy — Oh Carolina (1992), Destiny's Child — Say My Name (1999), Kevin Lyttle —
Turn Me On (2001), Kelly Clarkson — Because of You (2004), Jason Mraz — I'm Yours (2005), Nickelback — Rockstar (2005),
Kid Cudi — Day 'n' Nite (2007), OMI — Cheerleader (2012 original), Maroon 5 — Girls Like You (2017), Djo — End of
Beginning (2022, TikTok 2024), Doechii — Anxiety (2019/20).
`later` (26): both sources say a year LATER than ours; these are album tracks whose album year au_resolve already uses
(Vienna, Funkytown): correct by the first-release rule, left alone.

## Preview artist check
Song packs: 5 previews credit a differently spelled act (Dawn for Tony Orlando & Dawn, David Dundas for Lord David
Dundas, P!nk ×3), all the right recordings; no cover found in a song item. music-artists: two wrong previews fixed in
tools/au_lists/artists.txt: Bob Marley's "No Woman, No Cry" was "Ángeles & Bob Marley" (a 2011 Latin version;
`am=marley` → `am=^bob marley`), Dire Straits' "Money for Nothing" was "Dire Strats" (a tribute band; added
`am=^dire straits$`). The artist pack has no song years (only breakthrough decade), so no year audit there.

## Tests (2026-10-17)
musicyear_test all passed (10 known songs, 82 override items; fails 230× on the HEAD packs), au_test all passed,
a_test 487/0, trio_test 174287/0, leak_scan 0, build_index 0 errors, c2_test 8 failures (the known history timeline
ones).
