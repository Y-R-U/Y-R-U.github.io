#!/usr/bin/env python3
"""Generate the 20 built-in levels (levels/levelNN.json + levels/index.json).

Each level is a hand-designed path + theme + palette; the wave list is built
from a threat budget that ramps within the level, spent on the level's enemy
palette (deterministic per level). Re-run after tuning:
    python3 tools/gen_levels.py
"""
import json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "levels")

# threat ~ how much tower firepower a unit soaks (hp + armor + support value)
THREAT = {"shambler": 26, "rotter": 25, "bones": 36, "raider": 72, "maiden": 125,
          "knight": 310, "shade": 60, "mummy": 170, "warlock": 290,
          "boneking": 950, "frostjarl": 1700, "gravelord": 2700, "hollowking": 4400}
GAP = {"shambler": 1.0, "rotter": 0.85, "bones": 0.85, "raider": 1.1, "maiden": 1.3,
       "knight": 1.9, "shade": 0.55, "mummy": 1.7, "warlock": 2.4}

def waves_for(num, base, palette, npaths, rng, boss=None, extra_boss=None):
    """extra_boss: {wave_index(1-based): boss_type} reprises (level 20)."""
    out = []
    for i in range(num):
        budget = base * (1 + 0.55 * i)
        groups = []
        is_boss_wave = boss and i == num - 1
        if is_boss_wave:
            groups.append({"type": boss, "n": 1, "gap": 1, "delay": 0, "path": 0})
            budget *= 0.55  # escort
        if extra_boss and (i + 1) in extra_boss:
            b = extra_boss[i + 1]
            groups.append({"type": b, "n": 1, "gap": 1, "delay": 2, "path": rng.randrange(npaths)})
            budget *= 0.6
        # spend the budget on 1-3 palette picks (weighted)
        picks = rng.sample(palette, k=min(len(palette), rng.choice([1, 2, 2, 3])))
        # always lead with something cheap so waves don't start empty
        share = budget / len(picks)
        delay = 2.5 if is_boss_wave else 0
        for t in picks:
            n = max(1, min(30, round(share / THREAT[t])))
            groups.append({"type": t, "n": n, "gap": GAP[t],
                           "delay": round(delay, 1), "path": rng.randrange(npaths)})
            delay += n * GAP[t] * 0.45 + 2.0
        out.append({"groups": groups})
    return out


def blocked_cells(grid, paths, count, rng):
    """Scatter no-build decor cells away from the path polylines."""
    def seg_dist(px, pz, ax, az, bx, bz):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
        return ((px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2) ** 0.5
    cells, tries = [], 0
    while len(cells) < count and tries < 400:
        tries += 1
        cx, cz = rng.randrange(grid[0]), rng.randrange(grid[1])
        d = min(seg_dist(cx, cz, *a, *b)
                for path in paths for a, b in zip(path, path[1:]))
        if d > 1.8 and [cx, cz] not in cells:
            cells.append([cx, cz])
    return cells


L = []  # (name, theme, grid, paths, palette, waves, gold, lives, boss, tip, decor, extra)

L.append(("The Green Road", "meadow", (20, 14),
          [[[0, 7], [7, 7], [7, 3], [14, 3], [14, 9], [19, 9]]],
          ["shambler", "rotter"], 6, 250, 20, None,
          "Ballistas are cheap and fast — put two on the first bend.", 0.55, None))
L.append(("Miller's Bend", "meadow", (20, 14),
          [[[0, 3], [15, 3], [15, 10], [0, 10]]],
          ["shambler", "rotter", "bones"], 7, 260, 20, None,
          "Towers between the two roads hit both directions.", 0.55, None))
L.append(("The Crossroads", "meadow", (20, 14),
          [[[0, 11], [5, 11], [5, 2], [11, 2], [11, 11], [16, 11], [16, 6], [19, 6]]],
          ["shambler", "rotter", "bones", "raider", "shade"], 8, 280, 20, None,
          "Shades sprint. A Frost Spire near the gate slows them down.", 0.6, None))
L.append(("Long Meadow", "meadow", (20, 14),
          [[[0, 1], [18, 1], [18, 6], [1, 6], [1, 11], [12, 11], [12, 13], [19, 13]]],
          ["shambler", "bones", "raider", "maiden"], 9, 300, 20, None,
          "A long road is your friend — catapults love it.", 0.6, None))
L.append(("The Bone King's Gate", "meadow", (20, 14),
          [[[0, 2], [17, 2], [17, 11], [3, 11], [3, 5], [13, 5], [13, 8], [19, 8]]],
          ["rotter", "bones", "raider", "maiden"], 10, 330, 20, "boneking",
          "A boss marches at the end. Save gold for upgrades — they beat new towers.", 0.6, None))

L.append(("Amber Hollow", "autumn", (20, 14),
          [[[0, 10], [6, 10], [6, 4], [13, 4], [13, 10], [19, 10]]],
          ["shambler", "rotter", "bones", "raider", "mummy"], 8, 330, 20, None,
          "Mummies regenerate — focus fire, don't chip.", 0.65, None))
L.append(("Harvest Row", "autumn", (22, 14),
          [[[0, 2], [19, 2], [19, 7], [2, 7], [2, 12], [21, 12]]],
          ["shambler", "bones", "raider", "maiden", "shade", "mummy"], 9, 350, 20, None,
          "Cannons splash — aim them where the horde bunches up.", 0.6, None))
L.append(("The Forked Road", "autumn", (20, 14),
          [[[0, 3], [10, 3], [10, 7], [19, 7]],
           [[0, 11], [10, 11], [10, 7], [19, 7]]],
          ["shambler", "rotter", "bones", "raider", "maiden", "shade"], 10, 400, 20, None,
          "Two roads! Towers near the merge point cover both.", 0.6, None))
L.append(("Wolfswood", "autumn", (20, 14),
          [[[0, 13], [4, 13], [4, 5], [9, 5], [9, 12], [15, 12], [15, 3], [19, 3]]],
          ["bones", "raider", "maiden", "shade", "mummy", "warlock"], 10, 420, 20, None,
          "Warlocks heal the horde — arcane chains reach them in the pack.", 0.65, None))
L.append(("Jarl's Crossing", "autumn", (22, 14),
          [[[0, 2], [14, 2], [14, 11], [21, 11]],
           [[0, 11], [7, 11], [7, 2], [14, 2], [14, 11], [21, 11]]],
          ["rotter", "bones", "raider", "maiden", "shade", "mummy", "warlock"], 11, 450, 20, "frostjarl",
          "The Frost Jarl shrugs off small bolts. Bring cannon and catapult.", 0.6, None))

L.append(("First Snow", "winter", (20, 14),
          [[[0, 7], [8, 7], [8, 2], [15, 2], [15, 10], [19, 10]]],
          ["shambler", "bones", "raider", "maiden", "knight"], 10, 450, 20, None,
          "Dread Knights ignore 6 damage per hit — small arrows bounce off.", 0.6, None))
L.append(("Frozen Ford", "winter", (22, 14),
          [[[0, 1], [20, 1], [20, 6], [1, 6], [1, 11], [21, 11]]],
          ["rotter", "bones", "raider", "maiden", "knight", "shade"], 11, 480, 20, None,
          "Chill the ford. Frost makes every other tower hit twice as often (in effect).", 0.6, None))
L.append(("The Gauntlet", "winter", (20, 10),
          [[[0, 5], [19, 5]]],
          ["raider", "maiden", "knight", "shade", "mummy", "warlock"], 12, 560, 15, None,
          "One straight road. No tricks — just overwhelming firepower.", 0.55, None))
L.append(("Icebound Spiral", "winter", (20, 14),
          [[[0, 0], [19, 0], [19, 13], [2, 13], [2, 4], [15, 4], [15, 9], [7, 9]]],
          ["bones", "raider", "maiden", "knight", "shade", "mummy", "warlock"], 11, 520, 20, None,
          "The spiral turns past the same plots again and again — build in the middle.", 0.6, None))
L.append(("Gravelord's Barrow", "winter", (22, 14),
          [[[0, 2], [18, 2], [18, 7], [21, 7]],
           [[0, 12], [18, 12], [18, 7], [21, 7]]],
          ["bones", "maiden", "knight", "shade", "mummy", "warlock"], 12, 560, 20, "gravelord",
          "The Gravelord regenerates through thin fire. Stack damage at the merge.", 0.6, None))

L.append(("Cinder Road", "ash", (20, 14),
          [[[0, 8], [6, 8], [6, 3], [13, 3], [13, 11], [19, 11]]],
          ["shambler", "rotter", "bones", "raider", "maiden", "knight", "shade"], 12, 560, 20, None,
          "The Ashlands give little gold. Sell towers the road has passed by.", 0.7, None))
L.append(("The Ash Fork", "ash", (20, 14),
          [[[0, 2], [12, 2], [12, 7], [19, 7]],
           [[0, 12], [5, 12], [5, 7], [12, 7], [19, 7]]],
          ["bones", "raider", "maiden", "knight", "shade", "mummy", "warlock"], 12, 600, 20, None,
          "The north road is longer — the south fork bites fast. Guard it first.", 0.65, None))
L.append(("Ember Fields", "ash", (22, 14),
          [[[0, 1], [20, 1], [20, 5], [1, 5], [1, 9], [20, 9], [20, 13], [10, 13]]],
          ["raider", "maiden", "knight", "shade", "mummy", "warlock"], 13, 640, 20, None,
          "Warlocks come in numbers now. Arcane obelisks earn their keep.", 0.6, None))
L.append(("The Last March", "ash", (20, 14),
          [[[0, 2], [10, 2], [10, 7], [19, 7]],
           [[0, 7], [10, 7], [19, 7]],
           [[0, 12], [10, 12], [10, 7], [19, 7]]],
          ["bones", "raider", "maiden", "knight", "shade", "mummy", "warlock"], 14, 700, 20, None,
          "THREE roads, one gate. Hold the centre and the merge.", 0.6, None))
L.append(("The Hollow King", "ash", (22, 14),
          [[[0, 2], [19, 2], [19, 6], [2, 6], [2, 11], [14, 11], [14, 8], [21, 8]]],
          ["raider", "maiden", "knight", "shade", "mummy", "warlock"], 15, 760, 20, "hollowking",
          "Every king you felled returns to march before the Hollow King himself.", 0.65,
          {"extra_boss": {5: "boneking", 10: "frostjarl", 13: "gravelord"}}))


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for i, (name, theme, grid, paths, palette, nwaves, gold, lives, boss, tip, decor, extra) in enumerate(L):
        n = i + 1
        lid = f"level{n:02d}"
        rng = random.Random(n * 1337)
        base = 110 + 46 * i
        waves = waves_for(nwaves, base, palette, len(paths), rng, boss=boss,
                          extra_boss=(extra or {}).get("extra_boss"))
        level = {
            "id": lid, "name": name, "theme": theme,
            "grid": {"w": grid[0], "h": grid[1]},
            "paths": paths,
            "blocked": blocked_cells(grid, paths, rng.randint(5, 10), rng),
            "decor": decor, "gold": gold, "lives": lives,
            "waves": waves, "tip": tip,
        }
        with open(os.path.join(OUT, f"{lid}.json"), "w") as f:
            json.dump(level, f, indent=1)
        index.append({"id": lid, "name": name})
        total_threat = sum(THREAT[g["type"]] * g["n"] for w in waves for g in w["groups"])
        print(f"{lid}  {name:22s} {theme:7s} paths={len(paths)} waves={nwaves:2d} "
              f"gold={gold} threat={total_threat}")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, indent=1)
    print(f"\nwrote {len(L)} levels + index.json -> {OUT}")


if __name__ == "__main__":
    main()
