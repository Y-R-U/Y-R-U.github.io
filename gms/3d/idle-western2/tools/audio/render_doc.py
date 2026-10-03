"""Regenerate the script/cue sections of docs/AUDIO.md from script.json + music.json.
Text between <!-- BEGIN:x --> and <!-- END:x --> markers is replaced; everything else is kept."""
import json, os, re
H = os.path.dirname(os.path.abspath(__file__))
DOC = os.path.join(H, '../../docs/AUDIO.md')
S = json.load(open(os.path.join(H, 'script.json')))
M = json.load(open(os.path.join(H, 'music.json')))

def script():
    o = []
    n = sum(len(c['lines']) for c in S['chars'].values())
    w = sum(len(c['wordless']) for c in S['chars'].values())
    o.append(f'{n} sentence lines, {w} wordless clips. `once` = plays once ever; `rude` = muted by Sunday School.\n')
    for k, c in S['chars'].items():
        o.append(f"### {c['name']} (`{k}`) — {c['role']}\n")
        o.append(f"**Voice design:** _{c['voice']}_\n")
        o.append(f"Audition text: “{c['audition']}”\n")
        if c['lines']:
            o.append('| id | line | triggers | flags |\n|---|---|---|---|')
            for l in c['lines']:
                f = ' '.join(x for x in ('once' if l.get('once') else '', 'rude' if l.get('rude') else '') if x)
                o.append(f"| {l['id']} | {l['text']} | {', '.join(l['trig'])} | {f} |")
            o.append('')
        o.append('Wordless: ' + ' · '.join(f"`{x['id']}` {x['text']} ({x['kind']})" for x in c['wordless']) + '\n')
    return '\n'.join(o)

def triggers():
    return '| trigger | when |\n|---|---|\n' + '\n'.join(f'| `{k}` | {v} |' for k, v in S['triggers'].items()) + '\n'

def cues():
    o = ['| cue | file | len | loop | ACE-Step prompt |', '|---|---|---|---|---|']
    for k, c in M.items():
        o.append(f"| {c['title']} | `audio/music/{k}.mp3` | {c.get('trim', c['dur'])} s | {'yes' if c['loop'] else 'no'} | {c['prompt']} |")
    return '\n'.join(o) + '\n'

doc = open(DOC).read()
for tag, fn in (('SCRIPT', script), ('TRIGGERS', triggers), ('CUES', cues)):
    doc = re.sub(rf'(<!-- BEGIN:{tag} -->\n).*?(<!-- END:{tag} -->)', lambda m: m.group(1) + fn() + m.group(2), doc, flags=re.S)
open(DOC, 'w').write(doc)
print('ok')
