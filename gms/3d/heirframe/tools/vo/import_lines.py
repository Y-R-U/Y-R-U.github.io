"""docs/VO_LINES.md -> tools/vo/story.json. Re-run whenever the planner edits VO_LINES.

Rows: | key | voice | line | P | style |. Voice ids are STORY.md cast ids; a few are routed to
FX aliases from cast_story.json based on style/act (recordings, glitches, radio, HIRA's upgrade).
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'docs', 'VO_LINES.md'))
OUT = os.path.join(HERE, 'story.json')


def route(key, voice, style):
    act = int(m[1]) if (m := re.match(r'a(\d+)_', key)) else 0
    s = style.lower()
    if voice == 'iris' and 'recording' in s: return 'iris_rec'
    if voice == 'harmony' and 'glitch' in s: return 'harmony_glitch'
    if voice == 'halloran' and ('radio' in s or 'comms' in s): return 'halloran_radio'
    if voice == 'hira' and act >= 5: return 'hira_clean'
    if voice == 'dray' and act >= 2: return 'dray_gold'
    return voice


def main():
    lines = {}
    for row in open(SRC, encoding='utf-8'):
        cells = [c.strip() for c in row.strip().strip('|').split('|')]
        if len(cells) < 4 or not re.fullmatch(r'[a-z0-9_]+', cells[0]) or cells[0] == 'key':
            continue
        key, voice, text, p = cells[:4]
        style = cells[4] if len(cells) > 4 else ''
        lines[key] = dict(voice=route(key, voice, style), role=voice, text=text, p=p, style=style)
    json.dump({'_source': 'docs/VO_LINES.md via import_lines.py', 'lines': lines}, open(OUT, 'w'), indent=1, ensure_ascii=False)
    by = {}
    for v in lines.values(): by[v['p']] = by.get(v['p'], 0) + 1
    print(len(lines), 'lines', by)


if __name__ == '__main__':
    main()
