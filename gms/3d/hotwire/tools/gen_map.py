#!/usr/bin/env python3
"""Generate the built-in HOTWIRE levels: levels/palmbay.json + levels/docks.json.

Regenerate (don't hand-edit the JSON): python3 tools/gen_map.py
Tile codes: g grass · d dirt · r road · p pavement · s sand · w water
Coordinates in level JSON are WORLD metres (tile centre = (col+0.5)*tile).
"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "levels")
R = random.Random(20260708)

W = H = 96
TILE = 4.0


def world(c, r):  # tile -> world centre
    return round((c + 0.5) * TILE, 1), round((r + 0.5) * TILE, 1)


class Map:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [["g"] * w for _ in range(h)]
        self.objects, self.cars, self.guns, self.hotspots = [], [], [], []

    def set(self, c, r, t):
        if 0 <= c < self.w and 0 <= r < self.h:
            self.g[r][c] = t

    def get(self, c, r):
        return self.g[r][c] if (0 <= c < self.w and 0 <= r < self.h) else "g"

    def rect(self, c0, r0, c1, r1, t):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                self.set(c, r, t)

    def hroad(self, r, c0, c1, wdt=2):
        self.rect(c0, r, c1, r + wdt - 1, "r")

    def vroad(self, c, r0, r1, wdt=2):
        self.rect(c, r0, c + wdt - 1, r1, "r")

    def pave_around_roads(self):
        for r in range(self.h):
            for c in range(self.w):
                if self.g[r][c] != "g":
                    continue
                near = any(self.get(c + dc, r + dr) == "r"
                           for dc in (-1, 0, 1) for dr in (-1, 0, 1))
                if near:
                    self.g[r][c] = "p"

    def obj(self, m, c, r, rot=0.0, s=1.0):
        x, z = world(c, r)
        self.objects.append({"m": m, "x": x, "z": z, "rot": round(rot, 3), "s": s})

    def car(self, t, c, r, rot=0.0, locked=False):
        x, z = world(c, r)
        d = {"t": t, "x": x, "z": z, "rot": round(rot, 3)}
        if locked:
            d["locked"] = True
        self.cars.append(d)

    def gun(self, w, c, r):
        x, z = world(c, r)
        self.guns.append({"w": w, "x": x, "z": z})

    def hot(self, **kw):
        kw["x"], kw["z"] = world(kw.pop("c"), kw.pop("r"))
        self.hotspots.append(kw)

    def is_clear(self, c, r):
        return self.get(c, r) in "gds"

    def scatter(self, models, n, c0, r0, c1, r1, s=(0.9, 1.25)):
        placed = 0
        for _ in range(n * 14):
            if placed >= n:
                break
            c, r = R.randint(c0, c1), R.randint(r0, r1)
            if self.is_clear(c, r) and not any(
                    abs(o["x"] - world(c, r)[0]) < 6 and abs(o["z"] - world(c, r)[1]) < 6
                    for o in self.objects[-140:]):
                self.obj(R.choice(models), c, r, R.uniform(0, 6.28), round(R.uniform(*s), 2))
                placed += 1

    def dump(self, id_, name, spawn_c, spawn_r, spawn_rot=0.0):
        x, z = world(spawn_c, spawn_r)
        return {
            "id": id_, "name": name, "w": self.w, "h": self.h, "tile": TILE,
            "ground": ["".join(row) for row in self.g],
            "objects": self.objects, "cars": self.cars, "guns": self.guns,
            "hotspots": self.hotspots,
            "spawn": {"x": x, "z": z, "rot": spawn_rot},
        }


# ═══════════════════════════ PALM BAY ═══════════════════════════
m = Map(W, H)
PI, HPI = math.pi, math.pi / 2

# water: east harbour strip + beach south of the docks
m.rect(90, 0, 95, 95, "w")
m.rect(88, 0, 89, 95, "s")          # thin shoreline
m.rect(82, 6, 89, 44, "p")          # dock aprons (north half)
m.rect(84, 52, 89, 92, "s")         # the beach (south half)

# ring road
m.hroad(6, 6, 83)        # north
m.hroad(76, 6, 83)       # south
m.vroad(6, 6, 77)        # west
m.vroad(82, 6, 46)       # east (to the docks)
m.vroad(78, 46, 77)      # east lower (inset past the beach)
m.hroad(46, 78, 83)      # docks connector
# downtown grid
for c in (30, 46, 62):
    m.vroad(c, 6, 77)
for r in (24, 42, 60):
    m.hroad(r, 6, 82 if r != 60 else 78)
# airfield spur + strip
m.hroad(86, 10, 48)
m.rect(10, 88, 52, 93, "d")          # dirt runway
# park paths (dirt)
m.rect(34, 28, 44, 38, "g")
for c in range(32, 46):
    m.set(c, 33, "d")
m.rect(38, 28, 39, 38, "d")
# park pond
m.rect(40, 35, 43, 38, "w")

m.pave_around_roads()

# ── downtown landmarks (block interiors) ──
m.obj("bld_police", 38, 12, PI)          # Precinct 9 (north central)
m.obj("bld_pgarage", 43, 12, PI)
m.obj("bld_bank", 52, 15, PI)
m.obj("bld_tower", 57, 18, PI)
m.obj("bld_office", 68, 12, PI)
m.obj("bld_casino", 52, 30, 0)
m.obj("bld_cinema", 57, 36, -HPI)
m.obj("bld_hotel", 68, 30, 0)
m.obj("bld_mall", 70, 52, -HPI)
m.obj("bld_office", 52, 48, 0)
m.obj("bld_hospital", 38, 48, 0)
m.obj("bld_fire", 42, 54, 0)
m.obj("bld_diner", 52, 66, 0)            # Blue Palm Diner
m.obj("bld_block_a", 66, 66, 0)
m.obj("bld_block_b", 71, 66, 0)
m.obj("bld_block_a", 74, 36, -HPI)
m.obj("bld_block_b", 74, 28, -HPI)
# the Nest — old town, near the docks
m.obj("bld_nest", 74, 50, -HPI)
# Rico's Rides — southwest suburbs
m.obj("bld_garage", 16, 66, 0)
# Vega Motors dealer lot — west downtown
m.obj("bld_block_a", 22, 30, HPI)
# suburbs — houses west + south
for i, (c, r, b) in enumerate([(12, 12, "bld_house_a"), (18, 12, "bld_house_b"),
                               (24, 12, "bld_house_c"), (12, 18, "bld_house_d"),
                               (18, 18, "bld_house_a"), (24, 18, "bld_house_b"),
                               (12, 30, "bld_house_c"), (12, 36, "bld_house_a"),
                               (12, 48, "bld_house_b"), (18, 48, "bld_house_d"),
                               (24, 48, "bld_house_a"), (12, 54, "bld_house_c"),
                               (24, 54, "bld_house_b"), (12, 70, "bld_house_a"),
                               (24, 70, "bld_house_d"), (34, 70, "bld_house_b"),
                               (34, 66, "bld_house_c"), (44, 70, "bld_house_a"),
                               (58, 70, "bld_house_c")]):
    m.obj(b, c, r, R.choice([0, HPI, PI, -HPI]))
# airfield
m.obj("hangar", 16, 82, 0)
m.obj("plane", 34, 82, 0.2)
m.obj("crate", 22, 83, 0.4)
m.obj("crate", 23, 83, 1.2)
# docks set dressing
m.obj("ship", 92, 20, PI, 1.0)
m.obj("crane", 84, 14, HPI)
m.obj("crane", 84, 30, HPI)
m.obj("boat", 91, 40, 2.4)
for i in range(10):
    m.obj(R.choice(["cont_a", "cont_b", "cont_c"]), 84 + (i % 3) * 2, 8 + (i // 3) * 4,
          R.choice([0, HPI]))
# market square (S05 target stalls) — south of the casino
m.obj("stall_pizza", 47, 34, -HPI)
m.obj("stall_soda", 47, 37, -HPI)
m.obj("stall_coffee", 49, 40, PI)
m.obj("stall_burger", 43, 40, 0.3)
# ATMs
m.obj("atm", 50, 13, PI)
m.obj("atm", 54, 31, 0)
m.obj("atm", 51, 65, 0)

# street props along downtown roads
for r in (25, 43, 61):
    for c in range(10, 80, 8):
        if m.get(c, r) == "p":
            m.obj(R.choice(["lamp", "lamp", "bench", "bin", "hydrant"]), c, r, PI)
for c, r in [(30, 8), (46, 8), (62, 8), (30, 26), (46, 26), (62, 26),
             (30, 44), (46, 44), (62, 44), (46, 62), (62, 62)]:
    m.obj("tlight", c + 2, r + 2, 0)
for c in range(64, 78, 3):
    m.obj("cone", c, 47, 0)
m.obj("busstop", 49, 26, 0)
m.obj("busstop", 33, 62, PI)
m.obj("dumpster", 72, 64, HPI)
m.obj("dumpster", 40, 14, 0)
m.obj("tirepile", 18, 64, 0)
m.obj("sign_stop", 28, 25, 0)
m.obj("sign_stop", 60, 43, 0)

# nature
m.scatter(["palm_a", "palm_b"], 26, 84, 52, 89, 90)          # beach palms
m.scatter(["tree_a", "tree_b", "bush"], 30, 32, 28, 45, 39)  # the park
m.scatter(["tree_a", "bush", "tree_b"], 24, 8, 8, 28, 74)    # suburbs green
m.scatter(["bush", "tree_b"], 10, 64, 68, 76, 74)
m.scatter(["rock_a", "rock_b", "bush"], 12, 8, 80, 54, 92)   # airfield scrub

# ── vehicles parked around town ──
m.car("beater", 15, 68, HPI)                    # Rico's loaner, by the garage
m.car("sedan", 20, 25, 0); m.car("sedan", 55, 62, PI)
m.car("taxi", 50, 27, HPI); m.car("taxi", 36, 62, 0)
m.car("pickup", 13, 26, HPI); m.car("hippie", 26, 72, 0)
m.car("van", 76, 52, 0, locked=True)            # the Serpents' van (story)
m.car("sport", 54, 33, PI, locked=True)         # casino valet (S03 repo target)
m.car("police", 36, 14, PI, locked=True); m.car("police", 41, 14, PI, locked=True)
m.car("bus", 47, 24, 0)
m.car("fire", 44, 56, 0, locked=True)
m.car("golf", 30, 34, 1.2)
m.car("tow", 18, 68, HPI)
m.car("formula", 30, 84, 0, locked=True)        # airfield (race unlock)
m.car("sedan", 68, 25, 0); m.car("pickup", 70, 62, PI)

# ── weapon pickups ──
m.gun("pistol", 40, 33)      # park
m.gun("smg", 85, 10)         # docks
m.gun("shotgun", 20, 84)     # airfield hangar
m.gun("rifle", 74, 12)       # office rooftop lot
m.gun("rocket", 92, 46)      # far docks pier
m.gun("flamer", 44, 40)      # market

# ── hotspots ──
hot = m.hot
hot(id="ricos",   kind="garage", c=18, r=62, radius=6, label="Rico's Rides", icon="wrench")
hot(id="dealer",  kind="shop",   c=22, r=26, radius=6, label="Vega Motors", icon="car")
hot(id="police",  kind="giver",  c=40, r=16, radius=6, label="Precinct 9", icon="star",
    faction="police")
hot(id="nest",    kind="giver",  c=74, r=54, radius=6, label="Serpent's Nest", icon="snake",
    faction="gang")
hot(id="diner",   kind="giver",  c=52, r=63, radius=6, label="Blue Palm Diner", icon="mug",
    faction="civ")
hot(id="airfield", kind="race",  c=30, r=86, radius=8, label="Dust Cup", icon="flag")
hot(id="docks",   kind="story",  c=84, r=24, radius=8, label="The Docks", icon="anchor")
hot(id="beach",   kind="story",  c=86, r=70, radius=8, label="Palm Beach", icon="sun")

palmbay = m.dump("palmbay", "Palm Bay", 14, 70, 0.0)

# ═══════════════════════════ THE DOCKS (finale map) ═══════════════════════════
d = Map(64, 64)
d.rect(0, 0, 63, 63, "p")
d.rect(56, 0, 63, 63, "w")
d.rect(54, 0, 55, 63, "p")
d.hroad(30, 2, 53); d.vroad(8, 4, 60); d.vroad(40, 4, 60); d.hroad(54, 8, 41)
d.hroad(6, 8, 41)
# container maze
for i in range(26):
    c, r = 14 + (i % 6) * 5, 10 + (i // 6) * 8
    if d.get(c, r) == "p":
        d.obj(R.choice(["cont_a", "cont_b", "cont_c"]), c, r, R.choice([0, HPI]))
d.obj("ship", 59, 16, PI); d.obj("ship", 59, 44, PI)
d.obj("crane", 52, 12, HPI); d.obj("crane", 52, 36, HPI)
d.obj("boat", 57, 30, 2.0)
d.obj("hangar", 4, 46, 0)
d.obj("bld_office", 4, 12, HPI)
for i in range(8):
    d.obj("crate", R.randint(10, 50), R.randint(34, 52), R.uniform(0, 6.28))
d.obj("barrier", 20, 31, 0); d.obj("barrier", 26, 31, 0)
d.scatter(["tirepile", "dumpster", "cone"], 10, 4, 4, 52, 60)
d.car("van", 12, 8, 0); d.car("pickup", 36, 56, PI)
d.car("military", 46, 8, 0, locked=True)
d.car("armored", 24, 28, HPI, locked=True)      # Dane's money truck
d.gun("rocket", 50, 58); d.gun("smg", 6, 32); d.gun("shotgun", 30, 8)
d.hot(id="pier",  kind="story", c=54, r=30, radius=7, label="Pier 4", icon="anchor")
d.hot(id="gate",  kind="portal", c=4, r=30, radius=5, label="Back to Palm Bay",
      icon="car", map="palmbay")
docks = d.dump("docks", "The Docks", 6, 28, HPI)

os.makedirs(OUT, exist_ok=True)
for lv in (palmbay, docks):
    p = os.path.join(OUT, lv["id"] + ".json")
    json.dump(lv, open(p, "w"), separators=(",", ":"))
    print(f"{lv['id']}: {lv['w']}x{lv['h']}  objects={len(lv['objects'])} "
          f"cars={len(lv['cars'])} guns={len(lv['guns'])} hotspots={len(lv['hotspots'])} -> {p}")
