// Changing level without reloading the page.
//
// `Session.gotoLevel` used to set `?level=` on the location and let the browser do it, which was
// honest while there was one level and nothing to carry across. The proving is a round trip in the
// middle of a conversation — out to the arena, back to the desk — and a full reload there is a
// black screen, a boot splash and the whole world rebuilt twice for a fight that lasts a minute.
//
// What is replaced is exactly what the level document owns: the world, the doors that lead into
// its buildings, its props and its cast. What is kept is everything that is about the player
// rather than the place — the lighting rig, the crowd and dummy pools, the player himself, and the
// save. Keeping the two pools rather than rebuilding them is not only speed: `People` owns
// instanced meshes sized at construction and a shader that main.js has already wired into the
// player's own body, and standing a second one up would leave the player rendering off the first.

import { World, startDoc } from '../world/world.js';
import { Doors } from '../world/doors.js';
import { Props } from '../world/props.js';
import { Characters, loadCast } from './characters.js';
import { loadLevel } from './level.js';

export class LevelSwap {
  constructor({ app, player, people, dummies, lighting }) {
    this.app = app;
    this.player = player;
    this.people = people;
    this.dummies = dummies;
    this.lighting = lighting;
    this.busy = false;
  }

  // `hold` is called with the new document once the world is standing but before the first frame
  // of it is drawn, so the session can re-point everything that reads the level.
  async to(id, at, hold) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const level = await loadLevel(id);
      for (const w of level.warnings) console.warn(`level ${id}: ${w}`);
      const { doc, saved } = startDoc(level.doc, id);
      const cast = await loadCast().catch(e => {
        console.warn(`characters: nobody placed — ${e.message}`);
        return { cast: {}, warnings: [] };
      });

      const A = this.app;
      // Doors first: it holds the collider set the player's camera arm is raying against this
      // frame, and tearing the world out from under it leaves that set pointing at freed geometry.
      A.remove(this.doors);
      A.remove(this.props);
      A.remove(this.world);
      this.dummies.dispose();
      this.people.clear();

      const world = new World(doc, saved);
      A.add(world);
      this.people.terrain = world.terrain;
      this.dummies.terrain = world.terrain;

      const doors = new Doors(world, this.player, this.lighting, [world.object3D]);
      const props = new Props(world.terrain, []);
      // Doors sets `player.colliders` in its own constructor, so the order here is the order
      // main.js boots in: doors before the player is asked to move again.
      A.add(doors);
      A.add(props);
      const characters = new Characters(cast.cast, {
        people: this.people, dummies: this.dummies, world, level: doc.id,
      });

      this.world = world;
      this.doors = doors;
      this.props = props;
      this.characters = characters;

      const start = at || doc.start;
      this.player.pos.set(start.x, 0, start.z);
      this.player.pos.y = this.player.groundY(start.x, start.z);
      this.player.vel.set(0, 0, 0);
      this.player.yaw = this.player.camYaw = this.player.moveYaw = start.yaw ?? doc.start.yaw ?? 0;
      // The camera trails the player, and after a swap the point it is trailing from is in the
      // level that no longer exists. Without this it flies the whole distance between the two.
      this.player.started = false;
      this.player.indoor = 0;
      this.player.floorY = null;
      this.player.confine = null;

      // Arriving indoors. A point inside a building is inside that building's collider box, and
      // with the door system in its `out` state the walk world reads it as a wall and shoves the
      // player through the nearest face — which is how coming back from the proving put him ten
      // metres behind the Society. `at.inside` names the door he arrives through, so the room is
      // standing and the collider set is the room's before he is put anywhere.
      if (Number.isFinite(+start.inside)) {
        doors.jump(+start.inside);
        this.player.pos.set(start.x, this.player.pos.y, start.z);
        this.player.pos.y = doors.floor ? doors.floor(start.x, start.z, this.player.pos.y) : this.player.pos.y;
        this.player.yaw = this.player.camYaw = this.player.moveYaw = start.yaw ?? 0;
        this.player.started = false;
      }

      world.registerScenarios(doors);
      hold?.(doc, { world, doors, characters, cast: cast.cast });
      return doc;
    } finally {
      this.busy = false;
    }
  }

  // The systems main.js built at boot, handed over so the first swap knows what to take down.
  adopt({ world, doors, props, characters }) {
    this.world = world;
    this.doors = doors;
    this.props = props;
    this.characters = characters;
    return this;
  }
}
