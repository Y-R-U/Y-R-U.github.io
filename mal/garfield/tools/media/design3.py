"""Wave 3 voice auditions: design3.py <lyman|delivery> <variant> <seed>"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__)); import tts
C = {
 'lyman': ["Adult man in his thirties with a rich, theatrical, slightly hammy baritone voice. Dramatic and over-the-top like a struggling stage actor, a lovable moocher with smooth charm, rolling delivery, big sighs, grand gestures in the voice. American accent.",
           "A flamboyant, melodramatic American man around thirty-five. Resonant, booming, nasal-free voice with a showman's flair. Exaggerated, self-pitying, pleading delivery, then instantly breezy and charming. Comic.",
           "A smooth-talking, charming American man in his thirties with a husky, slightly raspy low voice. Dramatic, theatrical pauses, rolls his words, a cheeky freeloader who acts like everything is a grand tragedy."],
 'delivery': ["A friendly, matter-of-fact working man in his forties with a gruff, gravelly, slightly hoarse voice. Brisk and cheerful, a no-nonsense delivery driver. American accent, East Coast flavour.",
              "A chatty, jolly, older delivery guy around fifty, warm husky voice, slightly breathless from carrying boxes, upbeat and polite. American accent."],
}
T = {
 'lyman': "I'm cold. I'm hungry. I'm weak. Take me in! Ah, Jon, old buddy. You know, a man could get used to a sofa like this.",
 'delivery': "Delivery! One big box for this address. Sign here, please. Careful, it's a heavy one. Have a good one!",
}
if __name__ == '__main__':
    who, var, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    st = dict(mode='design', speaker='Ryan', language='English', instruct=C[who][var], temperature=0.9, top_p=1.0,
              top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
    out = os.path.join(os.path.dirname(__file__), f'scratch/w3/{who}_v{var}_s{seed}.wav')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    jid, s = tts.gen(st, T[who], out)
    print(who, var, seed, jid, round(s['duration'], 2), out, flush=True)
