let game;

document.addEventListener('DOMContentLoaded', () => {
    try {
        game = new Game();
        console.log('DriverC game initialized successfully');
    } catch (error) {
        console.error('Failed to initialize game:', error);
        showErrorScreen(error.message);
    }
});

function showErrorScreen(message) {
    const gameContainer = document.getElementById('gameContainer');
    gameContainer.innerHTML = `
        <div class="screen">
            <h2>Game Error</h2>
            <p>Failed to initialize the game:</p>
            <p style="color: #ff6b6b; font-family: monospace;">${message}</p>
            <p>Please check that all game assets are properly loaded.</p>
            <button class="menu-btn" onclick="location.reload()">Reload Game</button>
        </div>
    `;
}

// Removed beforeunload handler that was causing mobile issues

document.addEventListener('visibilitychange', () => {
    if (game && game.gameState === 'playing') {
        if (document.hidden) {
            game.pauseGame();
        }
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}