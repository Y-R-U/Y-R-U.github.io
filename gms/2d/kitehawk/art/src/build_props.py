#!/usr/bin/env python3
"""TERRAIN small props — the D52 re-attempt.

D51/D52 are the state of play: `poster.js` works, props still fail blind critics at
3.33 against 7.67-8.00, and TUNING THE BAKE MOVED THE SCORE NOT AT ALL while the
critics' complaints changed completely. So the remaining gap is in GENERATION, and D52
lists five causes. This manifest fixes the four that are generation-side; the fifth
(contact shadows) is a renderer requirement and is a REQUEST, not a prompt.

  1. painted-in ground despite `no ground`  -> in-prompt negation (D56: the FIELD is
     inert, a `no X` clause inside the prompt is not) PLUS the bake's largest-connected-
     component rule, which is already measured to remove exactly this (it took 4,180 px
     of grass strip off `h66_chateau`).
  2. amputated structure                    -> 9B on every prop with a load-bearing part
     tree. This is D52's carve-out to D36 and D36 already says 9B is the structure model.
  3. instanced clones                       -> D35's variation clause, stated the way D56
     corrected it: name two CONTRASTING STATES, not "no two alike" on its own.
  4. period drift (3 of 8 assets post-1930) -> an explicit period anchor naming the
     materials, plus in-prompt negation of the specific anachronisms critics named.
  5. no shared key-light direction          -> ART_PROPS §4 names the cheap remedy and
     records that it was never tested: give the neutral light a DIRECTION without giving
     it a colour. That is what `even overcast light from the upper left` does here. It
     keeps D53's verdict (neutral saturation, ramp supplies act colour) intact.
"""
import json, pathlib

STEM = ("Hand-painted gouache painting in the style of a WWI aviation poster and a "
        "Studio Ghibli aviation film, visible brush strokes and paper grain, "
        "romantic and beautiful, ")

# D53: keep §7's neutral-light rule and lean on poster.js -- but give it a DIRECTION.
LIGHT = (", even overcast light from the upper left, low saturation, neutral grey-blue")

PERIOD = (", Western Front 1916, weathered timber and riveted iron and canvas, spoked "
          "wooden wheels, hand-forged fittings, no pneumatic tyres, no modern machinery, "
          "no plastic, no corrugated plastic, nothing later than 1918")

ISO = (", completely isolated on a flat uniform neutral mid grey background, 2D game asset "
       "cutout, no ground, no grass, no earth, no groundline, no base, no plinth, no rubble "
       "at the bottom, no sky, no cast shadow, no shadow on the floor, no lettering, no "
       "signature, no paper mount, no border, nothing else in the frame")

NINE = "flux2-klein-9b-mlx-4bit"
FOUR = "flux2-klein-4b"

# (id, subject, model, preset, seed)
# 9B wherever the subject has a load-bearing part tree -- D52 cause 2. The five props a
# critic named as structurally amputated (watchtower legs, gun trail, MG support) are all
# in that class.
PROPS = [
 ("t_aagun", "a WWI anti-aircraft field gun on a wheeled carriage, the complete gun from "
             "muzzle to trail spade, a long thin barrel elevated steeply, a shield, two "
             "spoked wheels and a split trail resting on the ground behind it, the whole "
             "gun inside the frame with nothing cut off", NINE, "mech", 6101),
 ("t_hangar", "a WWI canvas Bessonneau aeroplane hangar, a timber truss frame with canvas "
              "stretched over it and wide doors open at one end, the whole building inside "
              "the frame with nothing cut off", NINE, "struct", 6102),
 ("t_tower", "a WWI wooden observation tower, four braced timber legs standing on their "
             "own feet with the complete cross-bracing visible all the way down to the "
             "bottom of every leg, a small railed platform and a ladder, the whole tower "
             "inside the frame with nothing cut off", NINE, "struct", 6103),
 ("t_mgpost", "a WWI machine-gun post, a water-cooled machine gun on a low tripod behind a "
              "sandbag parapet, both tripod legs and the rear leg complete and resting on "
              "the same level, an ammunition box beside it, the whole post inside the frame",
              NINE, "mech", 6104),
 ("t_tents", "a group of five WWI canvas bell tents, all different shapes and sizes, some "
             "newly pitched with taut clean canvas and some old and sagging with patched "
             "and stained canvas, irregular scattered arrangement, no two alike",
             FOUR, "struct", 6105),
 ("t_drums", "a stack of seven WWI fuel drums and jerricans, all different shapes and sizes "
             "and ages, some new and smooth with clean hoops and some old and dented and "
             "rusted through with the hoops sprung, stacked irregularly, no two alike",
             FOUR, "mech", 6106),
 ("t_wagon", "a WWI horse-drawn limber wagon, a plank body on two large spoked wooden "
             "wheels with every spoke complete, a drawbar sloping down at the front, the "
             "whole wagon inside the frame with nothing cut off", NINE, "mech", 6107),
 ("t_searchlight", "a WWI carbon-arc searchlight, a large round mirror drum on a yoke "
                   "mounted on a four-legged timber trestle standing on its own feet, "
                   "cables coiled at the base, the whole searchlight inside the frame",
                   NINE, "mech", 6108),
 ("t_wire", "a run of WWI barbed wire entanglement, six iron screw pickets carrying tangled "
            "wire, all different heights and leans, some pickets upright and freshly driven "
            "and some bent over and half torn out with the wire sagging loose, irregular "
            "spacing, no two alike", FOUR, "mech", 6109),
 ("t_hut", "a WWI corrugated iron Nissen hut, a half-cylinder of curved iron sheet with a "
           "planked end wall, a stove pipe and a small door, the whole hut inside the frame "
           "with nothing cut off", NINE, "struct", 6110),
 ("t_windsock", "a WWI airfield windsock, a tapered canvas sleeve on a hoop at the top of a "
                "single guyed timber mast standing on its own feet, three guy ropes running "
                "down to pegs, the whole mast inside the frame from top to bottom",
                NINE, "mech", 6111),
 ("t_wreck", "a wrecked WWI biplane lying on its nose, one wing folded and torn with the "
             "fabric split off the ribs, the other wing intact, a bent propeller, the whole "
             "wreck inside the frame with nothing cut off", NINE, "struct", 6112),
]


def build():
    out = []
    for pid, subj, model, preset, seed in PROPS:
        out.append({
            "out": pid, "w": 768, "h": 512, "steps": 16, "seed": seed,
            "model": model, "class": "prop", "preset": preset,
            "prompt": STEM + subj + LIGHT + PERIOD + ISO,
        })
    return out


if __name__ == "__main__":
    d = pathlib.Path(__file__).parent
    j = build()
    json.dump(j, open(d / "t_props.json", "w"), indent=1)
    print(f"t_props {len(j)}  ({sum(1 for e in j if '9b' in e['model'])} on 9B)")
