import { SCRIPTS, SPEAKERS } from '../data/story_a1.js';

// Plays STORY §8 script tables (js/data/story_a1.js): cards, barks (subtitle + VO), dialogue (ui.dialogue + VO), actions.
export function createStoryPlayer(ctx) {
  const { ui, audio, overlay } = ctx;
  let busy = 0;

  const who = (id) => SPEAKERS[id] || { name: id ? id[0].toUpperCase() + id.slice(1) : '', role: '', portrait: { kind: 'unknown' } };
  const fullText = (b) => audio.voInfo(b.vo)?.text || b.text || '';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const readMs = (t) => Math.max(1800, Math.min(7000, t.length * 55));

  async function bark(b) {
    const s = who(b.speaker), text = fullText(b);
    overlay.subtitle(s.name, text);
    const t0 = performance.now();
    const r = b.vo ? await audio.vo(b.vo) : { ok: false };
    const left = readMs(text) * (r.ok ? 0.25 : 1) - (performance.now() - t0);
    if (left > 0) await wait(left);
    overlay.hideSubtitle();
  }

  async function dlg(b) {
    const s = who(b.speaker), text = fullText(b);
    overlay.hideSubtitle();
    const p = { speaker: b.label || s.name, role: b.label ? '' : s.role, portrait: typeof b.portrait === 'string' ? { kind: 'unknown', seed: 7 } : (b.portrait || s.portrait), text, choices: b.choices };
    if (b.vo) p.voiceKey = b.vo;
    const choice = await ui.dialogue.show(p);
    const reply = b.replies?.[choice];
    if (reply) await ui.dialogue.show({ speaker: who(reply.speaker).name, role: who(reply.speaker).role, portrait: who(reply.speaker).portrait, text: reply.text });
    return choice;
  }

  async function beat(b) {
    if (b.sfx) for (const n of b.sfx) audio.sfx(n, { vol: 0.6 });
    if (b.fx) ctx.onFx && ctx.onFx(b.fx);
    let choice = 0;
    if (b.mode === 'card') await overlay.card(b.lines, b.ms || 3000);
    else if (b.mode === 'bark') { if (ui.dialogue.open) ui.dialogue.close(); await bark(b); }
    else if (b.mode === 'dlg') choice = await dlg(b);
    if (b.action && ctx.onAction) await ctx.onAction(b.action, b);
    return choice;
  }

  // Play every beat whose trigger matches, then its after:N chain. Resolves when the chain ends.
  async function run(script, trigger) {
    const beats = SCRIPTS[script] || [];
    const starts = beats.filter((b) => b.trigger === trigger);
    if (!starts.length) return false;
    busy++;
    try {
      for (let b of starts) {
        while (b) {
          await beat(b);
          b = beats.find((x) => x.trigger === `after:${b.n}`);
          if (b && b.mode !== 'dlg' && ui.dialogue.open) ui.dialogue.close();
        }
      }
    } catch (e) { console.error('story beat failed', e); }
    finally { busy--; if (ui.dialogue.open) ui.dialogue.close(); }
    return true;
  }

  return { run, beat, bark, get busy() { return busy > 0; }, has: (script, trigger) => (SCRIPTS[script] || []).some((b) => b.trigger === trigger) };
}
