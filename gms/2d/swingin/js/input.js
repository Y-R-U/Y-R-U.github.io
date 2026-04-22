// ============================================================
//  INPUT HANDLING — mouse, touch, button dispatch
// ============================================================

import { W, H } from './config.js';
import { game, mouse } from './state.js';
import { frog } from './frog.js';
import { shootTongue, releaseTongue } from './tongue.js';
import {
  menuButtons, shopButtons, levelCompleteButtons,
  gameOverButtons, tutorialButton,
} from './ui-screens.js';

export function initInput(canvas) {
  function getScreenPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  // --- Mouse (desktop) ---
  canvas.addEventListener('mousemove', e => {
    const p = getScreenPos(e);
    mouse.x = p.x;
    mouse.y = p.y;
  });

  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    mouse.down = true;
    handleClick();
  });

  canvas.addEventListener('mouseup', () => {
    mouse.down = false;
    handleRelease();
  });

  // --- Touch (mobile) ---
  // Touch mirrors mouse: touchstart acts on press (so holding means swinging
  // and reeling), touchend releases.
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = getScreenPos(e.touches[0]);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    handleClick();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const p = getScreenPos(e.touches[0]);
    mouse.x = p.x;
    mouse.y = p.y;
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    mouse.down = false;
    handleRelease();
  }, { passive: false });
}

function tryButtons(buttons) {
  for (const btn of buttons) {
    if (mouse.x >= btn.x && mouse.x <= btn.x + btn.w &&
        mouse.y >= btn.y && mouse.y <= btn.y + btn.h && btn.action) {
      btn.action();
      return true;
    }
  }
  return false;
}

function handleClick() {
  switch (game.state) {
    case 'menu':
      tryButtons(menuButtons);
      break;
    case 'tutorial':
      if (tutorialButton) tryButtons([tutorialButton]);
      break;
    case 'shop':
      tryButtons(shopButtons);
      break;
    case 'levelcomplete':
      tryButtons(levelCompleteButtons);
      break;
    case 'gameover':
      tryButtons(gameOverButtons);
      break;
    case 'playing':
      if (!frog.dead) shootTongue();
      break;
  }
}

function handleRelease() {
  if (game.state === 'playing' && frog.swinging) {
    releaseTongue();
  }
}
