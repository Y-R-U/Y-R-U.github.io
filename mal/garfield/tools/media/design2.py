import sys, os
sys.path.insert(0, os.path.dirname(__file__)); import tts
T = "Here you go, buddy. Crunchy cat biscuits, your favourite. And for me, steak and mash! Oh boy, I've been looking forward to this all day."
D = ["Adult male in his mid-thirties, deep-ish male baritone voice, low and warm. Friendly, cheerful, a little nerdy and awkward. Relaxed conversational American accent. Clearly a grown man.",
     "A thirty-five-year-old American man with a low, warm baritone speaking voice. Upbeat, polite, slightly goofy everyman, a bit sheepish."]
mode, arg, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
if mode == 'design':
    st = dict(mode='design', speaker='Ryan', language='English', instruct=D[int(arg)], temperature=0.9, top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
else:
    st = dict(mode='preset', speaker=arg, language='English', instruct="Cheerful, friendly and a little goofy, upbeat and warm.", temperature=0.9, top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
out = os.path.join(os.path.dirname(__file__), f'scratch/jon2_{mode}_{arg}_s{seed}.wav')
jid, s = tts.gen(st, T, out)
print(mode, arg, seed, jid, round(s['duration'], 2), out, flush=True)
