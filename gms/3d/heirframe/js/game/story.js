import { SCRIPTS, SPEAKERS } from '../data/story_a1.js';
import { VEILS, VEIL_DEFAULT } from '../data/veils.js';

// Plays STORY §8 script tables (js/data/story_a1.js): cards, barks (subtitle + VO), dialogue (ui.dialogue + VO), actions.
export function createStoryPlayer(ctx) {
  const { ui, audio, overlay } = ctx;
  let busy = 0;

  const who0 = (id) => SPEAKERS[id] || { name: id ? id[0].toUpperCase() + id.slice(1) : '', role: '', portrait: { kind: 'unknown' } };
  // Echo runs (after a Succession): Mara's, Lyra's and Iris's lines are recordings left for the new heir
  const ECHO = ['mara', 'lyra', 'iris', 'tomas'];
  const who = (id) => { const s = who0(id), heir = ctx.echo?.(); return heir && ECHO.includes(id) ? { ...s, name: `${s.name} · Echo`, role: `Recorded for ${heir}` } : s; };
  const fullText = (b) => audio.voInfo(b.vo)?.text || b.text || '';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const readMs = (t) => Math.max(1800, Math.min(7000, t.length * 55));
  // D30: humans call in veiled; `unveil` beats show the face (the one late payoff)
  const veilTag = (p) => p?.kind === 'human' ? (VEILS[p.veil] || VEIL_DEFAULT).tag : '';

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
    let portrait = typeof b.portrait === 'string' ? { kind: 'unknown', seed: 7 } : (b.portrait || s.portrait);
    if (b.unveil) portrait = { ...portrait, unveiled: true };
    const p = { speaker: b.label || s.name, role: b.label ? '' : s.role, tag: b.unveil ? 'UNVEILED' : veilTag(portrait), portrait, text, choices: b.choices };
    if (b.vo) p.voiceKey = b.vo;
    const choice = await ui.dialogue.show(p);
    const reply = b.replies?.[choice];
    if (reply) { const r = who(reply.speaker); await ui.dialogue.show({ speaker: r.name, role: r.role, tag: veilTag(r.portrait), portrait: r.portrait, text: reply.text }); }
    return choice;
  }

  async function beat(b) {
    ctx.onBeat?.(b);
    if (b.sfx) for (const n of b.sfx) audio.sfx(n, { vol: 0.6 });
    if (b.fx) ctx.onFx && ctx.onFx(b.fx);
    let choice = 0;
    if (b.mode === 'card') await overlay.card(b.lines, b.ms || 3000);
    else if (b.mode === 'bark') { if (ui.dialogue.open) ui.dialogue.close(); await bark(b); }
    else if (b.mode === 'dlg') choice = await dlg(b);
    if (b.action && ctx.onAction) await ctx.onAction(b.action, b);
    return choice;
  }

  // `when: {key: value}` beats only play for that story choice (the open contract's pick first, then the save's)
  const ok = (b) => !b.when || Object.entries(b.when).every(([k, v]) => (ctx.choice?.(k)) === v);

  // Play every beat whose trigger matches, then its after:N chain. Resolves when the chain ends.
  // Runs queue behind each other so a step's beats never talk over the mission's closing scene.
  let chain = Promise.resolve();
  function run(script, trigger) {
    const beats = SCRIPTS[script] || [];
    if (!beats.some((b) => b.trigger === trigger)) return Promise.resolve(false);
    busy++;
    const p = chain.then(() => runNow(beats, trigger));
    chain = p.catch(() => {});
    return p;
  }
  async function runNow(beats, trigger) {
    const starts = beats.filter((b) => b.trigger === trigger && ok(b));
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

  return { run, beat, bark, who, get busy() { return busy > 0; }, has: (script, trigger) => (SCRIPTS[script] || []).some((b) => b.trigger === trigger) };
}
