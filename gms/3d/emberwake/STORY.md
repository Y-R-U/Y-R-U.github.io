# Beyond the First Shore — review draft

This build is a playable first chapter: the lab prologue, the original training island, and three mainland missions. The Creator's identity and the intruders' origin remain open for Aaron's direction.

## Prologue: the new assistant

The player chooses a name and male/female character. Dr Vale welcomes the new assistant at Aster Lab. The device appears to transport a person into another dimension, but this remains a working theory. Vale reports two trips: ten seconds to check conditions, then one minute. On the second trip a man at the gate talked about training and a tutorial, and a woman offered a sword.

A boom interrupts his account. Vale gives the assistant the device and tells them to hide until it is safe. The player walks behind the storage cabinets. Intruders are heard demanding the traveller and the key; they are still approaching. The assistant decides to activate the device rather than wait to be found. The device draws the alarm sparks into a visible orange doorway across the lab. The player enters that rift to escape; the marker beside the storage box no longer teleports them.

## The first shore

The device becomes an ember-like stone. Edda treats arrivals as routine and speaks of “the Creator” without explanation. The player wonders whether the lab found this place or someone built it.

The existing gathering, forging, sword/dagger practice, magic practice, shades and Warden encounters remain. Dialogue is shorter. The shades are an unexpected breach, not a planned training exercise. The Warden warns that someone is opening doors from the other side.

The beacon is a crossing. After freeing the Warden, lighting it opens the crossing. Interacting again takes the player to Lantern Reach; finishing Edda’s speech never teleports the player automatically. It subsequently works both ways. Old completed island saves can use it immediately.

## Lantern Reach

| Mission | Playable actions | Reward and discovery |
| --- | --- | --- |
| A light for the living | Meet Mara; gather wood and copper; repair three ward lamps; report back | Smithing XP, reinforced weapons (+4 damage), three meals. The wards failed when the sky shook. |
| The missing archivist | Defeat two lost sentinels; speak to Neri on the archive road | Magic XP; Neri moves to the town archive. The sentinels demanded a traveller's key. |
| An impossible entry | Defeat the Observatory Custodian; collect its ledger; return to Neri | Magic XP, two meals, a recorded clue and a broken signal from Vale. |

The ledger contains **ASTER LAB / RETURN TEST / 00:61**, describes the authorising figure as **Founder**, and says the return channel is suspended. The extra second is a clue, not a settled explanation of the device's time behaviour. Sato's optional lab interaction also mentions the return timer.

Neri's oldest books begin with the Creator's arrival. Nothing records what came before. Vale's broken signal warns against using the return setting: someone is listening. He asks the assistant to find a second anchor, then cuts out.

The chapter ends here. The northern road is visibly sealed. Players can review their journal, travel between both shores, gather, fish, cook and practise; the game does not present another unfinished mission as playable.

## Open questions for the next chapter

- Is the Creator the Founder? The inhabitants assume one origin; the evidence has not proved it.
- Did Aster invent the device, reconstruct it, or discover something designed to be found?
- Are the intruders from Earth, this world, or a third place?
- Did the attack cause the ward failure, or did both result from a crossing?
- Where is Vale, and can the broken transmission be trusted?

## Voice and pacing

Lewis (`bm_lewis`) reads narration and NPC lines. The player's spoken thoughts use Bella (`af_bella`) for a female character and Echo (`am_echo`) for a male character. A name is displayed rather than inserted into prerecorded audio. Most clips last 6–11 seconds; the ledger reading is approximately 15 seconds. Speech plays as short orange subtitles without pausing movement. It advances automatically and has a small skip arrow. The message icon opens the complete transcript and pauses gameplay; closing it resumes the same speech. Replay and mute remain available. Departure and arrival effects stay unobstructed by speech.

Edit `story.json` for the exact dialogue. `tools/narrate.py` regenerates only changed clips using the local Reader environment. Mission transitions live in `main.js`; persistent progress and migration live in `state.mjs`.
