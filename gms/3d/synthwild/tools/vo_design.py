# Designs narrator candidates: python3 vo_design.py [baritone|female] <seed>...
# then save one:                python3 vo_design.py [baritone|female] save <job_id> <seed>
import sys, json; sys.path.insert(0, '.'); import vo_tts as tts
VOICES = {
  'female': ('Synthwild · Narrator Female', "A warm, gentle British woman in her thirties narrating a magical story for children. Soft, clear and "
             "wondrous, hopeful and kind, unhurried, with a quiet smile in her voice."),
  'baritone': ('Synthwild · Narrator Baritone', "A man in his fifties with a low, rich, deep baritone voice, warm and resonant, narrating a nature "
               "documentary for children. Calm, unhurried and reassuring, full of quiet wonder, gentle and kind, never menacing."),
}
WHO = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in VOICES else 'baritone'
if len(sys.argv) > 1 and sys.argv[1] in VOICES: sys.argv.pop(1)
NAME, INSTRUCT = VOICES[WHO]
TEXT = "A tiny seed could hold a whole design. Plant it, and the land would grow into its shape, block by block."
def st(seed): return dict(mode='design', speaker='Ryan', language='English', instruct=INSTRUCT, temperature=0.9,
                          top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
if sys.argv[1] == 'save':
    jid, seed = sys.argv[2], int(sys.argv[3])
    r = tts.req('/api/voices', dict(name=NAME, notes='Designed for SYNTHWILD (yru gms/3d/synthwild) intro narration.',
                                    settings=st(seed), job_id=jid, preserve_voice=True))
    json.dump(r, open(f'vo_voice_{WHO}.json', 'w'), indent=1); print(json.dumps(r)[:600])
else:
    import os; os.makedirs('scratch', exist_ok=True)
    for s in map(int, sys.argv[1:]):
        jid, res = tts.gen(st(s), TEXT, f'scratch/narr_{WHO}_{s}.wav'); print(s, jid, round(res['duration'], 2), flush=True)
