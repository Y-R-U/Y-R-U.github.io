class AssetManager {
    constructor() {
        this.images = new Map();
        this.loadedCount = 0;
        this.totalCount = 0;
        this.onProgressCallback = null;
        this.onCompleteCallback = null;
    }
    
    setProgressCallback(callback) {
        this.onProgressCallback = callback;
    }
    
    setCompleteCallback(callback) {
        this.onCompleteCallback = callback;
    }
    
    loadImage(key, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(key, img);
                this.loadedCount++;
                
                if (this.onProgressCallback) {
                    this.onProgressCallback(this.loadedCount, this.totalCount);
                }
                
                if (this.loadedCount === this.totalCount && this.onCompleteCallback) {
                    this.onCompleteCallback();
                }
                
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${path}`);
                // Create a fallback colored rectangle
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(0, 0, 64, 64);
                
                this.images.set(key, canvas);
                this.loadedCount++;
                
                if (this.onProgressCallback) {
                    this.onProgressCallback(this.loadedCount, this.totalCount);
                }
                
                if (this.loadedCount === this.totalCount && this.onCompleteCallback) {
                    this.onCompleteCallback();
                }
                
                resolve(canvas);
            };
            img.src = path;
        });
    }
    
    async loadAssets() {
        const assets = [
            // Car sprites - Red car in 8 directions
            { key: 'car_N', path: 'assets/sprites/racing/Isometric/raceCarRed_N.png' },
            { key: 'car_NE', path: 'assets/sprites/racing/Isometric/raceCarRed_NE.png' },
            { key: 'car_E', path: 'assets/sprites/racing/Isometric/raceCarRed_E.png' },
            { key: 'car_SE', path: 'assets/sprites/racing/Isometric/raceCarRed_SE.png' },
            { key: 'car_S', path: 'assets/sprites/racing/Isometric/raceCarRed_S.png' },
            { key: 'car_SW', path: 'assets/sprites/racing/Isometric/raceCarRed_SW.png' },
            { key: 'car_W', path: 'assets/sprites/racing/Isometric/raceCarRed_W.png' },
            { key: 'car_NW', path: 'assets/sprites/racing/Isometric/raceCarRed_NW.png' },
            
            // Road tiles
            { key: 'road_straight_NE', path: 'assets/sprites/racing/Isometric/roadStraight_NE.png' },
            { key: 'road_straight_NW', path: 'assets/sprites/racing/Isometric/roadStraight_NW.png' },
            { key: 'road_straight_SE', path: 'assets/sprites/racing/Isometric/roadStraight_SE.png' },
            { key: 'road_straight_SW', path: 'assets/sprites/racing/Isometric/roadStraight_SW.png' },
            
            { key: 'road_corner_NE', path: 'assets/sprites/racing/Isometric/roadCornerSmall_NE.png' },
            { key: 'road_corner_NW', path: 'assets/sprites/racing/Isometric/roadCornerSmall_NW.png' },
            { key: 'road_corner_SE', path: 'assets/sprites/racing/Isometric/roadCornerSmall_SE.png' },
            { key: 'road_corner_SW', path: 'assets/sprites/racing/Isometric/roadCornerSmall_SW.png' },
            
            // Grass tiles
            { key: 'grass_NE', path: 'assets/sprites/racing/Isometric/grass_NE.png' },
            { key: 'grass_NW', path: 'assets/sprites/racing/Isometric/grass_NW.png' },
            { key: 'grass_SE', path: 'assets/sprites/racing/Isometric/grass_SE.png' },
            { key: 'grass_SW', path: 'assets/sprites/racing/Isometric/grass_SW.png' },
            
            // Track decorations
            { key: 'barrier_NE', path: 'assets/sprites/racing/Isometric/barrierRed_NE.png' },
            { key: 'barrier_NW', path: 'assets/sprites/racing/Isometric/barrierRed_NW.png' },
            { key: 'barrier_SE', path: 'assets/sprites/racing/Isometric/barrierRed_SE.png' },
            { key: 'barrier_SW', path: 'assets/sprites/racing/Isometric/barrierRed_SW.png' },
            
            { key: 'flag_checkers_NE', path: 'assets/sprites/racing/Isometric/flagCheckers_NE.png' },
            { key: 'flag_checkers_NW', path: 'assets/sprites/racing/Isometric/flagCheckers_NW.png' },
            { key: 'flag_checkers_SE', path: 'assets/sprites/racing/Isometric/flagCheckers_SE.png' },
            { key: 'flag_checkers_SW', path: 'assets/sprites/racing/Isometric/flagCheckers_SW.png' },
            
            { key: 'pylon_NE', path: 'assets/sprites/racing/Isometric/pylon_NE.png' },
            { key: 'pylon_NW', path: 'assets/sprites/racing/Isometric/pylon_NW.png' },
            { key: 'pylon_SE', path: 'assets/sprites/racing/Isometric/pylon_SE.png' },
            { key: 'pylon_SW', path: 'assets/sprites/racing/Isometric/pylon_SW.png' },
        ];
        
        this.totalCount = assets.length;
        this.loadedCount = 0;
        
        const promises = assets.map(asset => this.loadImage(asset.key, asset.path));
        await Promise.all(promises);
        
        return this.images;
    }
    
    getImage(key) {
        return this.images.get(key);
    }
    
    getCarSprite(angle) {
        // Convert angle to 8-direction sprite
        const normalizedAngle = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        const octant = Math.round(normalizedAngle / (Math.PI / 4)) % 8;
        
        const directions = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
        const spriteKey = `car_${directions[octant]}`;
        
        return this.getImage(spriteKey);
    }
    
    getRandomDirection() {
        const directions = ['NE', 'NW', 'SE', 'SW'];
        return directions[Math.floor(Math.random() * directions.length)];
    }
}