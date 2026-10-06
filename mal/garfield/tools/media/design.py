"""Audition designed voices: design.py <garfield|jon> <seed> [variant]"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__)); import tts
C = {
 'garfield': ["A middle-aged man with a slow, lazy, deep, slightly gravelly voice. Deadpan, dry and sardonic, unhurried and relaxed, as if half asleep on a sofa, but warm and quietly amused. American accent. Speaks with drawn-out, self-satisfied pauses.",
              "A deep, mellow, laid-back American male voice, low and velvety with a lazy drawl. Bored, sarcastic, deadpan delivery, smug and cheeky but friendly, like a sleepy comedian muttering to himself.",
              "A heavyset, unhurried American man in his forties. Low, rich, slightly raspy voice. Utterly unimpressed, dry wit, deadpan sarcasm, sleepy and content, with a warm chuckle underneath."],
 'jon_old': ["A cheerful, nerdy American man in his thirties. Slightly nasal, mid-high pitched voice, upbeat and eager, a bit goofy, easily flustered, voice cracks a little when excited.",
         "A friendly, gangly, awkward American guy around thirty-five. Bright, slightly nasal tenor voice, enthusiastic and earnest, talks quickly, gets flustered and squeaky when upset.",
         "An upbeat, dorky, good-natured American man. Light nasal tenor, sing-song cheerful tone, polite and a little clumsy-sounding, with comic panic when things go wrong."],
 'jon': ["An adult male in his mid-thirties with a natural, deep-ish male tenor voice. Friendly, cheerful and a little nerdy, speaks quickly and gets easily flustered, voice rises with comic panic when hurt. Clearly a grown man. American accent.",
         "Adult male, deep-ish male voice, warm baritone, around thirty-five. Good-natured, upbeat everyman, slightly awkward and goofy, easily flustered and exasperated. American accent.",
         "A grown man in his thirties with a medium-low male voice. Earnest, friendly, nerdy and a bit clumsy, expressive and animated, yelps and stammers when flustered, never squeaky. American accent.",
         "Adult man, mid-thirties, clear male baritone-tenor voice. Cheerful sitcom dad energy, gentle and polite, quickly gets exasperated and whiny when things go wrong. American accent."],
}
T = {
 'garfield': "Diet biscuits. The saddest two words in any language. I'll get up in five minutes. Or fifty. Mmm, lasagna.",
 'jon': "Here you go, buddy! Crunchy cat biscuits, your favourite! And for me, steak and mash! Hey! Ow, ow, ow! My leg!",
}
if __name__ == '__main__':
    who, seed = sys.argv[1], int(sys.argv[2]); var = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    st = dict(mode='design', speaker='Ryan', language='English', instruct=C[who][var], temperature=0.9, top_p=1.0,
              top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
    out = os.path.join(os.path.dirname(__file__), f'scratch/{who}_v{var}_s{seed}.wav')
    jid, s = tts.gen(st, T[who], out)
    print(who, var, seed, jid, round(s['duration'], 2), out, flush=True)
