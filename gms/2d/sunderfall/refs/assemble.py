#!/usr/bin/env python3
"""Copy the picked candidates into refs/levels + refs/sprites and write manifest.json."""
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "_cand")
OGA = os.path.join(HERE, "_oga", "ex")
LV = os.path.join(HERE, "levels")
SP = os.path.join(HERE, "sprites")
for d in (LV, SP):
    os.makedirs(d, exist_ok=True)

# ---- level / scene references: official press screenshots -------------------
# (file, title, studio-ish source, what we are actually studying in it)
LEVELS = [
    ("deadcells_02.jpg", "Dead Cells — Ramparts", "Motion Twin", "Rim-lit silhouettes over a bloom sun; the whole scene reads in three depth bands."),
    ("deadcells_03.jpg", "Dead Cells — Toxic Sewers", "Motion Twin", "Sickly green key light, heavy vignette, tiles never repeat visibly."),
    ("deadcells_04.jpg", "Dead Cells — Stilt Village", "Motion Twin", "Cool/warm split with vertical light shafts; foreground is nearly black."),
    ("deadcells_05.jpg", "Dead Cells — Ossuary", "Motion Twin", "One glowing doorway carries the whole composition."),
    ("deadcells_07.jpg", "Dead Cells — Combat readability", "Motion Twin", "Hit sparks and enemy tells stay legible against a busy background."),
    ("hollowknight_00.jpg", "Hollow Knight — City of Tears", "Team Cherry", "Rain, parallax windows, muted blues; hand-inked line quality."),
    ("hollowknight_01.jpg", "Hollow Knight — Greenpath", "Team Cherry", "Saturated teal on near-black; foliage silhouettes frame the play space."),
    ("hollowknight_02.jpg", "Hollow Knight — Kingdom's Edge", "Team Cherry", "Crimson palette shift; the platform plane stays a clear readable line."),
    ("hollowknight_07.jpg", "Hollow Knight — Resting Grounds", "Team Cherry", "Sparse props, huge negative space, lantern point-lights."),
    ("ori_wotw_00.jpg", "Ori and the Will of the Wisps — Wellspring", "Moon Studios", "Painterly multi-layer parallax; god rays and particulate air."),
    ("ori_wotw_03.jpg", "Ori and the Will of the Wisps — Luma Pools", "Moon Studios", "The bar for depth-of-field and colour separation between layers."),
    ("ori_wotw_05.jpg", "Ori and the Will of the Wisps — Silent Woods", "Moon Studios", "Moonlit blues, glowing hero as the only warm element."),
    ("ori_wotw_06.jpg", "Ori and the Will of the Wisps — Baur's Reach", "Moon Studios", "Backlit canopy; note how little detail the far layers carry."),
    ("ori_blindforest_02.jpg", "Ori and the Blind Forest — Ginso Tree", "Moon Studios", "Interior organic architecture, emissive veins as level signposting."),
    ("ori_blindforest_05.jpg", "Ori and the Blind Forest — Forest", "Moon Studios", "Dense foreground occluders that never hide the player."),
    ("blasphemous2_00.jpg", "Blasphemous II — Moonlit ramparts", "The Game Kitchen", "Pixel art with painterly lighting; strong architectural verticals."),
    ("blasphemous2_02.jpg", "Blasphemous II — Cathedral", "The Game Kitchen", "Ornate tiles read cleanly because value range is kept narrow."),
    ("blasphemous2_04.jpg", "Blasphemous II — Interior hall", "The Game Kitchen", "Warm interior pocket inside a cold scene."),
    ("ninesols_00.jpg", "Nine Sols — Blossom", "Red Candle Games", "Hand-drawn 'taopunk'; flat colour blocks, confident line, pink/teal."),
    ("ninesols_05.jpg", "Nine Sols — Neon corridor", "Red Candle Games", "Emissive UI-like level geometry, high-contrast danger colours."),
    ("ninesols_06.jpg", "Nine Sols — Boss arena", "Red Candle Games", "Arena framing: symmetrical set dressing, empty floor for the fight."),
    ("skul_02.jpg", "Skul: The Hero Slayer — Castle", "SouthPAW Games", "Chunky readable pixel props, pink/gold accents, roguelite HUD."),
    ("skul_05.jpg", "Skul: The Hero Slayer — Garden", "SouthPAW Games", "Effects-heavy combat that still reads; note the FX colour discipline."),
    ("roguelegacy2_00.jpg", "Rogue Legacy 2 — Combat", "Cellar Door Games", "Roguelite HUD layout, projectile readability, room-scale composition."),
    ("enderlilies_05.jpg", "ENDER LILIES — Ruins", "Live Wire / Binary Haze", "Watercolour backdrops behind crisp sprites; desaturated with one accent."),
    ("enderlilies_06.jpg", "ENDER LILIES — Boss", "Live Wire / Binary Haze", "Fire lighting cast onto the ground plane and the character."),
    ("grime_02.jpg", "GRIME — Living architecture", "Clover Bite", "Sculptural, surreal shapes; a masterclass in weird silhouettes."),
    ("grime_05.jpg", "GRIME — Chalk hills", "Clover Bite", "Near-monochrome palette; depth carried purely by value."),
    ("katanazero_01.jpg", "Katana ZERO — Club", "Askiisoft", "Neon noir pixel interiors; heavy colour grading and grain."),
    ("katanazero_03.jpg", "Katana ZERO — Neon", "Askiisoft", "Purple/green complementaries, silhouette-first character reads."),
    ("thelastfaith_00.jpg", "The Last Faith — Gothic exterior", "Kumi Souls Games", "Painted pixel gothic; oversized architecture dwarfing the player."),
    ("thelastfaith_03.jpg", "The Last Faith — Cathedral square", "Kumi Souls Games", "Fog layers separating distance; muted stone palette."),
    ("trine4_03.jpg", "Trine 4 — Autumn village", "Frozenbyte", "2.5D reference: physically-lit props, soft shadows, warm bounce."),
    ("trine4_07.jpg", "Trine 4 — Golden forest", "Frozenbyte", "How far you can push atmospheric perspective in a side view."),
    ("aeternanoctis_03.jpg", "Aeterna Noctis — Sky vista", "Aeternum Game Studios", "Big-sky vista; the play platform is a thin band across a huge scene."),
    ("astralascent_03.jpg", "Astral Ascent — Garden", "Hibernian Workshop", "Clean modern pixel art, generous silhouette spacing for bullet-hell."),
    ("noita_02.jpg", "Noita — Falling sand caves", "Nolla Games", "EVERY pixel is simulated and destructible — our destruction north star."),
    ("noita_06.jpg", "Noita — Lava breach", "Nolla Games", "Material interaction: melted rock, flowing lava, emissive heat."),
    ("noita_07.jpg", "Noita — Excavated tunnel", "Nolla Games", "What a player-carved cavity looks like after sustained digging."),
    ("broforce_03.jpg", "Broforce — Collapsed structure", "Free Lives", "Chunky voxel-ish destruction: buildings shed tiles and fall."),
    ("broforce_06.jpg", "Broforce — Mid-demolition", "Free Lives", "Debris, fire and structural collapse all at once, still readable."),
]

# ---- spritesheet / animation references ------------------------------------
# (src path, out name, title, source, license, note)
SPRITES = [
    (os.path.join(OGA, "expl1/Free - 2D Explosion Animations/Half Sized/explosion 1.png"),
     "sheet_explosion_a.png", "2D Explosion Animations #1", "Sinestesia (OpenGameArt)", "CC0",
     "8×8 frame grid, 256px cells. Frame-by-frame smoke and fire — the format our destruction FX should ship in."),
    (os.path.join(OGA, "expl1/Free - 2D Explosion Animations/Half Sized/explosion 3.png"),
     "sheet_explosion_b.png", "2D Explosion Animations #3", "Sinestesia (OpenGameArt)", "CC0",
     "Same grid, different dissipation curve. Note how the last two rows are almost pure smoke."),
    (os.path.join(OGA, "expl2/Free Explosion Animations 2/Half Sized/2.png"),
     "sheet_explosion_c.png", "2D Explosion Animations #2 (set 2)", "Sinestesia (OpenGameArt)", "CC0",
     "Directional blast. Useful for wall-breach and barrel spells."),
    (os.path.join(OGA, "pixelfx/1.png"), "sheet_pixelfx_a.png", "Pixel FX Pack — impact", "CodeManu (OpenGameArt)", "CC-BY",
     "Pixel-art FX at a sane cell size; the resolution band we should actually work at."),
    (os.path.join(OGA, "pixelfx/4.png"), "sheet_pixelfx_b.png", "Pixel FX Pack — burst", "CodeManu (OpenGameArt)", "CC-BY",
     "Radial burst timing: 3 fast frames in, 6 slow frames out."),
    (os.path.join(OGA, "pixelfx/7.png"), "sheet_pixelfx_c.png", "Pixel FX Pack — smoke", "CodeManu (OpenGameArt)", "CC-BY",
     "Smoke puffs for rubble and footfalls."),
    (os.path.join(OGA, "magic_pack_9_files/Magic Pack 9 files/spritesheets/Lightning.png"),
     "sheet_magic_lightning.png", "Gothicvania Magic Pack — Lightning", "ansimuz (OpenGameArt)", "CC0",
     "Single-row strip sheet. Spell FX at true pixel resolution."),
    (os.path.join(OGA, "magic_pack_9_files/Magic Pack 9 files/spritesheets/Fire-bomb.png"),
     "sheet_magic_firebomb.png", "Gothicvania Magic Pack — Fire bomb", "ansimuz (OpenGameArt)", "CC0",
     "Projectile + detonation in one strip — the shape a 'break the wall' spell needs."),
    (os.path.join(OGA, "magic_pack_9_files/Magic Pack 9 files/spritesheets/Dark-Bolt.png"),
     "sheet_magic_darkbolt.png", "Gothicvania Magic Pack — Dark bolt", "ansimuz (OpenGameArt)", "CC0",
     "Travel loop then impact; note the tiny frame count that still reads."),
    (os.path.join(OGA, "gothicvania-town-files/GothicVania-town-files/code/phaser-code/assets/atlas/atlas.png"),
     "sheet_gothic_atlas.png", "Gothicvania Town — character atlas", "ansimuz (OpenGameArt)", "CC0",
     "A whole cast packed into one atlas — hero, enemies, props, all on one palette."),
    (os.path.join(OGA, "gothicvania-town-files/GothicVania-town-files/PNG/environment/layers/tileset.png"),
     "sheet_gothic_tileset.png", "Gothicvania Town — tileset", "ansimuz (OpenGameArt)", "CC0",
     "The tile vocabulary a whole level is built from. Ours needs a damaged variant per tile."),
    (os.path.join(OGA, "gothicvania-town-files/GothicVania-town-files/PNG/environment/props/houses.png"),
     "sheet_gothic_houses.png", "Gothicvania Town — buildings", "ansimuz (OpenGameArt)", "CC0",
     "Destructible candidates: these read as brick/timber assemblies that could shed pieces."),
    (os.path.join(OGA, "gothicvania-town-files/GothicVania-town-files/PNG/environment/props/props.png"),
     "sheet_gothic_props.png", "Gothicvania Town — props", "ansimuz (OpenGameArt)", "CC0",
     "Barrels, lamps, fences — the small breakables that sell a destructible world."),
    (os.path.join(OGA, "gothicvania-town-files/GothicVania-town-files/PNG/environment/environment-preview.png"),
     "scene_gothic_preview.png", "Gothicvania Town — assembled scene", "ansimuz (OpenGameArt)", "CC0",
     "The same tiles composed into a level, so we can judge tile → scene."),
    (os.path.join(OGA, "super_grotto_escape_files/Super Grotto Escape Files/Layers/far.png"),
     "layer_grotto_far.png", "Super Grotto — far parallax layer", "ansimuz (OpenGameArt)", "CC0",
     "Parallax layer 1 of 4. Low contrast, low detail, cool shift."),
    (os.path.join(OGA, "super_grotto_escape_files/Super Grotto Escape Files/Layers/middle.png"),
     "layer_grotto_mid.png", "Super Grotto — mid parallax layer", "ansimuz (OpenGameArt)", "CC0",
     "Parallax layer 3 of 4 — where silhouette shapes start to bite."),
    (os.path.join(OGA, "super_grotto_escape_files/Super Grotto Escape Files/Layers/tiledemo.png"),
     "scene_grotto_demo.png", "Super Grotto — layers composited", "ansimuz (OpenGameArt)", "CC0",
     "All four layers stacked. This is the parallax depth budget we should copy."),
    (os.path.join(OGA, "fort_of_illusion_files/Fort of Illusion Files/Previews/Fort-of-Illusionx3.png"),
     "scene_fort_illusion.png", "Fort of Illusion — assembled scene", "ansimuz (OpenGameArt)", "CC0",
     "Stone fort kit at 3× — brick shapes we can plausibly shatter into chunks."),
    (os.path.join(OGA, "forest_of_illusion_files/Forest of Illusion Files/Previews/Previewx3.png"),
     "scene_forest_illusion.png", "Forest of Illusion — assembled scene", "ansimuz (OpenGameArt)", "CC0",
     "Trees and bushes as discrete props — exactly the things a fire spell should fell."),
]

# animated previews harvested from itch pack pages (reference viewing only)
GIFS = [
    ("z_chierit_demonslime_05.gif", "Boss: Demon Slime — idle/attack", "chierit (itch.io)",
     "Large boss frames, ~120px tall, heavy squash and anticipation. Animation quality bar for our bosses."),
    ("z_chierit_demonslime_09.gif", "Boss: Demon Slime — ground slam", "chierit (itch.io)",
     "Impact frame holds for 2–3 ticks, then dust. Copy this timing."),
    ("z_chierit_demonslime_11.gif", "Boss: Demon Slime — cast", "chierit (itch.io)",
     "Telegraph → release → recovery, all clearly separated in silhouette."),
    ("z_chierit_fireknight_02.gif", "Elementals: Fire Knight — run", "chierit (itch.io)",
     "8-frame run cycle with cape follow-through."),
    ("z_chierit_fireknight_05.gif", "Elementals: Fire Knight — attack", "chierit (itch.io)",
     "Sword arc drawn as a smear frame — cheap, and it sells the speed."),
    ("z_luizmelo_heroknight_00.gif", "Hero Knight — full animation set", "LuizMelo (itch.io)",
     "The complete move list a platformer hero needs: idle, run, jump, 3-hit combo, block, roll, hurt, death."),
    ("z_luizmelo_heroknight_01.gif", "Hero Knight — combat", "LuizMelo (itch.io)",
     "Note the low frame count per action; readability beats smoothness."),
    ("z_luizmelo_huntress_00.gif", "Huntress — animation set", "LuizMelo (itch.io)",
     "Ranged-hero reference; bow draw and release poses."),
    ("z_luizmelo_evilwizard_02.gif", "Evil Wizard — cast", "LuizMelo (itch.io)",
     "Caster silhouette: robe motion carries the whole animation."),
    ("z_ansimuz_gothicvania_cemetery_03.gif", "Gothicvania Cemetery — in motion", "ansimuz (itch.io)",
     "Pixel scene running with parallax and animated props."),
]


def copy_scaled(src, dst, maxdim=1400):
    shutil.copy2(src, dst)
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", dst],
                         capture_output=True, text=True).stdout
    vals = [int(l.split(":")[1]) for l in out.splitlines()
            if l.strip().startswith(("pixelWidth:", "pixelHeight:"))]
    if vals and max(vals) > maxdim:
        subprocess.run(["sips", "-Z", str(maxdim), dst], capture_output=True)


manifest = {"levels": [], "sprites": []}

for fn, title, source, note in LEVELS:
    src = os.path.join(CAND, fn)
    if not os.path.exists(src):
        print("MISSING level", fn)
        continue
    shutil.copy2(src, os.path.join(LV, fn))
    manifest["levels"].append({"file": f"refs/levels/{fn}", "title": title,
                               "source": source, "note": note, "kind": "level"})

for src, out, title, source, lic, note in SPRITES:
    if not os.path.exists(src):
        print("MISSING sprite", src)
        continue
    copy_scaled(src, os.path.join(SP, out))
    manifest["sprites"].append({"file": f"refs/sprites/{out}", "title": title,
                                "source": source, "license": lic, "note": note,
                                "kind": "sheet"})

for fn, title, source, note in GIFS:
    src = os.path.join(CAND, fn)
    if not os.path.exists(src):
        print("MISSING gif", fn)
        continue
    shutil.copy2(src, os.path.join(SP, fn))
    manifest["sprites"].append({"file": f"refs/sprites/{fn}", "title": title,
                                "source": source, "license": "preview — reference only",
                                "note": note, "kind": "anim"})

json.dump(manifest, open(os.path.join(HERE, "manifest.json"), "w"), indent=1)
print("levels", len(manifest["levels"]), "sprites", len(manifest["sprites"]))
