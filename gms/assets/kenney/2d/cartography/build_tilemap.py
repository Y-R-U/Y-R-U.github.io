#!/usr/bin/env python3
"""
Build a tilemap spritesheet from individual Kenney Cartography PNGs.
Pure Python - no PIL/Pillow dependency. Uses struct/zlib for PNG I/O.
"""
import os, struct, zlib, json, math, subprocess, sys

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SRC_DIR, "edit2d")
TILE_SIZE = 64
COLS = 6  # tiles per row in output spritesheet

# ── Tile definitions with categories ──
TILE_DEFS = [
    # buildings
    ("castle",        "Castle",           "buildings"),
    ("castleTall",    "Castle Tall",      "buildings"),
    ("castleWide",    "Castle Wide",      "buildings"),
    ("castleWideLow", "Castle Wide Low",  "buildings"),
    ("houseTall",     "House Tall",       "buildings"),
    ("houseViking",   "House Viking",     "buildings"),
    ("houseSmall",    "House Small",      "buildings"),
    ("houseChimney",  "House Chimney",    "buildings"),
    ("mill",          "Mill",             "buildings"),
    ("mine",          "Mine",             "buildings"),
    ("lighthouse",    "Lighthouse",       "buildings"),
    # nature
    ("treeTall",      "Tree Tall",        "nature"),
    ("bush",          "Bush",             "nature"),
    ("palm",          "Palm",             "nature"),
    ("palmLarge",     "Palm Large",       "nature"),
    # terrain
    ("rocks",         "Rocks",            "terrain"),
    ("rocksA",        "Rocks A",          "terrain"),
    ("rocksB",        "Rocks B",          "terrain"),
    ("rocksMountain", "Rocks Mountain",   "terrain"),
    ("rocksTall",     "Rocks Tall",       "terrain"),
    # decoration
    ("flag",          "Flag",             "decoration"),
    ("campfire",      "Campfire",         "decoration"),
    ("fence",         "Fence",            "decoration"),
    ("gate",          "Gate",             "decoration"),
    ("skull",         "Skull",            "decoration"),
    ("graveyard",     "Graveyard",        "decoration"),
]


# ── PNG reading (pure Python) ──
def read_png_rgba(filepath):
    """Read a PNG file and return (width, height, pixels) where pixels is a
    list of rows, each row is a list of (r,g,b,a) tuples."""
    with open(filepath, 'rb') as f:
        sig = f.read(8)
        assert sig == b'\x89PNG\r\n\x1a\n', f"Not a PNG: {filepath}"

        chunks = {}
        idat_data = b''
        palette = None
        trns = None
        while True:
            raw = f.read(8)
            if len(raw) < 8:
                break
            length, ctype = struct.unpack('>I4s', raw)
            data = f.read(length)
            crc = f.read(4)
            ctype_str = ctype.decode('ascii', errors='replace')
            if ctype_str == 'IHDR':
                chunks['IHDR'] = data
            elif ctype_str == 'PLTE':
                palette = data
            elif ctype_str == 'tRNS':
                trns = data
            elif ctype_str == 'IDAT':
                idat_data += data
            elif ctype_str == 'IEND':
                break

    ihdr = chunks['IHDR']
    width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack('>IIBBBBB', ihdr)

    raw_data = zlib.decompress(idat_data)

    pixels = []
    pos = 0

    if color_type == 3:  # indexed color (palette)
        assert palette is not None, f"Palette PNG missing PLTE: {filepath}"
        # Build palette with alpha
        pal_entries = []
        for i in range(0, len(palette), 3):
            r, g, b = palette[i], palette[i+1], palette[i+2]
            a = trns[i//3] if (trns and i//3 < len(trns)) else 255
            pal_entries.append((r, g, b, a))

        bytes_per_row = width  # 8-bit indexed
        for y in range(height):
            filter_byte = raw_data[pos]
            pos += 1
            row_raw = list(raw_data[pos:pos+bytes_per_row])
            pos += bytes_per_row

            # Apply PNG filter (simplified: 0=None, 1=Sub, 2=Up, 3=Avg, 4=Paeth)
            if filter_byte == 1:  # Sub
                for i in range(1, len(row_raw)):
                    row_raw[i] = (row_raw[i] + row_raw[i-1]) & 0xFF
            elif filter_byte == 2:  # Up
                if y > 0:
                    prev = prev_row_raw
                    for i in range(len(row_raw)):
                        row_raw[i] = (row_raw[i] + prev[i]) & 0xFF
            elif filter_byte == 3:  # Average
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-1] if i > 0 else 0
                    b_val = prev[i]
                    row_raw[i] = (row_raw[i] + (a_val + b_val) // 2) & 0xFF
            elif filter_byte == 4:  # Paeth
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-1] if i > 0 else 0
                    b_val = prev[i]
                    c_val = prev[i-1] if (i > 0 and y > 0) else 0
                    p = a_val + b_val - c_val
                    pa = abs(p - a_val)
                    pb = abs(p - b_val)
                    pc = abs(p - c_val)
                    if pa <= pb and pa <= pc:
                        pr = a_val
                    elif pb <= pc:
                        pr = b_val
                    else:
                        pr = c_val
                    row_raw[i] = (row_raw[i] + pr) & 0xFF

            prev_row_raw = list(row_raw)
            row = [pal_entries[idx] if idx < len(pal_entries) else (0,0,0,0) for idx in row_raw]
            pixels.append(row)

    elif color_type == 6:  # RGBA
        bytes_per_pixel = 4
        bytes_per_row = width * bytes_per_pixel
        for y in range(height):
            filter_byte = raw_data[pos]
            pos += 1
            row_raw = list(raw_data[pos:pos+bytes_per_row])
            pos += bytes_per_row

            if filter_byte == 1:  # Sub
                for i in range(bytes_per_pixel, len(row_raw)):
                    row_raw[i] = (row_raw[i] + row_raw[i-bytes_per_pixel]) & 0xFF
            elif filter_byte == 2:  # Up
                if y > 0:
                    prev = prev_row_raw
                    for i in range(len(row_raw)):
                        row_raw[i] = (row_raw[i] + prev[i]) & 0xFF
            elif filter_byte == 3:  # Average
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-bytes_per_pixel] if i >= bytes_per_pixel else 0
                    b_val = prev[i]
                    row_raw[i] = (row_raw[i] + (a_val + b_val) // 2) & 0xFF
            elif filter_byte == 4:  # Paeth
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-bytes_per_pixel] if i >= bytes_per_pixel else 0
                    b_val = prev[i]
                    c_val = prev[i-bytes_per_pixel] if (i >= bytes_per_pixel and y > 0) else 0
                    p = a_val + b_val - c_val
                    pa = abs(p - a_val)
                    pb = abs(p - b_val)
                    pc = abs(p - c_val)
                    if pa <= pb and pa <= pc:
                        pr = a_val
                    elif pb <= pc:
                        pr = b_val
                    else:
                        pr = c_val
                    row_raw[i] = (row_raw[i] + pr) & 0xFF

            prev_row_raw = list(row_raw)
            row = []
            for x in range(width):
                off = x * 4
                row.append((row_raw[off], row_raw[off+1], row_raw[off+2], row_raw[off+3]))
            pixels.append(row)

    elif color_type == 2:  # RGB (no alpha)
        bytes_per_pixel = 3
        bytes_per_row = width * bytes_per_pixel
        for y in range(height):
            filter_byte = raw_data[pos]
            pos += 1
            row_raw = list(raw_data[pos:pos+bytes_per_row])
            pos += bytes_per_row

            if filter_byte == 1:
                for i in range(bytes_per_pixel, len(row_raw)):
                    row_raw[i] = (row_raw[i] + row_raw[i-bytes_per_pixel]) & 0xFF
            elif filter_byte == 2:
                if y > 0:
                    prev = prev_row_raw
                    for i in range(len(row_raw)):
                        row_raw[i] = (row_raw[i] + prev[i]) & 0xFF
            elif filter_byte == 3:
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-bytes_per_pixel] if i >= bytes_per_pixel else 0
                    b_val = prev[i]
                    row_raw[i] = (row_raw[i] + (a_val + b_val) // 2) & 0xFF
            elif filter_byte == 4:
                prev = prev_row_raw if y > 0 else [0]*len(row_raw)
                for i in range(len(row_raw)):
                    a_val = row_raw[i-bytes_per_pixel] if i >= bytes_per_pixel else 0
                    b_val = prev[i]
                    c_val = prev[i-bytes_per_pixel] if (i >= bytes_per_pixel and y > 0) else 0
                    p = a_val + b_val - c_val
                    pa = abs(p - a_val)
                    pb = abs(p - b_val)
                    pc = abs(p - c_val)
                    if pa <= pb and pa <= pc:
                        pr = a_val
                    elif pb <= pc:
                        pr = b_val
                    else:
                        pr = c_val
                    row_raw[i] = (row_raw[i] + pr) & 0xFF

            prev_row_raw = list(row_raw)
            row = []
            for x in range(width):
                off = x * 3
                # Check tRNS for transparency in RGB mode
                r, g, b = row_raw[off], row_raw[off+1], row_raw[off+2]
                row.append((r, g, b, 255))
            pixels.append(row)
    else:
        raise ValueError(f"Unsupported PNG color type {color_type} in {filepath}")

    return width, height, pixels


def scale_to_tile(pixels, src_w, src_h, tile_size):
    """Scale/fit pixel data into tile_size x tile_size using nearest neighbor,
    centering the image if aspect ratio differs."""
    result = [[(0,0,0,0)] * tile_size for _ in range(tile_size)]

    # Calculate scale to fit within tile_size while maintaining aspect ratio
    scale_x = tile_size / src_w
    scale_y = tile_size / src_h
    scale = min(scale_x, scale_y)

    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    off_x = (tile_size - new_w) // 2
    off_y = (tile_size - new_h) // 2

    for dy in range(new_h):
        for dx in range(new_w):
            sx = int(dx / scale)
            sy = int(dy / scale)
            sx = min(sx, src_w - 1)
            sy = min(sy, src_h - 1)
            result[off_y + dy][off_x + dx] = pixels[sy][sx]

    return result


# ── PNG writing (pure Python) ──
def write_png(filepath, width, height, pixels):
    """Write RGBA pixel data as a PNG file."""
    def make_chunk(ctype, data):
        raw = ctype + data
        crc = struct.pack('>I', zlib.crc32(raw) & 0xFFFFFFFF)
        return struct.pack('>I', len(data)) + raw + crc

    # IHDR
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)

    # IDAT - raw pixel data with filter byte 0 (None) per row
    raw_rows = bytearray()
    for y in range(height):
        raw_rows.append(0)  # filter: None
        for x in range(width):
            r, g, b, a = pixels[y][x]
            raw_rows.extend([r, g, b, a])

    compressed = zlib.compress(bytes(raw_rows), 9)

    with open(filepath, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(make_chunk(b'IHDR', ihdr))
        f.write(make_chunk(b'IDAT', compressed))
        f.write(make_chunk(b'IEND', b''))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    num_tiles = len(TILE_DEFS)
    rows = math.ceil(num_tiles / COLS)
    sheet_w = COLS * TILE_SIZE
    sheet_h = rows * TILE_SIZE

    print(f"Creating {sheet_w}x{sheet_h} spritesheet ({COLS} cols x {rows} rows, {num_tiles} tiles)")

    # Initialize transparent canvas
    sheet = [[(0,0,0,0)] * sheet_w for _ in range(sheet_h)]

    tiles_meta = []

    for idx, (file_stem, name, category) in enumerate(TILE_DEFS):
        col = idx % COLS
        row = idx // COLS
        src_path = os.path.join(SRC_DIR, f"{file_stem}.png")

        if not os.path.exists(src_path):
            print(f"  WARNING: {src_path} not found, skipping")
            continue

        print(f"  [{idx+1}/{num_tiles}] {file_stem}.png -> col={col}, row={row}")

        src_w, src_h, src_pixels = read_png_rgba(src_path)

        # Scale to tile size if needed
        if src_w != TILE_SIZE or src_h != TILE_SIZE:
            tile_pixels = scale_to_tile(src_pixels, src_w, src_h, TILE_SIZE)
            print(f"    Scaled from {src_w}x{src_h} to {TILE_SIZE}x{TILE_SIZE}")
        else:
            tile_pixels = src_pixels

        # Blit onto sheet
        ox = col * TILE_SIZE
        oy = row * TILE_SIZE
        for dy in range(TILE_SIZE):
            for dx in range(TILE_SIZE):
                sheet[oy + dy][ox + dx] = tile_pixels[dy][dx]

        tiles_meta.append({
            "id": file_stem,
            "name": name,
            "category": category,
            "col": col,
            "row": row
        })

    # Write spritesheet PNG
    png_path = os.path.join(OUT_DIR, "tilemap.png")
    print(f"\nWriting {png_path}...")
    write_png(png_path, sheet_w, sheet_h, sheet)
    print(f"  Done: {os.path.getsize(png_path)} bytes")

    # Write metadata JSON
    meta = {
        "tileSize": TILE_SIZE,
        "columns": COLS,
        "spacing": 0,
        "tiles": tiles_meta
    }
    json_path = os.path.join(OUT_DIR, "tilemap.json")
    with open(json_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"Writing {json_path}... Done")
    print(f"\nCartography pack: {len(tiles_meta)} tiles in {COLS}x{rows} grid")


if __name__ == '__main__':
    main()
