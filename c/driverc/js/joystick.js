class VirtualJoystick {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            size: options.size || 120,
            threshold: options.threshold || 10,
            fadeOnIdle: options.fadeOnIdle !== false,
            alwaysVisible: options.alwaysVisible || false,
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
        
        if (this.options.alwaysVisible) {
            this.show();
        } else {
            this.hide();
        }
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
            background: rgba(255, 255, 255, 0.2);
            border: 3px solid rgba(255, 255, 255, 0.5);
            backdrop-filter: blur(10px);
            pointer-events: all;
            z-index: 1000;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 1;
            visibility: visible;
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
            this.show();
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
        this.baseElement.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd, { passive: false });
        document.addEventListener('touchcancel', handleEnd, { passive: false });
        
        // Mouse events for desktop testing
        this.baseElement.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        
        // Prevent context menu
        this.baseElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    positionBase(x, y) {
        this.baseElement.style.left = x + 'px';
        this.baseElement.style.top = y + 'px';
        this.baseElement.style.transform = 'none'; // Remove centering transform when positioning
    }
    
    updateStick(touchX, touchY) {
        // Get container rect and calculate relative position
        const containerRect = this.container.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;
        
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
        this.baseElement.style.visibility = 'visible';
        this.baseElement.style.transform = 'translate(-50%, -50%) scale(1)';
    }
    
    hide() {
        // Don't actually hide on mobile, just make slightly transparent
        this.baseElement.style.opacity = '0.7';
        this.baseElement.style.visibility = 'visible';
        this.baseElement.style.transform = 'translate(-50%, -50%) scale(0.9)';
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