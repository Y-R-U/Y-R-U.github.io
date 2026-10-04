export const LISTEN_CSS = `
.au-listen .au-media{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:radial-gradient(circle at 50% 40%,#3b2f8f,#1f1a4d 70%);padding:10px}
.au-listen .au-media::before{display:none}
.au-disc{position:relative;width:min(58vw,30vh,260px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;flex:none}
.au-disc .au-cover{position:absolute;inset:16%;width:68%!important;height:68%!important;object-fit:cover!important;border-radius:14px;transition:filter .25s linear, inset .4s, border-radius .4s;box-shadow:0 6px 18px #0007}
.au-disc.art-blur .au-cover{filter:blur(22px)}
.au-disc.revealed .au-cover{inset:8%;width:84%!important;height:84%!important;filter:none}
.au-viz{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.au-disc.revealed .au-viz{opacity:.35}
.au-ring{position:absolute;inset:23%;border-radius:50%;background:conic-gradient(var(--sun,#ffc23c) calc(var(--p,0)*360deg),#ffffff22 0);
 -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px))}
.au-disc .au-cover ~ .au-ring{inset:12%}
.au-play{position:relative;width:84px;height:84px;border-radius:50%;border:var(--line,3px) solid var(--ink,#1f1a4d);background:var(--sun,#ffc23c);
 font-size:34px;box-shadow:var(--shadow,0 5px 0 #1f1a4d);color:var(--ink,#1f1a4d);display:grid;place-items:center;z-index:2}
.au-play[hidden]{display:none}
.au-play:active{transform:translateY(3px);box-shadow:0 2px 0 var(--ink,#1f1a4d)}
.au-disc.playing{animation:au-pulse 1.2s ease-in-out infinite}
@keyframes au-pulse{50%{transform:scale(1.03)}}
.au-under{display:flex;align-items:center;gap:10px;min-height:34px;color:#fff;font-weight:800}
.au-status{opacity:.85;font-size:15px}
.au-again{min-height:36px;padding:4px 12px;border-radius:12px;border:2px solid #fff;background:#fff2;color:#fff;font-weight:800}
.au-again[hidden],.au-more[hidden]{display:none}
.au-more{min-height:36px;padding:4px 12px;border-radius:12px;border:2px solid var(--sun,#ffc23c);background:var(--sun,#ffc23c);color:var(--ink,#1f1a4d);font-weight:900}
.au-rv{margin-top:8px}
.au-rv .au-keep{margin-top:6px;min-height:40px;padding:6px 14px;border-radius:12px;border:var(--line,3px) solid var(--ink,#1f1a4d);background:#fff;font-weight:800;align-self:flex-start}
.play.revealed .au-disc{width:min(15vh,130px)}
.au-disc.revealed .au-cover{filter:none!important}
.au-disc.revealed .au-ring,.au-disc.revealed .au-viz{display:none}
.play.revealed .au-listen .au-media{padding:6px}
.play.revealed .au-under{display:none}
.au-rv .au-keep{font-size:15px;white-space:nowrap;padding:6px 12px}
.play.kids .au-play{width:110px;height:110px;font-size:44px}
@media (prefers-reduced-motion: reduce){.au-disc.playing{animation:none}}
@media (orientation: landscape) and (max-height: 520px){.au-disc{width:min(36vw,56vh,240px)}}
`;
