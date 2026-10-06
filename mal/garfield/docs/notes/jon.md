# jon — notes
Owns: js/actors/jon*.js, tools/jon.html

## Files
- js/actors/jon.js — createJon API (contract + extras below)
- jon_body.js — procedural geometry + skeleton (one SkinnedMesh per material: skin, cloth, shoe, hair, eye, mouth[morphs])
- jon_anim.js — pose channels (euler deg per bone + hips offset), Catmull-Rom keyed clips, procedural idle/walk/run
- jon_clips.js — all keyed clips + SEAT + CHAIR_FALL constants
- jon_face.js — expressions (brows/lids/eyes/mouth morph/jaw), talk flap, blink, dizzy stars
- jon_props.js — fallback hand props (newspaper, rolled, fork, spoon, plate, pan, bowl) + conjure poof
- tools/jon.html — turntable, clip buttons, expressions, props, hit-zone dots; `__sheet(clip,[times],{yaw,dist,ty})` contact sheets;
  harness: scratchpad shot.mjs (CDP port 9403)

## API extras / conventions (told core, levels, props)
- setMove(>0.05) cancels full-body clip; setMove(0) does not. Upper-mask clips: carry, talk, talk_angry.
- hold clips keep last pose: sit, sit_down, sit_eat, stand_up, fall_back_chair, slip_faceplant, lie_still, stunned_shake.
- SEATED: root at chair.seat (seat surface centre, +Z to table). j.sitAt(seat) → sit_down; after stand_up j.leaveSeat(scene).
- events via j.on(): step, throw{object,pos,dir,speed}, release, hit, impact, fall, conjure, bite, place, open, close, scoop, drop, thumpL/R
- hitZone rules: face if within 0.42 of face socket; butt if behind pelvis (hips-space y -0.45..0.2); leg below hips; else body. hitTest(p,r)→zone|null
- stunned_shake is seated (L9).

## DONE
- v1 body + all contract clips + face + props + tool page
- Pass 2 vs refs/jon_front.png: rolled sleeves+bare forearms, pointed collar, quiff, blush, wider shoulders, butt cheeks,
  trousers as two waist-high leg tubes (no diaper), lash lines, bigger mouth, head scale 1.08
- Clip fixes: cover_face (hands on face), cover_butt (hands on cheeks), close_window shiver = arms crossed hug,
  investigate = hands on hips, sit_eat fork reaches mouth, fingers auto-curl when holding a prop
- farm bones use euler order YXZ: farm y swings the bent forearm around the upper-arm axis (hands-on-hips = farm y -90 + uarm z 45)
- tris: high 11.5k / medium 7.3k / low 5.2k; 6 draw calls (+props)
- uses props' createNewspaper (folded for throw, rolled for whack) via dynamic import, falls back to own
- j.addClip(name, def) for custom/one-off clips (levels can author cutscene poses)

- SDF head (js/actors/jon_head.js: smooth skull+face+chin+cheeks+nose+ears, eye sockets) meshed with garfield's
  shared surfacenets+decimate; BAKED to jon_head_data.js by `node js/actors/jon_head_bake.mjs` (re-run after editing the SDF;
  falls back to runtime meshing ~1 s if the data file is missing). surfZ() ray-marches the SDF (mouth/brow placement).
- Hair: shell + 6 swept locks (side part on his left) + cowlick
- sitAt(seat, then='sit') plays sit_down then `then`; no-op re-sit if already seated
- holdProp: props sit in a grip group (GRIPS in jon_props.js); game props are returned to their previous parent on release
- tris: high ~12.2k / medium ~8.1k / low ~6.1k; update ~0.1–0.45 ms
- verified in game (level 1 wander + cutscene) — loads, walks, scratch_head etc.

- shirt stays tucked when bending (torso weights), give_bowl keeps the bowl level, scratch_head/talk_angry poses fixed

## IN PROGRESS
- (none — wave 1 done)

## NEXT (ideas for a later pass)
- shoes: laces/welt detail; pointing finger for talk_angry; deeper squat in give_bowl so the bowl reaches the floor
- per-level cutscene poses can be authored by levels with j.addClip(name, {dur, keys:[[t,{bone:[x,y,z], pos:[...]}]], face, props, ev})
- the faceplant body lies ~0.45 m in front of the root (head ~1.3 m forward)

## REQUESTS
- none open (props delivered createNewspaper({folded}))

## Testing recipe
- tools/jon.html?hideui&paused&clip=NAME&t=SEC&q=high|medium|low&yaw=&dist=&ty=&expr=&prop=
- contact sheets: window.__sheet('clip',[t...],{yaw,dist,ty,pitch,exprs:[...]}) ; harness in scratchpad shot.mjs/allsheets.sh (CDP 9403; ALWAYS cdp stop after)
- node: import jon.js directly (no DOM needed) for hitZone grids / perf
