# BREACHPOINT II — test suites

These drive the real game in headless Chrome over CDP and assert against `window.__game`.
**They are the entire evidence base for "this game works."** They lived in a session-scoped
scratchpad directory for the whole of the original build, which meant one closed session would
have destroyed them — hence this directory.

## Running them
No puppeteer on this machine; node v24's built-in `fetch` + `WebSocket` are enough.

```
~/.claude/bin/cdp start --port 9223      # NEVER hand-roll the launch; strays peg the CPU for a day
node <suite>.mjs
~/.claude/bin/cdp stop 9223
```

Suites navigate to `file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html`.

## Measurement discipline — every one of these has already cost a worker hours
- **Pin `quality:'low'` AND the reference pose** (`teleport(1.5,24.5); look(0,0)`) before measuring draw
  calls. The auto-quality net flips shadows off mid-sample, and per-level insertion points changed the
  spawn frustum — an unpinned figure measures neither the build nor anything else.
- **Median with rigs hidden**, never a peak, when isolating static world cost. A peak sample silently
  absorbs the delta you are trying to measure.
- Poll **during** held inputs. A headless window with no CDP traffic throttles rAF and `dt` clamps at 0.06.
- **Fresh touch id per press.** Re-using an id after a tap the browser never landed makes the *next*
  `touchStart` a silent no-op.
- `Emulation.setDeviceMetricsOverride` resizes the real window and does **not** self-restore.
- `Log.enable` replays Chrome's buffered log, so a CANARY from an earlier run can surface in a later one.
- **Falsify every check.** An assertion never proven capable of failing is not evidence. Every suite here
  carries an error canary and at least one gameplay canary for this reason.

## Known flakes
See `docs/PIPELINE.md`. Do not "fix" the game to satisfy a flake without first establishing whether it is
pre-existing — the way P4c did, by restoring the previous data and reproducing the failure on it.
