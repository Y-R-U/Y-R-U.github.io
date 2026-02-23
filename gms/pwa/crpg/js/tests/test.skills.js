// ===== Skills Tests =====
import { TestRunner, assert, assertEqual, assertRange } from './testRunner.js';
import { SKILLS, SKILL_LEVEL_CAP, xpForLevel, totalXpForLevel } from '../config.js';
import { awardXP, isTaskUnlocked, getSkillProgress } from '../skills/skillEngine.js';
import { resetGame, getState } from '../state.js';

export function registerSkillTests(runner) {
  runner.describe('Skills: XP Formula', (it) => {
    it('xpForLevel(1) ≈ 336', () => {
      assertRange(xpForLevel(1), 300, 400, 'Level 1 XP should be ~336');
    });
    it('xpForLevel(10) > xpForLevel(1)', () => {
      assert(xpForLevel(10) > xpForLevel(1), 'XP should increase with level');
    });
    it('xpForLevel(50) is large', () => {
      assertRange(xpForLevel(50), 200000, 400000, 'Level 50 XP should be ~287k');
    });
    it('xpForLevel(99) is very large', () => {
      assert(xpForLevel(99) > 1000000, 'Level 99 XP should be > 1M');
    });
    it('formula is 300 * 1.12^n', () => {
      const expected = Math.floor(300 * Math.pow(1.12, 5));
      assertEqual(xpForLevel(5), expected, 'Formula mismatch');
    });
  });

  runner.describe('Skills: Init State', (it) => {
    it('all skills initialise at level 1', () => {
      resetGame();
      const st = getState();
      for (const id of Object.keys(SKILLS)) {
        assertEqual(st.player.skills[id]?.level, 1, `${id} should start at level 1`);
      }
    });
    it('all skills initialise with 0 XP', () => {
      resetGame();
      const st = getState();
      for (const id of Object.keys(SKILLS)) {
        assertEqual(st.player.skills[id]?.xp, 0, `${id} should start at 0 XP`);
      }
    });
    it('12 skills total', () => {
      assertEqual(Object.keys(SKILLS).length, 12, 'Expected 12 skills');
    });
  });

  runner.describe('Skills: Award XP', (it) => {
    it('awardXP increases correct skill only', () => {
      resetGame();
      const st = getState();
      const atkBefore = st.player.skills.attack.xp;
      const defBefore = st.player.skills.defence.xp;
      awardXP('attack', 100, null);
      assert(st.player.skills.attack.xp > atkBefore, 'Attack XP should increase');
      assertEqual(st.player.skills.defence.xp, defBefore, 'Defence XP should not change');
    });
    it('level up fires at correct XP threshold', () => {
      resetGame();
      const st = getState();
      const needed = xpForLevel(1);
      awardXP('fishing', needed + 1, null);
      assertEqual(st.player.skills.fishing.level, 2, 'Should level up to 2');
    });
    it('does not exceed level cap', () => {
      resetGame();
      const st = getState();
      st.player.skills.mining.level = SKILL_LEVEL_CAP;
      const before = st.player.skills.mining.level;
      awardXP('mining', 99999999, null);
      assertEqual(st.player.skills.mining.level, SKILL_LEVEL_CAP, 'Should not exceed cap');
    });
  });

  runner.describe('Skills: Unlock Gates', (it) => {
    it('task unavailable below required level', () => {
      resetGame();
      const st = getState();
      st.player.skills.fishing.level = 1;
      assert(!isTaskUnlocked('fishing', 20), 'Level 20 fishing task should be locked at level 1');
    });
    it('task available at exact required level', () => {
      resetGame();
      const st = getState();
      st.player.skills.fishing.level = 20;
      assert(isTaskUnlocked('fishing', 20), 'Level 20 fishing task should be unlocked at level 20');
    });
    it('task available above required level', () => {
      resetGame();
      const st = getState();
      st.player.skills.fishing.level = 50;
      assert(isTaskUnlocked('fishing', 20), 'Level 20 task should be available at level 50');
    });
  });

  runner.describe('Skills: Progress', (it) => {
    it('getSkillProgress returns 0 at start', () => {
      resetGame();
      assertEqual(getSkillProgress('attack'), 0, 'Progress should be 0 at start');
    });
    it('getSkillProgress returns 1 at max level', () => {
      resetGame();
      const st = getState();
      st.player.skills.attack.level = SKILL_LEVEL_CAP;
      assertEqual(getSkillProgress('attack'), 1, 'Progress should be 1 at max level');
    });
  });
}
