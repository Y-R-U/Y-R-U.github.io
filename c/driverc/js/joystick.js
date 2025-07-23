class VirtualJoystick {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            size: options.size || 120,
            threshold: options.threshold || 10,
            fadeOnIdle: options.fadeOnIdle !== false,
            ...options
        };
        
        this.baseElement = null;
        this.stickElement = null;
        this.pressed = false;
        this.baseX = 0;
        this.baseY = 0;
        this.deltaX = 0;
        this.deltaY = 0;
        this.angle = 0;
        this.distance = 0;
        
        this.callbacks = {
            start: [],
            move: [],
            end: []
        };
        
        this.init();
    }
    
    init() {
        this.createElements();
        this.bindEvents();
        this.hide();
    }
    
    createElements() {
        // Base (outer circle)
        this.baseElement = document.createElement('div');
        this.baseElement.className = 'virtual-joystick-base';
        this.baseElement.style.cssText = `
            position: absolute;
            width: ${this.options.size}px;
            height: ${this.options.size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.3);
            backdrop-filter: blur(10px);
            pointer-events: none;
            z-index: 1000;
        `;
        
        // Stick (inner circle)
        this.stickElement = document.createElement('div');
        this.stickElement.className = 'virtual-joystick-stick';
        this.stickElement.style.cssText = `
            position: absolute;
            width: ${this.options.size * 0.4}px;
            height: ${this.options.size * 0.4}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.8);
            border: 2px solid rgba(255, 255, 255, 1);
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            transition: all 0.1s ease;
        `;
        
        this.baseElement.appendChild(this.stickElement);
        this.container.appendChild(this.baseElement);
    }
    
    bindEvents() {
        const handleStart = (e) => {
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            
            this.pressed = true;
            this.baseX = touch.clientX - this.options.size / 2;
            this.baseY = touch.clientY - this.options.size / 2;
            
            this.show();
            this.positionBase(this.baseX, this.baseY);
            this.updateStick(touch.clientX, touch.clientY);
            
            this.trigger('start', this.getState());
        };
        
        const handleMove = (e) => {
            if (!this.pressed) return;
            e.preventDefault();
            
            const touch = e.touches ? e.touches[0] : e;
            this.updateStick(touch.clientX, touch.clientY);
            this.trigger('move', this.getState());
        };
        
        const handleEnd = (e) => {
            if (!this.pressed) return;
            e.preventDefault();
            
            this.pressed = false;
            this.deltaX = 0;
            this.deltaY = 0;
            this.distance = 0;
            this.angle = 0;
            
            this.resetStick();
            
            if (this.options.fadeOnIdle) {
                setTimeout(() => {
                    if (!this.pressed) this.hide();
                }, 1000);
            }
            
            this.trigger('end', this.getState());
        };
        
        // Touch events
        this.container.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd, { passive: false });
        
        // Mouse events for desktop testing
        this.container.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }
    
    positionBase(x, y) {
        this.baseElement.style.left = x + 'px';
        this.baseElement.style.top = y + 'px';
    }
    
    updateStick(touchX, touchY) {
        const centerX = this.baseX + this.options.size / 2;
        const centerY = this.baseY + this.options.size / 2;
        
        this.deltaX = touchX - centerX;
        this.deltaY = touchY - centerY;
        
        this.distance = Math.min(Math.sqrt(this.deltaX ** 2 + this.deltaY ** 2), this.options.size / 2);
        this.angle = Math.atan2(this.deltaY, this.deltaX);
        
        // Constrain stick to base circle
        const maxDistance = this.options.size / 2 - this.options.size * 0.2;
        if (this.distance > maxDistance) {
            this.deltaX = Math.cos(this.angle) * maxDistance;
            this.deltaY = Math.sin(this.angle) * maxDistance;
            this.distance = maxDistance;
        }
        
        // Position stick
        const stickX = 50 + (this.deltaX / maxDistance) * 30; // 30% of base radius
        const stickY = 50 + (this.deltaY / maxDistance) * 30;
        
        this.stickElement.style.left = stickX + '%';
        this.stickElement.style.top = stickY + '%';
    }
    
    resetStick() {
        this.stickElement.style.left = '50%';
        this.stickElement.style.top = '50%';
    }
    
    show() {
        this.baseElement.style.opacity = '1';
        this.baseElement.style.transform = 'scale(1)';
    }
    
    hide() {
        this.baseElement.style.opacity = '0.3';
        this.baseElement.style.transform = 'scale(0.8)';
    }
    
    getState() {
        return {
            pressed: this.pressed,
            deltaX: this.deltaX,
            deltaY: this.deltaY,
            distance: this.distance,
            angle: this.angle,
            normalizedX: this.deltaX / (this.options.size / 2),
            normalizedY: this.deltaY / (this.options.size / 2)
        };
    }
    
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }
    
    trigger(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }
    
    destroy() {
        if (this.baseElement && this.baseElement.parentNode) {
            this.baseElement.parentNode.removeChild(this.baseElement);
        }
    }
}