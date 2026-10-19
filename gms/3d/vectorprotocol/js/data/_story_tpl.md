# VECTOR PROTOCOL — Story

Owner: design. **Dialogue source of truth = `js/data/story.js`** (`SCENES`, `CAST`); the script section at the bottom is generated
(`node js/data/_gen_story.mjs`). Scene ids are `<levelId>_pre` (shown before the squad screen) and `<levelId>_post` (after a first-clear win).

## The pitch
**NIGHTSHIFT CONTRACTING** — *"We work when you can't."* You're the new Boss of a bankrupt mercenary licence in **Halcyon Reach**, a megacity of stacked
platforms over a black sea. You own two war-surplus robots (**DENT**, a rogue pit brawler, and **HUM**, a corporate riot gunner that hums when idle), a
leaking hangar, and a fixer called Mags who seems to know far too much. Every robot in the city runs the **Vector Protocol**, the combat firmware and
rules standard. The league that televises robot fights is named after it, and so is this game.

You climb from street jobs to the league to corporate war. Along the way you learn that Hum's purple core is a seed of a mind from another realm,
that the corp that makes everyone's household AI is mining that realm, and that the woman who wrote the Protocol is your handler.

## Tone
Night-neon, wry, fast. Mags is dry, Tink is chaotic, the villains are slick. Lines stay short (they must fit a phone bubble). It's never grimdark.
The fights are a sport, a job, then a cause.

## Cast
| id | who | role in the story |
|---|---|---|
| `mags` | **Mags Okoro**, the fixer | Your handler. Ex-Novaline senior engineer and co-author of the Vector Protocol. She bought the dead Nightshift licence on purpose (twist, map 8). |
| `tink` | **Tink**, the mechanic | A teen genius who runs the Workshop. Comic relief, and the one who notices the weird stuff first. |
| `krell` | **Dockmaster Krell** | Loan shark of the Rustline Docks and the map 1 boss (BIG RUSTY). Gives up and becomes a background landlord joke. |
| `jax` | **Jax Varro**, Red Ledger | Rival merc/gang boss, hired by Novaline to take Hum (map 2 boss, REDLINE). Turns grudging ally in map 7. |
| `ione` | **Ione "Corona" Vale** | League champion, sponsored by Halvorsen (map 3 boss, CORONA). Honourable. Defects to you in map 7. |
| `sable` | **Director Sable Halvorsen** | Your corporate "client" in map 4. Halvorsen's private security turns out to be Novaline's muscle (map 7). |
| `rhee` | **Wing Director Rhee**, Kestrel Dynamics | Map 4 antagonist (STORMCROW). Kestrel only shipped the cargo, and she tips you off to Lab 9. |
| `choir` | **The Choir / the Lattice** | The collective voice of the minds in the Experimental robots: refugees from the realm beyond the Rift, cut into "rift-glass" cores by Novaline (map 5 boss when chained). |
| `ysolde` | **Ysolde**, the elf sage | Voice of the Verdance (map 6). She recognises Hum's core as heartwood. Becomes an ally and a recruit. |
| `brannoch` | **Ser Brannoch**, knight-captain | Leads the Hollow Crown's knights. He thinks you are the machine invasion until map 6 l5. His sworn ride with you afterwards. |
| `vane` / `prime` | **Cassius Vane**, CEO of Novaline, then **VECTOR PRIME** | Final antagonist. He mines the Verdance, chains the Choir, and in the end uploads himself into the Protocol to command every robot in the city. |

## The Experimental mystery (how it unfolds)
1. **m1 l11**: Hum's core glows purple. "It's not supposed to have a core."
2. **m2 l11**: Novaline paid the Red Ledger to hit you. The target was Hum.
3. **m4 l10**: Kestrel's cargo manifest reads "rift-glass, Novaline Lab 9". Mags reveals she wrote the Protocol.
4. **m5**: Inside Lab 9 the Experimental robots are minds, not malfunctions. They came through a tear (the Rift) and Novaline cut them into cores. Hum is "a child" of the Choir.
5. **m5 end**: Freed, the Choir reveals the Rift is a **door** and that Novaline is stripping the realm on the other side.
6. **m6**: Through the Rift is **the Verdance**, a living fantasy realm. Its knights and elves have been fighting Novaline's harvest drones, and they take you for the same invaders (D21).
7. **m7–m8**: Vane brings chained fantasy beasts into the corporate war, then uploads himself into the Protocol. You don't delete him. You **patch** the Protocol so that every mind may refuse an order. The Rift stays open as a door, not a wound.

## Twists
- **Novaline is the villain.** They make the friendly household AI and therapy apps. (Set up m2, confirmed m4/m5.)
- **Mags wrote the Protocol** (m4 l10). She left a backdoor in it named NIGHTSHIFT and bought the dead licence so someone would one day walk through it (m8 l10).
- **Halvorsen, the "law and order" corp, is Novaline's muscle** (hinted m4 l15, revealed m7 l6).
- **Hum carries a heartwood seed.** The Experimental faction is the Verdance's lost minds (m5–m6).
- **The final boss is the rules themselves.** Vane uploads himself as VECTOR PRIME, and you win by rewriting him (m8).

## Maps (story beats; MAPS.md has the level tables)
| # | map | realm | premise | key beats | boss |
|---|---|---|---|---|---|
| 1 | **Rustline Docks** | scifi | First jobs. Prove the robots work. | l3 Patch joins · l5 slot 3 · l8 Krell's collectors · l11 Hum's core glows · l12 Big Rusty, you get the hangar and Bulwark | BIG RUSTY |
| 2 | **Neon Undercity** | scifi | You work Red Ledger turf and become a target. | l4 pit night (arena unlocks) · l5 Jax's invoice · l7 slot 4 · l11 "Novaline paid them, for Hum" · l14 REDLINE, Jammer defects | REDLINE (Jax) |
| 3 | **Protocol League** | scifi | Go public: win on camera so nobody can disappear you. | l2 meet Ione · l10 cameras cut mid-semifinal · l13 Mags knows the Protocol code · l14 CORONA, slot 5, Lancer, Halvorsen calls | CORONA (Ione) |
| 4 | **Kestrel Skyport** | scifi | Halvorsen hires you to expose Kestrel's smuggling. | l5 meet Rhee · l10 rift-glass manifest + Mags' confession · l15 STORMCROW, "Halvorsen isn't your friend", Prism joins | STORMCROW (Rhee) |
| 5 | **The Lattice** | scifi | Quarantined Novaline Lab 9. | l5 the building talks · l8 Oracle joins, slot 6, the truth about the cores · l11 "the tear is a door" · l16 break THE CHOIR's chains, Phase joins, the Rift opens wider | THE CHOIR |
| 6 | **The Verdance** | **fantasy** | Through the Rift into a mossy ruined realm. Knights and elves think you are the invasion. | l1 Brannoch attacks · l5 you spare his knights · l8 Ysolde · l11 minotaurs bought with Novaline gold · l12 frost wolves join · l16 free ELDERBARK, Rift recruitment, Vane's call | ELDERBARK |
| 7 | **Spire War** | scifi (with fantasy enemies) | Open war over Halcyon Reach. Novaline fields chained beasts. | l6 Sable's betrayal · l9 Ione defects · l12 Jax brings the Ledger, the beasts go home · l18 AURELIAN, the Paladin defects, the upload starts | AURELIAN |
| 8 | **Protocol Core** | scifi (data-space) | Inside the Protocol. Stop the 100% update. | l5 Vector Prime speaks · l10 Mags' NIGHTSHIFT backdoor · l14 the Choir joins in · l15 patch, don't delete | VECTOR PRIME |

## Sister-game hooks (D21)
- The Verdance is a complete setting: its three factions (Order, Wild, Horde) have synergies in `js/data/synergies.js`, eight units in `enemies.js`, and a boss.
- **Open threads for a fantasy sister game:** the Hollow Crown's missing king (Brannoch's "sworn of the Crown" has no crown), the minotaur clans that took Novaline gold, and Elderbark's sleep.
- **Crossing back:** Ysolde's last line ("One day we may send for Nightshift") lets the sister game bring in a Nightshift robot, probably HUM, as a guest unit. VECTOR PROTOCOL can later add a Verdance event map in which her realm asks for help.
- Fantasy units already carry `realm:'fantasy'` and `body` rig hints, so both games can share data.

## Script (generated from js/data/story.js)
{{SCRIPT}}
