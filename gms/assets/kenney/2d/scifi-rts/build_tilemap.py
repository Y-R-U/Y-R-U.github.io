#!/usr/bin/env python3
"""
Build tilemap.json metadata for the Kenney Sci-Fi RTS tilesheet.
The tilesheet is already a uniform grid of 64x64 tiles (scifi_tilesheet.png).
We just need the metadata + a copy of the tilesheet.
"""
import os, json, shutil

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SRC_DIR, "edit2d")
TILE_SIZE = 64
SHEET_W = 1152
SHEET_H = 448
COLS = SHEET_W // TILE_SIZE   # 18
ROWS = SHEET_H // TILE_SIZE   # 7

# ── Tile definitions based on visual inspection of tilesheet ──
# Format: (col, row, id, name, category)
# The tilesheet layout (18 cols x 7 rows):
#
# Rows 0-2: Large terrain tiles (multi-tile terrain scenes, road/path tiles, water)
# Row 0: dirt terrain, road intersections on dirt, road on concrete, structures (right side)
# Row 1: vegetation on dirt, road curves on dirt, water/road, structures (right side)
# Row 2: water/shore, terrain transitions, concrete roads, structures + vehicles (right side)
#
# Row 3: vegetation (individual trees/crystals), units (orange team), vehicles (orange/blue team)
# Row 4: rocks (orange), units (blue team), vehicles (blue/orange team)
# Row 5: rocks (grey/blue), units (green team), vehicles (green team)
# Row 6: misc (pipe, crate, container, plants), mostly empty

TILE_DEFS = [
    # === Row 0: Terrain - dirt, roads, concrete, structures ===
    (0, 0, "dirt_plain",           "Dirt Plain",              "terrain"),
    (1, 0, "dirt_vegetation",      "Dirt Vegetation",         "terrain"),
    (2, 0, "dirt_road_cross",      "Dirt Road Cross",         "roads"),
    (3, 0, "dirt_road_t_south",    "Dirt Road T South",       "roads"),
    (4, 0, "dirt_road_turn_se",    "Dirt Road Turn SE",       "roads"),
    (5, 0, "dirt_road_straight_h", "Dirt Road Straight H",    "roads"),
    (6, 0, "dirt_road_end_e",      "Dirt Road End E",         "roads"),
    (7, 0, "dirt_road_t_west",     "Dirt Road T West",        "roads"),
    (8, 0, "dirt_road_turn_ne",    "Dirt Road Turn NE",       "roads"),
    (9, 0, "concrete_plain",       "Concrete Plain",          "terrain"),
    (10, 0, "concrete_road_cross", "Concrete Road Cross",     "roads"),
    (11, 0, "concrete_road_t",     "Concrete Road T South",   "roads"),
    (12, 0, "concrete_road_turn",  "Concrete Road Turn SE",   "roads"),
    (13, 0, "turret_small",        "Turret Small",            "structures"),
    (14, 0, "antenna",             "Antenna",                 "structures"),
    (15, 0, "structure_tall_a",    "Structure Tall A",        "structures"),
    (16, 0, "structure_tall_b",    "Structure Tall B",        "structures"),
    (17, 0, "structure_dome_a",    "Structure Dome A",        "structures"),

    # === Row 1: More terrain, roads, water, structures ===
    (0, 1, "water_shore_w",        "Water Shore West",        "water"),
    (1, 1, "dirt_trees",           "Dirt Trees",              "terrain"),
    (2, 1, "dirt_road_straight_v", "Dirt Road Straight V",    "roads"),
    (3, 1, "dirt_road_t_east",     "Dirt Road T East",        "roads"),
    (4, 1, "dirt_road_turn_sw",    "Dirt Road Turn SW",       "roads"),
    (5, 1, "dirt_road_end_s",      "Dirt Road End S",         "roads"),
    (6, 1, "dirt_road_t_north",    "Dirt Road T North",       "roads"),
    (7, 1, "dirt_road_turn_nw",    "Dirt Road Turn NW",       "roads"),
    (8, 1, "dirt_transition",      "Dirt Transition",         "terrain"),
    (9, 1, "concrete_road_v",      "Concrete Road Straight V","roads"),
    (10, 1, "concrete_road_t_e",   "Concrete Road T East",    "roads"),
    (11, 1, "concrete_road_sw",    "Concrete Road Turn SW",   "roads"),
    (12, 1, "concrete_sparse",     "Concrete Sparse",         "terrain"),
    (13, 1, "structure_flag",      "Structure Flag",          "structures"),
    (14, 1, "structure_wide",      "Structure Wide",          "structures"),
    (15, 1, "structure_hangar",    "Structure Hangar",        "structures"),
    (16, 1, "structure_dome_b",    "Structure Dome B",        "structures"),
    (17, 1, "structure_glass",     "Structure Glass",         "structures"),

    # === Row 2: Water, shore, concrete terrain, vehicles ===
    (0, 2, "water_deep",           "Water Deep",              "water"),
    (1, 2, "water_shore_s",        "Water Shore South",       "water"),
    (2, 2, "dirt_water_road",      "Dirt Water Road",         "water"),
    (3, 2, "water_road_cross",     "Water Road Cross",        "water"),
    (4, 2, "water_dirt_corner",    "Water Dirt Corner",       "water"),
    (5, 2, "concrete_road_h",      "Concrete Road Straight H","roads"),
    (6, 2, "concrete_road_end",    "Concrete Road End",       "roads"),
    (7, 2, "concrete_road_nw",     "Concrete Road Turn NW",   "roads"),
    (8, 2, "concrete_road_ne",     "Concrete Road Turn NE",   "roads"),
    (9, 2, "vehicle_truck_orange_e","Truck Orange E",         "vehicles"),
    (10, 2, "vehicle_truck_orange_s","Truck Orange S",        "vehicles"),
    (11, 2, "vehicle_apc_blue_e",  "APC Blue E",              "vehicles"),
    (12, 2, "vehicle_apc_blue_s",  "APC Blue S",              "vehicles"),
    (13, 2, "vehicle_tank_orange_e","Tank Orange E",          "vehicles"),
    (14, 2, "vehicle_tank_orange_s","Tank Orange S",          "vehicles"),
    (15, 2, "vehicle_tank_blue_e", "Tank Blue E",             "vehicles"),
    (16, 2, "vehicle_tank_blue_s", "Tank Blue S",             "vehicles"),
    (17, 2, "vehicle_scout_orange","Scout Orange",            "vehicles"),

    # === Row 3: Vegetation, orange units, blue vehicles ===
    (0, 3, "tree_small",           "Tree Small",              "vegetation"),
    (1, 3, "tree_medium",          "Tree Medium",             "vegetation"),
    (2, 3, "tree_round",           "Tree Round",              "vegetation"),
    (3, 3, "tree_tall",            "Tree Tall",               "vegetation"),
    (4, 3, "mushroom",             "Mushroom",                "vegetation"),
    (5, 3, "crystal",              "Crystal",                 "vegetation"),
    (6, 3, "unit_soldier_orange_a","Soldier Orange A",        "units"),
    (7, 3, "unit_soldier_orange_b","Soldier Orange B",        "units"),
    (8, 3, "unit_soldier_orange_c","Soldier Orange C",        "units"),
    (9, 3, "unit_soldier_orange_d","Soldier Orange D",        "units"),
    (10, 3, "unit_vehicle_blue_a", "Vehicle Blue A",          "vehicles"),
    (11, 3, "unit_vehicle_blue_b", "Vehicle Blue B",          "vehicles"),
    (12, 3, "vehicle_truck_blue_a","Truck Blue A",            "vehicles"),
    (13, 3, "vehicle_truck_blue_b","Truck Blue B",            "vehicles"),
    (14, 3, "vehicle_apc_orange_a","APC Orange A",            "vehicles"),
    (15, 3, "vehicle_apc_orange_b","APC Orange B",            "vehicles"),
    (16, 3, "vehicle_scout_blue_a","Scout Blue A",            "vehicles"),
    (17, 3, "vehicle_scout_blue_b","Scout Blue B",            "vehicles"),

    # === Row 4: Rocks (orange), blue units, orange/blue vehicles ===
    (0, 4, "rock_small",           "Rock Small",              "environment"),
    (1, 4, "rock_medium",          "Rock Medium",             "environment"),
    (2, 4, "rock_large_a",         "Rock Large A",            "environment"),
    (3, 4, "rock_large_b",         "Rock Large B",            "environment"),
    (4, 4, "rock_cluster_a",       "Rock Cluster A",          "environment"),
    (5, 4, "rock_cluster_b",       "Rock Cluster B",          "environment"),
    (6, 4, "unit_soldier_blue_a",  "Soldier Blue A",          "units"),
    (7, 4, "unit_soldier_blue_b",  "Soldier Blue B",          "units"),
    (8, 4, "unit_soldier_blue_c",  "Soldier Blue C",          "units"),
    (9, 4, "unit_soldier_blue_d",  "Soldier Blue D",          "units"),
    (10, 4, "vehicle_orange_truck_a","Truck Orange A",        "vehicles"),
    (11, 4, "vehicle_orange_truck_b","Truck Orange B",        "vehicles"),
    (12, 4, "vehicle_blue_truck_a","Truck Blue Alt A",        "vehicles"),
    (13, 4, "vehicle_blue_truck_b","Truck Blue Alt B",        "vehicles"),
    (14, 4, "vehicle_orange_apc_a","APC Orange Alt A",        "vehicles"),
    (15, 4, "vehicle_orange_apc_b","APC Orange Alt B",        "vehicles"),
    (16, 4, "vehicle_orange_scout_a","Scout Orange A",        "vehicles"),
    (17, 4, "vehicle_orange_scout_b","Scout Orange B",        "vehicles"),

    # === Row 5: Rocks (grey/blue), green units, green vehicles ===
    (0, 5, "boulder_small",        "Boulder Small",           "environment"),
    (1, 5, "boulder_medium",       "Boulder Medium",          "environment"),
    (2, 5, "boulder_large",        "Boulder Large",           "environment"),
    (3, 5, "cloud_a",              "Cloud A",                 "environment"),
    (4, 5, "cloud_b",              "Cloud B",                 "environment"),
    (5, 5, "bush_small",           "Bush Small",              "vegetation"),
    (6, 5, "unit_soldier_green_a", "Soldier Green A",         "units"),
    (7, 5, "unit_soldier_green_b", "Soldier Green B",         "units"),
    (8, 5, "unit_soldier_green_c", "Soldier Green C",         "units"),
    (9, 5, "unit_soldier_green_d", "Soldier Green D",         "units"),
    (10, 5, "vehicle_green_truck_a","Truck Green A",          "vehicles"),
    (11, 5, "vehicle_green_truck_b","Truck Green B",          "vehicles"),
    (12, 5, "vehicle_grey_truck_a","Truck Grey A",            "vehicles"),
    (13, 5, "vehicle_grey_truck_b","Truck Grey B",            "vehicles"),
    (14, 5, "vehicle_green_apc_a", "APC Green A",             "vehicles"),
    (15, 5, "vehicle_green_apc_b", "APC Green B",             "vehicles"),
    (16, 5, "vehicle_green_scout_a","Scout Green A",          "vehicles"),
    (17, 5, "vehicle_green_scout_b","Scout Green B",          "vehicles"),

    # === Row 6: Misc items (mostly sparse) ===
    (0, 6, "pipe",                 "Pipe",                    "environment"),
    (1, 6, "crate",                "Crate",                   "environment"),
    (2, 6, "container",            "Container",               "environment"),
    (3, 6, "plant_a",              "Plant A",                 "vegetation"),
    (4, 6, "plant_b",              "Plant B",                 "vegetation"),
]

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Copy the tilesheet as tilemap.png
    src_img = os.path.join(SRC_DIR, "scifi_tilesheet.png")
    dst_img = os.path.join(OUT_DIR, "tilemap.png")
    shutil.copy2(src_img, dst_img)
    print(f"Copied tilesheet -> {dst_img}")

    # Build metadata
    tiles = []
    for col, row, tile_id, name, category in TILE_DEFS:
        tiles.append({
            "id": tile_id,
            "name": name,
            "category": category,
            "col": col,
            "row": row
        })

    meta = {
        "tileSize": TILE_SIZE,
        "columns": COLS,
        "spacing": 0,
        "tiles": tiles
    }

    json_path = os.path.join(OUT_DIR, "tilemap.json")
    with open(json_path, 'w') as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {json_path}")
    print(f"Sci-Fi RTS pack: {len(tiles)} tiles in {COLS}x{ROWS} grid")

    # Report categories
    cats = {}
    for t in tiles:
        cats.setdefault(t['category'], 0)
        cats[t['category']] += 1
    for c, n in sorted(cats.items()):
        print(f"  {c}: {n} tiles")


if __name__ == '__main__':
    main()
