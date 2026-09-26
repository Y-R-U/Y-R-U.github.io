# HEIRFRAME — Voice Lines (planner-owned)

Status: v1, 2026-09-26. **Audience:** the audio agent (Qwen TTS 1.7B, Voice Studio at localhost:7876). The voice ids and design prompts are in **STORY.md §1 CAST**.

**Format:** every table row is `| key | voice | line | P | style |`. Parse rows whose first cell matches `^[a-z0-9_]+$`. The output file is `audio/vo/<key>.mp3` (or .ogg). `style` is an optional delivery instruction for the TTS.
**Priority:** **P0** = first playable (the opening, Act 1 and core barks) · **P1** = next phase (more barks, Act 2) · **P2** = later acts · **P3** = endgame and Succession.
**Rules:** keep lines under ~20 words. Wren is silent and never voiced. `{…}` placeholders are not used in VO; variable numbers get one line per value.
**Key scheme:** story `a{act}_s{scene}_{voice}_{nn}`; barks `b_{group}_{event}_{nn}`; Harmony PA `pa_{topic}_{nn}`.

---

## 1. Act 1 — "A Brighter Future" (P0)

### Opening: pod and first boot (a1_s00)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s00_hira_01 | hira | Good morning, valued rider! Welcome to HireFrame. Your R-1 is ready for another brighter day! | P0 | chirpy, ad-read |
| a1_s00_hira_02 | hira | Link stable. Latency: zero milliseconds! Wow, that's... unusually good. Anyway! | P0 | puzzled, then bright |
| a1_s00_harmony_01 | harmony | Good morning, Halcyon. Renewal Day is one hundred days away. Two hundred and twenty-five years of unity. The journey continues. | P0 | serene PA |
| a1_s00_mara_01 | mara | Wren? It's Mara. Quill Contracts, the kiosk by the fountain. You said you wanted work. | P0 | brisk, warm |
| a1_s00_mara_02 | mara | I've got a parcel that needs legs. Yours are rented, but they'll do. | P0 | dry |
| a1_s00_hira_03 | hira | Tip! Drag the left side of the screen to walk. Tap anywhere to go there. Walking is included in your plan! | P0 | tutorial |

### A1-M1 "First Shift" (a1_s01–s04)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s01_mara_01 | mara | Locker seven, north side. Grab the parcel, walk it to drop-locker twelve. Don't open it, don't drop it, don't sell it. | P0 | briefing |
| a1_s01_hira_01 | hira | Parcel acquired! Did you know HireFrame Premium riders get a complimentary shoulder bag? | P0 | upsell |
| a1_s02_hira_01 | hira | Uh-oh! Scrap rats! Tap attack to swing your baton. Please do not get them on the upholstery. | P0 | alarmed-cheerful |
| a1_s02_mara_01 | mara | Rats out of the drains in broad daylight. Brighter future, my foot. Keep moving. | P0 | grumbling |
| a1_s03_hira_01 | hira | Drop-locker twelve! Scanning recipient... recipient is... you? Recipient: Ward four-four-seven-one. | P0 | confused |
| a1_s03_iris_01 | iris | Happy birthday, little star. Don't let them see this. | P0 | old recording, tender, hushed |
| a1_s03_hira_02 | hira | Mm-mm, mm-mm... Oh! Sorry! Firmware hiccup! I don't know that song. | P0 | hums two notes, then flustered |
| a1_s04_mara_01 | mara | That's not on my manifest. Who sends a Ward a birthday present? | P0 | wary |
| a1_s04_mara_02 | mara | Keep it in your pocket, kid. Go take some jobs; you've got rent. The board's yours. | P0 | covering, brisk |

### A1-M2 "Something Borrowed" (a1_s05–s06)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s05_mara_01 | mara | If you must know what's on that key, there's a pawn-droid called Tinsel in the east arcade. Two hundred cred and he'll look. | P0 | reluctant |
| a1_s05_hira_01 | hira | Tinsel's Pre-Loved Electronics! Two point three stars! | P0 | cheerful |
| a1_s06_thug_m_01 | thug_m | Oi, rental! Heard you've got a fancy key. Hand it over and you keep your arms. | P0 | cocky |
| a1_s06_mara_01 | mara | Word travels fast in the plaza. Too fast. Get out of there. | P0 | worried |

### A1-M3 "Brightline" (a1_s07–s08)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s07_mara_01 | mara | Silverhand courier on Brightline Boulevard. Get me three clean pictures of who he meets. Stay out of his eyeline. | P0 | briefing |
| a1_s08_harmony_01 | harmony | A brighter future... little... little star... together. | P0 | glitching, warm, slowed |
| a1_s08_hira_01 | hira | Did that billboard just... no. Brand-safe thoughts only! | P0 | nervous laugh |

### A1-M4 "The Kettle Boils" (a1_s09–s12)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s09_mara_01 | mara | You can't keep taking jobs in a rented tin can. I know a dealer. Thirty percent off; don't ask why. | P0 | gruff kindness |
| a1_s09_sal_01 | sal | Sal Venn, Nexus Frames! Brand new chassis, zero previous owners, and I mean that legally! | P0 | salesman |
| a1_s09_hira_01 | hira | You're... buying your own frame? That's great! I'm happy for you! I'll just... be in the chip slot. If you want. | P0 | brave, a little sad |
| a1_s10_kettle_01 | kettle | Mara, love! Put the kettle on, I'm coming in! | P0 | boisterous |
| a1_s10_kettle_02 | kettle | A genome-locked key walking round the plaza? That's worth a family fortune, that is. | P0 | greedy, sly |
| a1_s10_mara_01 | mara | Wren, they're at the kiosk. Hold them off, I'm not losing my shop to a boiler with legs. | P0 | urgent |
| a1_s11_kettle_01 | kettle | Let off some steam, shall we? | P0 | pun, delighted |
| a1_s11_kettle_02 | kettle | You're boiling me over! Alright, alright, I yield! | P0 | defeated, comic |
| a1_s12_kettle_01 | kettle | Wasn't my idea, rental. Someone in gold paid double. Never saw a face. They don't have faces. | P0 | nervous |
| a1_s12_mara_01 | mara | Hold still. You've got his stubbornness, you know that? | P0 | tender, slips out |
| a1_s12_mara_02 | mara | Nobody's. Figure of speech. Go on, off you go. | P0 | too quick |

### A1-M5 "Unperson" (a1_s13–s15)
| key | voice | line | P | style |
|---|---|---|---|---|
| a1_s13_mara_01 | mara | Civic records node, under the statue. If your blood opens that key, the records will know whose blood it is. | P0 | low, serious |
| a1_s13_hira_01 | hira | Hacking is a violation of your rental agreement! I'll... look away. La la la. | P0 | playful |
| a1_s14_hira_01 | hira | Match found. Vael, Wren. Status: unpersoned. What does unpersoned mean? | P0 | reading, uneasy |
| a1_s14_mara_01 | mara | It means they don't exist. The Vaels. The Meridian traitors. Wren, get out of there, now. | P0 | shaken |
| a1_s14_iris_01 | iris | If you are hearing this, you are a Vael, and they lied to you about us. Find Abel Fenn in the Terraces. He kept our names. | P0 | urgent recording |
| a1_s15_warden_m_01 | warden_m | Unregistered genome query at the civic node. All units, detain the rider. | P0 | radio |
| a1_s15_hira_01 | hira | Oh, we're famous! That's bad, right? That feels bad. Run! | P0 | panicked |

---

## 2. Act 2 — "Harmony Through Unity" (P1)
| key | voice | line | P | style |
|---|---|---|---|---|
| a2_s01_fenn_01 | fenn | You have her eyes. Well, your frame doesn't. But you would. | P1 | gentle, wistful |
| a2_s01_fenn_02 | fenn | Every plaque here had a name once. The Concord calls it tidying. | P1 | bitter, quiet |
| a2_s01_hira_01 | hira | Huh! That photo lady looks just like Harmony. Lookalike! Must be a lookalike. | P1 | bright, oblivious |
| a2_s02_tomas_01 | tomas | Lyra, take the baby, go. I'll hold the door. | P1 | urgent, scared |
| a2_s02_tomas_02 | tomas | Little star, the sky is wide... little star, go see outside. | P1 | sung softly, breaking |
| a2_s02_hira_01 | hira | That's the song. That's my hiccup song. Why do I know that song? | P1 | shaken |
| a2_s03_fenn_01 | fenn | No pod. There's no body at the other end of that frame, Wren. | P1 | grim |
| a2_s03_fenn_02 | fenn | I should tell you. I'm one of them too. I was dying. They offered. I'm not proud. | P1 | ashamed |
| a2_s04_halloran_01 | halloran | Rider Vael. You are an unperson. You have no rights to read. | P1 | cold |
| a2_s04_halloran_02 | halloran | Stand down, or be decommissioned. Those are the only options. | P1 | clipped |
| a2_s04_seraph_01 | seraph | Target located. Do not resist. | P1 | flat |
| a2_s04_seraph_02 | seraph | Mm... mm-mm. | P1 | hums three notes of the lullaby, then silence |
| a2_s05_fenn_01 | fenn | Iris made Ascension to save the dying. Severin made it to never die. | P1 | reading, hushed |
| a2_s05_fenn_02 | fenn | The Voices are the Concord, Wren. Seven minds that forgot how to end. | P1 | grave |
| a2_s05_dray_01 | dray | Abel. You always did talk too much. | P1 | calm, disappointed, over PA |
| a2_s05_fenn_03 | fenn | Find the ones who were erased. Some of them... aren't dead. | P1 | fading, last words |

## 3. Acts 3–6 (P2)
| key | voice | line | P | style |
|---|---|---|---|---|
| a3_s01_jun_01 | jun | You're the Vael? You're shorter than the wanted posters. It's the rental. It's definitely the rental. | P2 | fast, nervous |
| a3_s01_jun_02 | jun | That's soil. Real soil. Nothing in Halcyon grows in dirt like this. | P2 | whisper, amazed |
| a3_s02_jun_01 | jun | Guardian visits, once a year, every year, on your birthday. Initials: M.Q. | P2 | reading, careful |
| a3_s03_mara_01 | mara | Tomas was my brother. You're his child. You're all I had left of him. | P2 | raw, quiet |
| a3_s03_mara_02 | mara | I kept you alive. That was the deal. I never knew what he wanted you for. | P2 | pleading |
| a3_s03_mara_03 | mara | Ascension. Renewal means Ascension. God, Wren. I'm so sorry. | P2 | horrified |
| a3_s03_mara_cold_01 | mara | You're right. I should have. I'll earn it back, kiddo, one job at a time. | P2 | chastened |
| a3_s03_mara_warm_01 | mara | And you were all I had. Right. Let's burn his world down, then. | P2 | tearful, resolved |
| a3_s05_harmony_01 | harmony | Hello, little star. | P2 | glitch into warmth |
| a3_s05_iris_01 | iris | It's Grandma. I haven't long. Find Lyra. Then find the edge of the sky. | P2 | urgent, loving |
| a3_s05_iris_02 | iris | The sky is a lie, darling. The whole sky. | P2 | whisper |
| a3_s05_harmony_02 | harmony | Harmony through unity. Harmony through unity. Harmony through... | P2 | snapping back, cold loop |
| a4_s01_rook_01 | rook | So you're the one the whole city's pretending not to look for. Sit down. Your father owed me a drink. | P2 | amused |
| a4_s02_halloran_01 | halloran | Culling order for Stack Nine. There are people down there. I will not sign this. | P2 | controlled, cracking |
| a4_s03_lyra_01 | lyra | If you're hearing this, my love, the R-1 found you. The map is in the lullaby. | P2 | recording, tender |
| a4_s03_hira_01 | hira | She put it in me. All this time. I think... I think I was carrying something for you. | P2 | soft, moved, no FX |
| a4_s05_hira_01 | hira | That's... not in the brochure. | P2 | awed whisper |
| a4_s05_jun_01 | jun | It's a ship. The whole city. We're on a ship. | P2 | stunned |
| a5_s02_elena_01 | elena | Captain's log, day one-sixty-four. We can see it. It's green. I'm going to tell them tomorrow. | P2 | old log, joyful |
| a5_s02_mara_01 | mara | He's still holding the door. Oh, Tomas. | P2 | grief |
| a5_s05_seraph_01 | seraph | Return with me. You will not be harmed. You are required. | P2 | flat |
| a5_s05_lyra_01 | lyra | Wren? You got so... big. | P2 | waking, dazed, crying |
| a5_s05_lyra_02 | lyra | I could hear you. The whole time. I kept humming so I wouldn't forget. | P2 | exhausted, loving |
| a6_s01_lyra_01 | lyra | If no Vael sits in that chair on Renewal Day, the ship lands itself. That's why he kept you. | P2 | grim |
| a6_s03_helm_01 | helm | Welcome, Captain-heir. This vessel arrived at its destination sixty-one years, four days ago. | P2 | even |
| a6_s03_helm_02 | helm | Landfall has been deferred by order of the Concord twenty-two thousand, two hundred and sixty-nine times. | P2 | even |
| a6_s04_mara_01 | mara | Your own feet. Look at you. Slowly now, kiddo. | P2 | tearful, gentle |
| a6_s04_hira_01 | hira | For the record, you're my favourite rider. Premium tier. | P2 | warm |
| a6_s05_dray_01 | dray | I gave them paradise, child. You would give them mud. | P2 | calm, sincere |
| a6_s05_dray_02 | dray | Every generation needs a Vael to sit very still. You will sit very still forever. | P2 | quiet menace |
| a6_s05_dray_03 | dray | The journey... continues. | P2 | dying, whisper |
| a6_s05_iris_01 | iris | Not today, Severin. Not ever again. | P2 | steel |
| a6_s05_helm_open_01 | helm | Firmament disengaged. Landfall protocol initiated. Good morning, Verdance. | P2 | even |
| a6_s05_helm_keep_01 | helm | Renewal accepted. Captain-heir recognised. Awaiting your orders. | P2 | even |
| a6_s06_harmony_01 | harmony | A brighter future, together. For real this time. | P2 | Iris-warm, no reverb |

---

## 4. Harmony PA (surface districts, one every ~90 s) — P0 for the core set
| key | voice | line | P | style |
|---|---|---|---|---|
| pa_unity_01 | harmony | Harmony through unity. Unity through harmony. | P0 | serene |
| pa_unity_02 | harmony | A brighter future, together. Thank you for being part of it. | P0 | serene |
| pa_journey_01 | harmony | The journey continues. Two hundred and twelve years to Landfall. | P0 | serene (clue: never changes) |
| pa_weather_01 | harmony | Light rain is scheduled for fourteen hundred. Please enjoy it. | P0 | serene (clue) |
| pa_sunrise_01 | harmony | The sun has risen at six o'clock precisely. Good morning, Halcyon. | P0 | serene (clue) |
| pa_frames_01 | harmony | Riders, please return rented frames by end of shift. Idle frames will be reclaimed. | P0 | serene |
| pa_calm_01 | harmony | Disturbance reported. Wardens are responding. Please remain calm and beautiful. | P0 | serene |
| pa_aegis_01 | harmony | Every citizen is protected by the Harmony Aegis. No one is ever harmed in Halcyon. | P0 | serene (clue) |
| pa_renewal_100 | harmony | Renewal Day is one hundred days away. | P0 | serene |
| pa_renewal_90 | harmony | Renewal Day is ninety days away. | P0 | serene |
| pa_renewal_80 | harmony | Renewal Day is eighty days away. | P1 | serene |
| pa_renewal_70 | harmony | Renewal Day is seventy days away. | P1 | serene |
| pa_renewal_60 | harmony | Renewal Day is sixty days away. | P1 | serene |
| pa_renewal_50 | harmony | Renewal Day is fifty days away. | P1 | serene |
| pa_renewal_40 | harmony | Renewal Day is forty days away. | P2 | serene |
| pa_renewal_30 | harmony | Renewal Day is thirty days away. | P2 | serene |
| pa_renewal_20 | harmony | Renewal Day is twenty days away. | P2 | serene |
| pa_renewal_10 | harmony | Renewal Day is ten days away. | P2 | serene |
| pa_renewal_1 | harmony | Renewal Day is tomorrow. Be ready, little... be ready, Halcyon. | P2 | serene, glitch |
| pa_unperson_01 | harmony | The Vael name is not spoken in Halcyon. Thank you for your cooperation. | P1 | serene, after R1 |
| pa_glitch_01 | harmony | Little star... | P1 | glitch whisper; plays near Wren after R1 |
| pa_glitch_02 | harmony | Don't let them... Harmony through unity. | P1 | glitch, then snap |
| pa_curfew_01 | harmony | Stack Nine is being rebalanced. Riders in Stack Nine, please rest. | P2 | serene, horrifying |

## 5. Barks (reusable)

### Mara: dispatcher, contract events (P0)
| key | voice | line | P | style |
|---|---|---|---|---|
| b_mara_accept_01 | mara | Job's yours. Don't make me regret it. | P0 | |
| b_mara_accept_02 | mara | Good pick. Easy money, if anything's easy. | P0 | |
| b_mara_accept_03 | mara | Right. Go on then. | P0 | |
| b_mara_success_01 | mara | Nicely done. Credits are in your account. | P0 | pleased |
| b_mara_success_02 | mara | Clean work. I'll tell the client you're a professional. I'll lie. | P0 | dry |
| b_mara_success_03 | mara | That's the job. Come back for another. | P0 | |
| b_mara_fail_01 | mara | Well, that's gone sideways. Shake it off. | P0 | sigh |
| b_mara_fail_02 | mara | Client's not happy. Neither am I. Next one. | P0 | |
| b_mara_twist_01 | mara | Hang on. That's not what I was told. | P0 | alarmed |
| b_mara_twist_02 | mara | The client lied. Of course the client lied. | P0 | exasperated |
| b_mara_ambush_01 | mara | Company, Wren! Heads up! | P0 | urgent |
| b_mara_lowhp_01 | mara | You're coming apart. Back off and patch up. | P0 | worried |
| b_mara_heat_01 | mara | Wardens are sniffing around. Keep your head down. | P0 | |
| b_mara_heat_02 | mara | You've got half the city looking for you. Lose them. | P1 | |
| b_mara_story_01 | mara | Something new came in for you. Marked gold. Come see me. | P0 | serious |
| b_mara_levelup_01 | mara | Look at you, getting good at this. | P0 | proud |
| b_mara_timer_01 | mara | Clock's ticking. Move it. | P0 | |
| b_mara_stealth_01 | mara | Nobody saw you. That's the bonus, that is. | P1 | |

### HIRA: rental assistant (P0)
| key | voice | line | P | style |
|---|---|---|---|---|
| b_hira_loot_01 | hira | Ooh, shiny! Sent straight to your Warehouse! | P0 | |
| b_hira_loot_up_01 | hira | That's an upgrade! Tap equip, it's free! Unlike most things! | P0 | |
| b_hira_loot_rare_01 | hira | Oh wow. Oh wow! That one's glowing purple. That's the good glow! | P0 | excited |
| b_hira_levelup_01 | hira | Level up! You're doing amazing, sweetie! That's a direct quote from our marketing team. | P0 | |
| b_hira_fee_01 | hira | Friendly reminder: your shift rental fee has been deducted. Thank you for choosing HireFrame! | P0 | ad-read |
| b_hira_fee_02 | hira | Your balance is low. HireFrame has noted your balance. HireFrame notes everything. | P0 | slightly ominous |
| b_hira_lowhp_01 | hira | Integrity critical! Damage beyond normal wear and tear may void your warranty! | P0 | alarmed |
| b_hira_wreck_01 | hira | Frame wrecked. Re-linking. Don't worry, it happens to the best of us. Mostly to you, though. | P0 | |
| b_hira_idle_01 | hira | Did you know? HireFrame Premium includes working cup holders. | P0 | ad |
| b_hira_idle_02 | hira | Standing still is a great time to open the contract board! Just saying! | P0 | |
| b_hira_idle_03 | hira | Mm-mm, mm-mm... Oh! I'm not humming. I'm defragmenting. | P1 | hums, flustered |
| b_hira_skill_01 | hira | Sponsored content, activate! | P0 | bright |
| b_hira_warehouse_01 | hira | Opening your Warehouse link! | P0 | |
| b_hira_stealth_01 | hira | Shh. We are a quiet, discreet rental. | P0 | whisper |
| b_hira_ownframe_01 | hira | This frame is so much nicer than me. It's fine. I'm fine. | P1 | |

### Civilians (P0: two voices; more later)
| key | voice | line | P | style |
|---|---|---|---|---|
| b_civ_greet_01 | civ_f1 | What a glorious morning. Isn't it always? | P0 | airy |
| b_civ_greet_02 | civ_m1 | Afternoon, rider. Lovely day for it. | P0 | |
| b_civ_flee_01 | civ_f1 | Oh! Oh, how dreadful. Somebody call a Warden. | P0 | alarmed, posh |
| b_civ_flee_02 | civ_m1 | Whoa, whoa, not near me, pal! | P0 | |
| b_civ_rumour_01 | civ_m1 | My granddad swore the moon used to be a different shape. Senile, bless him. | P1 | clue, casual |
| b_civ_rumour_02 | civ_f1 | Have you ever noticed the waterfalls never run dry? Marvellous engineering. | P1 | clue |
| b_civ_rumour_03 | civ_f2 | Stack Nine went dark again last night. Nobody says anything. | P1 | clue, weary |
| b_civ_rumour_04 | civ_m2 | Gold ones don't ever log off. Watched one stand in the rain for six hours. | P1 | clue, mutter |
| b_civ_worker_01 | civ_f2 | Twelve-hour shift. Can't feel my real legs. | P1 | tired |
| b_civ_worker_02 | civ_m2 | Mind the mop, rental. | P1 | |

### Enemies (P0: thug and warden)
| key | voice | line | P | style |
|---|---|---|---|---|
| b_thug_aggro_01 | thug_m | Get 'im! | P0 | shout |
| b_thug_aggro_02 | thug_f | Rental's lost! Scrap it! | P0 | shout |
| b_thug_aggro_03 | thug_m | Wrong plaza, tin can! | P0 | |
| b_thug_hurt_01 | thug_m | Argh! Me paint job! | P0 | |
| b_thug_death_01 | thug_f | Tell Kettle... ugh. | P0 | |
| b_thug_search_01 | thug_m | Where'd it go? Check behind the fountain. | P0 | stealth search |
| b_thug_lost_01 | thug_f | Nothing. Probably a rat. | P0 | |
| b_warden_spot_01 | warden_m | Halt. You are in violation of civic harmony. | P0 | radio |
| b_warden_spot_02 | warden_f | Rider identified. Engaging. | P0 | radio |
| b_warden_search_01 | warden_m | Suspect lost. Sweeping sector. | P0 | radio |
| b_warden_backup_01 | warden_f | Requesting support at my location. | P0 | radio |
| b_warden_death_01 | warden_m | Unit down... | P0 | radio, static |
| b_unlinked_aggro_01 | unlinked | You're Concord's dog now? Pity. | P2 | |
| b_choir_aggro_01 | choir | Heir located. Heir will be returned. | P2 | unison |
| b_choir_death_01 | choir | Harmony... | P2 | unison, fading |

### Vendors (P0: Sal and Ottoline core)
| key | voice | line | P | style |
|---|---|---|---|---|
| b_sal_open_01 | sal | Sal Venn! What are we buying today? | P0 | |
| b_sal_buy_01 | sal | Pleasure doing business! No refunds, all the love. | P0 | |
| b_sal_poor_01 | sal | Ooh, the account's a little light, friend. Come back soon! | P0 | |
| b_sal_frame_01 | sal | Your very own frame! That's a proud day. I'm tearing up. That's lubricant. | P0 | |
| b_ottoline_open_01 | ottoline | Fabricator's open. Don't touch anything you can't pay for. | P0 | blunt |
| b_ottoline_tune_ok_01 | ottoline | There. Purring like a proper machine. | P0 | satisfied |
| b_ottoline_tune_fail_01 | ottoline | Didn't take. Happens. Try again, it'll hold next time. | P0 | |
| b_ottoline_salvage_01 | ottoline | Scrap's scrap. I'll melt it down. | P0 | |
| b_rook_open_01 | rook | Everything's for sale in the Stacks, friend. Even the truth. Especially the truth. | P2 | |
| b_kettle_informant_01 | kettle | Psst. Rental. Got a tip, and it's piping hot. | P1 | |
