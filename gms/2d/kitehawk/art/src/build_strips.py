#!/usr/bin/env python3
"""Builds the strip / atmosphere generation manifests for P3.

  python3 build_strips.py            -> writes s_strips.json, s_atmos.json

Every 2048-wide shipped strip is built from TWO distinct 1024-wide plates
cross-faded together, and every strip layer ships variants A and B, so one
(act, layer) needs four plates. That is what buys an 8192 wu period with no
mirror axis (ART.md §4, gate A3/A4).

Stem is D34, verbatim. Act-exclusive strips are prompted in the act palette
(ART.md §4); shared atmosphere plates are not.
"""
import json, pathlib

STEM = ("Hand-painted gouache painting in the style of a WWI aviation poster and a "
        "Studio Ghibli aviation film, visible brush strokes and paper grain, "
        "romantic and beautiful, ")

# The isolation tail for a strip. The v1 wording ("everything above the skyline a flat
# uniform neutral mid grey field") produced a PAINTED sky wash on the horizon plates and a
# tilted skyline on the ground plates -- neither is keyable and neither butts at a join.
# What fixed both, measured on pr_hor_v2 / pr_gm_v2: say the skyline is level and say the
# grey field is featureless and name its share of the frame. See P3_NOTES §2.
def band(share):
    return (", the land forming a band along the bottom of the frame with its skyline running "
            "straight and level all the way across, the entire upper " + share + " of the frame "
            "a completely flat uniform featureless neutral mid grey field with absolutely "
            "nothing painted in it, no sky, no sky wash, no sky gradient, no clouds, no sun, "
            "no moon, no aircraft, no birds, no lettering, no cast shadow, no paper mount, "
            "no border, nothing else in the frame")

SHARE = {'hor': "half", 'gf': "third", 'gm': "third"}

# R-03's theatres, and ART.md §6's palette words per act (act 3/4/5 re-authored).
ACTS = {
 1: dict(name="flanders", light="flat cold overcast spring midday light, no visible sun, weak "
                                "green-white daylight and dead cool grey shadow",
         pal="near-monochrome cold umber, olive drab, dirty grey-green and chalk white, "
             "very low saturation"),
 2: dict(name="somme", light="warm cream summer morning sunlight raking from the left, long "
                             "cool violet shadows",
         pal="dusty gold, warm ochre, cream and violet, high summer"),
 3: dict(name="massif", light="low warm autumn late-afternoon sunlight raking hard from the "
                              "left, near-black shadow, one cold blue-green accent",
         pal="burnt orange, russet, warm ochre and near-black, with cold blue-green in the "
             "deepest distance"),
 4: dict(name="winterfront", light="cold blue winter moonlight from above, near-black shadow, "
                                   "one small hot orange fire glow far off",
         pal="near-black, deep indigo, cold silver-blue snow, one small hot orange"),
 5: dict(name="burning", light="dull red dusk sun low behind smoke, hot orange key and "
                               "black-red shadow",
         pal="hot orange, burnt red, ash grey and black-red, a sky full of smoke"),
}

# subject clauses per (act, layer). D56: variation comes from naming contrasting
# STATES, not from "no two alike" alone -- so every multi-item clause names two.
SUBJ = {
 (1,'hor'): "a low band of dead flat waterlogged drowned Flanders polder seen from the air, a broken treeline of "
            "shattered stumps and one distant church tower, all different heights, some snapped "
            "off short and some still standing tall",
 (1,'gf'):  "a flooded battlefield plain seen from the air, flat grey-green water in the shell "
            "craters, torn wire belts, drab field patches, some craters fresh and sharp-lipped "
            "and some old and half grassed over",
 (1,'gm'):  "a front line seen from a shallow oblique aerial view, zig-zag trench lines, "
            "duckboard tracks, sandbag parapets, a smashed farm, wire pickets, some sections "
            "freshly dug and raw and some old and collapsing",
 (2,'hor'): "a low band of distant rolling chalk downland and a hazy treeline seen from the air, soft "
            "layered ridges, some ridges near and firm and some far and dissolved into haze",
 (2,'gf'):  "summer farmland seen from the air, small irregular fields in wheat gold and green, "
            "hedgerows, a winding river, a chalk road, small copses, some fields cut to stubble "
            "and some still standing in crop",
 (2,'gm'):  "a Somme valley floor seen from a shallow oblique aerial view, a ruined village with "
            "a church tower, poplar rows along a road, an orchard, a stone bridge, shell holes, "
            "some buildings intact and some roofless and burnt",
 (3,'hor'): "a low band of high jagged autumn mountain peaks seen from the air, layered receding ridges, "
            "some peaks sharp and near and some soft and blue with distance",
 (3,'gf'):  "an autumn mountain valley seen from the air, larch forest turning gold, bare rock "
            "scree, a river gorge, terraced meadows, some slopes still wooded and some stripped "
            "to bare stone",
 (3,'gm'):  "an alpine valley floor seen from a shallow oblique aerial view, a stone village on "
            "a spur, a viaduct, a mountain road switchbacking, timber barns, some barns whole "
            "and some collapsed under old snow",
 (4,'hor'): "a low band of snow-covered ridges at night under moonlight seen from the air, layered receding "
            "silhouettes, some ridges near and near-black and some far and pale silver",
 (4,'gf'):  "a snow-covered winter plain at night seen from the air, frozen ditches, black "
            "hedge lines, drifted fields, some fields smooth and untouched and some cut up by "
            "tracks",
 (4,'gm'):  "a blacked-out winter town seen from a shallow oblique aerial view at night, a "
            "railway yard, a frozen canal, dark roofs under snow, one small burning building, "
            "some buildings dark and some faintly lit",
 (5,'hor'): "a low band of far ridges lost in smoke at dusk seen from the air, layered burning ridges, some smoke columns "
            "thick and near-black and some thin and drifting apart",
 (5,'gf'):  "a scorched plain at dusk seen from the air, burnt fields, craters, oil fires, "
            "black smoke drifting sideways, some fires fresh and bright and some burnt down to "
            "dull embers",
 (5,'gm'):  "a burning industrial town seen from a shallow oblique aerial view at dusk, "
            "collapsed factory sheds, chimneys, a wrecked marshalling yard, some chimneys still "
            "standing and some fallen across the tracks",
}

SIZE = {'hor': (1024, 192), 'gf': (1024, 256), 'gm': (1024, 384)}
# seed base per ART.md §7: act I 1000 .. act V 5000
LAYER_IDX = {'hor': 10, 'gf': 30, 'gm': 50}


def strips():
    out = []
    for act, a in ACTS.items():
        for lay in ('hor', 'gf', 'gm'):
            w, h = SIZE[lay]
            for k in range(4):                 # A1 A2 B1 B2
                seed = act * 1000 + LAYER_IDX[lay] + k
                out.append({
                    "out": f"s{act}_{lay}_{'ab'[k // 2]}{k % 2 + 1}",
                    "w": w, "h": h, "steps": 16, "seed": seed,
                    "model": "flux2-klein-4b",
                    "class": "strip", "act": act, "layer": lay,
                    "prompt": STEM + SUBJ[(act, lay)] + ", " + a['light'] + ", "
                              + a['pal'] + band(SHARE[lay]),
                })
    return out


# --- shared atmosphere: CLOUD_FAR cirrus, CLOUD_NEAR wisps, FG_OCCLUDE shreds ---
CLOUDLIGHT = (", sculpted painterly volume, warm cream sunlit top-left face and cool violet-grey "
              "shadowed underside, crisp readable silhouette")
ISO = (", completely isolated on a flat uniform neutral mid grey background, 2D game asset sheet, "
       "no sky gradient, no ground, no aircraft, no sun, no moon, no cast shadow, no lettering, "
       "every mark well inside the sheet with a wide empty grey margin all around it, "
       "nothing touching or near the edge of the frame")


def atmos():
    out = []
    # CLOUD_FAR: high cirrus veil, a strip -- 4 plates, two per variant.
    for k in range(4):
        out.append({
            "out": f"a_cirrus_{'ab'[k // 2]}{k % 2 + 1}", "w": 1024, "h": 256,
            "steps": 16, "seed": 80 + k, "model": "flux2-klein-4b",
            "class": "strip", "layer": "cirrus",
            "prompt": STEM + "a long wide band of very high thin cirrus, drawn-out fibrous "
                      "mare's-tail streaks and torn feathered sheets far above everything, "
                      "some streaks long and combed straight and some short and curled, "
                      "painted as dry-brush drags of thin pale paint" + CLOUDLIGHT +
                      ", a long wide horizontal panoramic band running unbroken from the left "
                      "edge to the right edge of the frame, the rest of the frame a flat uniform "
                      "neutral mid grey field, no sky gradient, no ground, no horizon, no sun, "
                      "no aircraft, no lettering, no cast shadow, no paper mount, no border",
        })
    # CLOUD_NEAR: torn near wisps, cut apart by connected component.
    for k in range(2):
        out.append({
            "out": f"a_wisp_{k+1}", "w": 768, "h": 512, "steps": 16, "seed": 90 + k,
            "model": "flux2-klein-4b", "class": "sheet", "layer": "cloudnear",
            "prompt": STEM + "a study sheet of seven torn scraps and wisps of thin pale cloud "
                      "passing close by, all different shapes and sizes, some long and combed "
                      "into thin streaming tails and some short and curled and lumpy, each one "
                      "painted as a soft dry-brush drag of thin pale paint, irregular scattered "
                      "layout, no two alike" + ISO,
        })
    # FG_OCCLUDE: near-black ragged shreds (P3 / gate A6).
    for k in range(2):
        out.append({
            "out": f"a_shred_{k+1}", "w": 768, "h": 512, "steps": 16, "seed": 95 + k,
            "model": "flux2-klein-4b", "class": "sheet", "layer": "fgocclude",
            "prompt": STEM + "a study sheet of six ragged shreds of very dark smoke and torn "
                      "storm cloud, all different shapes and sizes, some broad and heavy and "
                      "some thin and drawn out into tatters, each one painted as a single flat "
                      "torn-edged mark of thick opaque near-black paint with no interior detail, "
                      "irregular scattered layout, no two alike" + ISO,
        })
    return out


if __name__ == "__main__":
    d = pathlib.Path(__file__).parent
    s = strips()
    json.dump(s, open(d / "s_strips.json", "w"), indent=1)
    json.dump(atmos(), open(d / "s_atmos.json", "w"), indent=1)
    # a 6-plate validation slice: act II, all three layers, first two sources
    val = [e for e in s if e["out"] in
           ("s2_hor_a1", "s2_hor_a2", "s2_gf_a1", "s2_gf_a2", "s2_gm_a1", "s2_gm_a2")]
    json.dump(val, open(d / "s_validate.json", "w"), indent=1)
    print(f"s_strips {len(s)}  s_atmos {len(atmos())}  s_validate {len(val)}")
