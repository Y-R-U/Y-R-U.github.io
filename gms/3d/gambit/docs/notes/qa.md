# qa — notes

Owner (for fixes): `js/app/`, `css/` (ui agents done); small surgical fixes in `js/puzzles/`, `js/board/`.
Tools: `tools/qa_cdp.mjs` (persistent CDP driver, real touch/mouse input, continuous console-error capture).

## How to test
```
~/.claude/bin/cdp start --port 9528 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
~/.claude/bin/cdp start --port 9530 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist   # 2nd browser (online)
node tools/qa_cdp.mjs serve --ports=9528,9530 --http=9628 --out=DIR &
Q="node tools/qa_cdp.mjs do"
$Q A size 360 740 m , nav '#/home' , tap '.menu-item.primary' , tap '.bot-card' 0 , tap '[data-act=play]' , \
     until "window.__gambitTest().myTurn" , mv e2 e4 , shot g1 , errs
```
Commands (comma separated, `A`/`B` switches browser): `size W H [m]`, `nav HASH`, `reload`, `tap SEL [i]`,
`tapt TEXT`, `sq e4`, `mv e2 e4` (tap-tap), `drag e2 e4`, `key v`, `eval JS`, `until JS [ms]`, `wait ms`,
`shot NAME`, `errs`, `navs [reset]`, `throttle N`. `nav` clears the browser cache and cache-busts the URL.
Phone sizes use `m` (dpr 2, touch emulation): every tap/drag is a CDP touch event; desktop uses mouse events.
`window.__gambitTest()` now also exposes `chess`, `fen`, `assisted`.

## Bug list
Severity: H = breaks a feature / wrong result, M = wrong behaviour with a workaround / visible glitch, L = polish / copy.

| # | Sev | Area | Bug / repro | Status |
|---|---|---|---|---|
