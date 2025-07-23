class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.input = new InputManager();
        this.camera = new Camera(this.canvas);
        this.track = new Track();
        this.car = new Car(800, 600); // Adjusted for larger map
        this.assetManager = new AssetManager();
        
        this.gameState = 'menu'; // menu, playing, paused, finished
        this.lastTime = 0;
        this.totalRaceTime = 0;
        
        // Make asset manager globally available
        window.assetManager = this.assetManager;
        
        this.setupCanvas();
        this.setupUI();
        this.loadAssets();
    }
    
    setupCanvas() {
        const resizeCanvas = () => {
            const container = document.getElementById('gameContainer');
            const containerRect = container.getBoundingClientRect();
            
            const aspectRatio = 16 / 9;
            let width = containerRect.width * 0.9;
            let height = width / aspectRatio;
            
            if (height > containerRect.height * 0.9) {
                height = containerRect.height * 0.9;
                width = height * aspectRatio;
            }
            
            this.canvas.width = width;
            this.canvas.height = height;
            
            this.camera = new Camera(this.canvas);
            
            this.ctx.imageSmoothingEnabled = false;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupUI() {
        document.getElementById('startRace').addEventListener('click', () => {
            this.startRace();
        });
        
        document.getElementById('instructions').addEventListener('click', () => {
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('instructionsScreen').style.display = 'flex';
        });
        
        document.getElementById('backBtn').addEventListener('click', () => {
            document.getElementById('instructionsScreen').style.display = 'none';
            document.getElementById('startScreen').style.display = 'flex';
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.startRace();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.gameState === 'playing') {
                    this.pauseGame();
                } else if (this.gameState === 'paused') {
                    this.resumeGame();
                }
            }
        });
    }
    
    async loadAssets() {
        this.showLoadingScreen();
        
        this.assetManager.setProgressCallback((loaded, total) => {
            const progress = (loaded / total) * 100;
            document.getElementById('loadingProgress').style.width = progress + '%';
            
            if (progress < 30) {
                document.getElementById('loadingText').textContent = 'Loading track textures...';
            } else if (progress < 60) {
                document.getElementById('loadingText').textContent = 'Loading vehicle sprites...';
            } else if (progress < 90) {
                document.getElementById('loadingText').textContent = 'Preparing game engine...';
            } else {
                document.getElementById('loadingText').textContent = 'Ready to race!';
            }
        });
        
        this.assetManager.setCompleteCallback(() => {
            setTimeout(() => {
                this.hideLoadingScreen();
                this.showStartScreen();
            }, 500);
        });
        
        try {
            await this.assetManager.loadAssets();
        } catch (error) {
            console.error('Failed to load assets:', error);
            document.getElementById('loadingText').textContent = 'Some assets failed to load, using fallbacks...';
            setTimeout(() => {
                this.hideLoadingScreen();
                this.showStartScreen();
            }, 1000);
        }
    }
    
    showLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'flex';
        
        let progress = 0;
        const loadingInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 100) {
                progress = 100;
                clearInterval(loadingInterval);
            }
            
            document.getElementById('loadingProgress').style.width = progress + '%';
            
            if (progress < 30) {
                document.getElementById('loadingText').textContent = 'Loading track data...';
            } else if (progress < 60) {
                document.getElementById('loadingText').textContent = 'Loading vehicle assets...';
            } else if (progress < 90) {
                document.getElementById('loadingText').textContent = 'Preparing game engine...';
            } else {
                document.getElementById('loadingText').textContent = 'Ready to race!';
            }
        }, 100);
    }
    
    hideLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'none';
    }
    
    showStartScreen() {
        document.getElementById('startScreen').style.display = 'flex';
    }
    
    startRace() {
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('instructionsScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        
        this.gameState = 'playing';
        this.totalRaceTime = 0;
        this.car.reset(800, 600); // Adjusted for larger map
        this.track.resetCheckpoints();
        
        if (Utils.isMobile()) {
            document.getElementById('controls').style.display = 'flex';
            document.getElementById('joystickContainer').style.display = 'block';
        } else {
            document.getElementById('controls').style.display = 'none';
            document.getElementById('joystickContainer').style.display = 'none';
        }
        
        this.gameLoop();
    }
    
    pauseGame() {
        this.gameState = 'paused';
    }
    
    resumeGame() {
        this.gameState = 'playing';
        this.lastTime = performance.now();
    }
    
    finishRace() {
        this.gameState = 'finished';
        document.getElementById('controls').style.display = 'none';
        document.getElementById('joystickContainer').style.display = 'none';
        
        document.getElementById('finalTime').textContent = Utils.formatTime(this.totalRaceTime);
        document.getElementById('bestLap').textContent = Utils.formatTime(this.car.bestLapTime);
        document.getElementById('gameOverScreen').style.display = 'flex';
    }
    
    update(deltaTime) {
        if (this.gameState !== 'playing') return;
        
        this.input.updateGamepad();
        this.car.update(deltaTime, this.input, this.track);
        this.camera.update(this.car.x, this.car.y, Math.abs(this.car.speed));
        
        this.totalRaceTime += deltaTime;
        
        if (this.car.raceFinished) {
            this.finishRace();
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.camera.apply(this.ctx);
        
        this.track.render(this.ctx, this.camera);
        this.car.render(this.ctx);
        
        this.renderMinimap();
        
        this.camera.restore(this.ctx);
        
        if (this.gameState === 'paused') {
            this.renderPauseScreen();
        }
    }
    
    renderMinimap() {
        const minimapSize = 120;
        const minimapX = this.canvas.width - minimapSize - 20;
        const minimapY = 20;
        
        this.ctx.save();
        this.ctx.resetTransform();
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
        
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
        
        const scaleX = minimapSize / (this.track.width * this.track.tileSize);
        const scaleY = minimapSize / (this.track.height * this.track.tileSize);
        
        this.ctx.fillStyle = '#ff0000';
        const carX = minimapX + (this.car.x * scaleX);
        const carY = minimapY + (this.car.y * scaleY);
        this.ctx.fillRect(carX - 2, carY - 2, 4, 4);
        
        this.ctx.fillStyle = '#ffff00';
        this.track.checkpoints.forEach(checkpoint => {
            if (!checkpoint.passed) {
                const cpX = minimapX + (checkpoint.x * scaleX);
                const cpY = minimapY + (checkpoint.y * scaleY);
                this.ctx.fillRect(cpX - 1, cpY - 1, 2, 2);
            }
        });
        
        this.ctx.restore();
    }
    
    renderPauseScreen() {
        this.ctx.save();
        this.ctx.resetTransform();
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press ESC to resume', this.canvas.width / 2, this.canvas.height / 2 + 50);
        
        this.ctx.restore();
    }
    
    gameLoop(currentTime = 0) {
        if (this.gameState === 'finished') return;
        
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.016);
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.render();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}