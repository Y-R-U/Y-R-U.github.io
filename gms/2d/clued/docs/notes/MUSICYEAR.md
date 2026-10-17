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

## Round 2 (2026-10-17): hand-checked disagreements
Rule (manager): the earliest OFFICIAL release by the same act: a single, or an album track on a commercially released
album. Ignore demos, live/bootleg, promo-only and tiny regional pressings; same-act re-recordings count as the same
song. Each entry was checked against the song's Wikipedia article (infobox "Released", the album's release, the prose)
plus Wikidata or MusicBrainz, and added as `hand: true` with a one-line `why`. Method: the 272 `disagree` songs were
scored by Wikipedia infobox year + album-article year (scratch script, cache `~/.cache/clued-au/firstyear/wp.json`);
86 candidates where Wikipedia matched Wikidata or MusicBrainz were read by hand. 80 entries added (156 overrides in all,
164 pack items).

Changed (old → new):
- Singles released late in the year before their chart year: Teen Angel 1960→1959, Where or When 1960→1959, Michael
  (Highwaymen) 1961→1960, Exodus 1961→1960, Hey! Baby 1962→1961, Pipeline 1963→1962, Georgy Girl 1967→1966, Green,
  Green Grass of Home 1967→1966, For What It's Worth 1967→1966, Spooky 1968→1967, Rose Garden 1971→1970, Seasons in
  the Sun 1974→1973, Love's Theme 1974→1973, Never Can Say Goodbye 1975→1974, Feelings 1975→1974, Convoy 1976→1975,
  Mississippi 1976→1975, Don't Cry for Me Argentina 1977→1976, Torn Between Two Lovers 1977→1976, Love Is in the Air
  1978→1977, Born to Be Alive 1979→1978, Brass in Pocket 1980→1979, Relax 1984→1983, Tell It to My Heart 1988→1987,
  She Drives Me Crazy 1989→1988, Tears in Heaven 1992→1991, Finally 1992→1991, All for Love 1994→1993, Freestyler
  2000→1999, Say My Name 2000→1999, Somebody to Love (Boogie Pimps) 2004→2003, So Sick 2006→2005, This Ain't a Scene
  2007→2006, Push It 1988→1987 (B-side of "Tramp", 1987; not on the 1986 album edition).
- Album tracks released as singles later: One (Three Dog Night) 1969→1968, Crystal Blue Persuasion 1969→1968, The
  First Time Ever I Saw Your Face 1972→1969, You Make Me Feel Brand New 1974→1973, Band on the Run 1974→1973, Dancing
  Machine 1974→1973, When I Need You 1977→1976, Knowing Me, Knowing You 1977→1976, When You're in Love with a Beautiful
  Woman 1979→1978, Crying (Don McLean) 1980→1978, Antmusic 1981→1980, Rapture 1981→1980, Time After Time 1984→1983,
  I Can't Wait 1986→1985, Toy Soldiers 1989→1988, How Am I Supposed to Live Without You 1990→1989, Freak Me 1993→1992,
  Waterfalls 1995→1994, Boom Boom Boom 1995→1994, You're Still the One 1998→1997, Viva Forever 1998→1997, Kiss Me
  (Sixpence) 1999→1997 (both packs), Jumpin', Jumpin' 2000→1999, With Arms Wide Open 2000→1999, Angel (Shaggy)
  2001→2000, What's Luv? 2002→2001, Everytime 2004→2003, Because of You 2005→2004, I Write Sins Not Tragedies
  2006→2005, What Goes Around... Comes Around 2007→2006, Rockstar 2007→2005, Rude Boy 2010→2009, E.T. 2011→2010, Bad
  Blood 2015→2014, Girls Like You 2018→2017 (original on Red Pill Blues), Say So 2020→2019, End of Beginning 2024→2022.
- Re-releases, re-charts, re-recordings: From a Jack to a King 1963→1957 (re-released 1962), Dedicated to the One I
  Love (Shirelles) 1961→1959 (1959 single re-released 1961), Mickey 1982→1981, Down Under 1982→1981 (the 1980
  self-released local B-side ignored), Take On Me 1985→1984 (Oct 1984 original; the hit is a re-recording), Walking
  on Sunshine 1985→1983 (1983 album; the hit is a re-recording), Nothing's Gonna Change My Love for You 1987→1986
  (independent label 1986, Europe 1986), Cha Cha Slide 2004→2000, Cheerleader (OMI, hits-2010s) 2014→2012 (2012
  Oufah original).

Kept, with the reason:
- Jason Mraz — I'm Yours (2008): the 2005 release was a limited-edition demo EP (Extra Credit); studio single 2008.
- Kid Cudi — Day 'n' Nite (2008): 2007 was a MySpace upload; commercial single Feb 2008.
- Doechii — Anxiety (2025): 2019 was a YouTube demo; the official (re-recorded) release is March 2025.
- Kevin Lyttle — Turn Me On (2003): Wikipedia mentions a 2002 soca original on a VP sublabel, but neither Wikidata
  (2003) nor MusicBrainz (earliest 2003 in its recordings) confirms 2002.
- Shaggy — Oh Carolina (1993): released Jan 1993 (the MusicBrainz 1992 is not backed by Wikipedia).
- OMI — Cheerleader (Felix Jaehn Remix) in one-hit-wonders (2014): the item names the remix, released May 2014.
- ATB, Topic and A7S — Your Love (9PM) (2021): a new song that samples ATB's 1998 "9 PM", not the same song.
- Proud Mary (1969, single and album Jan 1969; 1968 is the recording year), Fernando (ABBA's own version March
  1976; the 1975 recording was Frida's solo album), This Ole House (Shakin' Stevens released it in 1981), Killing Me
  Softly (Roberta Flack's single 1973; 1972 is Lori Lieberman's), Hips Don't Lie (2006; not on the original 2005
  Oral Fixation Vol. 2), Drake — Nice for What (2018; MusicBrainz 2016 is noise).
- The other disagreements are covers dated by the composition, or single-source noise; unchanged.

Pack moves (same rule): The First Time Ever I Saw Your Face → hits-1960s; Brass in Pocket, Crying → hits-1970s;
How Am I Supposed to Live Without You → hits-1980s; Say My Name, Freestyler, Jumpin', Jumpin', With Arms Wide Open →
hits-1990s; Rude Boy → hits-2000s; Say So → hits-2010s. 1950s years (Teen Angel, Where or When, Dedicated to the One
I Love, From a Jack to a King) stay in hits-1960s. No song was dropped. Packs: 1960s 255, 1970s 254, 1980s 260,
1990s 258, 2000s 259, 2010s 270, 2020s 143.
Tests: musicyear_test (15 known songs, 164 override items) passed, au_test passed, a_test 487/0, trio_test 174287/0,
leak_scan 0, build_index 0 errors, c2_test the 8 known history failures.
