# Krayzee access: br8t login, cloud saves, br8t Pass limits (D36, lane ACCESS, 2026-10-29)

Aaron (D36): deploy online, plug in the br8t login so players can change devices, and limit story progress and online
games without a br8t Pass. Manager's calls: Free = intro + Missions 1–4, Free Flight, every airport, 3 online games a
day. Pass = Missions 5+ and unlimited online. Planes, ranks and tasks are never gated. Locks are friendly cards, never
modals. Online needs a sign-in.

## 1. Login and cloud save

`js/ui/account.js` mounts `/lib/auth/localsync.js` (games/CLAUDE.md) with `SYNC_KEYS`:

| key | what moves between devices |
|---|---|
| `krayzee.profile` | name, gender (title), company, livery colours, registration, voice + starred favourites |
| `krayzee.settings` | controls, views, difficulty, units, sound, **the hangar's chosen plane** |
| `krayzee.career` | lifetime PP, rank, unlocked/selected titles, online wins/rooms, story floor, stats |
| `krayzee.tasks` | the task grid (done, sets, counters, worn cosmetic) |
| `krayzee.story` | **new**: intro seen, missions done / best / difficulty, story complete |
| `krayzee.hints`, `krayzee.coach`, `krayzee.coachTakeoff` | **new**: one-time teaching marks, so a new phone doesn't teach you again |

Device-only on purpose: `krayzee.netSaver` (this connection), `krayzee.courtCollapsed` (this screen). No mid-flight
state is stored anywhere. Entitlements are memory-only (`js/game/access.js`), never in a save.

- Newest-wins, the blank-save rule and the two-saves chooser are the shared layer's (`pickSave`, `resolveConflict`).
  `describe()` gives the chooser plain lines: title + name, PP, story missions done, tasks ticked, company.
- **Catch-up** (`catchUp` in account.js): career and tasks can save during boot before the layer hooks
  localStorage (the task grid's retro credit for story missions does). Such a write only reached the account with the
  next save; `test-access` caught it (cloud 7777 PP, device 8277). Both saves carry their own `savedAt`; if it is newer
  than the layer's stamp, the same string is written again after mount. The push stays held until the boot reconcile
  decides (an adopt discards it).
- `matchCompleted()` is called once per banked flight (career.addPP), so the callout nudge counts sorties. The nudge is
  the non-blocking pill, only while the menu is up (`canPester`).

## 2. Pass limits

**The switch** is `data/access.js` → `enforce`:

| value | meaning |
|---|---|
| `'auto'` (default) | enforce only while payments are LIVE: `GET /api/br8t/offer` → 200, sells `br8t_pass`, `testMode:false`. Missing API, error, test mode, or any host but games.br8t.com = nothing locked |
| `'on'` | always enforce |
| `'off'` | never |

Test overrides (local pages only): `?access=on|off|auto`, `?payapi=http://127.0.0.1:N/api/br8t/` (+ `?uid=` = bearer
`dev:<uid>`, mock only).

**Live status (checked 2026-10-29):** `https://games.br8t.com/api/br8t/offer` answers 200 with the Pass monthly A$1.49
and yearly A$4.99, but **`testMode: true`** (the payments service refuses live Stripe keys). Nobody can buy a real
Pass, so with `auto` **everything stays open** and the game says "br8t Pass coming soon". When payments go live,
limits switch on by themselves (client: next page load; server: within 5 minutes).

Modules: `js/game/access.js` (state: one offer probe per page, entitlement, allowance, checkout; no polling),
`js/ui/pass.js` + `css/pass.css` (the card, `decoratePicker`). Hooks in other lanes' files, one line each, marked
`// ACCESS`: `js/story/index.js` (import + the `runMission` gate), `js/story/picker.js` (decorate),
`js/main.js` (boot probe; Online button live on games.br8t.com once the room server answers).

**Missions.** In the story picker Missions 5+ carry a crown "br8t Pass needed" tag and a dashed row. Tapping one opens
the card **inline under the row** ("By Royal Decree · The Crown requires a br8t Pass"): Get the Pass (monthly /
yearly, from the offer), Restore, Not now. Signed out: Sign in (opens the account panel) instead. Every other way in
(Next mission after 4, `?mission=5`, relaunch) goes through `runMission`, which reopens the picker on that card.
Restore re-reads the entitlement; the card closes and the row unlocks. Pass holders' tags read "br8t Pass".

**Online.** The lobby home shows a line: "3 of 3 free online games left today" / "Unlimited online games with your
br8t Pass" / "br8t Pass coming soon. Online is free for now." Guests see "Sign in to fly with other royals" instead
of Quick join / Join (the public list stays visible). A refused join puts the online card at the top of the lobby.

Checkout posts `{product, game:'krayzee'}`; the payments service only knows `ragdojo|hub|clued` return paths today, so a
400 retries with `hub` (returns to the hub after paying).

## 3. Server (krayzeenet, `server/access.go`)

| env | default | |
|---|---|---|
| `KRAYZEE_SIGNIN` | (open) | `required`: create / join / quick need a verified non-anonymous token (`err signin`) |
| `KRAYZEE_ALLOWANCE` | `auto` | `off` / `auto` (only while the payments offer says live, re-read every 5 min) / `on` |
| `KRAYZEE_ALLOWANCE_URL` | `http://127.0.0.1:8016/api/br8t/` | the payments service on the box (loopback) |
| `KRAYZEE_ALLOWANCE_GAME` | `krayzee` | allowance key |

- **A game = a room you enter.** Each new room spends one use (`POST allowance {game, id}` with the player's own ID
  token, a fresh UUID per entry). Re-entering a room the account already paid for (a drop, a second tab, leaving and
  coming back, every rematch in it) is free. Pass holders are never counted (the service answers unlimited).
- Refusal: `err {code:'nogames', msg, allowance}`; a spend sends `allowance {allowance}` to the client.
- **Fail-open:** anything but a clear 429 lets the player in (unreachable, 5xx, 404 = krayzee not configured, 401).
- A create/join that arrives while its token is still being checked waits for the check (no false "sign in").
- `welcome` and `/health` carry `access: {signin, allowance, counting}`.
- The service unit sets `KRAYZEE_SIGNIN=required` and `KRAYZEE_ALLOWANCE=auto`.

**For limits to bite once payments are live**, the payments service needs (not this lane's repo,
`~/cc/ionos/ragdojo-payments`): `BR8T_FREE_PER_DAY="ragdojo=3,…,krayzee=3"` (until then 404 → fail-open, online
unlimited) and `"krayzee": "/gms/3d/krayzee/"` in `returnPaths` (until then checkout returns to the hub).

## 4. Tests

- `cd server && go test ./...`: access_test.go (sign-in, token-check wait, 3 then refused with re-entry free and the
  Pass never counted, fail-open, auto-not-live, payments HTTP mapping).
- `node server/test.mjs`: + 9 access checks over real sockets against `tools/access/mockpay.mjs`;
  `--falsify` starts the access server with both switches off (4 checks go red).
- `node tools/test-access.mjs [--only=missions,online,flight,cloud] [--falsify=gate|pass|failopen|signin|allowance|cloud]`:
  two headless Chromes (two profiles, CDP 9711/9712), own static server 8743, mock payments 8744, krayzeenet 8745.
  Missions (locks, card, runMission gate, checkout, Pass + Restore unlock, fail-open in test mode, landscape hit test),
  online (guest sign-in card, allowance 3 → 0 by real taps, 4th refused inline, host/join into flight, each page
  sees the other, F-35 nozzle/fan), cloud (real Firebase throwaway email/password account: sign in on A, progress,
  sign in on B, same profile/settings/career/story/tasks, no reload loop, B's newer PP back on A; account deleted).
  Screenshots: `docs/shots/access/`.

## 5. F2 bits

- STOVL: a STOVL plane's state packet carries two extra bytes (nozzle, lift fan; older clients read only the first
  32). The receiving session sets them on the remote aircraft and `traffic.js` poses the rig.
- Rooms fly at **C-Tower 1 only** for v1 (the lobby's start already ensures `royal`). Other airports in rooms later.
- Fixed on the way: a joiner that attached after the host's `hi` never drew the host's plane (`hi` dropped while
  detached, never re-sent). `hi` now carries `re:1` from attach/new members and is answered.
