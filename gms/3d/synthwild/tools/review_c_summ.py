# R3 reviewer C: print a compact summary of review_c_perf JSON results.  python3 tools/review_c_summ.py <json>...
import json, sys
for f in sys.argv[1:]:
    r = json.load(open(f))
    print('==', r.get('scenario'), 't%s' % r.get('throttle'), {k: r.get(k) for k in ['dur', 'fps', 'p50', 'p95', 'p99', 'max', 'over50', 'over100', 'mutPerSec', 'heapMB', 'calls', 'tris', 'mobs', 'sceneObjs', 'geo', 'tex', 'workers']})
    tot = sum(v['msPerFrame'] for k, v in r['per'].items() if '.' not in k)
    print('   per-frame ms (top-level sum %.2f):' % tot, ', '.join('%s %.3f' % (k, v['msPerFrame']) for k, v in sorted(r['per'].items(), key=lambda x: -x[1]['msPerFrame'])[:12]))
    print('   mut/s', r['topMut'][:6], 'dom', r['domCallsPerSec'])
    p = r.get('profile')
    if p:
        idle = dict((k, v) for k, v, _ in p['topSelf']).get('(idle) :0', 0)
        print('   busy %.1f%%' % (100 - 100.0 * idle / max(1, p['totalMs'])), 'top self:', [x for x in p['topSelf'][:14] if 'idle' not in x[0]])
        print('   by file:', [x for x in p['byFile'][:12] if 'idle' not in x[0]])
    a = r['alloc']
    print('   alloc %.2f MB/s' % a['MBperSec'], a['top'][:10])
    if r.get('exceptions'): print('   EXC', r['exceptions'][:3])
