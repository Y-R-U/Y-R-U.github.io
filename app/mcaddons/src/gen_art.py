#!/usr/bin/env python3
"""Generate all pixel art for the Trolling Addon (no PIL needed).

Outputs item icons, block/entity textures and pack icons into the RP/BP,
plus web copies into ../img/ for the mcaddons site.
"""
import os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RP = os.path.join(HERE, "TrollingAddon_RP")
BP = os.path.join(HERE, "TrollingAddon_BP")
IMG = os.path.normpath(os.path.join(HERE, "..", "img"))


def write_png(path, pixels):
    h = len(pixels)
    w = len(pixels[0])
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in pixels
    )

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(path, HERE), f"({w}x{h})")


def grid(rows, pal):
    assert all(len(r) == len(rows[0]) for r in rows), "ragged art grid"
    return [[pal[ch] for ch in row] for row in rows]


def scale(pixels, n):
    out = []
    for row in pixels:
        big = []
        for px in row:
            big.extend([px] * n)
        out.extend([big] * n)
    return out


def blank(w, h, color=(0, 0, 0, 0)):
    return [[color] * w for _ in range(h)]


def fill(pixels, x0, y0, x1, y1, color):
    for y in range(y0, y1):
        for x in range(x0, x1):
            pixels[y][x] = color


T = (0, 0, 0, 0)

# ---------------------------------------------------------------- god pickaxe
god_pal = {
    ".": T,
    "G": (255, 200, 60, 255),   # gold
    "g": (200, 140, 30, 255),   # gold shade
    "W": (255, 250, 220, 255),  # white-hot edge
    "h": (130, 92, 56, 255),    # handle
    "H": (86, 58, 34, 255),     # handle shade
    "r": (255, 60, 40, 255),    # redstone spark
    "R": (170, 20, 10, 255),    # redstone dark
}
god_pickaxe = [
    "..gGGGGGGGGGGg..",
    ".gGWWGGggGGWWGg.",
    ".GWWg..hh..gWWG.",
    ".GWg...Hh...gWG.",
    ".Gg....Hh....gG.",
    ".G.....Hh.....G.",
    ".g.....Hh.....g.",
    ".......Hh.......",
    ".......Hh.......",
    ".......Hh.......",
    ".......Hh.......",
    ".......Hh.......",
    "......rHhr......",
    ".......Hh.......",
    ".......Hh.......",
    "......RrrR......",
]

# ---------------------------------------------------------------- chunk miner
chunk_pal = {
    ".": T,
    "G": (150, 150, 158, 255),  # stone head
    "g": (100, 100, 110, 255),  # stone shade
    "W": (210, 214, 220, 255),  # bright edge
    "h": (60, 46, 34, 255),     # dark handle
    "H": (38, 28, 20, 255),     # handle shade
    "e": (90, 250, 120, 255),   # green energy
    "E": (30, 160, 70, 255),    # green energy dark
}
chunk_miner = [
    "..gGGGGGGGGGGg..",
    ".gGWWGGggGGWWGg.",
    ".GWeg..hh..geWG.",
    ".GWg...Hh...gWG.",
    ".Geg...Hh...geG.",
    ".G.....Hh.....G.",
    ".g.....Hh.....g.",
    ".......Hh.......",
    ".......Hh.......",
    ".......Hh.......",
    ".......Hh.......",
    "......eHhe......",
    ".......Hh.......",
    ".......Hh.......",
    "......EHhE......",
    "......eEEe......",
]

# ------------------------------------------------------------- speed minecart
cart_pal = {
    ".": T,
    "C": (120, 124, 132, 255),  # iron
    "c": (78, 82, 90, 255),     # iron shade
    "D": (40, 42, 48, 255),     # interior dark
    "d": (58, 60, 68, 255),     # interior
    "o": (255, 150, 40, 255),   # speed streak
    "O": (255, 90, 30, 255),    # speed streak hot
    "R": (232, 178, 60, 255),   # golden rail
    "r": (255, 60, 40, 255),    # redstone glow
    "s": (110, 70, 40, 255),    # sleeper wood
}
speed_minecart = [
    "................",
    "................",
    "................",
    "O...cCCCCCCCCc..",
    "oO..CDDDDDDDDC..",
    "O...CDddddddDC..",
    "oO..CDddddddDC..",
    "O...CDddddddDC..",
    "oO..CDDDDDDDDC..",
    "O...cCCCCCCCCc..",
    "....RRRRRRRRRR..",
    "...s.r.s.r.s.r..",
    "................",
    "................",
    "................",
    "................",
]

# ------------------------------------------------- skin mocker / stalker / hunter
def mock_item(eye):
    pal = {
        ".": T,
        "K": (70, 70, 78, 255),    # hair/head dark
        "F": (176, 178, 184, 255), # mannequin face
        "E": eye,                  # eyes
        "B": (96, 98, 110, 255),   # torso
        "b": (66, 68, 80, 255),    # torso shade
        "L": (48, 50, 60, 255),    # legs
        "P": (120, 100, 70, 255),  # base plate
        "p": (86, 70, 48, 255),    # base shade
    }
    rows = [
        "................",
        "......KKKK......",
        "......FFFF......",
        "......EFFE......",
        "......FFFF......",
        ".....bBBBBb.....",
        ".....BBBBBB.....",
        ".....BBBBBB.....",
        ".....bBBBBb.....",
        "......L..L......",
        "......L..L......",
        "......L..L......",
        "......L..L......",
        "....PPPPPPPP....",
        "...pPPPPPPPPp...",
        "................",
    ]
    return grid(rows, pal)

MOCK_EYE = (176, 178, 184, 255)   # plain (blends into face)
STALK_EYE = (120, 230, 255, 255)  # cold cyan
HUNT_EYE = (255, 40, 40, 255)     # red

# ---------------------------------------------------------------- pure sky block
def pure_sky():
    base = (124, 168, 255)
    px = blank(16, 16)
    for y in range(16):
        for x in range(16):
            n = (x * 7 + y * 13) % 5 - 2  # whisper of noise so it isn't a dead flat
            px[y][x] = (base[0] + n, base[1] + n, min(255, base[2]), 255)
    return px

# ---------------------------------------------------------------- entity skins
def mannequin_skin(body, legs, skin, eye, pupil):
    px = blank(64, 64)
    # head (all faces region)
    fill(px, 0, 0, 32, 16, skin)
    # face detail (front face at 8,8 → 16,16)
    brow = (max(0, skin[0] - 40), max(0, skin[1] - 40), max(0, skin[2] - 40), 255)
    fill(px, 9, 11, 15, 12, brow)                # brow shadow
    fill(px, 9, 12, 11, 13, eye)                 # right eye
    fill(px, 13, 12, 15, 13, eye)                # left eye
    fill(px, 10, 12, 11, 13, pupil)
    fill(px, 13, 12, 14, 13, pupil)
    fill(px, 11, 14, 13, 15, brow)               # mouth
    # torso UV block (16,16 → 40,32)
    fill(px, 16, 16, 40, 32, body)
    # arms: right (40,16 → 56,32) — sleeve top, skin below
    fill(px, 40, 16, 56, 24, body)
    fill(px, 40, 24, 56, 32, skin)
    # right leg (0,16 → 16,32)
    fill(px, 0, 16, 16, 32, legs)
    # left leg (16,48 → 32,64)
    fill(px, 16, 48, 32, 64, legs)
    # left arm (32,48 → 48,64)
    fill(px, 32, 48, 48, 56, body)
    fill(px, 32, 56, 48, 64, skin)
    return px

SKIN_GRAY = (168, 170, 176, 255)
MOCK_BODY = (92, 94, 106, 255)
MOCK_LEGS = (52, 54, 64, 255)

# ---------------------------------------------------------------- pack icon
pack_pal = {
    "D": (18, 18, 26, 255),
    "k": (34, 34, 46, 255),
    "K": (70, 70, 84, 255),
    "f": (172, 174, 180, 255),
    "R": (255, 40, 40, 255),
    "m": (52, 52, 62, 255),
    "G": (255, 200, 60, 255),
    "r": (200, 30, 20, 255),
}
pack_icon_art = [
    "DDDDDDDDDDDDDDDD",
    "DDDDDDDDDDDDDDDD",
    "DDkkkkkkkkkkkkDD",
    "DDkKKKKKKKKKKkDD",
    "DDkKffffffffKkDD",
    "DDkKfRRffRRfKkDD",
    "DDkKffffffffKkDD",
    "DDkKffmmmmffKkDD",
    "DDkKfmffffmfKkDD",
    "DDkKKKKKKKKKKkDD",
    "DDkkkkkkkkkkkkDD",
    "DDDDDDDDDDDDDDDD",
    "DDGGGGGGGGGGGGDD",
    "DDrrrrrrrrrrrrDD",
    "DDDDDDDDDDDDDDDD",
    "DDDDDDDDDDDDDDDD",
]


def main():
    items = {
        "god_pickaxe": grid(god_pickaxe, god_pal),
        "chunk_miner": grid(chunk_miner, chunk_pal),
        "speed_minecart": grid(speed_minecart, cart_pal),
        "skin_mocker": mock_item(MOCK_EYE),
        "skin_stalker": mock_item(STALK_EYE),
        "skin_hunter": mock_item(HUNT_EYE),
    }
    for name, px in items.items():
        write_png(os.path.join(RP, "textures", "items", name + ".png"), px)
        write_png(os.path.join(IMG, name + ".png"), scale(px, 8))  # crisp web copies

    sky = pure_sky()
    write_png(os.path.join(RP, "textures", "blocks", "pure_sky.png"), sky)
    write_png(os.path.join(IMG, "pure_sky_block.png"), scale(sky, 8))

    skins = {
        "trolling_mock": mannequin_skin(MOCK_BODY, MOCK_LEGS, SKIN_GRAY, SKIN_GRAY, (120, 120, 128, 255)),
        "trolling_stalker": mannequin_skin((66, 78, 106, 255), (40, 46, 66, 255), (150, 158, 176, 255), (120, 230, 255, 255), (255, 255, 255, 255)),
        "trolling_hunter": mannequin_skin((84, 52, 56, 255), (44, 30, 34, 255), (160, 148, 150, 255), (255, 40, 40, 255), (120, 0, 0, 255)),
    }
    for name, px in skins.items():
        write_png(os.path.join(RP, "textures", "entity", name + ".png"), px)

    icon = scale(grid(pack_icon_art, pack_pal), 8)  # 128x128
    write_png(os.path.join(RP, "pack_icon.png"), icon)
    write_png(os.path.join(BP, "pack_icon.png"), icon)
    write_png(os.path.join(IMG, "pack_icon.png"), icon)


if __name__ == "__main__":
    main()
