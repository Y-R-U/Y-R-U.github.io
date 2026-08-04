// First run: the briefing, the guided opening objectives, and the how-to-play you can reopen.
// main.js hands this everything it needs and never calls back into it, so this file is free to
// own the whole onboarding without touching the boot sequence.

export const intro = {
  start({ hud } = {}) {
    hud?.ticker('Tap the belt to send the rig.', 6000);
  },

  replay() {},
};

export default intro;
