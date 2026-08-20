# The phone fill-rate test — Aaron, five minutes

This is the one number in the project that has never been substitutable. `BUILD_PLAN.md` says the
whole plan stops and replans if it fails, so it is worth the five minutes before A4 authors any
terrain against an unverified budget.

## Serve it

On the Mac, in `site/gms/3d/forge/`:

```bash
python3 -m http.server 8600
```

Phone on the same wifi, **landscape**, Chrome or Safari:

```
http://192.168.0.236:8600/index.html?hud=1&preset=medium&dpr=1&shot=street_dusk
```

(If the Mac's LAN address has moved, `ipconfig getifaddr en0`.)

`?hud=1` keeps the perf readout visible in shot mode. `preset=medium` and `dpr=1` are the gate
profile; `shot=street_dusk` is the densest of the five scenarios and boots straight into it with no
game session running, so nothing moves and the number is stable.

## The four numbers, off the HUD

Let it sit for ten seconds first — the shadow map and the texture uploads settle.

| read | budget | means |
|---|---|---|
| **fps** | 60 | the only timing number that has ever been trustworthy here |
| **cpu p95** | < 6 ms | |
| **calls** | < 150 | shown as `total (n main)` |
| **tris** | < 350 k | shown as `total (n main)`; **the gate is on the total** |
| tex MB | < 60 | should read ~54 |

**gpu p95 will very likely show `—` on the phone.** iOS has no `EXT_disjoint_timer_query`. That is
expected and is exactly why fps is the number that matters.

## The one A/B that actually answers the question

Triangles and fill rate fail differently, and only this tells them apart. Load the same URL twice:

```
…&shot=street_dusk&renderScale=1.0        ← the gate
…&shot=street_dusk&renderScale=0.6        ← same geometry, 36 % of the pixels
```

- **fps recovers at 0.6** → the phone is **fill-rate bound**. This is the risk `WORLD.md` §6.6 says
  the triangle budget cannot see, and it gets worse at K = 1.5 because surfaces are bigger and
  closer. If this is what happens, say so — it changes the plan, not just a knob.
- **fps barely moves** → geometry or CPU bound, which the triangle budget already tracks and A7's
  culling work already targets.

## Second A/B, if the first one is interesting

```
…&shot=street_dusk&foliage=0
```

Alpha-tested grass near the camera is the biggest overdraw item in the frame. If `foliage=0`
recovers the frame rate but `renderScale=0.6` did not, the fill-rate problem is specifically the
grass, and the §6.4 foliage cut pays for itself twice.

## Also worth ten seconds while you are there

Load it **without** `?shot=` so the player is live:

```
http://192.168.0.236:8600/index.html?hud=1&preset=medium&dpr=1
```

and walk around. The outdoor camera arm is now **7.2 m** (was 6.2). It is a live knob — open the
panel, `Controls → Camera distance` — and no test can decide whether it feels right. Same for
`Camera height`, now 2.10 (was 1.62). Walk into a house and sweep the look up: the camera should
stop cleanly under the ceiling rather than going through the boards.
