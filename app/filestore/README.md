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
| See who's online, kick, block | — | ✅ (their projects) | — |

Admin can also step into a lead's shoes for a session — see *Acting as a lead*.

There is exactly **one admin**, bootstrapped on first run: `aaron@br8t.com`.

The split is deliberate. Admin is an *operator* account — it configures the
server and manages leads, but cannot create projects, touch files, or delete a
team's work. Leads own the day-to-day. A lead only ever sees the users they
created, never another lead's.

### Acting as a lead

Admin sees everything and changes almost nothing, which makes it a poor seat to
test from. The **ADMIN / LEAD** switch in the top bar drops the admin account
into a real lead's shoes for that session: it creates and owns its own projects,
pages and users, and sees exactly the lead view — the switch itself is the only
thing a lead wouldn't have.

It is implemented by masking the role in `currentUser`, not by granting admin
extra powers, so there is no "admin except…" branch anywhere to drift out of
sync with what a lead actually gets. The flag lives on the **session** row, so
it dies at sign-out and never follows the account to another device. While the
switch is on, the Server and Leads tabs 403 exactly as they would for a lead.

Two consequences worth knowing: projects created this way are owned by
`aaron@br8t.com` and show up under that name in the admin project list, and to
manage or delete one you have to be in lead mode — as plain admin it is
read-only like any other project.

### Names

Everyone can change what they are called, from their name in the top bar. The
**display name** is only a label — it is what shows next to files, pages and
edits. The **username** is the sign-in handle and normally stays put.

The one exception: while somebody still has no display name (so the username is
doing double duty), the dialog also offers to change the username itself, with a
warning that it is what they will type next time. Once a display name is set,
that offer disappears — otherwise renaming yourself would quietly move your own
login out from under you.

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

## Working at the same time

Every open tab heartbeats to `/api/presence` every 8 seconds. One request
carries the whole live layer:

- **Who's here.** A strip under the project header shows everyone else in the
  project and what they have open — "Sam · editing manifest.json" — with the
  editing marker pulsing.
- **Saves land on their own.** If someone else saves the document you have open
  and you have nothing unsaved, your copy is replaced in place. If you *do*
  have unsaved edits, a strip says so and offers to load theirs instead; your
  typing is never thrown away for you.
- **Clashing saves are refused, not merged.** A save carries the version it
  started from; if that isn't the current one any more the server answers 409
  and you are asked whether to overwrite. Either way the other version is still
  in History.
- **Orders** from a lead (see below) ride back on the same heartbeat.

Pages **autosave** a few seconds after you stop typing. Files deliberately do
not — half-typed JSON shouldn't land on someone else's screen — so they keep
their Save button and ⌘S.

### History

Every save of a text file or a page is snapshotted, at most **one a minute per
document** (saves inside the same minute replace the pending one), kept for
**two days**. The 🕘 History button in either editor lists them with who and
when, previews any of them, and restores one — which is itself a save, so an
unwanted restore is undoable too.

Only text is kept: a binary would put megabytes into SQLite for nothing.
Renaming a file carries its history with it; deleting one takes it away.

## People, kicks and blocks

A lead's **People** tab (outside any project) lists everyone they created plus
anyone signed in to one of their projects, with where each person is right now.
For each: 

- **Move out** — eject them from the file, the page, or the whole project.
  They're taken out within a few seconds and told why.
- **Send to…** — put them somewhere instead: another project, or a specific
  file or page in it. Their screen follows.
- **Block** — the durable version, with an optional time limit (15 minutes to a
  week, or none) and a reason. Blocks are per project and can cover the whole
  project, one file (a folder covers everything under it) or one page. A block
  also kicks them out of it immediately if they're already inside.

Every one of these carries a reason the person sees, and a blocked door explains
itself rather than pretending the thing doesn't exist. Blocks apply only to
ordinary users — a lead can't be shut out of their own project, and admin isn't
in the moderation picture at all.

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
main.go       routing, bootstrap, session + password + role-switch endpoints
auth.go       bcrypt, sessions, role middleware, admin's lead mode
db.go         schema, settings, user/project queries, audit log
projects.go   project CRUD, file CRUD, upload, zip in/out
pages.go      rich-text pages: CRUD, per-page access, markup allow-list
presence.go   who's where, kicks/moves, bans and their enforcement
revisions.go  document history: snapshots, pruning, restore
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
role boundary, quota, traversal vector, page permission, name change, presence,
history, save conflict, block and the admin's lead mode — 220 assertions.

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
