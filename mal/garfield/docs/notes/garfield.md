# garfield — notes

## DONE
- v1 usable: `js/actors/garfield.js` implements the full contract (createGarfield({quality}) → root, update, play, setMove,
  lookAt, sockets{head,mouth,pawR,pawL,belly}, height, radius, anims, setBelly, claw, setExpression, dispose).
- Pipeline: `tools/sculpt/garfield_sculpt.js` (SDF primitives, each owned by a bone) → `node tools/sculpt/bake.mjs`
  (surface nets at 6 mm → QEM decimation to 14k/7k/3.6k tris → SDF normals, skin weights from primitive proximity,
  tone paint (cream/pink/limb), belly-fat morph target) → `js/actors/garfield_mesh.js` (generated, ~650 KB, base64).
- Rig: `js/actors/garfield_rig.js` (28 bones, identity rest rotations). Fur shader `garfield_mat.js` (stripes from
  bind-pose coords, branch-free so fwidth AA works). Clips `garfield_anim.js` (code-driven poses, crossfaded).
- Face: separate eyeballs (shader pupils), animated upper/lower lids with lash line, pink nose, dynamic mouth ribbon
  (line → open lens with tongue + fangs), whiskers, claws on front paws.
- Secondary: belly spring (body accel + touchdown impulse), tail lag on yaw/vertical, ear flicks, auto squash on
  touchdown, blink.
- Tool: `tools/garfield.html` (clips, expressions, belly, speed, claws, look-at, walk-circle, hop, quality, views).
  Deterministic stills: `?clip=sit&t=1.2&yaw=..&pitch=..&dist=..&ty=..&belly=..&expr=..&hideui`.
- `tools/sculpt/shot.mjs <outdir> "<query>"...` screenshots via CDP port 9402.

## Behaviour notes for core/levels
- One-shot clips (jump_up, land, scratch, spit, pounce, knockback, whacked, interact, belly_bounce, idle_bored) play once
  regardless of `loop`, resolve their promise at the end and fade back to locomotion (jump_up → fall).
- Looping clips (idle/walk/run, fall, sit, sleep, push, smug, chew, eat, celebrate) loop unless `{once:true}`.
- setMove(speed) re-enters locomotion from any looping clip or a finished one-shot; a one-shot mid-play is not cut.
- Unknown clip names warn and resolve immediately.

- Pass 2 (all reviewed in screenshots): bolder forehead (3) + cheek stripes, darker stripes, lids/lower lids reworked,
  expressions checked (smug/happy/disgust/shock/sleepy/chew), fat belly morph now huge (beach-ball at 1, leg rings hidden
  on the fat), thicker legs, eat/sleep/push heads no longer buried, belly-drum celebrate, bigger scratch, run gait
  with flight phase. LODs 14k/7k/3.6k look near-identical.
- Machine is overloaded: always `cdp stop 9402` after each shot run (shot.mjs runs need it started first).

- Pass 3 (manager feedback): behind view fixed: the tail root is now lower at the rump edge with a sideways '?' carriage, there are no
  bullseye rings on the rear (bands fade on rear-facing rest normals), stripes cross the back, the haunches are striped from behind,
  shoulder blades and rump-top masses added. Cream toe tips. Scratch is a real high-to-low cross swipe now, and the claws are bigger.
- Shell fur exists but is OPT-IN (`createGarfield({shellFur:true})`): it looked grainy, so it's off by default.
- Checked in the real game (?level=1&skip=1): reads well from the behind cam. About 58 fps at high in the full scene.

- Pass 4: spit now pushes forward with the mouth open, tongue and fangs showing. Sleep is a loaf with the chin on the paws. Smug is a scheming
  paws-together sit. Yawn, eat and push all reviewed.

## IN PROGRESS
- nothing (wave-1 piece is complete)

## NEXT (ideas if more time)
- bigger mouth shapes for chomp; dizzy eyes in whacked; ear-inner fur tufts; tune gait speeds against the real controller feel.
- If the sculpt changes: `node tools/sculpt/bake.mjs` (slow when the machine is loaded), then screenshot with
  `~/.claude/bin/cdp start --port 9402 -- --use-angle=metal; node tools/sculpt/shot.mjs <dir> "<query>"...; cdp stop 9402`,
  then `python3 tools/sculpt/sheet.py <dir> out.png 4` for a contact sheet.

## REQUESTS
- none
