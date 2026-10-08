# cast — notes (wave 3)
Owns js/actors/* (garfield*, jon*, shared/*, odie*, lyman*, human*, mice*), tools/sculpt/*, tools/{garfield,jon,odie,lyman}.html. CDP 9402.

## DONE
- Human refactor: human_head.js (makeHead: SDF head factory), human_body.js (buildHuman(quality, look) with stage hooks:
  torso/sleeve/leg/pelvis/hair/extras + palette), human.js (createHumanActor — was createJon's body; + variants/setOutfit/
  setFur, sockets.carry, ALIAS chase→run eat→sit_eat, moveOk clips), human_clips.js (Ch2 clips for all humans).
  jon.js / jon_body.js / jon_head.js are thin wrappers. **Jon is byte-identical**: fingerprint script (scratchpad
  cast/fp.mjs hashes buildJon geometry ×3 LODs + buildClips) = 28895b99… before and after.
- Lyman v1 (lyman.js, lyman_head.js): big nose, push-broom moustache, black pompadour + sideburns, bushy brows; olive
  sweater vest/cream shirt/grey slacks; disco variant (white suit, lapels, huge collar, medallion, flares).
- Delivery man v1 (human_delivery.js, delivery_head.js): navy courier uniform + cap. createHuman({kind:'delivery'}) in human.js.
- Props: mug, suitcase, box fallbacks (jon_props.js); 'box'/'tv' two-handed → sockets.carry.
- tools/lyman.html (?who=lyman|delivery|jon&outfit=disco&fur=).
- Messaged game with the API.

- Odie v1: odie_rig.js, tools/sculpt/odie_sculpt.js + bake_odie.mjs → odie_mesh.js (11.5k/6k/3.2k tris), odie.js
  (fur shader from tone attr: black ears/tail by bone weight, spot paint, pink tongue), odie_anim.js (all brief clips +
  _hold loops), ear/tongue/tail springs, socks, events. tools/odie.html. Messaged game.

- Garfield: garfield_clips2.js (shed, head_in_corner, startled_jump, meow_loud, poke, seethe+setSeethe, loved+hearts,
  pull, play_socks, blow_whistle, throw_behind, sit_table, hug_squeezed), new EXT puff/hearts/sqX, clip events g.on(),
  setBald(bool) (uBald in garfield_mat: pink skin, no stripes; lids/whiskers too). tools/garfield.html ?bald&seethe=.
- Humans also got sneak (moveOk), jump_out, wipe (game request).
- Mice: mice.js createMice({count}) one InstancedMesh; setPaths/scurry/wander/show/stop. Preview: tools/odie.html?mice
- Lyman/delivery heads baked (lyman_head_data.js, delivery_head_data.js).
- Regression 2026-10-08: play.mjs 1-10 all PASS, catch PASS (port 9402). Jon fingerprint unchanged.

## IN PROGRESS
- nothing

## NEXT / rough spots
- Lyman back hair reads helmet/mop-like from behind; disco shirt V shading muddy.
- Odie: no visible mouth line when closed; stuck_wall/land_head root offsets tuned by eye only (check in the real house);
  walk gait speeds untuned vs AI; puff tail on Garfield looks blobby at full seethe.
- Delivery man nose is big (shared cartoon style); fine.
- Clips verified with stills (scratchpad cast/*.png); not yet seen in the real level lighting.

## Testing
- scratchpad cast/oshot.sh <name> <cols> "query"... (BASE env selects tools page; starts+stops CDP 9402)
- node scratchpad cast/fp.mjs → Jon fingerprint must stay 28895b999bc2047bfdde2d1eafb9e699ed258eeb
- rebake Odie: node tools/sculpt/bake_odie.mjs (~20 s); heads: node js/actors/human_head_bake.mjs lyman|delivery

## REQUESTS
- none
