# filestore — files.br8t.com

Shared project file store backing **Addon Studio**. Leads create projects and
users; anyone with access uploads and edits the files that go into an add-on
(`.mcaddon`, `.mcpack`, `.zip`, textures, audio, docs, video, JSON…).

Go + SQLite + a no-build-step front end. Runs on the IONOS VPS behind Caddy —
see `~/cc/ionos/ionos.readme.txt` for the box itself.

**Live:** https://files.br8t.com · systemd `filestore` · port `127.0.0.1:8005`
DB `/srv/data/filestore/filestore.db` · files `/srv/data/filestore/files/p<id>/`

> Source is in git for backup; **uploaded files are not** — they live only on
> the VPS. See *Backups* below.

## Roles

| | admin | lead | user |
|---|---|---|---|
| Create / delete **leads** | ✅ | — | — |
| Create / delete **users** | — | ✅ (their own) | — |
| Create / delete **projects** | — | ✅ (their own) | — |
| Grant project access | — | ✅ | — |
| Upload / edit / delete files | — | ✅ | ✅ (granted projects) |
| Create / rename / delete **pages** | — | ✅ | — |
| Read / edit page contents | 👁 read-only | ✅ | per page (see *Pages*) |
| See all projects + disk usage | ✅ (read-only) | own only | granted only |
| Change storage limits | ✅ | — | — |

There is exactly **one admin**, bootstrapped on first run: `aaron@br8t.com`.

The split is deliberate. Admin is an *operator* account — it configures the
server and manages leads, but cannot create projects, touch files, or delete a
team's work. Leads own the day-to-day. A lead only ever sees the users they
created, never another lead's.

### First sign-in

Every pre-created account (admin included) starts with a temporary password and
`must_reset` set: the only endpoint reachable until they choose their own is
`POST /api/password`. Passwords are bcrypt-hashed (cost 11); the plaintext is
returned exactly once, when the account is created or reset, so the creator can
hand it over.

The bootstrap admin password is generated on first start and written to the
journal once:

```
ssh br8t 'sudo journalctl -u filestore | grep one-time'
```

## Pages

A **page** is a rich-text document that belongs to a project but is not a file:
it lives in SQLite, never on disk, so it doesn't appear in the file listing, the
`.zip` export or the storage figures. Notes, briefs and to-do lists go here;
the add-on's actual contents stay in files.

"+ Page" sits next to "+ File" above the file list, and the project's pages are
listed in their own box underneath it. Clicking one opens it where the file
editor goes, with a toolbar for bold, italic, underline, strikethrough,
headings, lists, quotes and links.

Only the **lead who owns the project** can create, rename or delete a page.
Each page then carries its own setting for what everyone else with access to
that project may do with it:

| Setting | Project's users can |
|---|---|
| Only me | nothing — the page isn't listed for them at all |
| Users can read | open and read it |
| Users can read and edit | open, read and change it |

New pages start at *Users can read*. Admin can read pages for oversight but,
as everywhere else, cannot write them.

Limits: 200 pages per project, 256 KB per page.

**Markup is allow-listed twice.** Saved pages are rendered back into the app on
this origin, so a page that carried a `<script>` or a `javascript:` link would be
a stored XSS. The editor filters what it sends (`sanitizePageHTML` in `app.js`,
which also rewrites pasted inline styles back into `<b>`/`<i>`/`<u>` so pasting
from Word keeps its formatting), and the server refuses anything outside the
same allow-list (`validatePageHTML` in `pages.go`). Neither side trusts the
other: content posted straight at the API is rejected, and content already in
the database is cleaned again before it is displayed.

## Storage limits

Three admin-tunable numbers (Server tab, or `/api/admin/settings`):

- **Default per-project limit** — 100 MB. Applied to newly created projects.
- **Global cap** — 3 GB across all projects. The box only has ~5 GB free, so
  this is what stops a full disk taking down every other app on the VPS.
- **Largest single upload** — 100 MB.

Uploads are streamed and counted as bytes land, so an over-quota upload is
refused mid-flight rather than after filling the disk. A per-project limit can
be raised individually by admin in the Server tab.

## Layout

```
main.go       routing, bootstrap, session + password endpoints
auth.go       bcrypt, sessions, role middleware
db.go         schema, settings, user/project queries, audit log
projects.go   project CRUD, file CRUD, upload, zip in/out
pages.go      rich-text pages: CRUD, per-page access, markup allow-list
users.go      user management, project membership, admin settings + stats
storage.go    path safety, quota accounting, disk writes, zip, reindex
web/          index.html + app.css + app.js (embedded in the binary)
```

Everything under `web/` is `go:embed`-ed, so the binary is the whole deployment.

## Security notes

- **Path safety** is funnelled through one function, `cleanRelPath` in
  `storage.go`, plus a containment re-check in `absFor`. Query-param paths are
  URL-decoded by `net/http` before we see them, so `..%2F..%2Fetc%2Fpasswd` is a
  real vector and is covered by tests.
- **Zip extraction** skips entries that would escape the project (zip-slip)
  rather than aborting, so one hostile entry can't block a legitimate archive.
- **Uploaded files are served** with `X-Content-Type-Options: nosniff` and a
  `default-src 'none'; sandbox` CSP, as attachments by default. Only images,
  video, audio and PDF may render inline — HTML and SVG deliberately cannot,
  so an uploaded page can't run script on this origin.
- **Login is rate-limited** to 8 attempts/minute per IP, and unknown-user and
  wrong-password return the same message, so accounts can't be enumerated.
- Changing a password or disabling an account **kills every live session** for
  that user.

## Deploy

The laptop is arm64 while the box is amd64, so the build happens **on the box**
(same pattern as `caltrack` / `vpstats`):

```
cd ~/cc/yru/site/app/filestore && ./deploy.sh
```

Syncs source → builds on the box → installs the systemd unit → points the Caddy
vhost at `127.0.0.1:8005` → restarts → health-checks.

## Tests

`test.sh` runs the real binary against a throwaway data dir and covers every
role boundary, quota, traversal vector, page permission and the zip
round-trip — 144 assertions.

```
rsync -az test.sh br8t:/tmp/ && ssh br8t 'bash /tmp/test.sh /srv/apps/filestore/filestore'
```

It must be run on the box (that's where the binary is). It never touches the
live DB — it starts its own instance on port 8099 with a temp data dir.

## Ops

```
ssh br8t 'systemctl status filestore'
ssh br8t 'sudo journalctl -u filestore -n 100 --no-pager'
ssh br8t 'sqlite3 /srv/data/filestore/filestore.db "SELECT username,role FROM users;"'
ssh br8t 'du -sh /srv/data/filestore/files/*'
```

**Backups.** The VPS keeps no copies of its own, so `backup.sh` pulls the whole
store to Aaron's Mac at `~/Backups/filestore/`, driven by the launch agent in
`com.br8t.filestore-backup.plist` (installed to `~/Library/LaunchAgents/`):

```
./backup.sh              take a backup now, then prune
./backup.sh --prune      apply the retention rules only
launchctl kickstart -k gui/$(id -u)/com.br8t.filestore-backup    # force a run
tail ~/Backups/filestore/backup.log
```

Runs at 02:15, 10:15 and 18:15. Retention: every backup from today, the most
recent one from each earlier day, nothing over 7 days old.

It's launchd rather than cron for two reasons — `crontab` needs Full Disk Access
on modern macOS, and launchd runs a missed job when the Mac wakes, where cron
just skips it.

The database is snapshotted with `sqlite3 .backup` before archiving. Copying a
live `.db` without its `-wal` can restore as a corrupt or stale database, so
don't "simplify" that into an `rsync`. To restore, stop the service, unpack the
archive over `/srv/data/filestore/`, and start it again.

Each project can also be downloaded as a `.zip` from its own page. Pages are
not in it — they live in the database, which the backup snapshots.

**If the file index ever drifts from disk** (restored files, manual edits),
the owning lead or admin can `POST /api/projects/<id>/reindex` to rebuild it by
walking the directory.

## Not done yet

- Off-site backups. `backup.sh` covers disk failure on the VPS, but every copy
  then lives on one Mac. restic → B2 (see `~/cc/ionos/PLAN.md`) is still the
  answer for fire-and-theft.
- No email: password resets are handed over out of band by whoever created the
  account. Deliberate, given there's no mail sending on the box.
- Reassigning a project to a different lead — an admin currently can't, so a
  lead who owns projects can't be deleted until those projects are.
