# iTerm Reminders

Open **YRU → Utils → iTerm Reminders** at `http://localhost:8888/utils/iterm/`.
On a phone, use the Mac's LAN address, e.g. `http://192.168.0.236:8888/utils/iterm/`.
The portrait layout supports selecting split panes, scheduling and editing reminders,
pausing/resuming/cancelling, delivery history, and an on-demand visible-screen preview.

Choose a session, enter the initial delay in hours/minutes, and edit the first prompt
(default `continue`). Enable repeats to set their interval, prompt and **additional**
count. For example: first in 1h, then every 5h 2m × 3 more = four total deliveries.
Saving an edited schedule restarts its timing and delivery count.

## Install on macOS

From the site root:

```sh
python3 utils/iterm/install.py
```

This installs `~/Library/LaunchAgents/com.airon.iterm-reminders.plist`, with
`RunAtLoad` and `KeepAlive`. It is the cron equivalent: a small persistent Python
service checks durable schedules each second, even with the browser closed.
No pip dependencies and no changes to the existing static server on port 8888.
The helper listens on **8890**; allow it on your home network if macOS asks.
If prompted, allow automation of iTerm2 under System Settings → Privacy & Security
→ Automation. The installed job must be able to send Apple Events in your login session.

```sh
launchctl print gui/$(id -u)/com.airon.iterm-reminders
python3 utils/iterm/install.py --uninstall
```

Uninstall preserves schedules. Reinstall resumes any active schedules.
For foreground diagnostics (stop the installed job first to free port 8890):

```sh
python3 utils/iterm/server.py
osascript -l JavaScript utils/iterm/bridge.js list
osascript -l JavaScript utils/iterm/bridge.js preview SESSION_UUID
osascript -l JavaScript utils/iterm/bridge.js send SESSION_UUID continue
```

`bridge.js` sends the text, then a separate Enter. It uses iTerm2's installed
scripting dictionary and stable session IDs, not the frontmost window or its title.
See [iTerm2 scripting](https://iterm2.com/documentation-scripting.html).

## Timing and delivery

- Mac must be awake, logged in, and running iTerm2. Closing the web page is fine.
- One overdue reminder is delivered after waking/restarting. The next interval
  starts at the actual delivery time; missed intervals never accumulate into a burst.
- Repeat count excludes the initial send. Different sessions have independent schedules.
- A closed session, automation failure or detected shell prompt pauses the schedule.
  After checking the terminal, resume it or edit it to select another session.
- Shell detection depends on iTerm2 shell integration and is only a best-effort guard.
  Keep the intended agent running and the input clear. The helper cannot distinguish
  every agent's input state or know whether a submitted prompt was accepted by its AI.
- If a process stops during a send, restart pauses that schedule for review rather
  than risking an automatic duplicate. History says “sent” when iTerm accepted input.
- Resume keeps a future deadline; an overdue deadline waits at least one minute.
- Prompts are single-line text (up to 4,000 characters); terminal controls are rejected.

## Local data and network

SQLite schedules, prompts, history and logs stay outside the public site in
`~/Library/Application Support/YRU iTerm Scheduler/`. Back up that directory to
preserve schedules. Screen previews are fetched on demand and never persisted.

This is a **trusted home-network tool**: anyone on that network who opens your local
YRU can operate it. Do not port-forward 8890. The API checks local Host names/IPs,
same-host port-8888 browser origins, JSON requests and a per-service token for writes;
unrelated websites and the public Pages site cannot call it from a browser.
Utils navigation stays hidden on public hosting. There is no public backend.

## Checks

```sh
python3 -m unittest discover -s utils/iterm -p 'test_*.py' -v
node --check utils/iterm/app.js
```

Tests use an isolated temporary database and fake iTerm transport. They cover timing,
repeat counts, separate prompts/sessions, persistence, errors, interrupted delivery,
edits, validation and HTTP origin/token protections. A real delivery smoke test must
use a disposable iTerm session, never one of the user's running agents.
