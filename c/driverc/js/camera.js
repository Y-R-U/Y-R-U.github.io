class Camera {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.zoom = 1;
        this.targetZoom = 1;
        this.smoothing = 0.05;
        this.zoomSmoothing = 0.1;
    }
    
    update(targetX, targetY, speed = 0) {
        this.targetX = targetX - this.canvas.width / 2;
        this.targetY = targetY - this.canvas.height / 2;
        
        this.x = Utils.lerp(this.x, this.targetX, this.smoothing);
        this.y = Utils.lerp(this.y, this.targetY, this.smoothing);
        
        const baseZoom = Math.min(this.canvas.width / 1200, this.canvas.height / 800);
        const speedZoom = 1 - (speed * 0.0005);
        this.targetZoom = Utils.clamp(baseZoom * speedZoom, 0.5, 2);
        
        this.zoom = Utils.lerp(this.zoom, this.targetZoom, this.zoomSmoothing);
    }
    
    apply(ctx) {
        ctx.save();
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }
    
    restore(ctx) {
        ctx.restore();
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.zoom) + this.x,
            y: (screenY / this.zoom) + this.y
        };
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.x) * this.zoom,
            y: (worldY - this.y) * this.zoom
        };
    }
    
    isVisible(x, y, width, height) {
        const margin = 100;
        return !(x + width < this.x - margin || 
                 x > this.x + this.canvas.width / this.zoom + margin ||
                 y + height < this.y - margin || 
                 y > this.y + this.canvas.height / this.zoom + margin);
    }
}