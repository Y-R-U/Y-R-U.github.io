class InputManager {
    constructor() {
        this.keys = {};
        this.touches = {};
        this.gamepad = null;
        
        this.setupKeyboard();
        this.setupTouch();
        this.setupGamepad();
    }
    
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            e.preventDefault();
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            e.preventDefault();
        });
    }
    
    setupTouch() {
        const buttons = {
            leftBtn: 'left',
            rightBtn: 'right',
            gasBtn: 'gas',
            brakeBtn: 'brake'
        };
        
        Object.entries(buttons).forEach(([id, action]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.touches[action] = true;
                    btn.style.transform = 'scale(0.9)';
                });
                
                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.touches[action] = false;
                    btn.style.transform = 'scale(1)';
                });
                
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.touches[action] = true;
                    btn.style.transform = 'scale(0.9)';
                });
                
                btn.addEventListener('mouseup', (e) => {
                    e.preventDefault();
                    this.touches[action] = false;
                    btn.style.transform = 'scale(1)';
                });
            }
        });
    }
    
    setupGamepad() {
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad);
        });
        
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected:', e.gamepad);
        });
    }
    
    updateGamepad() {
        const gamepads = navigator.getGamepads();
        if (gamepads[0]) {
            this.gamepad = gamepads[0];
        }
    }
    
    isPressed(action) {
        switch (action) {
            case 'left':
                return this.keys['arrowleft'] || this.keys['a'] || this.touches.left || 
                       (this.gamepad && this.gamepad.axes[0] < -0.3);
            case 'right':
                return this.keys['arrowright'] || this.keys['d'] || this.touches.right || 
                       (this.gamepad && this.gamepad.axes[0] > 0.3);
            case 'gas':
                return this.keys['arrowup'] || this.keys['w'] || this.keys[' '] || this.touches.gas || 
                       (this.gamepad && (this.gamepad.buttons[0].pressed || this.gamepad.axes[1] < -0.3));
            case 'brake':
                return this.keys['arrowdown'] || this.keys['s'] || this.keys['control'] || this.touches.brake || 
                       (this.gamepad && (this.gamepad.buttons[1].pressed || this.gamepad.axes[1] > 0.3));
            default:
                return false;
        }
    }
    
    getSteeringInput() {
        let steering = 0;
        if (this.isPressed('left')) steering -= 1;
        if (this.isPressed('right')) steering += 1;
        
        if (this.gamepad && Math.abs(this.gamepad.axes[0]) > 0.1) {
            steering = this.gamepad.axes[0];
        }
        
        return Utils.clamp(steering, -1, 1);
    }
    
    getAccelerationInput() {
        if (this.isPressed('gas')) return 1;
        if (this.isPressed('brake')) return -1;
        
        if (this.gamepad) {
            if (this.gamepad.buttons[7] && this.gamepad.buttons[7].pressed) return this.gamepad.buttons[7].value;
            if (this.gamepad.buttons[6] && this.gamepad.buttons[6].pressed) return -this.gamepad.buttons[6].value;
        }
        
        return 0;
    }
}