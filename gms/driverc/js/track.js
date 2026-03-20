class Track {
    constructor() {
        this.tiles = [];
        this.checkpoints = [];
        this.startPosition = { x: 1600, y: 1200 };
        this.tileSize = 128;
        this.width = 80; // Quadrupled from original 20
        this.height = 60; // Quadrupled from original 15
        
        this.generateTrack();
    }
    
    generateTrack() {
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = this.getTileType(x, y);
            }
        }
        
        this.setupCheckpoints();
    }
    
    getTileType(x, y) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const distance = Utils.distance(x, y, centerX, centerY);
        
        if (distance < 3) return 'road';
        if (distance < 6) return 'grass';
        if (distance < 7 && Math.random() > 0.7) return 'tree';
        return 'grass';
    }
    
    setupCheckpoints() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 16; // Increased for much larger track
        
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            this.checkpoints.push({
                x: x * this.tileSize,
                y: y * this.tileSize,
                passed: false
            });
        }
    }
    
    render(ctx, camera) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const worldPos = Utils.worldToIso(x, y);
                const renderX = worldPos.x + 1600; // Adjusted for much larger map
                const renderY = worldPos.y + 800; // Adjusted for much larger map
                
                if (!camera.isVisible(renderX, renderY, this.tileSize, this.tileSize)) {
                    continue;
                }
                
                this.renderTile(ctx, this.tiles[y][x], renderX, renderY, window.assetManager);
            }
        }
        
        this.renderCheckpoints(ctx);
    }
    
    renderTile(ctx, type, x, y, assetManager) {
        ctx.save();
        
        const direction = this.getTileDirection(x, y);
        
        switch (type) {
            case 'road':
                const roadSprite = assetManager?.getImage(`road_straight_${direction}`);
                if (roadSprite) {
                    // Scale the road sprite to match new tile size
                    ctx.drawImage(roadSprite, x, y, this.tileSize, this.tileSize/2);
                } else {
                    // Fallback
                    ctx.fillStyle = '#555555';
                    this.drawIsometricTile(ctx, x, y, this.tileSize, this.tileSize/2);
                    ctx.fillStyle = '#777777';
                    this.drawIsometricTile(ctx, x + 8, y + 4, this.tileSize-16, this.tileSize/2-8);
                }
                break;
                
            case 'grass':
                const grassSprite = assetManager?.getImage(`grass_${direction}`);
                if (grassSprite) {
                    // Scale the grass sprite to match new tile size
                    ctx.drawImage(grassSprite, x, y, this.tileSize, this.tileSize/2);
                } else {
                    // Fallback
                    ctx.fillStyle = '#4CAF50';
                    this.drawIsometricTile(ctx, x, y, this.tileSize, this.tileSize/2);
                }
                break;
                
            case 'tree':
                const grassTreeSprite = assetManager?.getImage(`grass_${direction}`);
                if (grassTreeSprite) {
                    ctx.drawImage(grassTreeSprite, x, y, this.tileSize, this.tileSize/2);
                }
                
                const pylonSprite = assetManager?.getImage(`pylon_${direction}`);
                if (pylonSprite) {
                    ctx.drawImage(pylonSprite, x, y, this.tileSize, this.tileSize/2);
                } else {
                    // Fallback tree
                    ctx.fillStyle = '#8D6E63';
                    this.drawIsometricRect(ctx, x + 28, y + 10, 8, 12);
                    ctx.fillStyle = '#2E7D32';
                    ctx.beginPath();
                    ctx.arc(x + 32, y + 8, 12, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
        }
        
        ctx.restore();
    }
    
    getTileDirection(x, y) {
        // Randomize tile direction for visual variety
        const seed = x * 31 + y * 17;
        const directions = ['NE', 'NW', 'SE', 'SW'];
        return directions[seed % directions.length];
    }
    
    drawIsometricTile(ctx, x, y, width, height) {
        ctx.beginPath();
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height / 2);
        ctx.lineTo(x + width / 2, y + height);
        ctx.lineTo(x, y + height / 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    drawIsometricRect(ctx, x, y, width, height) {
        ctx.fillRect(x, y, width, height);
    }
    
    renderCheckpoints(ctx) {
        this.checkpoints.forEach((checkpoint, index) => {
            if (checkpoint.passed) return;
            
            ctx.save();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            
            const size = 60; // Doubled for larger scale
            ctx.strokeRect(
                checkpoint.x - size / 2,
                checkpoint.y - size / 2,
                size,
                size
            );
            
            ctx.fillStyle = '#FFD700';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(
                (index + 1).toString(),
                checkpoint.x,
                checkpoint.y + 5
            );
            
            ctx.restore();
        });
    }
    
    checkCollision(x, y) {
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return true;
        }
        
        const tile = this.tiles[tileY][tileX];
        return tile === 'tree';
    }
    
    checkCheckpoint(x, y) {
        for (let i = 0; i < this.checkpoints.length; i++) {
            const checkpoint = this.checkpoints[i];
            if (checkpoint.passed) continue;
            
            const distance = Utils.distance(x, y, checkpoint.x, checkpoint.y);
            if (distance < 60) { // Doubled checkpoint size for larger scale
                checkpoint.passed = true;
                return i;
            }
        }
        return -1;
    }
    
    resetCheckpoints() {
        this.checkpoints.forEach(checkpoint => {
            checkpoint.passed = false;
        });
    }
    
    getAllCheckpointsPassed() {
        return this.checkpoints.every(checkpoint => checkpoint.passed);
    }
}