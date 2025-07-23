# DriverC - Asset Download Instructions

## Required Kenney Assets

Please download the following asset packs from https://kenney.nl/assets and extract them to the specified folders:

### 1. Racing Pack (Required)
- **URL**: https://kenney.nl/assets/racing-pack
- **Extract to**: `assets/sprites/racing/`
- **Contains**: Isometric cars, roads, buildings, props

### 2. City Kit (Roads) (Required)
- **URL**: https://kenney.nl/assets/city-kit-roads
- **Extract to**: `assets/sprites/roads/`
- **Contains**: Road tiles, intersections, curves

### 3. Isometric Buildings (Optional but recommended)
- **URL**: https://kenney.nl/assets/isometric-buildings
- **Extract to**: `assets/sprites/buildings/`
- **Contains**: Buildings for city environment

### 4. UI Pack (Optional)
- **URL**: https://kenney.nl/assets/ui-pack
- **Extract to**: `assets/sprites/ui/`
- **Contains**: UI elements, buttons, progress bars

## Expected Folder Structure After Download:

```
c/driverc/
├── assets/
│   ├── sprites/
│   │   ├── racing/          # Racing Pack contents
│   │   ├── roads/           # City Kit Roads contents
│   │   ├── buildings/       # Isometric Buildings contents
│   │   └── ui/              # UI Pack contents
│   ├── audio/               # (Will be populated later)
│   └── fonts/               # (Will be populated later)
├── js/
├── css/
└── index.html
```

## Key Files We'll Use:
- `racing/` - Car sprites (isometric vehicles)
- `roads/` - Road tiles for track building
- `buildings/` - Environmental decoration
- `ui/` - Game interface elements

After downloading, the game will be built using vanilla JavaScript with HTML5 Canvas for optimal mobile performance.