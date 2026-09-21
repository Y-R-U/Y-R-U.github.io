# TINPOT — *A Very Small War*

**Folder:** `gms/3d/tinpot/` · **URL:** `/gms/3d/tinpot/` · **Portrait, mobile-first, Three.js, no build step**

---

## The pitch

A tinpot general fights a tinpot war with tinpot men. You command up to four helmets — that is
mostly what you see of them from up here, a round tin helmet, two little boots and a rifle held
out in front — as they trot through a forest that they are about to set on fire.

It is *Cannon Fodder*'s shape: tap the ground, the lads walk there, and they shoot anything that
wanders into range all by themselves. It is not *Cannon Fodder*'s look. The camera sits high but
tilted a few degrees off vertical, so helmets have a highlight on one side and cast a long soft
shadow, the grass has depth, and the treeline is a real canopy you are looking down into rather
than a tile. Everything on screen is lit, shadowed and bloomed like a modern game and then
populated with idiots.

The tone is the joke *Cannon Fodder* made and then some. Men die instantly and comprehensively,
in a spray of cartoon claret that stains the grass for the rest of the mission. The soundtrack is
a jaunty march. The debrief screen counts your dead with enthusiasm. Nothing about this is
respectful and none of it is gory in a way that means anything — the blood is the colour of jam
and the explosions are the size of houses.

## What you actually do

**Move.** Tap the ground. Every *active* unit walks there in a loose formation. There is no
aiming and no fire button: a soldier shoots whatever is in range of his current weapon, on his
own, forever, until one of them is dead.

**Choose who moves.** Four unit cards sit along the bottom edge. Tapping a card toggles that
soldier in or out of the squad order — lit means "you come too", dim means "you hold here and
keep shooting". One must always stay lit. This one toggle is the entire tactical game: peel one
man off to hold a gap while the other three swing wide, and you have flanked something.

**Choose what they shoot with.** A vertical rail of three weapon buttons climbs the left edge from
the bottom. In a mission they set the weapon for the *whole* squad in one tap. Each unit card
also carries up to three tiny weapon pips along its top edge, for changing one man on his own —
so three rifles and one grenadier is two taps away. Buttons only exist once you have unlocked and
equipped the weapon, so mission one has exactly one of them and the screen is almost empty.

**Burn the map down.** Nearly every tree is destructible. A grenade takes a bite out of the
treeline; the bite catches, fire crawls outward tree to tree with the wind, burns itself out, and
leaves a scar of charred ground that is now *walkable*. The forest is the wall and the wall is
flammable, so a route that did not exist at the start of the mission can exist by the end of it —
including one the enemy can use to get behind you.

**Bury them.** Death is permanent. Men who live get promoted, shoot straighter and come back next
mission with their name on the card. Men who do not get a small wooden cross, and the next name
on the recruitment list steps up in their place, worse at everything.

## The map, reused

Maps are territory, not levels. One forest clearing hosts a run of missions in sequence:

1. **Beachhead** — push in from the south track and clear the clearing.
2. **Dig In** — same map, and now *your* sandbags and a mortar pit are standing where you won.
   Hold it while they come back for it.
3. **Push North** — the treeline you burned down in mission 1 is still burned down, and the new
   objective is on the far side of it.

Win a mission and its consequences are on the ground the next time you see the place. This is how
a handful of maps becomes a long campaign, and it is why the maps are worth making properly.

## The shape of the campaign

The first release is deliberately small: two forest maps, six or seven missions, rifle and
grenade, and an upgrade screen with real buttons on it but a thin catalogue behind them. The
squad grows fast on purpose — one man, then two, then four inside the first few missions — so the
four-card UI and the weapon rail get exercised early and we find out quickly whether the core is
fun.

What it grows into: flamethrowers and mortars and rocket launchers, jeeps and half-tracks and a
tank, a mission or two where one of your four is a wizard and nobody comments on it, and a long
silly story told across dozens of maps in a couple of hundred short missions. Almost every one
should be over in ninety seconds.

## What must be true of it

- **It is a phone game held in one hand.** Portrait. Everything interactive lives on an edge; the
  middle of the screen is the battlefield and is never covered.
- **It looks expensive.** Soft shadows, real bloom on the fires and tracers, grass that moves,
  smoke that drifts. Low-poly is the style, not the budget.
- **A mission is ninety seconds.** Long enough for one idea, short enough to lose and instantly
  retry.
- **It is silly.** If a choice is between realistic and funny, it is funny.
