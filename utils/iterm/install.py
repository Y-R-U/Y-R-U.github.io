#!/usr/bin/env python3
"""Install the iTerm reminder helper as a login launchd service, or --uninstall."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
LABEL = 'com.airon.iterm-reminders'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()
    target = Path.home() / f'Library/LaunchAgents/{LABEL}.plist'
    domain = f'gui/{os.getuid()}'
    if args.uninstall:
        subprocess.run(['launchctl', 'bootout', f'{domain}/{LABEL}'], check=False)
        target.unlink(missing_ok=True)
        print('Helper removed. Saved schedules are preserved.')
        return
    data = Path.home() / 'Library/Application Support/YRU iTerm Scheduler'
    data.mkdir(parents=True, exist_ok=True, mode=0o700)
    python = shutil.which('python3', path='/opt/homebrew/bin:/usr/local/bin:/usr/bin') or sys.executable
    target.parent.mkdir(parents=True, exist_ok=True)
    # Backup once for an existing installation; do not touch the port 8888 service.
    if target.exists():
        backup = target.with_suffix('.plist.previous')
        if not backup.exists():
            shutil.copy2(target, backup)
        subprocess.run(['launchctl', 'bootout', f'{domain}/{LABEL}'], check=False)
    target.write_bytes(plistlib.dumps({
        'Label': LABEL, 'ProgramArguments': [python, str(HERE / 'server.py')],
        'WorkingDirectory': str(HERE), 'RunAtLoad': True, 'KeepAlive': True,
        'ThrottleInterval': 10, 'ProcessType': 'Background',
        'StandardOutPath': str(data / 'service.log'), 'StandardErrorPath': str(data / 'service.log'),
    }))
    subprocess.run(['launchctl', 'bootstrap', domain, str(target)], check=True)
    print('Installed. Open http://localhost:8888/utils/iterm/ or your Mac’s LAN address on your phone.')


if __name__ == '__main__':
    main()
