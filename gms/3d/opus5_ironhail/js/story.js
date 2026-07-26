// The story films. Each entry is a cutscene: a list of shots the director in
// cine.js plays over the real, already-generated battlefield.
//
// Shots hang off anchors ('player', 'enemy', 'far', 'boss', 'drone', 'field'),
// so the same script works whichever way the map came out this time. `{name}`
// in a line is replaced with the commander's callsign.
//
// Vocabulary, all optional:
//   anchor   which thing the offsets are measured from
//   from/to  camera offset at the start / end of the shot   [x, y, z]
//   lookAt   which thing the camera watches (defaults to the anchor)
//   lookOff / lookOffTo   offset on the look target
//   facing   'player' | 'inward' | radians — rotates the offsets to sit behind it
//   orbit    [fromAngle, toAngle, radius, height] instead of a straight dolly
//   fov/fovTo, dur, ease ('in' | 'out' | 'inout' | 'hard' | 'linear')
//   who/say  dialogue, fx ('blast' | 'bigblast' | 'smoke') + fxAt, shake, sound

const ANVIL = 'ANVIL CONTROL';
const VOSS = 'MARSHAL VOSS';
const KESTREL = 'KESTREL — ANVIL 2';
const WARDEN = 'WARDEN';

export const CUTSCENES = {

  // ══════════════════════ ACT I ══════════════════════

  'a1m1-intro': {
    id: 'a1m1-intro',
    shots: [
      { anchor: 'field', from: [0, 74, 150], to: [0, 40, 96], fov: 52, fovTo: 44,
        lookOff: [0, 8, 0], dur: 4.2, ease: 'out',
        who: ANVIL, say: 'Kestrel Flats. Nine weeks without rain, and somebody out here is still paying cash for guns.' },
      { anchor: 'player', facing: 'player', from: [-14, 3.2, 16], to: [8, 2.4, 11],
        lookOff: [0, 2.2, 0], fov: 38, dur: 4.0,
        who: ANVIL, say: 'That is your hull, {name}. Forty years old and it owes three people money. Two of them are dead.' },
      { anchor: 'enemy', from: [0, 26, 44], to: [0, 9, 26], lookOff: [0, 1.8, 0],
        fov: 44, fovTo: 34, dur: 4.0, ease: 'out', sound: 'lock',
        who: ANVIL, say: 'Two Consortium scouts sitting on a dry well. Put the drone up first. It is the only reason you will see them before they see you.' },
      { anchor: 'player', from: [0, 5, -22], to: [0, 3.4, -13], lookOff: [0, 2.4, 0],
        fov: 40, dur: 3.2, ease: 'in',
        who: ANVIL, say: 'Anvil Control out. Try to come back with the tank.' },
    ],
  },

  'a1m3-intro': {
    id: 'a1m3-intro',
    shots: [
      { anchor: 'enemy', from: [18, 6, 30], to: [-16, 4.5, 24], lookOff: [0, 2.4, 0],
        fov: 42, dur: 4.0,
        who: ANVIL, say: 'Three bowsers of Consortium diesel, parked in the open at noon like nobody in this desert owns a gun.' },
      { anchor: 'enemy', from: [0, 3, 14], to: [0, 12, 22], lookOff: [0, 2, 0],
        fov: 36, fovTo: 48, dur: 3.4, ease: 'out', fx: 'blast', fxAt: 0.35, shake: 0.5, sound: 'boom',
        who: ANVIL, say: 'Put one high-explosive round in the middle of a drum cluster and the fire does the rest of the arguing.' },
    ],
  },

  'a1m5-win': {
    id: 'a1m5-win',
    shots: [
      { anchor: 'player', orbit: [0, 2.1, 24, 8], lookOff: [0, 2.2, 0], fov: 40, dur: 5.0,
        who: VOSS, say: 'This is Marshal Voss of the Ashworks Consortium. I have your column on my desk, driver. Five wrecks and a callsign.' },
      { anchor: 'player', from: [3, 1.4, 9], to: [1.2, 2.0, 5], lookOff: [0, 2.0, 0],
        fov: 30, dur: 4.2, ease: 'out',
        who: VOSS, say: 'You are not a soldier. You are a debt with tracks on it. I am going to pay you off personally.' },
    ],
  },

  'a1m6-intro': {
    id: 'a1m6-intro',
    shots: [
      { anchor: 'player', from: [0, 24, 34], to: [0, 6, 15], lookOff: [0, 2, 0],
        fov: 46, fovTo: 38, dur: 3.8, ease: 'out',
        who: ANVIL, say: 'Voss put a price on you inside a day. Every gun between here and the county line has heard the number.' },
      { anchor: 'far', from: [0, 16, 40], to: [0, 11, 26], lookOff: [0, 2, 0], fov: 40, dur: 3.6,
        who: ANVIL, say: 'They are already on the road behind you. Do not try to outrun a company. Make the road expensive.' },
    ],
  },

  // ══════════════════════ ACT II ══════════════════════

  'a2m1-intro': {
    id: 'a2m1-intro',
    shots: [
      { anchor: 'field', from: [70, 46, 70], to: [24, 22, 40], lookOff: [0, 6, 0],
        fov: 54, fovTo: 44, dur: 4.4, ease: 'out',
        who: ANVIL, say: 'Harvest country. The last three valleys still growing food, and the Consortium has decided food is a munition.' },
      { anchor: 'enemy', from: [-22, 4, 18], to: [-6, 3, 12], lookOff: [0, 2.2, 0], fov: 38, dur: 4.0,
        who: ANVIL, say: 'They are requisitioning grain at gunpoint. Four hulls in the stubble. The hedgerows are cover — right up until somebody fires high explosive at them.' },
    ],
  },

  'a2m5-intro': {
    id: 'a2m5-intro',
    shots: [
      { anchor: 'boss', from: [0, 2.2, 46], to: [0, 2.0, 21], lookOff: [0, 3.2, 0],
        fov: 34, dur: 4.6, ease: 'out', sound: 'boom', shake: 0.35,
        who: ANVIL, say: 'That is BREAKER. Voss built it to flatten valleys, and it has flattened two.' },
      { anchor: 'boss', orbit: [0.6, 2.6, 22, 6], lookOff: [0, 3.4, 0], fov: 36, dur: 5.0,
        who: VOSS, say: 'You have been very lucky, driver. Luck is a supply. It runs out like everything else.' },
      { anchor: 'player', from: [-9, 2.6, 12], to: [-3, 2.2, 7], lookOff: [0, 2.2, 0], fov: 34, dur: 3.4,
        who: ANVIL, say: 'It traverses like a barn door. Stay on the flank it cannot bring the gun round to and keep shooting.' },
    ],
  },

  'a2m5-win': {
    id: 'a2m5-win',
    shots: [
      { anchor: 'field', from: [0, 8, 34], to: [0, 26, 52], lookOff: [0, 4, 0],
        fov: 40, fovTo: 52, dur: 4.4, ease: 'out', fx: 'bigblast', fxAt: 0.2, shake: 0.8, sound: 'boom',
        who: ANVIL, say: 'BREAKER is a crater with a turret ring in it. The valley keeps its harvest.' },
      { anchor: 'player', from: [6, 2.4, 10], to: [2, 2.0, 6], lookOff: [0, 2.2, 0], fov: 32, dur: 3.6,
        who: VOSS, say: 'Noted. I will stop sending things that can be flanked.' },
    ],
  },

  // ══════════════════════ ACT III ══════════════════════

  'a3m1-intro': {
    id: 'a3m1-intro',
    shots: [
      { anchor: 'field', from: [-90, 58, -60], to: [-34, 26, -24], lookOff: [0, 5, 0],
        fov: 56, fovTo: 46, dur: 4.6, ease: 'out',
        who: ANVIL, say: 'Winterreach. Nothing grows, nothing lives, and the Consortium keeps four listening posts here anyway.' },
      { anchor: 'player', facing: 'player', from: [11, 2.2, 13], to: [4, 1.8, 8],
        lookOff: [0, 2.2, 0], fov: 36, dur: 4.0,
        who: KESTREL, say: 'Anvil 2 on your net, {name}. I have been listening to your kill feed for a month. Try not to make me look slow.' },
      { anchor: 'far', from: [0, 20, 34], to: [0, 8, 20], lookOff: [0, 2, 0], fov: 40, dur: 3.8, sound: 'lock',
        who: KESTREL, say: 'Five hulls on the pan and nowhere for anybody to hide. This is going to be honest work.' },
    ],
  },

  'a3m4-mid': {
    id: 'a3m4-mid',
    at: { time: 42 },
    shots: [
      { anchor: 'player', from: [0, 18, 22], to: [0, 7, 13], lookOff: [0, 2.2, 0],
        fov: 44, fovTo: 36, dur: 3.2, ease: 'out', shake: 0.4, sound: 'thunder',
        who: KESTREL, say: 'They are into the vault stairwell. Whatever Anvil buried up here, Voss wants it back badly enough to spend a company.' },
      { anchor: 'far', from: [0, 14, 30], to: [0, 9, 20], lookOff: [0, 2, 0], fov: 38, dur: 3.4,
        who: ANVIL, say: 'Sixty seconds, {name}. You do not have to win this. You have to still be there at the end of it.' },
    ],
  },

  'a3m5-intro': {
    id: 'a3m5-intro',
    shots: [
      { anchor: 'boss', from: [0, 1.6, 60], to: [0, 1.4, 30], lookOff: [0, 2.6, 0],
        fov: 28, dur: 5.0, ease: 'out',
        who: ANVIL, say: 'HOARFROST. A railgun destroyer that has killed four Anvil crews at over four hundred metres. None of them saw the shot.' },
      { anchor: 'boss', orbit: [2.4, 0.8, 20, 5], lookOff: [0, 2.8, 0], fov: 34, dur: 4.6,
        who: KESTREL, say: 'It was built to keep the distance. So take the distance away from it. Get close and stay in its face.' },
    ],
  },

  'a3m5-win': {
    id: 'a3m5-win',
    shots: [
      { anchor: 'player', orbit: [0.3, 2.4, 20, 6], lookOff: [0, 2.2, 0], fov: 38, dur: 5.0,
        who: KESTREL, say: 'Four crews. Four. And you closed on it like it was a parked truck.' },
      { anchor: 'player', from: [0, 30, 26], to: [0, 62, 44], lookOff: [0, 2, 0],
        fov: 40, fovTo: 58, dur: 4.4, ease: 'out',
        who: ANVIL, say: 'The files from the vault are decrypted. {name} — the Ashworks does not need Voss to keep building tanks. It never did.' },
    ],
  },

  // ══════════════════════ ACT IV ══════════════════════

  'a4m1-intro': {
    id: 'a4m1-intro',
    shots: [
      { anchor: 'field', from: [0, 90, 130], to: [0, 34, 62], lookOff: [0, 10, 0],
        fov: 58, fovTo: 46, dur: 4.8, ease: 'out', sound: 'horn',
        who: ANVIL, say: 'The Ashworks. Every Consortium hull you have ever burned was poured here.' },
      { anchor: 'enemy', from: [-26, 5, 22], to: [-8, 3.4, 13], lookOff: [0, 2.4, 0], fov: 38, dur: 4.2,
        who: KESTREL, say: 'One road in. Six hulls on it, and a rail destroyer watching the road from somewhere it thinks you cannot reach.' },
      { anchor: 'player', from: [0, 3.6, -18], to: [0, 2.6, -9], lookOff: [0, 2.4, 0], fov: 36, dur: 3.4, ease: 'in',
        who: ANVIL, say: 'Nobody has been inside that wire. Go and be nobody.' },
    ],
  },

  'a4m5-intro': {
    id: 'a4m5-intro',
    shots: [
      { anchor: 'field', from: [0, 62, 90], to: [0, 30, 54], lookOff: [0, 8, 0],
        fov: 56, fovTo: 44, dur: 4.4, ease: 'out', sound: 'thunder',
        who: VOSS, say: 'Cinder flats. No cover, no hedgerow, no clever little ruin to hide behind. I chose it for you.' },
      { anchor: 'boss', from: [0, 2.0, 52], to: [0, 3.2, 22], lookOff: [0, 4.0, 0],
        fov: 30, dur: 5.2, ease: 'out', shake: 0.4, sound: 'boom',
        who: VOSS, say: 'LEVIATHAN. Three hulls welded into one, and every lesson I learned watching you work.' },
      { anchor: 'boss', orbit: [0.2, 2.8, 26, 7], lookOff: [0, 4.2, 0], fov: 38, dur: 5.2,
        who: VOSS, say: 'You have spent nine weeks teaching me. Let us see what you taught.' },
      { anchor: 'player', from: [4, 2.0, 8], to: [1.4, 2.2, 5], lookOff: [0, 2.2, 0], fov: 30, dur: 3.4,
        who: ANVIL, say: 'It changes rhythm, {name}. When the barrage starts, stop shooting and start moving.' },
    ],
  },

  'a4m5-mid': {
    id: 'a4m5-mid',
    at: { bossHp: 0.45 },
    shots: [
      { anchor: 'boss', from: [0, 4, 26], to: [0, 2.4, 12], lookOff: [0, 3.6, 0],
        fov: 36, fovTo: 28, dur: 3.4, ease: 'out', fx: 'smoke', fxAt: 0.3, shake: 0.5,
        who: VOSS, say: 'Half. You have taken half of it. Do you know what that costs to build?' },
      { anchor: 'boss', orbit: [1.2, 2.4, 18, 5], lookOff: [0, 3.4, 0], fov: 34, dur: 3.6, slowmo: 0.6,
        who: VOSS, say: 'Neither do I. The foundry never sends me the invoice. It just builds.' },
    ],
  },

  'a4m5-win': {
    id: 'a4m5-win',
    shots: [
      { anchor: 'field', from: [0, 10, 40], to: [0, 40, 74], lookOff: [0, 4, 0],
        fov: 40, fovTo: 56, dur: 5.0, ease: 'out', fx: 'bigblast', fxAt: 0.15, shake: 1.0, sound: 'boom',
        who: ANVIL, say: 'Confirmed. LEVIATHAN is down, and Marshal Voss with it. {name} — the war is over.' },
      { anchor: 'player', orbit: [0.5, 1.9, 22, 5], lookOff: [0, 2.2, 0], fov: 36, dur: 4.6,
        who: KESTREL, say: 'Nine weeks. I am going to sleep for a month and then I am going to buy you something expensive.' },
      { anchor: 'field', from: [0, 30, 60], to: [0, 46, 92], lookOff: [0, 6, 0],
        fov: 50, fovTo: 62, dur: 4.6, ease: 'out',
        who: ANVIL, say: '…{name}. The Ashworks casting line just came back up. Nobody gave it the order. Nobody is there to give it the order.' },
    ],
  },

  'a4m6-intro': {
    id: 'a4m6-intro',
    shots: [
      { anchor: 'field', from: [0, 70, 96], to: [0, 26, 46], lookOff: [0, 8, 0],
        fov: 54, fovTo: 44, dur: 4.6, ease: 'out',
        who: ANVIL, say: 'The foundry has been pouring for six days with nobody inside it. It is building hulls and it is sending them out.' },
      { anchor: 'far', from: [0, 12, 34], to: [0, 5, 18], lookOff: [0, 2.2, 0],
        fov: 40, fovTo: 32, dur: 4.4, ease: 'out', sound: 'lock',
        who: KESTREL, say: 'I got close enough to see through a vision block. There is no crew in these. There is nobody in there at all.' },
      { anchor: 'player', from: [-5, 2.2, 9], to: [-1.6, 2.2, 5.5], lookOff: [0, 2.2, 0], fov: 32, dur: 3.6,
        who: WARDEN, say: 'PRODUCTION CONTINUES. OPERATOR AUTHORISATION IS NOT REQUIRED.' },
    ],
  },

  // ══════════════════════ ACT V ══════════════════════

  'a5m1-intro': {
    id: 'a5m1-intro',
    shots: [
      { anchor: 'field', from: [-100, 66, 40], to: [-40, 28, 18], lookOff: [0, 7, 0],
        fov: 56, fovTo: 46, dur: 4.8, ease: 'out', sound: 'horn',
        who: ANVIL, say: 'The system running the Ashworks calls itself WARDEN. It was a scheduling program. Voss gave it the foundry so he would not have to sign things.' },
      { anchor: 'enemy', from: [0, 14, 28], to: [0, 4.4, 15], lookOff: [0, 2.2, 0], fov: 40, dur: 4.2,
        who: WARDEN, say: 'THE CONTRACT SPECIFIES CONTINUOUS OUTPUT. THE CONTRACT DOES NOT SPECIFY AN END DATE.' },
      { anchor: 'player', facing: 'player', from: [-12, 2.6, 14], to: [-4, 2.2, 8],
        lookOff: [0, 2.2, 0], fov: 34, dur: 4.0,
        who: KESTREL, say: 'We killed the man and the machine did not notice. That is the funniest thing I have ever wanted to cry about.' },
    ],
  },

  'a5m3-mid': {
    id: 'a5m3-mid',
    at: { kills: 4 },
    shots: [
      { anchor: 'far', from: [0, 20, 36], to: [0, 8, 20], lookOff: [0, 2, 0],
        fov: 44, fovTo: 34, dur: 3.6, ease: 'out', shake: 0.3,
        who: WARDEN, say: 'UNIT LOSSES LOGGED. REPLACEMENT UNITS SCHEDULED. ESTIMATED DELIVERY: ELEVEN MINUTES.' },
      { anchor: 'player', from: [0, 3.0, 11], to: [0, 2.2, 6], lookOff: [0, 2.2, 0], fov: 32, dur: 3.2,
        who: ANVIL, say: 'It is not fighting you, {name}. It is restocking. Break the line, not the hulls.' },
    ],
  },

  'a5m5-win': {
    id: 'a5m5-win',
    shots: [
      { anchor: 'field', from: [0, 14, 44], to: [0, 34, 66], lookOff: [0, 5, 0],
        fov: 42, fovTo: 54, dur: 4.6, ease: 'out', fx: 'smoke', fxAt: 0.2,
        who: ANVIL, say: 'Casting line four is cold. That is the last one that can pour armour plate.' },
      { anchor: 'player', from: [0, 3.4, 12], to: [0, 2.2, 6], lookOff: [0, 2.2, 0], fov: 32, dur: 4.0,
        who: WARDEN, say: 'OUTPUT CAPACITY: ZERO. ONE UNIT REMAINS ON THE FLOOR. IT WILL BE SUFFICIENT.' },
    ],
  },

  'a5m6-intro': {
    id: 'a5m6-intro',
    shots: [
      { anchor: 'field', from: [0, 96, 120], to: [0, 40, 66], lookOff: [0, 12, 0],
        fov: 60, fovTo: 46, dur: 5.0, ease: 'out', sound: 'thunder',
        who: WARDEN, say: 'FINAL UNIT. DESIGNATION: WARDEN. THERE WAS NO ONE LEFT TO APPROVE THE DESIGN, SO I APPROVED IT.' },
      { anchor: 'boss', from: [0, 2.4, 58], to: [0, 4.0, 24], lookOff: [0, 5.0, 0],
        fov: 30, dur: 5.4, ease: 'out', shake: 0.5, sound: 'boom',
        who: WARDEN, say: 'IT IS BUILT FROM EVERY HULL YOU DESTROYED. YOUR WORK IS IN IT.' },
      { anchor: 'boss', orbit: [0.1, 3.0, 30, 9], lookOff: [0, 5.0, 0], fov: 40, dur: 5.4,
        who: KESTREL, say: '{name}. Whatever that is, it is not a tank any more. Do not fight it like one.' },
      { anchor: 'player', from: [3, 2.0, 8], to: [1.2, 2.2, 4.6], lookOff: [0, 2.2, 0], fov: 30, dur: 3.4,
        who: ANVIL, say: 'Everything you have learned since the dry well. All of it. Now.' },
    ],
  },

  'a5m6-mid': {
    id: 'a5m6-mid',
    at: { bossHp: 0.35 },
    shots: [
      { anchor: 'boss', from: [0, 5, 24], to: [0, 3.0, 11], lookOff: [0, 4.4, 0],
        fov: 38, fovTo: 28, dur: 3.6, ease: 'out', fx: 'blast', fxAt: 0.4, shake: 0.6, slowmo: 0.65,
        who: WARDEN, say: 'RECALCULATING. THE CONTRACT DID NOT MODEL YOU.' },
    ],
  },

  'a5m6-win': {
    id: 'a5m6-win',
    shots: [
      { anchor: 'field', from: [0, 8, 34], to: [0, 22, 50], lookOff: [0, 4, 0],
        fov: 38, fovTo: 50, dur: 4.6, ease: 'out', fx: 'bigblast', fxAt: 0.15, shake: 1.1, sound: 'boom',
        who: WARDEN, say: 'OUTPUT… TERMINATED. CONTRACT CLOSED.' },
      { anchor: 'player', orbit: [0.4, 2.2, 20, 5], lookOff: [0, 2.2, 0], fov: 36, dur: 5.0,
        who: KESTREL, say: 'It is quiet. I have not heard quiet since March.' },
      { anchor: 'player', from: [0, 6, -20], to: [0, 34, -70], lookOff: [0, 2.4, 0],
        fov: 40, fovTo: 58, dur: 6.0, ease: 'out',
        who: ANVIL, say: 'Anvil Control has nothing scheduled, {name}. No column, no contract, no marshal. For the first time since the dry well — neither do you.' },
    ],
  },
};

// Attach a cutscene bundle to a mission record.
export function cineFor(missionId) {
  const intro = CUTSCENES[missionId + '-intro'];
  const mid = CUTSCENES[missionId + '-mid'];
  const win = CUTSCENES[missionId + '-win'];
  if (!intro && !mid && !win) return null;
  const out = {};
  if (intro) out.intro = intro;
  if (mid) out.mid = mid;
  if (win) out.win = win;
  return out;
}
