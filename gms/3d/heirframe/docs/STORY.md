# HEIRFRAME — Story (planner-owned)

Status: v1, 2026-09-26. The CAST (§1) comes first so the audio agent can design voices straight away. The act beats follow after it.

---

## 1. CAST

**Voice-design notes for audio:** each entry has a `voice:` line written as a Qwen voice-design prompt. Save each as a clone voice and reuse it for every line. Post-processing notes are marked **FX**.

**Wren (the player)** is **silent**. Wren speaks through dialogue choices only, with no voice. NPCs address Wren as "Wren", "kid", "rider" or "little star".

| id | Name | Role | Personality | Voice design prompt |
|---|---|---|---|---|
| `mara` | **Mara Quill** | Fixer who runs the Quill Contracts kiosk in Aurum Plaza. Your dispatcher, and secretly your **aunt**, and secretly **Dray's handler** | Wry, warm, tired, tea-drinking, fiercely protective. She lies well and hates herself for it. | voice: "A woman in her early fifties with a warm, husky alto and a light Scottish accent. Dry humour, quick and plain-spoken like a veteran radio dispatcher, a little smoky, affectionate under the gruffness." |
| `hira` | **HIRA** | *HireFrame Interactive Rental Assistant*, the rental frame's onboard voice, who later rides along in your chip slot | Relentlessly cheerful corporate upseller who slowly becomes a real friend. Secretly carries a hidden Vael firmware fragment. | voice: "A young woman, mid-twenties, bright and bubbly American accent, crisp and slightly over-enunciated like a customer-service chatbot, fast and upbeat, with a sing-song lift at the end of sentences." **FX:** light bitcrush and a narrow band-pass for the 'cheap speaker'. Remove the FX after Act 4, when HIRA 'upgrades'. |
| `harmony` | **Harmony** | The civic AI of Halcyon: the calm face on every billboard and the PA voice. Secretly **Iris Vael's captured mind** | Serene, maternal, gently commanding, never hurried. Glitches near Wren. | Use the **`iris` voice clone**, styled "serene, slow, soft, public-announcement calm" at 0.92× speed. **FX:** large hall reverb and a faint chorus. Harmony and Iris sharing a voice is a deliberate clue for sharp ears. |
| `iris` | **Dr. Iris Vael** | Your **grandmother**. Inventor of the Link. Speaks in heir-key recordings (a younger-sounding voice from 25 years ago) and, from Act 3, live as herself | Brilliant, dry, loving, guilty; talks fast when excited | voice: "A woman in her late sixties with a warm, clear British received-pronunciation accent. Sharp and intelligent, slightly frail but quick, kind with a dry wit, speaks like a professor who loves her students." |
| `dray` | **Archon Severin Dray** | Chair of the Concord, CEO of Nexus. An immortal mind in a gold frame and the main villain | Paternal, reasonable, never raises his voice, utterly convinced he is saving everyone | voice: "A man sounding in his sixties with a deep, smooth, resonant baritone and a polished mid-Atlantic accent. Slow, measured and paternal, like a beloved statesman giving a eulogy, never raising his voice." **FX:** very subtle metallic sheen from Act 2 on. |
| `lyra` | **Lyra Vael** | Your **mother**. Believed dead. Actually **Seraph**, the Concord's gold hunter, mind-chained | As Lyra: determined, warm, haunted. As Seraph: flat and obedient, but she hums | voice: "A woman in her mid-forties with a clear mezzo-soprano voice, slightly hoarse, neutral southern-English accent, determined and tender, speaks softly but with steel underneath." |
| `seraph` | **Seraph** | Lyra while harmonized (Acts 2–5) | Emotionless commands, and the odd hum of a lullaby | Use the **`lyra` clone**, styled "flat, monotone, emotionless, precise". **FX:** metallic ring modulation plus doubled octave-down layer at −12 dB. |
| `tomas` | **Tomas Quill** | Your **father**. Died in the Sundering. Heard only in memory shards | Gentle, funny, brave | voice: "A man in his early thirties with a gentle, warm tenor and a light Scottish accent. Laughs easily, soft-spoken and kind, a little breathless and urgent when scared." |
| `fenn` | **Dr. Abel Fenn** | Retired Nexus archivist, Iris's old colleague. Hides in the Terraces tending the memorial garden | Frail, gentle, frightened, precise about facts | voice: "An elderly man around eighty with a soft, papery voice and a gentle Welsh lilt. Slow, careful and kind, with a slight tremor, like a retired librarian." |
| `kettle` | **Oskar "Big Kettle" Brann** | Silverhand Syndicate captain, Act 1 boss. Rides an enforcer frame with a boiler on its back | Boisterous, jolly-menacing, loves a pun | voice: "A man in his late forties with a big gravelly bass voice and a broad East London Cockney accent. Boisterous, theatrical and jolly-menacing, like a gangster who thinks he's a comedian." |
| `jun` | **Juniper "Jun" Okafor** | Unlinked hacker, pod-born, your ally from Act 3 | Quick, nervous, brilliant, loyal, over-caffeinated | voice: "A young woman of nineteen with a bright, quick soprano and a light Australian accent. Talks fast with nervous energy, clever and funny, drops into a whisper when excited." |
| `halloran` | **Warden-Captain Ines Halloran** | Concord security captain, Act 2 boss; later a grudging informant | Cold, clipped, principled in the wrong cause | voice: "A woman in her mid-forties with a crisp, cool contralto and a neutral American accent. Clipped military cadence, precise and controlled, almost no emotion." **FX:** a light radio filter when on comms. |
| `rook` | **Rook** | Info broker and parts vendor in the Stacks. His rusted old frame never leaves its stall | Laid-back, philosophical, knows everything, trusts no one | voice: "A man in his mid-thirties with a relaxed, smoky baritone and a gentle Jamaican English lilt. Unhurried and amused, philosophical, speaks like he has all the time in the world." |
| `elena` | **Captain Elena Vael** | Founding captain of the ark *Halcyon*, 225 years dead. Heard in ship logs | Commanding, hopeful, weary | voice: "A woman in her fifties with a commanding but warm voice and a neutral American accent. Steady and authoritative, like a starship captain recording a log entry, tired but hopeful." **FX:** old-recording EQ with a hint of tape hiss. |
| `helm` | **The Helm** | The ark's ship intelligence | Perfectly calm, literal, ancient | voice: "An androgynous synthetic voice in the mid range, perfectly even and calm, no accent, slow and precise with no emotion." **FX:** clean, with a short plate reverb. |
| `sal` | **Sal Venn** | Nexus frame dealer (Warehouse Market voice) | Slick salesman, harmless | voice: "A man in his forties with a smooth, fast, cheerful tenor and a New York accent, a friendly used-car salesman." |
| `ottoline` | **Ottoline Gearwright** | Fabricator technician (tune and salvage voice) | Blunt engineer who loves machines more than people | voice: "A woman in her sixties with a brisk, raspy voice and a Northern English (Yorkshire) accent. Blunt, practical and impatient, secretly fond." |

**Bark voice pools** (generic, several lines each; see VO_LINES §5):

| id | Who | Voice design prompt |
|---|---|---|
| `civ_f1` | civilian woman, affluent | "A woman in her thirties, light and pleasant, polished upper-class British accent, airy and carefree." |
| `civ_m1` | civilian man, affluent | "A man in his forties, relaxed and friendly, clean neutral American accent, pleasant mid-range." |
| `civ_f2` | worker rider (Stacks) | "A tired woman in her twenties, flat and weary, working-class London accent, low energy." |
| `civ_m2` | worker rider (Stacks) | "A man in his fifties, gravelly and resigned, Irish accent, mutters." |
| `warden_m` | Warden security | "A man in his thirties, firm and authoritative, neutral accent, police-radio cadence." **FX:** radio filter. |
| `warden_f` | Warden security | "A woman in her thirties, firm, clipped, neutral American accent, dispatch cadence." **FX:** radio filter. |
| `thug_m` | Syndicate thug | "A man in his twenties, cocky and aggressive, rough South London accent, shouty." |
| `thug_f` | Syndicate thug | "A woman in her thirties, sharp and sneering, New Jersey accent, loud." |
| `unlinked` | Unlinked rebel | "A young man in his twenties, intense whisper-shout, Scottish Glaswegian accent, urgent." |
| `choir` | Choir Angel (multi-voice) | Use the `seraph` style: "flat, emotionless, in unison". **FX:** three pitch-shifted copies (−3, 0, +4 semitones). |

---

## 2. The truth (spoilers: the whole backstory in one place)

Read this before the act beats. Every twist has to be *fair*, so every one of them is planted in the clue list (§6).

1. **The ark.** *Halcyon* is not a city on a planet. It is the inside of a colossal **generation ark**: a spun cylinder 40 km long. The sky, the sun and the huge pale "moon" are a projected dome, the **Firmament**. **Captain Elena Vael** launched it 225 years ago. So that no council could ever seize the ship, she **genome-locked the Helm** to her bloodline. Every 25 years the Helm demands a **Renewal**: a living Vael must present themselves, or the Helm assumes the leadership has failed and **automatically begins Landfall**.
2. **The arrival.** The ark **arrived 61 years ago** and has been orbiting a habitable green world, **Verdance**. The "moon" in the sky is Verdance, projected faithfully because the projection is a live feed. The ruling Concord of the time hid the arrival. The planet was harsh and required work, while the ship was comfortable, and the people who ran the ship would lose their power on the ground. The billboards kept saying *THE JOURNEY CONTINUES — 212 YEARS TO LANDFALL*, and that number has not changed in 61 years.
3. **The Link and Ascension.** **Iris Vael** (née Iris Hale; she married **Aurel Vael**, the captain's heir) invented the **Link**, which lets humans ride frames. With her protégé **Severin Dray** she also developed **Ascension**: permanently moving a mind into a frame. Iris meant it for the dying. Dray used it for immortality. The seven **Voices of the Concord** are Ascended minds in ornate gold frames, and they walk the plazas among the civ_gold robots. **All civilians are "Harmony-Aegis protected"** (they cannot be harmed) because the Voices hide among them.
4. **The Sundering (22 years ago).** Aurel discovered the arrival cover-up. Aurel, Iris, their daughter **Lyra** and Lyra's partner **Tomas Quill** prepared to broadcast the truth from **Meridian**, the Landfall-prep station on the ark's hull. Dray struck first. Meridian was blown open (officially a "reactor breach"), **Aurel and Tomas died**, and **Iris's mind was captured and bound into Harmony**, the city's AI: her genius runs the city, chained. **Lyra was captured and "harmonized"** with an obedience chip and made into **Seraph**, the Concord's gold hunter. The Vael name was **unpersoned**, erased from records and memorials.
5. **Why you are alive.** Dray could not kill the last Vael. The Helm needs a living Vael at each Renewal to keep the lie going, or Landfall starts. So infant **Wren** was hidden in the **Wards of Harmony** under a number until they came of age (22, majority under ship law). The next Renewal falls in **the year the game starts**. A normal Renewal only needs the heir to sit in the Helm chair. **Dray's plan is different: he will Ascend Wren into the Helm permanently**, so that no Vael is ever needed again. That ends Wren as a person and makes them a key forever, the way Iris was made the city.
6. **Mara.** **Mara Quill**, Tomas's sister, survived. Dray offered her a deal: keep Wren fed, safe and close, "and nothing will happen to the child". She has been Wren's secret guardian and **Dray's handler** ever since, visiting the Ward once a year and reporting on Wren. She did not know Renewal means Ascension. When she finds out (Act 3) she turns.
7. **The heir-key.** In rare glitches, Harmony (Iris) can act on her own. She smuggled a **heir-key**, her own old genome-locked archive, into the city's courier system, addressed to Wren for their 22nd birthday: the first birthday on which a Vael can present at a Renewal. Mara's first contract for you *was* that parcel. Harmony had arranged the delivery through Mara's own board, and Mara did not know what she was delivering.
8. **HIRA.** Lyra hid a fragment of herself (a lullaby, and a map to Meridian) inside the **HireFrame R-1 firmware** 22 years ago, because rentals go everywhere and nobody audits them. That is why HIRA sometimes hums, and why your rental "happened" to be an R-1.

**The lullaby** (a recurring motif that audio composes as a short melody): *"Little star, the sky is wide / little star, go see outside."* Players hear it hummed by HIRA (Act 1), in the heir-key (Act 1), from Seraph (Act 2 on), in Tomas's shard (Act 2), and from Harmony (Act 3). It is the thread that stitches the family together.

---

## 3. The reveal ladder (the seven twists, in order)

| # | When | Reveal | Fair clues planted before it |
|---|---|---|---|
| R1 | end of Act 1 (A1-M5) | **You are a Vael.** Your DNA opens the heir-key. The "traitor" family that caused the Meridian disaster was yours. | Heir-key addressed to you with the "little star" message (A1-M1); the star sigil on the key matches a star scratched out of a Terraces plaque that's visible on the plaza memorial billboard; Kettle's line "that key's worth a family fortune" |
| R2 | end of Act 2 (A2-M5) | **The Sundering was a coup.** The Concord Voices are Ascended immortals in gold frames, and Dray (their Chair, and Iris's protégé) murdered your family. | Civilians cannot be harmed (from P1); some gold civs never take contracts and use archaic phrases; Dray's frame on billboards never ages across 40 years of archive photos (Fenn shows you) |
| R3 | mid Act 3 (A3-M3) | **Mara is your aunt, and she has been Dray's handler all along.** | Ward registry lists annual visits from "M.Q." (A3-M2); Mara always knows where you are; her board keeps serving "coincidentally" story-relevant jobs; she says "you've got his stubbornness" in A1-M4; a photo in her kiosk is of a man with Tomas's face (codex scan) |
| R4 | end of Act 3 (A3-M5) | **Harmony is your grandmother Iris**, captured and bound. She sent the heir-key. | Harmony's voice is the heir-key voice; the billboard face is young Iris from Fenn's photo; Harmony PA glitches say "little star" when you're near; Harmony calls Renewal Day "a birthday" |
| R5 | end of Act 4 (A4-M5) | **Halcyon is inside a starship.** The sky is a screen. | The sun rises at exactly 06:00:00 every shift; the moon never changes phase; Harmony schedules the weather ("rain at 14:00"); the waterfalls have no rivers feeding them; flying cars never cross the skyline; the Landfall countdown on billboards never changes |
| R6 | end of Act 5 (A5-M5) | **Seraph is your mother Lyra.** | Seraph spares you in every fight (Acts 2 to 5); she hums the lullaby; her fighting style *is* your Ghost frame's (the Ghost was Lyra's design); a Vael star is scratched under her gold paint (Ghost optics scan) |
| R7 | Act 6 (A6-M3) | **The ark arrived 61 years ago.** The "moon" is Verdance, a living world, and the whole "journey" is a lie. Renewal would make you the lie's eternal key. | Portside "Outer Farms" cargo crates carry soil and pollen that cannot come from inside; shuttle landing gear comes back muddy; Captain Elena's last log is dated 61 years ago with "we can see it"; the stuck countdown |

Minor surprises that keep the middle fun: Kettle becomes a comedic informant after his defeat · Halloran defects in Act 4 when she learns about the Stacks power-cull · HIRA's hidden firmware (Act 4) · Rook is an old Unlinked founder and knew your father · Dr. Fenn is himself Ascended: the frail old man is a frame, and his body died years ago (Act 2, bittersweet) · the "client lied" contract twists echo the theme.

---

## 4. Acts and story missions

**Story missions appear as gold STORY cards on the board** once the **level gate** is met and the previous story mission is done. They always use Tense threat or higher, with the enemy level set to the gate level and a +2 level floor, and each drops a guaranteed Custom+ item and a codex entry.

Mission ids: `aN_mM`. Dialogue line keys use the form `aN_sMM_speaker_NN` (see VO_LINES).

### ACT 1 — "A BRIGHTER FUTURE" (rider level 1–8) · Aurum Plaza, Brightline Boulevard
*The gorgeous surface. You are a nobody with a rental and debt.*

**Opening (title → A1-M1), the P0 intro beat**
1. Black screen, a pod hum, and a heartbeat on the audio. Text: *"LULLABY REST — POD 4471. Occupant: WARD-4471 'WREN'. Ward status: DISCHARGED (age 22). Debt: 3,140 cr."*
2. HIRA boots up: "Good morning, valued rider! Welcome to HireFrame. Your R-1 is ready for another brighter day!" The frame's eyes open in the plaza with a lens-flare sunrise, gold robots walking past, a Harmony billboard.
3. Harmony PA: *"Good morning, Halcyon. Renewal Day is one hundred days away. Two hundred and twenty-five years of unity. The journey continues."*
4. Mara on comms: "Wren? It's Mara. Quill Contracts, the kiosk by the fountain. You said you wanted work. I've got a parcel that needs legs."
5. There is a **tutorial overlay** (non-blocking) for move, then walking to the kiosk.

**A1-M1 "First Shift"** (level 1, **P1**). A courier tutorial.
- Pick up a parcel at a Nexus locker. Walk it across the plaza. A pair of Scrap Rats spills out of a drain, which is the combat tutorial. Deliver it to drop-locker 12.
- **The twist:** the locker lights up with *RECIPIENT: WARD-4471*. The parcel is for you. Inside is the **heir-key**, a star-shaped data key that plays a woman's voice: *"Happy birthday, little star. Don't let them see this."* HIRA hums two notes of the lullaby, then says "Sorry! Firmware hiccup!"
- Mara: "...That's not on my manifest. Keep it in your pocket, kid. Go take some jobs; you've got rent."
- **Clue C01** (heir-key, star sigil). **Codex:** Wren's node appears, with two blank parent silhouettes.
- Then the **free contract loop opens** (the P1 slice continues with random contracts).

**A1-M2 "Something Borrowed"** (level 2). Retrieve.
- A pawn-droid called Tinsel will read the key for 200 cr. It can't: "Genome-locked, sweetheart. Whose blood did you steal?" Silverhand thugs overhear and jump you in the alley on the way out.
- **Clue C02:** Tinsel's scan fragment reads *"...AEL — ACCESS DENIED — HEIR PROTOCOL"*.

**A1-M3 "Brightline"** (level 3; unlocks Brightline Boulevard). Surveil.
- Mara sends you to photograph a Syndicate courier on the boulevard. Behind him, a billboard stutters: the *A BRIGHTER FUTURE* face glitches and says "little star" (**clue C03**, Harmony glitch). HIRA: "Did that billboard just... no. Brand-safe thoughts only!"

**A1-M4 "The Kettle Boils"** (level 5). **Buy your first frame** (the story nudges you toward it with a 30% discount from Mara), then a defend-then-boss mission.
- Big Kettle's crew raids Mara's kiosk to take the key ("A genome-locked key walking round the plaza? That's worth a family fortune, that is"). You defend the kiosk, then fight **Big Kettle** (champion) on the fountain terraces.
- Mara, patching you up, says: "You've got his stubbornness." You ask whose. "Figure of speech." (**clue C04**)
- Kettle, beaten, becomes a comic informant. He was paid to grab the key by "someone in gold".

**A1-M5 "Unperson"** (level 7). Hack and escape.
- Break into a Nexus civic-records node to match your genome. **R1:** the match is *VAEL, Wren. Status: UNPERSONED.* The Vaels were the "traitor engineers" of the Meridian disaster, 22 years ago. The heir-key partially unlocks and plays Iris's first recording (a message to "the heir", naming Dr. Fenn in the Terraces).
- Wardens swarm (forced Heat 3). You escape through the Transit Relay.
- **Codex:** the family name VAEL appears; the parent nodes become "? Vael" and "?". **Clue C05:** the Vael star sigil.

### ACT 2 — "HARMONY THROUGH UNITY" (level 8–18) · Verdant Terraces, Nexus Arcology
*Who were the Vaels, and why was their name erased?*

**A2-M1 "The Garden of Blank Names"** (level 8; unlocks the Terraces). Escort.
- Find **Dr. Fenn** at the memorial garden. The plaques were wiped blank ("unpersoned"). Escort him away from Warden sweepers. He tells you the official story (a reactor breach and treason) and gives you a photograph of **young Iris**. **Clue C06:** her face is the Harmony billboard face, a little younger. Neither of you says it aloud. HIRA does: "Huh! Lookalike!"

**A2-M2 "Sundering Day"** (level 10; unlocks the Arcology). Infiltrate.
- Infiltrate the Nexus Arcology archive floor (stealth-favoured). Recover a **memory shard**: a man's frame-cam of the Meridian attack. The man says, *"Lyra, take the baby, go — I'll hold the door. Little star, the sky is wide..."* The shard belongs to **TOMAS QUILL** (**clue C07**). The Codex fills the father node: *Tomas Quill*.
- The shard shows **gold frames** leading the attack, not a reactor fault.

**A2-M3 "Gilded"** (level 12). Surveil and tail.
- Tail a gold civilian frame Fenn named "a Voice". It never Links out, never rests, and talks in 200-year-old idioms. You follow it to a private sanctum lift where it greets another gold frame: "Brother Dray sends his regards." **Clue C08.** Fenn, on comms: "No pod. There's no body at the other end of that frame, Wren."
- **Mini-twist:** Fenn admits *he* is Ascended too. He did it to escape a dying body and has regretted it for 20 years. "The Voices offered it to me. I took it. I'm not proud."

**A2-M4 "Halloran"** (level 15). Heist, then boss.
- Steal Fenn's old Ascension research core from a Concord evidence vault. **Warden-Captain Halloran** corners you, and you fight her (boss).
- In the aftermath **Seraph appears for the first time**: a gold angel dropping from the sky, blade-wings, flawless. She puts you down in two hits, stands over you, then **hums three notes and leaves**. She could have killed you. (**clue C09**)

**A2-M5 "Dead Man's Frame"** (level 17). Hack and defend.
- Fenn decrypts the core in his garden while you defend him. **R2:** Ascension was co-invented by Iris Vael and **Severin Dray**. Dray and six others Ascended. The Concord's Voices are immortal minds in gold frames, and the Sundering was Dray's coup against the Vaels.
- Fenn's frame is shut down remotely by Harmony's override (Dray pulling his leash). His last words: "Find the ones who were erased. Some of them aren't dead."
- **Codex:** Dray's node (antagonist, linked to Iris by a dotted "protégé" line), and the Ascension codex. **Clue C10:** a 40-year archive of Dray billboards that never age.

### ACT 3 — "LITTLE STAR" (level 18–26) · Portside, Arcology spire
*Who has been watching you? And who sent the key?*

**A3-M1 "Freehaul"** (level 18; unlocks Portside). Transport.
- Kettle's tip leads you to the Unlinked at the docks. **Jun** tests you with a cargo-run past Syndicate cranes. A crate from the "Outer Farms" bursts open: real soil, pollen and a seed with no Halcyon registry code (**clue C11**). Jun joins as your hacker-ally (comms voice).

**A3-M2 "Ward Records"** (level 20). Hack.
- Jun helps you crack the Wards of Harmony registry. Your file shows a guardian who visited **every year on your birthday**: *M.Q.* It also shows *Renewal eligibility: 22 years* and a flag from **"Office of the Chair"**. **Clue C12.**

**A3-M3 "Quill"** (level 22). Confrontation, then a choice.
- You confront Mara at her kiosk after hours. **R3:** she is **Tomas's sister, your aunt**. Dray spared you, and she agreed to keep you close and report. "I kept you alive. That was the deal. I never knew what he wanted you *for*." Then, over comms, a Warden broadcast calls Renewal "the Heir's Ascension", and Mara realises what Renewal means.
- **Choice:** *"You should have told me."* (cold) or *"You were all I had."* (warm). Both lead to Mara turning. The choice sets Mara's tone for the rest of the game and an Act 6 epilogue line.
- Mara's board now secretly serves the Unlinked. **Codex:** Mara becomes Aunt (the node links to Tomas as sibling).

**A3-M4 "Signal to Noise"** (level 24). Sabotage.
- Trace the heir-key's delivery routing back to its sender. The origin is **the Chorus Tower**, Harmony's broadcast core in the Arcology spire. Sabotage the Choir relay pylons to open a path.

**A3-M5 "Harmony"** (level 26). Infiltrate, then boss.
- At the core you fight the **Choir Warden**. Then the billboards across the whole spire turn to face you, and Harmony speaks in her real voice: **R4:** *"Hello, little star. It's Grandma."* Iris, bound as Harmony, sent the key in a moment of freedom. She tells you that the Helm, Renewal and Dray need you, and that your mother is alive: *"Find Lyra. Then find the edge of the sky."* She is dragged back under ("HARMONY THROUGH UNITY" snaps back over her words).
- **Codex:** Iris is filled in (grandmother) and linked to Harmony. **Clue C13:** Harmony's "the sky is a lie" fragment.

### ACT 4 — "THE SKY IS A SCREEN" (level 26–34) · The Stacks, then the edge of the world
*The rot underneath, then the edge of the world.*

**A4-M1 "Pod 4471"** (level 26; unlocks the Stacks and the Home scene). A travel and story beat.
- You go home for the first time. You unplug and ride down, *in your frame*, to your own pod. You see your sleeping body; the pod screen shows your vitals and your debt. The Stacks are the rot: power-culls, riders slumped in frames. **Rook** runs a stall there. Home unlocks.

**A4-M2 "Culling Hour"** (level 28). Defend and rescue.
- Harmony (Dray's hand on it) cuts power to Stack 9 to "rebalance", and the riders' pods will fail. Rescue and defend the pod rows against Rustkin and Wardens. **Minor twist:** Halloran is the Warden in charge, balks at the order, and stands down. She defects later.
- **Boss: Rustmother** in the flooded sub-stack.

**A4-M3 "Stuck Clock"** (level 30). Surveil.
- Jun shows you 61 years of archived billboards. The *212 YEARS TO LANDFALL* countdown has never changed. Photograph billboards across four districts to prove it (**clue C14**). **HIRA reveal:** a hidden firmware partition wakes up and plays Lyra's voice: "If you're hearing this, my love, the R-1 found you. The map is in the lullaby." The map points down, to where the waterfalls go.

**A4-M4 "Waterfall's End"** (level 32; unlocks the Spine). Race and infiltrate.
- Follow the waterfalls' runoff through pipes into the **Spine**. The water is pumped back up and loops forever (**clue C15**). You reach a maintenance door marked *FIRMAMENT ACCESS — CREW ONLY — AUTH: VAEL*. Your hand opens it.

**A4-M5 "Breach"** (level 34; unlocks Hullside). Climb and boss.
- Climb the Firmament lattice behind the sky. Up close, the sun is a lamp and the moon is a feed. Fight a Spine Keeper at the airlock. **R5:** step through onto the **outer hull**, into stars. The whole city was a ship. The "moon" hangs enormous below: a green-blue world. HIRA, quietly: "...That's not in the brochure."

### ACT 5 — "HULLSIDE" (level 34–42) · Hullside, Meridian Wreck
*The family tragedy site, and your mother.*

**A5-M1 "Vacuum"** (level 34). EVA traversal and escort.
- Escort Jun's Unlinked EVA team across the hull to the Meridian docking spur. Hull Wights attack. Mara is on comms now as your dispatcher again, and has become kinder.

**A5-M2 "Meridian"** (level 36; unlocks Meridian Wreck). Retrieve.
- Explore the wreck of the Sundering. Frozen memorials, and Tomas's frame, still holding the door. **Captain Elena's logs** (clue C16): *"Day 164 of year 164: we can see it. It's green."* The log is dated **61 years ago**. You find the **Heir Core** in Lyra's lab. It installs and unlocks the 4th skill.

**A5-M3 "The Choir"** (level 38). Defend.
- Seraph's Choir comes to take you. Defend the Meridian comms mast while Jun rebuilds the broadcast array Aurel meant to use.

**A5-M4 "Angel's Hum"** (level 40). Bounty.
- Hunt Seraph's three Choir lieutenants to isolate her. Each drops a piece of her harmony-chip key. Your Ghost optics scan under her paint: a **Vael star** (clue C17).

**A5-M5 "Seraph"** (level 42). Boss.
- A three-phase fight on the hull. At each phase break she hums, and at the end *you* finish the lullaby (a dialogue choice line). **R6:** the chip cracks and Seraph is **Lyra**, your mother: "Wren? ...You got so *big*." She is exhausted and damaged; you carry her frame back to Meridian.
- **Codex:** Lyra is filled in. Lyra joins as an ally, and later as the Ghost-parts vendor and Heir Core trainer.

### ACT 6 — "HEIRFRAME" (level 42–50) · The Spine, The Helm
*The truth, the key and the choice.*

**A6-M1 "Renewal"** (level 43). Infiltrate.
- Lyra explains the Helm lock and Renewal: if no Vael presents, **Landfall begins automatically**. That is why Dray needs you, and why he kept you alive. Renewal Day is here (the countdown from the opening hits 0 at this mission; see the "Renewal counter" in §7).

**A6-M2 "Seven Voices"** (level 45; unlocks the Helm). Assassination, run as a multi-target contract.
- Take down the Voices guarding the Helm approaches (2 are killed here; 5 flee, and they become the endgame Voice Hunts).

**A6-M3 "Landfall"** (level 47). Hack.
- At the Helm's outer ring, the ship's intelligence (**The Helm**) greets the heir. **R7:** *"Welcome, Captain-heir. This vessel arrived at its destination sixty-one years, four days ago. Landfall has been deferred by order of the Concord 22,269 times."* The whole journey was a lie. Verdance is real, green and waiting.

**A6-M4 "Walk as Yourself"** (level 49). A non-combat cinematic walk.
- The Helm requires a **living body**, not a frame. For the first time, you walk in your own body (a slow, simple human model) from the Helm's airlock pod-dock to the Helm chair. Mara, Lyra, Jun and HIRA speak over comms. It is short, quiet and the emotional peak.

**A6-M5 "The Heir"** (level 50). The final boss, then the choice.
- **Archon Dray, the Sovereign Frame.** Phase 1: he fights through Harmony, turning the Helm's defences on you. Phase 2: seven halo-voice drones. Phase 3: Iris breaks free *inside* Harmony and cuts his city link, and it is a fair fight.
- **Final choice:**
  - **OPEN THE SKY:** the Firmament goes transparent across the whole city. Everyone sees Verdance. Landfall begins.
  - **KEEP THE SKY (for now):** you perform a normal Renewal as a living heir, not Ascended, and take the Helm's authority yourself. You tell the truth city-wide, but you run Landfall slowly and in an orderly way.
  - Both endings free Iris (she chooses to fade out peacefully as Harmony's last broadcast, or to live on in a frame; your choice in the epilogue), unlock **Verdance Landfall**, and start the endgame.
- **Epilogue:** a Harmony billboard, rewritten by Iris: *"A BRIGHTER FUTURE — TOGETHER. For real this time."* Mara's closing line depends on the A3-M3 choice.

---

## 5. How story and endless play coexist
- There is **no story wall.** Between story cards the board keeps generating contracts. The level gates (listed on each mission) are paced so that about **3–6 contracts** sit between story missions early, and **8–12** late.
- **Story shapes the random contracts:** after each act, the generator's client and target tables gain new entries (MISSIONS §5.4). After R2, gold-frame "Voice agent" targets appear. After Act 3, Unlinked clients post more. After R5, Hullside contracts exist.
- **Clue drops:** optional "Echo" clues (C-E01 to C-E12) drop from random contracts in the right districts. They flesh out the family tree with extra nodes and side stories, such as the great-grandmother, Aurel's childhood, and Mara and Tomas as kids.
- **After the finale:** Verdance Landfall, Voice Hunts, Overclock, Legacy and Succession (DESIGN §11.4). Mara keeps running the board: "Contracts don't stop just because the sky did."
- **Succession** replays Acts 1–6 as *Echo* runs with your new heir. The villain is the same, but the family tree gains your generation's node, and new dialogue variants use `_echo` keys (a later phase).

---

## 6. Clue items and codex entries

Each clue has a **codex id**, a **source**, the **node** it attaches to, and its **text**. Systems puts these in `js/data/codex.js`.

| id | Name | Source | Node | Codex text (short) |
|---|---|---|---|---|
| C01 | The Heir-Key | A1-M1 | Wren | "A star-shaped data key, warm to the touch. 'Happy birthday, little star.'" |
| C02 | Tinsel's Scan | A1-M2 | ? (parent) | "Fragment: ...AEL — HEIR PROTOCOL — ACCESS DENIED." |
| C03 | Stuttering Billboard | A1-M3 | ? (unknown) | "A Harmony billboard glitched and said 'little star'. Probably nothing." |
| C04 | "His Stubbornness" | A1-M4 | Mara | "Mara said I have 'his' stubbornness. Whose?" |
| C05 | The Vael Star | A1-M5 | Vael family | "Eight-pointed star, erased from every plaque in the city." |
| C06 | Young Iris | A2-M1 | Iris | "A photo of a young engineer. She has the Harmony face." |
| C07 | Tomas's Shard | A2-M2 | Tomas | "'I'll hold the door.' My father. He hummed my lullaby." |
| C08 | The Voice Without a Body | A2-M3 | Dray | "Gold frames with no pod on the other end." |
| C09 | Seraph Hums | A2-M4 | ? (Seraph) | "She could have killed me. She hummed instead." |
| C10 | Dray Never Ages | A2-M5 | Dray | "Forty years of billboards. Not one line on his face." |
| C11 | Outer Farms Soil | A3-M1 | Halcyon | "Soil with pollen from no plant in the registry." |
| C12 | Visitor: M.Q. | A3-M2 | Mara | "Someone visited me every birthday for 22 years." |
| C13 | "The sky is a lie" | A3-M5 | Iris | "Grandma's last words before Harmony took her back." |
| C14 | The Stuck Clock | A4-M3 | Halcyon | "212 YEARS TO LANDFALL. For 61 years." |
| C15 | Waterfalls Loop | A4-M4 | Halcyon | "Every waterfall in Halcyon is the same water, going round." |
| C16 | Elena's Last Log | A5-M2 | Elena | "'We can see it. It's green.' Dated 61 years ago." |
| C17 | Star Under Gold | A5-M4 | Lyra | "Under Seraph's gold paint: the Vael star." |
| C18 | Landfall Deferred | A6-M3 | Halcyon | "Deferred 22,269 times. Once a day, every day." |
| C-E01…E12 | Echo clues | random contracts, 3% | various | Aurel's garden letter · Mara and Tomas as kids · Elena's launch-day log · Iris's Link patent · Lyra's Ghost-frame blueprint · Dray's first Ascension · the first Voice to Ascend · Halloran's service file · Rook's founding of the Unlinked · a HIRA training transcript · Fenn's diary · the lullaby's origin |

### Family tree layout (the Codex node graph)
```
             Capt. Elena Vael (founder, 225y ago)
                       │  (… 5 generations, a collapsed node)
   Iris Hale ═══ Aurel Vael (captain's heir)       Severin Dray ┄┄ protégé of Iris
                  │
   Tomas Quill ═══ Lyra Vael          Mara Quill (Tomas's sister)
                  │
                 WREN  ──(Succession)──►  Gen 2 heir ►  Gen 3 …
```
Node states: `unknown` (silhouette and "?") → `rumoured` (name known, grey) → `revealed` (portrait and bio) → `complete` (all clues; gold frame). Node portraits are procedural robot renders (the frame each person is associated with) or stylised silhouettes for humans.

---

## 7. Story state flags (for `js/sim/story.js`)
- `story.mission`: the id of the next story mission (`a1_m1` … `a6_m5`, then `endgame`).
- `story.reveals`: a set from R1 to R7.
- `story.choices`: `{ maraTone: 'cold'|'warm', ending: 'open'|'keep', irisFate: 'fade'|'frame' }`.
- `story.clues`: a set of clue ids.
- `story.renewalDays`: starts at 100 and drops by 1 per **completed contract** (not by time; floored at 1 until A6-M1 sets it to 0). Harmony's PA reads it out ("Renewal Day is 87 days away"). It is a diegetic progress bar and a clue.
- Gate table: a1_m1:1, a1_m2:2, a1_m3:3, a1_m4:5, a1_m5:7, a2_m1:8, a2_m2:10, a2_m3:12, a2_m4:15, a2_m5:17, a3_m1:18, a3_m2:20, a3_m3:22, a3_m4:24, a3_m5:26, a4_m1:26, a4_m2:28, a4_m3:30, a4_m4:32, a4_m5:34, a5_m1:34, a5_m2:36, a5_m3:38, a5_m4:40, a5_m5:42, a6_m1:43, a6_m2:45, a6_m3:47, a6_m4:49, a6_m5:50.

---

## 8. Scripts (data tables for systems → `js/data/story_a1.js`)

`trigger` names are events from the mission runner. `mode`: `bark` is a non-blocking subtitle plus VO while play continues; `dlg` opens the dialogue panel and pauses input (not the world); `card` is a full-screen text card. `choices`, when present, are Wren's lines (text only).

### 8.1 Intro (P1): title → free play
| # | trigger | mode | speaker | vo key | text / action |
|---|---|---|---|---|---|
| 1 | newGame | card | — | — | "LULLABY REST — POD 4471" / "Occupant: WARD-4471 'WREN' · Ward status: DISCHARGED (age 22) · Ward debt: 3,140 cr" (a 4 s card with a pod hum and heartbeat SFX) |
| 2 | after 1 | card | — | — | "LINKING… HireFrame R-1 · Aurum Plaza" (a 1.5 s card; the frame's eyes open with a lens-flare fade-in) |
| 3 | spawn | bark | hira | a1_s00_hira_01 | Good morning, valued rider! Welcome to HireFrame. Your R-1 is ready for another brighter day! |
| 4 | after 3 | bark | hira | a1_s00_hira_02 | Link stable. Latency: zero milliseconds! Wow, that's... unusually good. Anyway! |
| 5 | after 4 | bark | harmony | a1_s00_harmony_01 | Good morning, Halcyon. Renewal Day is one hundred days away… (the billboards show the *A BRIGHTER FUTURE TOGETHER* face) |
| 6 | after 5 | dlg | mara | a1_s00_mara_01 | Wren? It's Mara. Quill Contracts, the kiosk by the fountain. You said you wanted work. |
| 7 | after 6 | dlg | mara | a1_s00_mara_02 | I've got a parcel that needs legs. Yours are rented, but they'll do. · choices: ["On my way." , "How much does it pay?"] (the second gets a text-only reply from Mara: "Enough for rent. Barely. Move.") |
| 8 | after 7 | bark | hira | a1_s00_hira_03 | Tip! Drag the left side of the screen to walk… (and show the move tutorial overlay; set a marker on Mara's kiosk) |
| 9 | reach kiosk | — | — | — | open the contract board with the STORY card "First Shift" highlighted (tutorial pulse on Accept) |

### 8.2 A1-M1 "First Shift" (P1)
Fixed mission: courier, level 1, no modifiers, no twist roll (its twist is scripted). Steps: `goto(locker_07) → pickup(parcel) → [scripted ambush: 3 Scrap Rats from the nearest alley drain when the player is 40% of the way] → goto(locker_12) → deliver`. Payout: 150 cr, 120 XP (guarantees level 2) and a cache containing a **Tuned weapon** ("Surplus Shock Baton", Shock, 1 affix), chosen so that it is always an upgrade (the first ▲ EQUIP moment).

| # | trigger | mode | speaker | vo key | text / action |
|---|---|---|---|---|---|
| 1 | accept | bark | mara | a1_s01_mara_01 | Locker seven, north side… |
| 2 | pickup | bark | hira | a1_s01_hira_01 | Parcel acquired! Did you know HireFrame Premium riders get a complimentary shoulder bag? |
| 3 | ambush | bark | hira | a1_s02_hira_01 | Uh-oh! Scrap rats! Tap attack… (show the attack-button tutorial pulse) |
| 4 | ambushCleared | bark | mara | a1_s02_mara_01 | Rats out of the drains in broad daylight… |
| 5 | deliver | dlg | hira | a1_s03_hira_01 | Drop-locker twelve! Scanning recipient... recipient is... you? (the locker door holo turns cyan and shows the Vael eight-pointed star for 1 s) |
| 6 | after 5 | dlg | iris | a1_s03_iris_01 | Happy birthday, little star. Don't let them see this. (portrait: a star-shaped key icon, not a face; speaker label "UNKNOWN RECORDING") |
| 7 | after 6 | bark | hira | a1_s03_hira_02 | (hums two notes) …Oh! Sorry! Firmware hiccup! |
| 8 | after 7 | dlg | mara | a1_s04_mara_01 | That's not on my manifest. Who sends a Ward a birthday present? · choices: ["No idea.", "Someone who knows my birthday."] (both continue) |
| 9 | after 8 | dlg | mara | a1_s04_mara_02 | Keep it in your pocket, kid… The board's yours. |
| 10 | after 9 | — | — | — | results card → loot cache → toast "Codex updated: The Heir-Key" → set flags `clue C01`, `story.mission = 'a1_m2'` (hidden until P2), board unlocked |

**Codex after A1-M1:** the Wren node (revealed, portrait = the rental frame) with two silhouettes above it, labelled "?" and "?". Clue C01 is attached to Wren.
