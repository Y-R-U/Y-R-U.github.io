// Game HUD layer above the flight HUD: score/rank (score.js), opportunity prompts (prompts.js), first-flight coach (coach.js),
// the bottom action slot (DEMAND IT, DEMAND TAKEOFF, Skip to runway) that keeps clear of both thumbs, and the top band
// (prompt card left of the warp chip, parked difficulty/aircraft chips).
import { createScoreHUD } from './score.js';
import { createPrompts } from './prompts.js';
import { createCoach } from './coach.js';
import { createFinishButton } from './finish.js';
import { createGroundButtons } from './ground.js';
import { createHeadlines } from './headlines.js';
import { createOnlineHUD } from './online.js';
import { injectHudCss } from './style.js';
import { createMsgCap } from './msgcap.js';
import { createHints } from './hints.js';

export function createGameHUD(root, { getSettings, onTarget, onFinish, onTakeoff, onSkip, onReel, onDifficulty, onAircraft, coachForce = false } = {}) {
  injectHudCss();
  const el = document.createElement('div');
  el.id = 'krz-ghud';
  el.hidden = true;
  root.append(el);
  const headlines = createHeadlines(el, { onReel: (on) => onReel?.(on) });
  const score = createScoreHUD(el, { headlines });
  score.el.append(headlines.badge, headlines.toast);
  const actions = document.createElement('div');
  actions.className = 'krz-actions';
  el.append(actions);
  let ground = null;
  const prompts = createPrompts(el, { getSettings, onTarget, held: () => !!ground?.chipsOn });
  const finish = createFinishButton(actions, { onPress: () => onFinish?.() });
  ground = createGroundButtons(actions, { chipRoot: el, onTakeoff: () => onTakeoff?.(), onSkip: () => onSkip?.(), onDifficulty: (d) => onDifficulty?.(d), onAircraft: (a) => onAircraft?.(a) });
  const coach = createCoach(el, { force: coachForce });
  const online = createOnlineHUD(el);
  const msgcap = createMsgCap();
  const hints = createHints({ force: /[?&]hints=1\b/.test(location.search) });
  return {
    el, score, prompts, coach, finish, ground, actions, headlines, online, msgcap, hints,
    setVisible(v) { el.hidden = !v; score.setVisible(v); if (!v) { coach.end(); prompts.reset(); finish.set('hidden'); ground.set({}); headlines.reset(); online.setVisible(false); msgcap.reset(); hints.hide(); } },
  };
}
