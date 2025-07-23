class Car {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 300;
        this.acceleration = 200;
        this.friction = 50;
        this.turnSpeed = 2;
        this.width = 32;
        this.height = 16;
        
        this.velocity = { x: 0, y: 0 };
        this.drift = 0;
        this.skidMarks = [];
        
        this.lapTime = 0;
        this.bestLapTime = Infinity;
        this.currentLap = 1;
        this.totalLaps = 3;
        this.raceFinished = false;
    }
    
    update(deltaTime, input, track) {
        const steering = input.getSteeringInput();
        const acceleration = input.getAccelerationInput();
        
        this.handleSteering(steering, deltaTime);
        this.handleAcceleration(acceleration, deltaTime);
        this.updatePhysics(deltaTime);
        this.checkCollisions(track);
        this.updateLapProgress(track);
        
        this.lapTime += deltaTime;
    }
    
    handleSteering(steering, deltaTime) {
        if (Math.abs(this.speed) > 10) {
            const turnFactor = Utils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.3, 1);
            this.angle += steering * this.turnSpeed * turnFactor * deltaTime;
        }
    }
    
    handleAcceleration(acceleration, deltaTime) {
        if (acceleration > 0) {
            this.speed += this.acceleration * deltaTime;
        } else if (acceleration < 0) {
            this.speed -= this.acceleration * 1.5 * deltaTime;
        } else {
            if (this.speed > 0) {
                this.speed = Math.max(0, this.speed - this.friction * deltaTime);
            } else {
                this.speed = Math.min(0, this.speed + this.friction * deltaTime);
            }
        }
        
        this.speed = Utils.clamp(this.speed, -this.maxSpeed * 0.5, this.maxSpeed);
    }
    
    updatePhysics(deltaTime) {
        const forwardX = Math.cos(this.angle);
        const forwardY = Math.sin(this.angle);
        
        this.velocity.x = forwardX * this.speed;
        this.velocity.y = forwardY * this.speed;
        
        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;
        
        if (Math.abs(this.speed) > 150) {
            this.addSkidMark();
        }
    }
    
    addSkidMark() {
        if (this.skidMarks.length > 100) {
            this.skidMarks.shift();
        }
        
        this.skidMarks.push({
            x: this.x,
            y: this.y,
            opacity: 1
        });
    }
    
    updateSkidMarks(deltaTime) {
        this.skidMarks.forEach(mark => {
            mark.opacity -= deltaTime * 0.5;
        });
        
        this.skidMarks = this.skidMarks.filter(mark => mark.opacity > 0);
    }
    
    checkCollisions(track) {
        const corners = [
            { x: this.x - this.width / 2, y: this.y - this.height / 2 },
            { x: this.x + this.width / 2, y: this.y - this.height / 2 },
            { x: this.x - this.width / 2, y: this.y + this.height / 2 },
            { x: this.x + this.width / 2, y: this.y + this.height / 2 }
        ];
        
        for (const corner of corners) {
            if (track.checkCollision(corner.x, corner.y)) {
                this.speed *= 0.1;
                
                const bounceX = Math.cos(this.angle + Math.PI);
                const bounceY = Math.sin(this.angle + Math.PI);
                this.x += bounceX * 5;
                this.y += bounceY * 5;
                break;
            }
        }
    }
    
    updateLapProgress(track) {
        const checkpointIndex = track.checkCheckpoint(this.x, this.y);
        
        if (checkpointIndex === 0 && track.getAllCheckpointsPassed()) {
            this.completeLap(track);
        }
    }
    
    completeLap(track) {
        if (this.lapTime < this.bestLapTime) {
            this.bestLapTime = this.lapTime;
        }
        
        this.currentLap++;
        this.lapTime = 0;
        track.resetCheckpoints();
        
        if (this.currentLap > this.totalLaps) {
            this.raceFinished = true;
        }
    }
    
    render(ctx) {
        this.renderSkidMarks(ctx);
        this.renderCar(ctx);
    }
    
    renderSkidMarks(ctx) {
        ctx.save();
        this.skidMarks.forEach(mark => {
            ctx.globalAlpha = mark.opacity * 0.3;
            ctx.fillStyle = '#333333';
            ctx.fillRect(mark.x - 2, mark.y - 1, 4, 2);
        });
        ctx.restore();
    }
    
    renderCar(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        this.drawIsometricCar(ctx, window.assetManager);
        
        ctx.restore();
        
        this.renderSpeedometer(ctx);
    }
    
    drawIsometricCar(ctx, assetManager) {
        if (assetManager) {
            const carSprite = assetManager.getCarSprite(this.angle);
            if (carSprite) {
                const scale = 0.8;
                const width = carSprite.width * scale;
                const height = carSprite.height * scale;
                
                ctx.drawImage(
                    carSprite,
                    -width / 2,
                    -height / 2,
                    width,
                    height
                );
                return;
            }
        }
        
        // Fallback to procedural rendering
        const width = this.width;
        const height = this.height;
        
        ctx.fillStyle = '#E53E3E';
        ctx.fillRect(-width / 2, -height / 2, width, height);
        
        ctx.fillStyle = '#C53030';
        ctx.fillRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4);
        
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(-width / 4, -height / 2 + 3, width / 2, height - 6);
        
        ctx.fillStyle = '#2D3748';
        ctx.fillRect(-width / 2 - 2, -height / 4, 4, height / 2);
        ctx.fillRect(width / 2 - 2, -height / 4, 4, height / 2);
        
        ctx.fillStyle = '#FFFF00';
        if (this.speed > 0) {
            ctx.fillRect(width / 2 - 4, -height / 2 + 2, 6, 3);
            ctx.fillRect(width / 2 - 4, height / 2 - 5, 6, 3);
        }
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-width / 2, -height / 2, width, height);
    }
    
    renderSpeedometer(ctx) {
        const speedKmh = Math.abs(this.speed) * 3.6;
        document.getElementById('speed').textContent = Math.round(speedKmh);
        document.getElementById('lap').textContent = `${this.currentLap}/${this.totalLaps}`;
        document.getElementById('time').textContent = Utils.formatTime(this.lapTime);
    }
    
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.speed = 0;
        this.velocity = { x: 0, y: 0 };
        this.lapTime = 0;
        this.currentLap = 1;
        this.raceFinished = false;
        this.skidMarks = [];
    }
}