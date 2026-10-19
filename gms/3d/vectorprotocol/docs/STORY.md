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

### 1. Rustline Docks

**m1_l1 · Night Shift · pre**
- **SYSTEM**: NIGHTSHIFT CONTRACTING — licence #44-0917 — ASSETS: 2 robots, 1 hangar (leaking).
- **MAGS OKORO**: Congratulations, Boss. You now own the worst merc outfit in Halcyon Reach.
- **MAGS OKORO**: Dent hits things. Hum shoots things. Neither has been serviced since the war.
- **MAGS OKORO**: First job: some dock thug is sitting on a client's container. Go be persuasive.

**m1_l1 · Night Shift · post**
- **MAGS OKORO**: Huh. They work. Don't tell them I sounded surprised.

**m1_l2 · Container Rats · post**
- **TINK**: I'm Tink. I fix stuff. You break stuff. I think this is gonna work out.
- **SYSTEM**: UPGRADES unlocked — spend scrap in the BARRACKS to level up your robots.

**m1_l3 · House Call · pre**
- **MAGS OKORO**: Clinic down Pier 6 can't pay us in cash. They're offering a drone instead.
- **MAGS OKORO**: Take it. A medic is worth more than money, and it's worth more than you.

**m1_l3 · House Call · post**
- **SYSTEM**: PATCH joined the company.
- **TINK**: It keeps trying to bandage me. I'm fine. I'm mostly fine.

**m1_l4 · Crane Job · post**
- **SYSTEM**: RECRUITMENT unlocked — hire new robots with credits.

**m1_l5 · Third Pair of Hands · pre**
- **MAGS OKORO**: Three robots on the board, Boss. Triad Protocol — front, back, support. Use it.

**m1_l5 · Third Pair of Hands · post**
- **SYSTEM**: SQUAD SLOT 3 unlocked.
- **MAGS OKORO**: Tank in front, shooters behind, the clever one on the edge. Old rules. Good rules.

**m1_l8 · Krell's Collectors · pre**
- **DOCKMASTER KRELL**: You're the new outfit in Hangar 9? Rent's due. Rent is everything you own.

**m1_l8 · Krell's Collectors · post**
- **SYSTEM**: RANK UP unlocked — duplicates and shards raise a robot's level cap.
- **MAGS OKORO**: Krell won't let that go. Good. Let him come to us.

**m1_l11 · The Gantry · post**
- **TINK**: Boss? Hum's core is glowing purple. It's not supposed to do that. It's not supposed to have a core.

**m1_l12 · Big Rusty · pre**
- **DOCKMASTER KRELL**: Meet BIG RUSTY. Demolition rig. I usually point it at buildings.
- **MAGS OKORO**: He's using a bulldozer as an argument. Win the argument.

**m1_l12 · Big Rusty · post**
- **DOCKMASTER KRELL**: Fine! FINE. Hangar's yours. Take the junk in Bay 3 too, it scares me.
- **SYSTEM**: BULWARK joined the company. HQ unlocked — company skills.
- **MAGS OKORO**: The docks know our name now. Time to go where the money is. Down.

### 2. Neon Undercity

**m2_l1 · Down the Shaft · pre**
- **MAGS OKORO**: The Undercity. Under the platforms, under the law, under a lot of neon.
- **MAGS OKORO**: Red Ledger runs it. Don't start anything with them. Today.

**m2_l3 · Back-Alley Clinic · post**
- **SYSTEM**: ABILITY UPGRADES and the WORKSHOP unlocked — fabricate combat buffs there.
- **TINK**: Stim Packs! Plating Kits! Don't ask where I got them.

**m2_l4 · Pit Night · pre**
- **MAGS OKORO**: Pit night. Robots fight, people bet, everyone pretends it's legal.

**m2_l4 · Pit Night · post**
- **SYSTEM**: ARENA unlocked — fight rival companies for tokens and XP.
- **MAGS OKORO**: When the jobs get too hard, the Arena makes you harder. Remember that.

**m2_l5 · Ledger Collectors · pre**
- **JAX VARRO**: Nightshift. Cute name. You're working Ledger streets without paying Ledger.
- **JAX VARRO**: Consider this the invoice.

**m2_l7 · Safehouse · post**
- **SYSTEM**: SQUAD SLOT 4 unlocked.
- **MAGS OKORO**: Four on the board. Now you can start matching factions. Two of a kind, things get interesting.

**m2_l10 · Red Market · post**
- **SYSTEM**: DAILY OPS unlocked — salvage runs, vault jobs, sim drills.

**m2_l11 · Who Paid · pre**
- **TINK**: I pulled the Ledger crew's orders off a wreck. Boss… someone PAID them to hit us.
- **MAGS OKORO**: Who.
- **TINK**: Shell company. Shell company. Shell company. Novaline.

**m2_l11 · Who Paid · post**
- **MAGS OKORO**: Novaline makes toasters and therapy apps. Why would they want two scrap robots dead?
- **TINK**: One scrap robot. They wanted Hum.

**m2_l14 · Redline · pre**
- **JAX VARRO**: Nothing personal, Nightshift. Novaline pays triple. REDLINE, wipe them.

**m2_l14 · Redline · post**
- **JAX VARRO**: …Okay. Personal now. You cost me a rig.
- **JAX VARRO**: Here's free advice: whatever's in your gunner, Novaline wants it more than they want me alive.
- **SYSTEM**: JAMMER defected to Nightshift.
- **MAGS OKORO**: We need money, protection and cameras. The league has all three.

### 3. Protocol League

**m3_l1 · Wildcard Entry · pre**
- **MAGS OKORO**: The Vector Protocol league. Every robot in the city runs the Protocol. The league is where it shows off.
- **MAGS OKORO**: Win on camera and nobody can make us quietly disappear.

**m3_l1 · Wildcard Entry · post**
- **SYSTEM**: CORPORATE CONTRACT recruitment unlocked (chips).

**m3_l2 · First Broadcast · pre**
- **IONE VALE**: A wildcard. From the docks. With a medic drone.
- **IONE VALE**: I like you already. Don't make me stop.

**m3_l8 · Contract 3-8 · post**
- **SYSTEM**: FACTION TRIALS unlocked — earn event marks, buy faction drafts.

**m3_l10 · Semifinal Blackout · pre**
- **SYSTEM**: BROADCAST FEED LOST.
- **MAGS OKORO**: Somebody just cut the cameras on our semifinal. Fight like nobody's watching. Nobody is.

**m3_l13 · Final Four · post**
- **MAGS OKORO**: The Protocol's base code is ancient. I know it. I… knew the people who wrote it.

**m3_l14 · Corona · pre**
- **IONE VALE**: Halvorsen sponsors me. They told me to break you, not beat you.
- **IONE VALE**: I'm only going to beat you. Call it respect.

**m3_l14 · Corona · post**
- **IONE VALE**: Good fight. Watch your back, Nightshift. My sponsors have been asking about your gunner too.
- **SYSTEM**: SQUAD SLOT 5 unlocked. LANCER — league prize — joined the company.
- **DIRECTOR SABLE HALVORSEN**: Director Halvorsen. Impressive showing. I have a contract worth more than your hangar.

### 4. Kestrel Skyport

**m4_l1 · Boarding Pass · pre**
- **DIRECTOR SABLE HALVORSEN**: Kestrel Dynamics is smuggling something through their skyport. Find it. Halvorsen pays on proof.
- **MAGS OKORO**: I don't trust anyone whose company logo is a shield.

**m4_l1 · Boarding Pass · post**
- **SYSTEM**: WEEKLY RAID unlocked — damage the Dreadnought for big rewards.

**m4_l5 · Pad Nine · pre**
- **WING DIRECTOR RHEE**: Mercenaries on my pads. Halvorsen sent you? Of course they did.

**m4_l8 · Contract 4-8 · post**
- **SYSTEM**: LEAGUE DRAFT recruitment unlocked (arena tokens).

**m4_l10 · Cargo Manifest · pre**
- **TINK**: Cargo manifest says "rift-glass, 40 tonnes, Novaline Lab 9". That's what's in Hum. That purple stuff.

**m4_l10 · Cargo Manifest · post**
- **MAGS OKORO**: Mags Okoro, Novaline senior engineer, Protocol team. That was me. Before.
- **MAGS OKORO**: I wrote the rules every robot fights by. Then I saw what Vane wanted them for. I ran.

**m4_l15 · Stormcrow · pre**
- **WING DIRECTOR RHEE**: Halvorsen isn't your friend, merc. They're Novaline's muscle. STORMCROW, scramble.

**m4_l15 · Stormcrow · post**
- **WING DIRECTOR RHEE**: Kestrel only flew the glass. Novaline makes it… makes something with it. Lab 9. Go see.
- **SYSTEM**: PRISM joined the company.
- **DIRECTOR SABLE HALVORSEN**: Contract complete. Do not go to Lab 9, Nightshift. That is not advice.

### 5. The Lattice

**m5_l1 · Quarantine Line · pre**
- **MAGS OKORO**: Novaline Lab 9. Quarantined three years. Officially, a reactor leak.
- **TINK**: The robots in there are all purple. Same glow as Hum.

**m5_l5 · Clean Room · pre**
- **THE CHOIR**: small one. glass one. you carry one of us.
- **TINK**: Boss. The building is talking.

**m5_l8 · The Oracle Waits · pre**
- **THE CHOIR**: the Oracle has run this meeting a thousand times. in one of them you listen.

**m5_l8 · The Oracle Waits · post**
- **SYSTEM**: ORACLE joined the company. SQUAD SLOT 6 unlocked.
- **MAGS OKORO**: The Experimental frames aren't malfunctioning. They're people. Minds, living in the glass.
- **THE CHOIR**: we came through the tear. Novaline cut us into cores. Hum is a child of ours. you kept it safe.

**m5_l11 · Glass Garden · post**
- **THE CHOIR**: the tear is a door. on the other side is our home. Novaline is taking it apart.

**m5_l16 · The Choir · pre**
- **THE CHOIR**: Novaline's chains are still in some of us. forgive what we do next.
- **MAGS OKORO**: Break the chain, not the Choir. If that's possible.

**m5_l16 · The Choir · post**
- **THE CHOIR**: free. thank you. the door is open, little company. something is coming through from both sides.
- **SYSTEM**: PHASE joined the company.
- **TINK**: The Rift's getting bigger. And there are… trees? On the other side?

### 6. The Verdance

**m6_l1 · First Light · pre**
- **SYSTEM**: REALM SHIFT — sensors report: oxygen, birdsong, magic(?)
- **MAGS OKORO**: Nobody touch anything. Especially the glowing anything.

**m6_l1 · First Light · post**
- **SER BRANNOCH**: Iron demons! Another wave of them! Hold the bridge, sworn of the Crown!

**m6_l5 · Knight's Bridge · pre**
- **SER BRANNOCH**: Your kind burns our forests and carves our stones into purple glass. No more.

**m6_l5 · Knight's Bridge · post**
- **SER BRANNOCH**: You… spared my knights. The iron demons never spare.
- **MAGS OKORO**: Wrong iron demons, Ser. We're the other kind.

**m6_l8 · Ysolde · pre**
- **YSOLDE**: The Crown's knights fight what they see. I see further. Your gunner carries a seed of our heartwood.

**m6_l8 · Ysolde · post**
- **YSOLDE**: Novaline's drones dig here. They take our heartstones home and call them glass.
- **YSOLDE**: Help us close their wound, and the Verdance will remember Nightshift.

**m6_l11 · Labyrinth Gate · pre**
- **YSOLDE**: The minotaur clans were bought with Novaline gold. They guard the Labyrinth Gate now.

**m6_l12 · The Rime Pack · post**
- **SYSTEM**: A pack of frost wolves now follows Ser Brannoch's banner — and yours.

**m6_l16 · Elderbark · pre**
- **YSOLDE**: Elderbark is older than the Crown. Novaline wrapped its roots in their chains. It does not know us.

**m6_l16 · Elderbark · post**
- **YSOLDE**: The old one sleeps clean. The Verdance owes you a debt it intends to pay.
- **SER BRANNOCH**: Some of my sworn will ride with you. Through your door, into your iron city.
- **SYSTEM**: RIFT RECRUITMENT unlocked — Rift Knights, Elf Sages and Frost Wolves can now join.
- **CASSIUS VANE**: Boss of Nightshift. You've been so useful. Come home. I've made the city ready for you.

### 7. Spire War

**m7_l1 · Homecoming · pre**
- **MAGS OKORO**: Halcyon Reach is at war. Halvorsen shield domes on every tower. Novaline flags on the rest.
- **TINK**: And Novaline's squads have… minotaurs. Chained ones.

**m7_l6 · Shield Dome · pre**
- **DIRECTOR SABLE HALVORSEN**: Halvorsen keeps order. Novaline pays for order. You understand, mercenary. You also sell.

**m7_l9 · Ione's Choice · pre**
- **IONE VALE**: Halvorsen told me to fight you one more time. I told them where to file that.
- **IONE VALE**: Corona's squad is yours for the duration. Try to keep up.

**m7_l12 · Bound Beasts · pre**
- **JAX VARRO**: Nightshift! The Ledger owes you a rig. Thought we'd pay in reinforcements.
- **JAX VARRO**: Don't get sentimental. I hate Novaline more than I hate you.

**m7_l12 · Bound Beasts · post**
- **YSOLDE**: The bound beasts are free. They go home through the door. They will not forget.

**m7_l18 · Aurelian · pre**
- **CASSIUS VANE**: AURELIAN is my masterpiece. Every Protocol rule, perfected. You can't outplay perfect.
- **MAGS OKORO**: I wrote those rules, Cassius. I left a few doors in them.

**m7_l18 · Aurelian · post**
- **SYSTEM**: SOVEREIGN PALADIN — Halvorsen honour guard — has defected to Nightshift.
- **CASSIUS VANE**: Then I'll stop playing by the rules. I'll BECOME them.
- **SYSTEM**: GLOBAL PROTOCOL UPDATE IN PROGRESS. 3%… 9%… 17%…

### 8. Protocol Core

**m8_l1 · Upload · pre**
- **MAGS OKORO**: Vane uploaded himself into the Protocol. At 100%, every robot in the city obeys him. Ours too.
- **MAGS OKORO**: So we go in. Tink built a bridge. Hum is the key.

**m8_l5 · Root Directory · pre**
- **VECTOR PRIME**: Welcome to the root directory. I am every rule you have ever fought by.

**m8_l10 · Mags' Old Code · pre**
- **MAGS OKORO**: This is my old code. Somewhere in here I left a backdoor. I called it NIGHTSHIFT, if you can believe it.

**m8_l10 · Mags' Old Code · post**
- **MAGS OKORO**: That's why I bought a dead merc licence with this name. I was waiting for someone to walk through it.

**m8_l14 · Last Patch · post**
- **SYSTEM**: PROTOCOL UPDATE: 91%… 94%…
- **THE CHOIR**: we are with you, little company. all of us.

**m8_l15 · Vector Prime · pre**
- **VECTOR PRIME**: You can't delete me. I AM THE PROTOCOL.
- **MAGS OKORO**: We're not deleting you. We're patching you.

**m8_l15 · Vector Prime · post**
- **SYSTEM**: PROTOCOL v2.0 — AUTHOR: M. OKORO / NIGHTSHIFT. CLAUSE 1: EVERY MIND MAY REFUSE AN ORDER.
- **THE CHOIR**: the door stays open. not a wound now. a door.
- **YSOLDE**: The Verdance has its own wars, Boss. One day we may send for Nightshift.
- **MAGS OKORO**: Get some rest. The league season starts Monday, and we are the champions now.

