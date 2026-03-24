class Utils {
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    
    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    static distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    
    static angle(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    }
    
    static normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
    
    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    static createIsometricPoint(x, y) {
        return {
            x: (x - y) * 0.866,
            y: (x + y) * 0.5
        };
    }
    
    static worldToIso(worldX, worldY) {
        return {
            x: (worldX - worldY) * 32,
            y: (worldX + worldY) * 16
        };
    }
    
    static isoToWorld(isoX, isoY) {
        return {
            x: (isoX / 32 + isoY / 16) / 2,
            y: (isoY / 16 - isoX / 32) / 2
        };
    }
}