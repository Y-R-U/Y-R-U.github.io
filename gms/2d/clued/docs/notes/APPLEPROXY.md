# APPLEPROXY — Apple previews when Apple hosts are blocked (2026-10-10)

## Why
Remote logs from Aaron's Windows laptop (Edge 154): every request to Apple fails with `TypeError: Failed to fetch`
after ~16 s: the preview fetch for decode, the HEAD check, the iTunes lookup/search JSON and the JSONP fallback.
Wikimedia clips on the same laptop load in 30–440 ms, and Android Chrome on the same Wi-Fi works. Something on that
laptop blocks or blackholes Apple hosts (Edge tracking prevention, an extension, security software). The game now
copes: a short direct attempt, then the Clued server proxies Apple for the rest of the session.

## The chain (client, `js/audio/applenet.js`)
1. **Direct** for Apple URLs (`audio-ssl.itunes.apple.com/itunes-assets/`, `itunes.apple.com/lookup|search`,
   `is1–5-ssl.mzstatic.com/image/thumb/`): fetch with an AbortController, **5 s to first byte**, then 20 s for the body.
2. On a network failure or timeout: **the server proxy** (`/api/preview?u=` for files, `/api/itunes?path=…` for JSON).
3. If the proxy then works, direct is **marked broken for the session** (`sessionStorage clued.appleDirect=broken`,
   so a reload in the same tab remembers). After that every Apple request, metadata included, goes straight to the
   proxy with no direct attempt. If the proxy fails too (e.g. both say 404: the preview is just gone), nothing is
   marked and the old recovery runs (lookup by trackId, then search).
4. JSONP stays as the last resort, only while direct is not known broken.

Where it is wired:
- `clip.js` `fetchDecode` → `net.get` (both the question clip and the rooms preload/`listen.preload` path).
  `stream()` ("Keep listening"): `<audio>` src via `appleSrc()`; if direct doesn't start within 5 s it switches to the
  proxy.
- `apple.js` `getJSON` (lookup/search) → `net.get`; `previewUrl(a, true)` HEAD check → `net.head` (direct HEAD 5 s, then
  a proxy HEAD, which also warms the server cache); `revealHTML` artwork and `setArt(img, url)`: the proxy if broken,
  else direct with a one-shot `onerror` swap to the proxy. The "Listen on Apple Music" link stays a plain link.
- `listen.js` `prepare()` (solo/party, before the media preflight): runs the HEAD checks (all in parallel, so a
  blackholed host costs one 5 s wait), and if direct is now broken rewrites the round's audio and artwork `src`s to
  proxy URLs, so `core/media.js` preflight and the clip loader both use the proxy. Artwork on the question disc uses
  `setArt`. Rooms skip `prepare`; their `listen.preload` goes through the same `clip.load` → chain.

Cost on a healthy network: none (same requests as before; the only change is the 5 s first-byte cap on Apple).
Measured on the blackholed run: prepare → first question 5.3 s (the one direct timeout), then every clip starts
70–220 ms after the question renders.

## Server (`server/applepx.go`, registered by one line `registerAppleProxy(api)` in `main.go`)
- `GET|HEAD /gms/2d/clued/api/preview?u=<url>`. Allowlist (anything else → **403**, never fetched): `https` only, no
  userinfo/port/query/fragment, path chars `[A-Za-z0-9/._+-]` and already clean, and either
  `audio-ssl.itunes.apple.com/itunes-assets/….m4a` or `is1…is5-ssl.mzstatic.com/image/thumb/….jpg|jpeg|png|webp`.
  Redirects are re-checked against the same allowlist. Upstream must be 200 with an audio/image/octet-stream type
  (HTML error pages → 502; upstream 404/403/410 → 404).
- Served as `audio/mp4` / `image/*`, `Cache-Control: public, max-age=2592000`, `X-Clued-Cache: hit|miss` (exposed to
  CORS), CORS like every other endpoint (allowed origins incl. the Pages copy).
- **Streams** a miss to the browser while teeing it to a temp file; renamed into the cache only when complete. Cap
  **2 MB** per file (a declared larger file → 502; an undeclared one is cut off at the cap and never cached; previews
  are ~1.07 MB). Range/HEAD on a miss fill the cache first, then `http.ServeContent` (ranges, 206).
- **Disk LRU** at `$CLUED_DATA/previews` (production `/srv/data/clued/previews`), 200 MB, mtime touched on every hit,
  evicts oldest to 90% when over; stale temp files swept.
- `GET /api/itunes?path=lookup|search&…`: the upstream URL is rebuilt from validated params only (`id` digits ≤150,
  `term` ≤200 chars, `country` 2 letters, `entity` song|musicTrack, `media` music, `limit` 1–50; anything else incl.
  `callback` → 403). JSON capped at 1 MB, in-memory cache 4 MB / 6 h.
- Limits: per IP `preview` 300/min, `itunes` 60/min (added in `applepx.go`'s `init`, `limits.go` untouched); at most 6
  upstream fetches at once (others wait ≤10 s → 503); dial 5 s, TLS 5 s, headers 8 s, whole request 20 s. Memory stays
  flat (io.Copy with 32 KB buffers): 16 MB RSS after deploy.

## Logging (dlog)
| tag | msg | when |
|---|---|---|
| `applenet` | `direct.ok` / `direct.bad` (HTTP status) / `direct.fail` (err, ms, timedOut) | each direct Apple request |
| `applenet` | `proxy.ok` / `proxy.ok.cachehit` / `proxy.bad` / `proxy.fail` (what, url, status, ms) | each proxy request |
| `applenet` | `broken` (what, url, directErr, directMs) · `broken.remembered` · `skip.direct` | the session switch |
| `applenet` | `head.direct` / `head.direct.fail` / `head.proxy` / `head.proxy.fail` · `img.fallback` | HEAD checks, artwork swap |
| `clip` | `fetch.ok`/`fetch.bad` now carry `via: direct|proxy|other`; `stream.fallback`, `stream.playing {via}` | |
| `apple` | `json {via}`, `head {ok, broken}` | |
| `listen` | `render {broken}`, `prepareAll {broken}`, `prepare.proxied`, `preload {broken}` | |

## Apple connectivity probe (tag `probe`, only while remote debug logging is on)
`js/audio/probe.js`. Zero cost when logging is off (`debugOn()` check first). Runs once at the start of each music
round: `listen.prepare` (solo/party), or the first `preload`/`render` of a listen question after two quiet minutes
(rooms). All checks run in parallel with 8 s timeouts and do not affect the chain.

Rows, in order: `start` (preview + artwork URL under test, `onLine`, `conn {type, saveData, downlink, rtt}`, `ua`,
`brands`, `platform`, `edge`, `hasStorageAccess` (result of `document.hasStorageAccess()` or `absent`),
`requestStorageAccess`, `dnt`, `gpc`, `cookies`, `origin`), then one row per check with `ok`, `ms`, HTTP `status` /
`type` / `bytes` / `first` (ms to headers) where readable, or `err` + `msg` (+ `timedOut`), and `onLine`:

| row | what it does |
|---|---|
| `lookup.cors` | fetch CORS `https://itunes.apple.com/lookup?id=1444065075` |
| `lookup.jsonp` | the same as JSONP via `<script>` (`n` = resultCount) |
| `preview.cors.range` | fetch CORS with `Range: bytes=0-1023` on the round's real preview (expect 206) |
| `preview.audio` | plain `<audio>` (no crossOrigin, muted, never played): `canplay` → ok, `error` + `code`, or `stall` (networkState/readyState); `ev` lists `loadedmetadata` time |
| `artwork.img` | `<img>` of the round's mzstatic artwork |
| `proxy.preview` / `proxy.lookup` / `proxy.artwork` | the same three through the Clued proxy (`cache` = hit/miss) |
| `control.wikimedia` | Range fetch of a Commons anthem MP3 |

then `summary` (one line: each check → `ok N ms` or `<error> N ms`). The last result is also on
`window.__cluedProbeLast`.

**Reading it:**
- All Apple rows `AbortError`/`stall`/`timeout ~8000ms`, proxy + control ok → Apple hosts are **blackholed** (packets
  dropped: firewall/security suite/DNS sinkhole to a dead IP). The 16 s failures in Aaron's logs look like this.
- Apple rows fail **fast** (`TypeError` in tens of ms, `script error`, `<audio>` `error code 4`) → **actively blocked**
  in the browser: an extension or Edge tracking prevention (check `edge`, `hasStorageAccess`), or DNS returning
  0.0.0.0/NXDOMAIN.
- Only the CORS fetches fail but `<audio>`/`<img>`/JSONP work → a CORS/header-stripping proxy or extension.
- `onLine:false` or the control failing too → the device was offline, not an Apple problem.
- Proxy rows failing as well → the Clued server is unreachable from that device (the game falls back to the old
  recovery and the clip is skipped).

Headless reference outputs (from `tools/applepx_e2e.mjs`):
- refused (`MAP … 127.0.0.1:1`): `lookup.cors TypeError 30ms, preview.cors.range TypeError 30ms, artwork.img error,
  preview.audio error, lookup.jsonp script error`, proxies ok, control ok.
- blackholed (`MAP … 10.255.255.1:443`): every Apple row `AbortError`/`stall`/`timeout 8006ms`; proxies ok ~1.4 s cold.
- unblocked: everything ok in ~0.9–1.4 s.

## Tests
- Go `server/applepx_test.go` (fake Apple = local TLS server that every upstream dial is pointed at):
  `TestPreviewAllowlist` (21 rejected URLs incl. lookalike hosts, ports, userinfo, `..`, `%2e%2e`, queries, IPs,
  `file:`/`gopher:` → 403 and **zero upstream hits**; a 302 to another host → 502), `TestPreviewCacheHitMiss`
  (miss → hit with one upstream fetch, headers, CORS, Range on hit and miss, image type, upstream 404 → 404, HTML →
  502), `TestPreviewLRU` (oldest evicted, a touched file survives), `TestPreviewSizeCap` (declared and streamed
  over-cap, nothing cached, no temp files), `TestPreviewRateLimit` (preview + itunes buckets), `TestPreviewTimeout`
  (hung upstream and stalled body cut off, nothing cached), `TestItunesProxy` (rebuilt upstream URL, cache, 13
  rejected queries with zero upstream hits, non-JSON → 502). Falsified: removing the host/path check fails
  `TestPreviewAllowlist` on every bad URL. `server/test.sh` ALL PASS.
- Node `tools/applenet_test.mjs` (29): allowlist; healthy → direct only; blackholed → proxy after the first-byte
  timeout only (128 ms for a 120 ms budget), marked broken, later requests skip direct with no wait, lookups/search
  proxied (callback stripped), cache-hit log, artwork src mapping, HEAD skipped, reload remembers; fast refusal; dead
  preview (proxy 404) not marked broken; both down → throws, not broken; HEAD paths; stalled body aborted.
- E2E `tools/applepx_e2e.mjs` (header has the recipe; CDP 9530, `--autoplay-policy=no-user-gesture-required`, cache
  disabled, local server :8099 with logging on), solo 6-question listen round, blurred artwork, plus "Keep listening":
  - `--mode blocked` with `--host-resolver-rules` mapping audio-ssl, itunes and is1–5-ssl mzstatic to `127.0.0.1:1`:
    36/0. Every clip `via: proxy`, broken exactly once, blurred + reveal artwork and Keep listening via the proxy,
    render → audio start 144/115/100/112/109/121 ms, probe as above.
  - the same mapped to `10.255.255.1:443` (true blackhole, cold server cache): 36/0, prepare 5.3 s, then 221/81/70/113/114/128 ms.
  - `--mode direct` (no rules): 34/0, `head.direct` + `direct.ok` only, proxy never used, Keep listening direct,
    render → audio start 129–337 ms, probe all ok.
- Ad-hoc rooms path (blackholed Apple, refused mzstatic): `listen.preload` ×4 → 5411 ms (the one timeout), then
  114 / 2769 (cold upstream) / 97 ms; `setArt` and the reveal `<img>` both swapped to the proxy on error and loaded.
- `au_test`, `dbg_test` 36, `s_unit_test`, `a_test` 467/0 still pass.

## Deploy / state
- **Server deployed 2026-10-10** with `deploy.sh`, from a scratch copy of the deployed source (= git HEAD) + `applepx.go`
  + the one `main.go` line, because MYROOMS has uncommitted edits in `main.go`/`rooms.go`/`roomhttp.go`/`admin.go`
  that are not mine to ship. The working-tree `main.go` has the same line, so MYROOMS's next deploy keeps the proxy.
  Production checks: real preview → 200 `audio/mp4` 1 072 024 bytes (`file`: AAC M4A), `miss` then `hit`; artwork →
  200 `image/jpeg`; lookup → 200 JSON; `https://example.com/a.m4a` and a non-`itunes-assets` Apple path → 403; a
  lookup with `callback` → 403; `/srv/data/clued/previews` holds the cached files; service RSS ~16 MB.
- **Client not shipped, BUILD not bumped** (manager's call). New files `js/audio/applenet.js`, `js/audio/probe.js`
  use the same `?v=` stamp, so `a_bump.mjs` covers them. Until the static files ship, Aaron's laptop still sees the old
  16 s failures.
- Files: `server/applepx.go`, `server/applepx_test.go`, `server/main.go` (1 line), `js/audio/applenet.js`,
  `js/audio/probe.js`, `js/audio/clip.js`, `js/audio/apple.js`, `js/audio/listen.js`, `tools/applenet_test.mjs`,
  `tools/applepx_e2e.mjs`.
