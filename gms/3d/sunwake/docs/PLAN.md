# SUNWAKE implementation plan

Status: planning only. This document is the implementation contract; no game code is part of this run. `docs/BRIEF.md` takes precedence. Build a small, beautiful sunset boating game whose first ten seconds sell the water and whose next thirty minutes reward curiosity.

## 1. Direction and fixed scope

**Art direction: Apricot Passage.** A quiet, wind-worn archipelago at perpetual late golden hour, with a large apricot sun 6° above the western horizon. Deep teal troughs, copper wave faces, cream foam, violet distance, and warm limestone make a coherent picture. The mood is expansive and reassuring. There is no night cycle, survival pressure, combat, fuel, inventory, trading, walking on land, or procedural quest system.

| Use | sRGB hex |
| --- | --- |
| Deep water / interface background | `#082F3D` |
| Lit water body | `#246B70` |
| Shallow-water tint | `#53A69C` |
| Foam / sailcloth / primary text | `#FFF0D0` |
| Sun core | `#FFF2BA` |
| Sun halo / glitter | `#FFC078` |
| Horizon peach | `#F2A487` |
| Upper sky | `#657B9A` |
| Distant haze / shaded stone | `#877B99` |
| Dry limestone | `#D5AE82` |
| Vegetation | `#526B50` |
| Hull paint | `#E7DCC0` |
| Hull trim / discovery accent | `#BF603F` |
| Deck wood | `#76513D` |

Use these as authoring colors and convert to linear values for lighting and shader arithmetic. Use ACES filmic tone mapping, exposure 1.05, and sRGB output; custom shaders must perform the same final tone-mapping and output conversion exactly once.

The boat is a **4.6 m × 1.7 m wooden motor launch**: pointed cream bow, rust-red rubbing strake, dark lower hull, three visible timber benches, compact rear outboard, brass bow lamp, rope coil, and a short cloth pennant. Build the mesh procedurally from seven hull cross sections, with a real V-shaped keel 0.50 m below the body origin. Use flat-shaded facets on the hull and smooth normals on rounded fittings. Keep the entire solid hull inside a 2.6 m sphere around its physics origin. The pennant and lamp have no collision. No character rig is needed.

Islands are compact limestone mesas and stacked rounded rocks: continuous cream shore walls, warm terraced tops, sparse olive shrubs, a few leaning cypresses, and one readable landmark. Three top profiles—low garden, stepped mesa, split summit—share the same solid shoreline construction. Variation belongs above the shoreline; navigable holes and caves are out of scope.

The sky is a procedural full-screen triangle rendered first. Reconstruct view direction, blend peach horizon into blue-violet zenith, and add the sun disc, a soft halo, and three broad cloud bands drifting east at 0.003 radians/second. Clouds are two samples of a small tiled noise texture, not volumetric ray marching. Reflected sky uses the same gradient and cloud function. The sun remains fixed, so the player can use it as a landmark. The launch begins pointing west directly into its glitter road.

House style follows the explicit boot gate and import map in `../tidekeeper2/index.html`, the small module responsibilities in `../tanking2/js/`, and the `.mjs` simulation/browser split in `../hellwake/`. Use restrained DOM overlays, system fonts, inline SVG icons, and generous touch targets. Do not inherit other games' dependencies, portrait-only controls, or campaign scope.

## 2. Water — primary engineering and visual investment

### 2.1 Surface choice and shared mathematical contract

Use an **analytic four-octave directional sine height field**, plus **two scrolling normal-map layers** for small ripples. There is no horizontal vertex displacement. This is a deliberate height-field ocean: visible rolling swells, exact cheap CPU samples, stable buoyancy, and a single water draw call. A choppy Gerstner surface would require solving the inverse horizontal displacement for every hull sample; FFT simulation would add render targets, spectral setup, and a separate CPU sampling problem. Scrolling normals alone would leave the silhouette and boat motion flat. Four displaced octaves plus fine shading meet the priorities with a small, testable implementation.

One world unit is one metre; Y is up. Compass north is +Z and east is +X. Angles below are clockwise from +Z. Simulation time is seconds. All wave data lives in `js/core/waves.mjs`, with no Three.js import.

| Octave | Wavelength λ (m) | Amplitude A (m) | Direction θ | Phase φ (rad) |
| --- | ---: | ---: | ---: | ---: |
| 0, main swell | 36 | 0.420 | 255° | 0.0 |
| 1, crossing swell | 18 | 0.200 | 285° | 1.7 |
| 2, wind wave | 9 | 0.085 | 240° | 3.1 |
| 3, small wave | 4.5 | 0.035 | 300° | 4.4 |

For each octave, `d=(sin θ, cos θ)`, `k=2π/λ`, `ω=sqrt(9.81*k)`, and `q=k*dot(d,(x,z))-ω*t+φ`. Evaluate:

- `h(x,z,t) = Σ A*sin(q)`.
- `hx = Σ A*k*d.x*cos(q)` and `hz = Σ A*k*d.z*cos(q)`.
- `ht = Σ -A*ω*cos(q)`.
- Upward normal: `normalize((-hx, 1, -hz))`.

Maximum displacement is ±0.740 m. Maximum gradient magnitude is bounded by `Σ A*k < 0.254`; retain these bounds as exported constants and harness assertions. Do not randomize the wave parameters per chunk. Waves cross island/chunk/render-origin boundaries without resetting.

Expose `sampleWave(x, z, time, out)` returning the supplied object populated with `{height, dx, dz, dt, nx, ny, nz}`. No per-sample allocation. Export the numeric wave table and `phaseAtOrigin(originX, originZ, time, outPhases)`. The renderer builds GLSL constants/uniforms from this table, rather than hand-copying a second table. Physics always samples all four octaves at full amplitude.

Absolute simulation positions and time remain JavaScript doubles. GPU coordinates stay close to zero: rebase the render origin to a 256 m lattice when the boat is more than 256 m from it. For each wave pass `wrap(k*dot(d, origin)-ω*time+φ, 2π)` as its phase; the shader evaluates only `k*dot(d, localXZ)+phase`. Recompute from double precision each frame. Rebase island meshes, boat, camera, and wake positions together; do not change simulation coordinates or island IDs. Normal/cloud texture origins are wrapped by their own texture periods. This avoids wave jumps and float jitter on long voyages without resetting the world.

### 2.2 Mesh, horizon, and geometric LOD

Build one indexed **concentric radial disc** centered on the interpolated boat position. Store immutable radial XZ offsets in a `BufferGeometry`; the vertex shader adds the moving center before evaluating world-anchored waves. The disc follows the boat continuously, with no snapped tile replacement and no mesh upload each frame. Moving tessellation must not move the wave phase. A triangle fan covers the center; successive rings share vertices and use the same angular subdivision, so there are no T-junctions or cracks.

| Tier | Angular segments | Rings and spacing | Triangles, including center fan |
| --- | ---: | --- | ---: |
| High | 256 | 96 to 48 m at 0.5 m; 48 to 144 m at 2 m; 32 to 400 m at 8 m; 16 geometrically spaced to 1,536 m | 98,048 |
| Standard | 192 | 64 to 32 m at 0.5 m; 48 to 128 m at 2 m; 32 to 384 m at 8 m; 16 geometrically spaced to 1,536 m | 61,248 |
| Low / emergency | 128 | 64 to 32 m at 0.5 m; 32 to 128 m at 3 m; 24 to 384 m at 10⅔ m; 8 geometrically spaced to 1,536 m | 32,640 |

The center vertex is additional to the listed rings. Triangle count is `segments*(2*rings-1)`. Keep all tiers below 65,536 vertices, allowing 16-bit indices. Set conservative vertical bounds to ±0.9 m and disable automatic frustum culling only on the one water disc.

Attenuate geometric wave amplitudes by distance from the boat: octave 3 fades from 24–48 m; octave 2 from 48–96 m; octave 1 from 96–224 m; octave 0 from 224–512 m. Use `1-smoothstep(start,end,r)` for each fade. Include the radial fade derivative when computing render normals, so the normal matches the actual displaced mesh. The boat's four samples remain inside the full-detail zone. This is sampling LOD, not a different physical ocean. Fine ripple normal strength separately fades from 80–240 m to avoid distant shimmer.

Camera near/far are 0.15/2,000 m. Apply horizontal-distance haze from 280 to 900 m with `smoothstep`, reaching exactly the sky's horizon color at 900 m. Fade island geometry into that same haze before removal. The mesh rim at 1,536 m is entirely hidden. At nearly horizontal rays, blend the sky's lower hemisphere to the identical horizon color. The result must remain seamless in portrait, at either camera height, and while facing away from the sun. Do not use an exposed finite blue plane edge or a sky dome seam.

### 2.3 Surface shading and the sunset road

Use one opaque, depth-writing `ShaderMaterial`, with no scene refraction buffer, planar reflection camera, shadow map, or post-processing pass. Render solid opaque geometry normally; water wins depth tests only where its actual surface is in front. Below-water hull and terrain disappear into the opaque water naturally.

Pass displaced world position and macro gradients from the vertex stage. In the fragment shader:

1. Sample one repeat-wrapped, mipmapped 256×256 procedural RGBA8 ripple normal texture twice. Layer A has a 5 m repeat, moves `(0.07,0.02)` m/s; layer B has a 2.3 m repeat, rotated 67°, moves `(-0.025,0.045)` m/s. Combine their XY slopes with weights 0.065 and 0.035 into the macro gradient, then normalize. Generate the texture from periodic noise derivatives so opposite edges match. These two shading layers do not move the hull or alter collision. Low tier keeps the first layer only.
2. Evaluate Schlick Fresnel, `F=0.02+0.98*(1-max(dot(N,V),0))^5`. Blend deep/lit body color toward the procedural sky sampled along `reflect(-V,N)`. Color body water by macro slope facing the sun and by the analytic shore-distance tint described below. Keep troughs saturated teal rather than black. Use a gentle backlit-crest term, `0.12*pow(max(dot(-V,L),0),3)*smoothstep(0.15,0.65,h)`, tinted jade/cream.
3. Compute direct sun reflection using a GGX microfacet lobe. Let `H=normalize(V+L)`, perceptual roughness `r=0.18`, `a=r*r`, `D=a²/[π*(NoH²*(a²-1)+1)²]`. Use Smith-Schlick visibility with `k=(r+1)²/8`, `G1(n)=n/[n*(1-k)+k]`, and the same Fresnel term evaluated at `VoH`. Radiance is `sunLinear*3.0*D*G1(NoV)*G1(NoL)*F/(4*NoV*NoL+1e-4)*NoL`. Clamp dot products and denominators, not the finished color. Tone mapping controls the highlight.
4. Broaden the lobe at grazing distance: increase `r` smoothly to 0.26 between 80 and 350 m and add normal-variance filtering from `dFdx(N)`/`dFdy(N)` to `a²`. Sample texture mip levels through ordinary derivatives. The reflected sun, waves, and broken ripple normals create the **glitter road physically through alignment**, not through a stripe painted on the screen. The road must narrow toward the horizon, widen toward the camera, break across wave faces, and leave the center of view when steering away from the sun.
5. The reflected sky function omits the bright sun disc to avoid counting it twice; it retains the warm sun halo. Direct GGX supplies the disc's reflected energy. The visible sky disc uses an artistic 0.8° angular radius and a 5° halo. Use world sun direction `normalize((-cos(6°),sin(6°),0))` everywhere: sky, water, boat, and terrain.
6. Apply crest foam, wake modulation, horizon haze, then tone mapping and output conversion. Avoid pure-white bloom: highlights occupy small regions and retain apricot color.

Island and boat reflections are intentionally not rendered. Sell their contact with depth-correct shore walls, localized foam, hull immersion, wake, and consistent light. Do not add a second scene render to compensate. The fixed sunset and open sea make sky reflection the dominant visual contribution.

### 2.4 Shore water, foam, wake integration

Upload the nearest **eight island circles** whose shores are within 180 m of the boat, in render-local coordinates. The deterministic island spacing guarantees this is ample; assert the count in development. The fragment shader computes `shoreDistance=min(length(p-center)-radius)` only inside the 180 m detail region. Upload count zero when none are present and use a constant-bounded loop with early exit. Collision data exists independently of these shader uniforms.

Tint water over the submerged stone apron within 4 m of the shore; do not fake a broad walkable beach. Shore foam is an irregular 0.35–1.1 m band outside the wall, with width driven by local wave height and ripple noise. Blend color and roughness into the opaque water shader, avoiding another transparent ocean layer. Crest foam uses the macro height plus upward wave velocity, starts only above `h=0.52 m`, and is capped at 15% opacity; this is a moderate breeze, not a storm.

Wake geometry is one pooled indexed ribbon mesh with two V arms and a short central prop wash, shaded by the same current wave-height function. Store each emitted station in absolute world XZ; it remains where the boat passed. Evaluate current wave height in the wake vertex shader, plus 0.025 m bias, instead of leaving old ribbon vertices frozen vertically. Use premultiplied alpha, `depthWrite=false`, normal depth testing, and a soft edge from the shared foam atlas. Clip wake fragments inside any uploaded shore circle. Spawn nothing during pause and clear old stations on a test teleport.

### 2.5 Cheap rendering without flattening the sea

Four analytic wave evaluations run per vertex, not four full wave evaluations per water pixel. Macro normal gradients interpolate between vertices; the small ripple maps supply fragment detail. Precompute `k`, `ω`, direction, and render-origin phases. No per-frame geometry rebuild, GPU readback in gameplay, dynamic cube map, FFT, tessellation extension, or offscreen reflection pass.

High and standard use two ripple samples; low uses one. All tiers preserve four physical waves, four float points, Fresnel, the sun road, horizon haze, and shore collision. Lower resolution and ornament density before removing defining water behavior. Geometry tier swaps occur only when the quality controller changes tier; prebuild the two adjacent tier geometries during boot to avoid a gameplay allocation spike.

### 2.6 Water acceptance gate

Before producing island content, capture the same fixed-seed view at `t=0, 2, 5, 10`, facing west and east, in standard and low tiers. The swell must visibly move the silhouette, the hull waterline must track the rendered water, and the glitter must travel over wave faces without crawling pixel noise. Capture a near-water view and a 90° turn to expose edge/seam errors.

`tools/sim.mjs --suite waves` checks the analytic derivative against central differences (`ε=1e-4 m/s`, tolerance `1e-6`), height/slope bounds, and continuity across chunk and render-origin boundaries (`height change ≤0.254*distance + max|ht|*timeDelta +1e-8`). Browser diagnostics render 64 known wave samples into a small RGBA8 target, encode height into two channels, read back once, and compare with CPU samples to within 0.002 m. Repeat after a rebase at coordinates `(1e7,-1e7)`. This test uses the same shader function as water, not a duplicate reference implementation. Normal gameplay never performs readback. Browser evidence is mandatory before calling the water visually complete.

## 3. Boat physics, steering, and effects

Use a 60 Hz fixed simulation step, a maximum of four catch-up steps per rendered frame, and interpolation between the previous/current states. Clamp incoming frame time to 0.067 s, discard excess backlog, and reset the accumulator on resume. Time advances only through simulation steps. With interpolation fraction `alpha=accumulator/fixedDt`, render water/effects at `renderTime=previousSimTime+alpha*fixedDt`, matching the interpolated hull rather than the latest physics tick. Pausing and hidden tabs freeze waves, boat, wake age, and discovery timers together.

State is a plain object: `{x,z,y,vx,vz,vy,yaw,yawRate,pitch,pitchRate,roll,rollRate,throttle,rudder}`. Horizontal motion is hydrodynamic; vertical motion and two tilt axes come from buoyancy. Units are SI and radians. Start at `(x,z)=(0,0)`, heading west (`yaw=-π/2`), stationary, with its vertical equilibrium initialized from the four wave samples. Never overwrite Y with a wave height each frame.

**Four buoyancy points** sit at local `(x,y,z)=(±0.60,-0.25,±1.55)`. Mass is 420 kg; gravity 9.81 m/s²; pitch inertia 1,200 kg·m² and roll inertia 220 kg·m². Transform each point using `Ry(yaw)*Rx(-pitch)*Rz(roll)`; positive pitch lifts the bow and positive roll lifts starboard. Use that identical transform for the render model.

For each point, sample the wave at its transformed horizontal position. Let `s=waveHeight-pointY`; point vertical velocity includes heave and both angular-rate contributions. Surface velocity seen by the moving sample is `wave.dt + wave.dx*pointVX + wave.dz*pointVZ`. When `s>0`, apply upward force `clamp(4682*s + 950*(surfaceVelocity-pointVY),0,2*mass*g/4)`; otherwise apply zero. Apply gravity at the center of mass. Each point supports one quarter of the weight at approximately 0.22 m immersion in flat water.

Accumulate heave force and generalized pitch/roll torque using `F*d(pointY)/d(angle)`, computed from the transform above. This makes the sign and lever arms unambiguous. Integrate rates then positions with semi-implicit Euler. Add angular water damping `-100*pitchRate` and `-60*rollRate`. Clamp pitch to ±15° and roll to ±18° as non-capsizing safety stops; discard only angular velocity pushing farther into a stop. Normal sailing must stay within ±9° pitch and ±12° roll. No decorative sine wobble is added on top of physics.

Horizontal forward/right vectors are `f=(sin yaw,cos yaw)` and `r=(cos yaw,-sin yaw)`. Let `u=dot(v,f)`, `vSide=dot(v,r)`:

- Smooth throttle toward input with time constant 0.35 s and rudder with 0.18 s using `1-exp(-dt/τ)`.
- Engine force: `1,140*max(throttle,0) + 320*min(throttle,0)` N along `f`.
- Forward resistance: `-(55*u + c*u*abs(u))` N, with `c=11` for `u≥0`, `c=45` for `u<0`. Equilibrium full-forward speed is about 8 m/s (15.6 kn); full reverse about 2.13 m/s. Do not hard-set velocity to the throttle command.
- Lateral resistance: `-mass*3.0*vSide` N along `r`. This gives short, visible sideslip while preventing ice-skating. Boat coast-down from 8 to 1 m/s takes about 10 seconds.
- Target yaw rate is `rudder*sign(u)*(0.55*abs(u)/(abs(u)+2))` rad/s. Smooth yaw rate with τ=0.45 s. At full speed/full rudder expect 0.44 rad/s and an 18 m turn radius. At rest there is no spin-in-place; reverse steering flips with travel direction.
- Feed `-mass*0.30*u*yawRate` N·m into the roll equation to bank into a turn. Apply engine pitch moment `55*throttle` N·m for a small bow lift. Cap horizontal speed at 12 m/s solely as a defensive invalid-state guard; collision still supports arbitrarily long test displacements.
- Holding reverse while moving forward provides reverse thrust and brakes naturally, then goes astern. Releasing throttle goes to neutral; momentum remains. There is no handbrake or instant stop.

Emit wake stations every 0.08 s above 0.8 m/s, at most 96 stations with 7.5 s lifetime. Two arms expand laterally at 0.45 m/s; opacity scales with forward speed. Reverse produces only a short 1.5 m prop churn at the stern. Spray is a pool of 64 standard/high or 24 low camera-facing quads, emitted from the bow shoulders when relative downward water impact exceeds 0.8 m/s and speed exceeds 2 m/s. Lifetime 0.35–0.7 s, ballistic gravity, no collision. Use the seeded effects RNG, not the terrain RNG. Outboard tilt, prop wash, and audio respond to thrust; the pennant bends with velocity plus the fixed wind.

## 4. Endless islands and guaranteed solid shores

Use deterministic **384 m square chunks**, indexed with `Math.floor(x/384)` for both positive and negative coordinates. The world seed is fixed to `0x53554E57`. `hash32(seed,cx,cz,salt)` uses unsigned `Math.imul` mixing; never use `Math.random` for geography. Store IDs as `"cx:cz"`; do not use a packed signed 32-bit coordinate as identity. Query order must not affect generation.

Each ordinary chunk has a 55% occupancy chance and at most one island. Its center is chunk center plus independent ±64 m jitter. Radius is 26–64 m. Adjacent centers stay at least 256 m apart along their separating axis, leaving at least 128 m between maximum-radius shores. This guarantees open channels, caps nearby density, and makes collision response straightforward. Reserve the origin chunk and the surrounding 90 m spawn-clearance area as water. Authored landmarks override their whole chunk, replacing its ordinary island.

Generate collision descriptors synchronously and cheaply on demand. Rendering streams a radius of 1,000 m around the boat, visits nearest chunks first, and evicts geometry past 1,150 m. Descriptor cache is bounded to 256 chunks; collision queries are allowed to regenerate uncached chunks immediately. Mesh creation is budgeted to 2 ms per frame, up to two small work items; split large work across frames. Pending meshes never mean pending colliders. Save/load and fast-travel test hooks must also query descriptors before placing the boat.

**The solid shore is a circle, not the visual mesh.** Every island descriptor has `{id,cx,cz,x,z,radius,height,profile,landmark,seed}`. Its collision circle has exactly `radius`. Render a continuous 96-segment cylindrical shore wall at that radius, from Y=-2.0 to Y=+1.05 m, capped by a triangulated top. The highest wave is +0.74 m, so no transient water crest exposes a gap or allows entry. The polygon's maximum inward chord error is under 0.04 m even at radius 64. Above Y=1.05, use four inset rings and seeded low-frequency radial/height variation to create terraces, reaching 5–18 m. No above-water rock extends outside the collision circle. A decorative apron may extend 4 m outward only below Y=-0.95 m, below the lowest trough. Every emerged rock must have its own collider or sit inside an existing island circle; do not scatter uncollidable rocks into navigation channels.

Use a **2.6 m enclosing boat circle** in the XZ plane for all physics orientations. This deliberately trades close side-on docking for a collision proof independent of yaw, pitch, and roll. The hull's bounding sphere is no larger than that radius, so no hull vertex can cross a shore. Island encounters take place offshore; the design does not require threading a tight dock or scraping a gunwale against a wall.

`moveCircleSwept(position, displacement, velocity, radius, queryIslands, out)` performs continuous collision detection:

1. Enumerate all chunks crossed by the center segment with grid DDA, plus one neighboring chunk in every direction. This conservative band contains every possible collider because maximum island-plus-boat radius is 66.6 m, less than one chunk. Deduplicate descriptors and process equal-time hits by stable ID. Do not query only the destination or only rendered islands.
2. Expand each island radius to `R=island.radius+2.6+0.001`. For segment `p+s*d`, solve `a*s²+b*s+c=0`, where `a=dot(d,d)`, `b=2*dot(p-center,d)`, `c=|p-center|²-R²`. Take the earliest entering root in `[0,1]`. Handle zero-length displacement, tangency, near-zero discriminant, and a starting point already touching the boundary explicitly. Ignore a zero-time root when motion points away from the shore. Use a numerically stable quadratic root calculation.
3. Advance to that contact. Compute outward normal `n`, remove inward velocity with `v-=min(dot(v,n),0)*n`, and project the untravelled displacement the same way. Set restitution to zero and damp tangent speed by 8% per actual new impact, once per island per step. Sweep the projected remainder again, including newly relevant chunks.
4. Allow up to four contacts per fixed step. If the budget is exhausted, keep the last verified safe position and discard remaining motion. Never apply unswept remainder. Large test speeds lose distance rather than bypassing collision.
5. Resolve imported/test initial overlaps before movement by pushing out to `R` using the center-to-boat normal; use +X for a coincident center. Iterate in stable ID order up to eight times and validate clearance afterward. If unresolved, restore the saved last-safe position after validating it, then fall back to the guaranteed-clear spawn. Ordinary generated islands do not overlap.

After every step assert in test mode `distance(boat,island) ≥ island.radius+2.6-1e-6`. Check all candidates, not just the last contact. Straight interpolation between two safe positions can cut through a convex shore: run the same overlap projection on the interpolated render center, without modifying simulation state, and use that corrected center for boat, camera, and water-disc placement. Assert rendered clearance as well as simulated clearance. The guarantee is geometric sweeping plus safe failure, not a hope that 60 Hz substeps are small enough. Never bypass this solver for reverse, saved positions, or scripted movement.

## 5. Camera and motion comfort

Use one chase camera with an always-level horizon. Follow yaw with exponential damping τ=0.45 s, taking the shortest angular path. Do not inherit boat roll or pitch. Desired position is 10.5 m behind heading and 5.2 m above low-pass boat Y; look target is 3 m ahead and 0.8 m above that same filtered Y. Low-pass heave with τ=1.0 s and clamp its contribution to ±0.35 m. Position damping τ=0.28 s; look-target damping τ=0.20 s. Interpolate render state before this update.

Use a 58° vertical FOV in landscape and 66° in portrait; portrait follow distance is 12.5 m and height 6.0 m. Never bob the camera with each wave, add impact shake, roll the horizon, or change FOV with speed. Clamp camera height to at least sampled local water height +2.0 m.

Prevent clipping through islands using a swept 0.4 m camera sphere from look target toward desired camera position against the same circles extruded to each island's maximum height. Treat the envelope as conservative; move the camera to the nearest valid point before the first obstruction. Clamp look-target XZ outside island radius+0.5 m, keep it at least 1.0 m above water, and shorten follow distance immediately when blocked. Ease outward again with τ=0.6 s. If both target and desired point are blocked, use the boat's safe center as the target and a 4 m overhead camera until clear. Debug geometry must show the camera never enters an island wall.

Reduced-motion setting: τ=1.5 s heave filter with zero heave contribution, no animated discovery card entrance, and unchanged steering. There is no free orbit control in the initial release.

## 6. Controls and interface

The shared struct is `InputState = {throttle: number, steer: number, chartPressed: boolean, pausePressed: boolean, mutePressed: boolean}`, where axes are clamped to [-1,1], throttle positive means ahead, and steer positive means starboard. Button fields are one-tick rising-edge pulses. UI actions never directly change simulation velocity.

Desktop: W/↑ ahead, S/↓ reverse, A/← port, D/→ starboard, M chart, Escape/P pause, Q mute. Opposite held keys cancel. Prevent browser scrolling only for game-bound keys while the play surface has focus; typing into UI fields must not steer the boat.

Mobile uses a **fixed split helm**: a 132×104 CSS-pixel spring-centered horizontal rudder pad at bottom left and two stacked 72×56 hold buttons marked AHEAD and ASTERN at bottom right. Rudder travel ±48 px maps linearly to ±1 after an 8% dead zone; dragging up/down does nothing. Use independent pointer IDs, pointer capture, and `touch-action:none` on controls. Throttle buttons provide ±1 while held; releasing returns to neutral. Two simultaneous throttle touches cancel. A new valid desktop key input selects keyboard axes; an active control pointer selects touch axes, preventing additive mixed-device surprises.

Use 16 px margins plus `env(safe-area-inset-*)`; all action buttons are at least 48×48 px. In portrait retain the same split helm, collapse the top HUD to compass/discovery count/pause, and put speed between the bottom controls. No rotation lock or blocking rotate overlay. Verify 360×800, 390×844, 844×390, and 1,366×768 layouts. Chart, pause, and settings are DOM sheets and pause simulation; close them back to neutral controls. On `pointercancel`, lost capture, window blur, visibility change, or orientation change, clear all input immediately.

HUD: thin compass strip, speed in knots, discovered landmarks `n/6`, one pinned destination bearing, and one short discovery toast. The title screen has “Set sail” / “Continue”, sound toggle, and a one-line control hint. The first-session hint disappears after both 20 m travelled and one deliberate turn. During play the ocean must occupy at least 75% of the screen unobscured by UI.

## 7. Exploration and persistence

The finite goal is a **six-page sunset atlas** inside an endless procedural sea. Each landmark has a distinct silhouette, one two-sentence postcard, and a two-note musical discovery cue. Visit within `island.radius+32 m` at speed below 3 m/s for 2 continuous seconds to record it. No interaction button or docking system is needed. A discovery briefly lights the bow lamp and adds its page to the chart.

These six authored chunk overrides are fixed for this seed; coordinates are metres and remain clear of the origin:

| ID / chunk | Center X,Z | Radius / height | Landmark and reward copy |
| --- | --- | --- | --- |
| Lantern Key / `-1:0` | -210, 160 | 34 / 6 | Small stone lighthouse. “Someone kept this light for boats they would never meet. Tonight it still finds you.” |
| Bell Garden / `-2:1` | -540, 520 | 40 / 8 | Three brass bells under a stone lintel. “The wind knows three notes. It never plays them in the same order.” |
| Split Crown / `0:2` | 170, 920 | 52 / 17 | Two towers of pale rock. “The crown broke long before the charts were drawn. The sea kept both halves.” |
| Cinder Steps / `2:1` | 910, 580 | 48 / 13 | Rust-red terraces and a beacon brazier. “Every step remembers a different tide. The highest still waits for the water.” |
| White Needle / `1:-2` | 570, -590 | 36 / 18 | Slender limestone spire and circling birds. “From far away it looks like a sail. Up close, it is still going nowhere.” |
| Last Orchard / `-2:-2` | -580, -530 | 58 / 10 | A grove of six bent cypresses around a cairn. “Six trees lean toward the last warm light. There is room here for another memory.” |

Pin Lantern Key at the start, about 260 m away, giving a first discovery within one minute. After each discovery automatically pin the nearest undiscovered landmark. The chart shows discovered silhouettes, the remaining six goal markers as hollow compass diamonds, the boat, and locally seen ordinary islands. The initial atlas route takes approximately 20–30 minutes including slow approaches. Completion displays the six illustrated cards and “The chart ends. The sea doesn't.” Continue sailing immediately after closing the atlas.

Ordinary islands get deterministic names from 12 adjective and 12 noun entries in `content.mjs`, unique coordinate IDs, and a simple arrival stamp. Keep a lifetime discovery count and the most recent 256 ordinary records; evict the oldest from the saved chart without changing geography. An evicted island can be rediscovered; the counter is labelled “island visits recorded,” not an impossible exact unique count. Beyond the six landmarks the reason to sail is scenery, new silhouettes, and distance travelled, not an infinite progression treadmill.

Keep one shared flock of 12 low-poly birds near the nearest interesting island, two seeded distant moving sail silhouettes, and wind/outboard/water audio synthesized with Web Audio after the first user gesture. These are visual/audio atmosphere, not AI actors or collision hazards. Sound settings persist and default to off until enabled.

Save under `sunwake-v1`: `{version:1,seed,position:{x,z,yaw},atlasIds,ordinaryVisits,visitCount,distanceM,settings}`. Serialize every 15 seconds, after discovery, on pause, and on `pagehide`. Validate finite coordinates, known atlas IDs, bounds on arrays, and supported version in pure code. On resume preserve position and heading, reset velocity to zero, compute fresh buoyancy equilibrium, and validate collision before showing play. Save failures produce a small “Progress stays in this session” notice and leave the game playable. Restart voyage clears progress only after an explicit in-game confirmation.

## 8. Complete planned file layout and module contracts

All paths below are relative to `gms/3d/sunwake/`. Use `.mjs` for every JavaScript module so Node imports work without a package file. No build step, dependency install, external fonts, fetched art, or CDN requests. Procedural geometry and small generated textures are sufficient.

| File | Kind | Responsibility / main exports |
| --- | --- | --- |
| `index.html` | DOM | Canvas, loading/error gate, accessible UI shell, exact import map, module entry |
| `style.css` | DOM | Responsive HUD, split helm, sheets, safe areas, reduced motion |
| `js/main.mjs` | Browser integration | Boot, fixed-step accumulator, interpolation, pause/resume, wiring; only composition root |
| `js/core/config.mjs` | Pure | Constants, palette, quality presets, physics and world settings |
| `js/core/math.mjs` | Pure | Clamp/wrap, interpolation, hash32, transforms, reusable vector math |
| `js/core/waves.mjs` | Pure | Wave table, `sampleWave(x,z,t,out)`, `phaseAtOrigin(x,z,t,out)` |
| `js/core/world.mjs` | Pure | `describeChunk(seed,cx,cz)`, `querySweep(seed,p,d,r,out)`, bounded descriptor cache |
| `js/core/collision.mjs` | Pure | `sweepCircle(p,d,center,r,out)`, `moveCircleSwept(...)`, `resolveOverlap(...)` |
| `js/core/boat.mjs` | Pure | `createBoat(spawn)`, `stepBoat(boat,input,world,time,dt,scratch)`; buoyancy and hydrodynamics |
| `js/core/content.mjs` | Pure | Six landmark descriptors/postcards, name tables, atlas order/IDs |
| `js/core/exploration.mjs` | Pure | `stepExploration(state,boat,nearby,dt,events)`, discovery timers and nearest goal |
| `js/core/simulation.mjs` | Pure | `createSimulation(seed,save)`, `stepSimulation(sim,input,dt)`, bounded event queue |
| `js/core/save.mjs` | Pure | `validateSave(value)`, `encodeSave(sim,settings)`, `decodeSave(text)`; no storage calls |
| `js/render/scene.mjs` | Render / Three.js | Renderer/lights, tone mapping, resize, origin rebase, draw order, metrics, disposal |
| `js/render/water.mjs` | Render / Three.js | Radial mesh construction, water material, shared-wave uniform upload, foam circles |
| `js/render/shaders.mjs` | Render-side source | GLSL strings and wave-function builder from pure wave table; no runtime fetch |
| `js/render/sky.mjs` | Render / Three.js | Full-screen sky and shared gradient/cloud uniforms |
| `js/render/boat-view.mjs` | Render / Three.js | Procedural launch, pose interpolation, propeller/pennant/lamp animation |
| `js/render/islands.mjs` | Render / Three.js | Chunk streaming, shore/terrain meshes, three LODs, batched ornament geometry |
| `js/render/effects.mjs` | Render / Three.js | Wake ribbon, spray pool, birds and distant sails |
| `js/render/textures.mjs` | Render / Three.js | Seeded tileable ripple normal, cloud-noise and foam-atlas generation |
| `js/render/camera.mjs` | Render / Three.js | Damped follow, aspect presets, water clearance and island obstruction handling |
| `js/platform/input.mjs` | Browser | Keyboard/pointer normalization, capture, cancellation, `readInput(out)` |
| `js/platform/ui.mjs` | Browser | Title/HUD/chart/settings, atlas cards, 10 Hz text updates, input hints |
| `js/platform/storage.mjs` | Browser | Guarded localStorage access and save scheduling, delegates validation to core |
| `js/platform/audio.mjs` | Browser | Web Audio synthesis, gesture unlock, mute/pause, pooled nodes |
| `js/platform/quality.mjs` | Browser | Frame timing, tier/resolution adaptation, manual setting and metrics |
| `js/platform/debug.mjs` | Browser, opt-in | `?test=1` controlled fixtures, shader probe, wireframes, debug metrics |
| `tools/sim.mjs` | Node harness | Built-in `node:assert/strict`; wave, handling, collision, world/save suites |
| `tools/cdp.mjs` | Node/CDP harness | Built-in fetch/WebSocket CDP transport, timeouts, error collection, screenshots |
| `tools/browser.mjs` | Node/CDP harness | Real input/render/boot-failure/resize/LOD/rebase scenarios |
| `docs/BRIEF.md` | Existing specification | Read-only brief |
| `docs/PLAN.md` | Plan | This implementation contract |
| `docs/VERIFY.md` | Future evidence log | Commands, hardware/browser, results, remaining failures, screenshot links |

`docs/evidence/` is the future output directory for screenshots and small JSON reports, not runtime assets. All generated evidence stays inside SUNWAKE. No additional package, manifest, service worker, external asset directory, or registry entry is required. The existing vendored Three.js files outside SUNWAKE are read-only dependencies.

Every `core/` module must import only other `core/` modules and must run with no `window`, `document`, `localStorage`, `performance`, WebGL, or Three.js. Inject time, seed, input, and output buffers. Render and platform modules may depend on core; core never depends on either. Shader source strings are classified render-side even though they do not themselves import Three.js. The Node harness imports the actual production simulation, never copies its formulas.

Boot must use this exact import map before the module entry:

```html
<script type="importmap">
{ "imports": {
    "three": "../../lib/three/0.180.0/three.module.js",
    "three/addons/": "../../lib/three/0.180.0/addons/"
} }
</script>
```

Before both import map and module entry, install an inline classic-script `window.onerror`, capture-phase resource `error` listener, `unhandledrejection` listener, and 15-second loading watchdog. Write errors with `textContent`, show the failing file/message, and offer a reload button. A query timestamp is only a retry mechanism; do not claim it clears every cached submodule. Mark `window.__SUNWAKE_BOOTED__=true` only after required modules, renderer setup, shader compilation, and the first successful frame. Surface shader compile failures and `webglcontextlost` as visible errors as well. On restoration show a reload action; do not continue a half-restored renderer. Unsupported WebGL2 gets a clear failure panel, not an endless spinner. Keep error text/button styling inline enough to work even if CSS fails.

## 9. Performance budget and quality control

Target sustained 60 fps on a modern phone. **30 fps is the supported-device floor and a release gate**, not a claim about every browser/device. Measure on physical hardware; desktop emulation proves layout and logic, not thermal phone performance. Treat sustained frames over 33.3 ms as a failed gate until reduced quality meets the budget.

| Budget | High | Standard, initial default | Low | Emergency |
| --- | ---: | ---: | ---: | ---: |
| Draw calls, full scene maximum | 70 | 55 | 36 | 28 |
| Total triangles, full scene maximum | 185k | 125k | 70k | 58k |
| Water triangles | 98,048 | 61,248 | 32,640 | 32,640 |
| Drawing-buffer pixel cap | 2.0 MP | 1.1 MP | 0.65 MP | 0.40 MP |
| Effective pixel-ratio cap | 1.5 | 1.25 | 1.0 | 0.75 |
| Ripple texture samples | 2 | 2 | 1 | 1 |
| Spray / birds | 64 / 12 | 64 / 12 | 24 / 6 | 0 / 0 |
| Shore foam / sky reflection / GGX | On | On | On | On |

Compute base pixel ratio as `min(devicePixelRatio,tierDpr,sqrt(pixelCap/(cssWidth*cssHeight)))`, then multiply by the adaptive resolution scale, initially 1.0 and bounded to [0.75,1.0]; the pixel cap wins on a large display. Reset this scale to 1.0 when changing tier, except emergency entry uses 0.75 immediately. Disable renderer antialiasing to avoid hidden multisample fill cost; use analytic edges, texture mips, and specular variance filtering. There is no bloom, SSAO, shadow map, reflection render target, or multisampled composer. Use a hemisphere light plus one sun directional light without shadows; bake occlusion into vertex colors under benches, rock ledges, and tree roots.

Standard CPU frame budget at 60 Hz: simulation/collision ≤1.0 ms, view updates ≤1.0 ms, streaming ≤2.0 ms, submission/JS ≤2.0 ms, leaving GPU and browser headroom. GPU target ≤9 ms. Measure, rather than infer GPU time from JavaScript duration; use timer-query support when available and RAF intervals for automatic adaptation. Reuse scratch objects, typed arrays, pooled events/effects, and island geometry templates. Update UI text at 10 Hz and chart at 2 Hz while open; do not touch DOM every frame.

Island LOD: within 160 m use 96-segment wall/top and up to 2,500 triangles of terrain; from 160–420 m use a 48-segment wall and up to 650 terrain triangles; from 420–900 m use a 24-segment silhouette under 140 triangles. Landmark shapes remain recognizable at every LOD. Collision radius never changes. Walls always remain capped/closed; LOD does not create a hole. Fade to full haze by 900 m, cull beyond it, and retain the streaming margin. Use 15% distance hysteresis. Near/mid wall material is shared; batch ordinary distant silhouettes by visible sector, and use InstancedMesh for shrubs, trees, birds, and repeated landmark parts. Hard-cap visible ornament instances to 240/160/64/24 by tier, selected nearest-first. Limit boat to 4,000 triangles and four material draws. Enforce budgets in the maximum-density fixture, not just the empty sea.

Textures: one 256² RGBA8 ripple normal, one 128² RGBA8 cloud noise, one 128² RGBA8 foam/spray atlas. All generated at boot, power-of-two, repeat only where needed, with mipmaps; total texture storage stays below 0.6 MiB. No downloaded textures, environment maps, or per-island textures. Geometry GPU memory stays below 24 MiB, and total application-owned GPU allocation below 48 MiB excluding browser backbuffer. Dispose evicted geometries/material ownership correctly; shared textures persist once.

Start standard on supported WebGL2 devices; start low if the initial drawing buffer would exceed the cap by more than 4× or a reported `navigator.deviceMemory≤4` indicates a constrained device. These are starting hints only. Observe a rolling 180-frame sample, excluding hidden/pause/loading time. If p90 frame time exceeds 20 ms for 3 seconds, reduce resolution scale by 0.10 down to tier minimum; then step down a tier. If any rolling 30-frame average exceeds 30 ms, immediately step down a tier and resolution. Emergency is the final automatic tier. Upgrade only after p90 is below 15 ms continuously for 20 seconds, at most one step per 30 seconds; avoid oscillation. Expose Auto/High/Standard/Low and a frame-rate readout in settings; manual modes retain emergency downshift protection and display the override. At emergency, first suppress ornaments/cloud texture sampling and then report a failed device qualification if 30 fps is still unsustained. Never disable shore collision or reduce physical wave fidelity.

## 10. Build order and independently verifiable gates

Implement in this order. Each milestone extends a bootable game and is accepted before the next begins. During this planning run, none of these implementation steps are executed.

1. **Bootable sunset shell.** Add HTML/CSS, the exact local import map, inline boot/error gate, renderer, sky, static flat water, simple launch mesh, and pause/start UI. Verify through a static server from repo root that all requests are same-origin, local Three.js resolves, and first frame dismisses loading. Use CDP request interception to fail the module, a CSS request, and a malformed module response; each must show a useful error. Simulate WebGL2 unavailability. The game still runs as a stationary launch on a sunset sea.

2. **Water showcase and pure wave contract.** Add the four-octave core sampler, radial mesh, shader, fine normals, sun glitter, haze, render-origin phases, and all tier meshes. Add Node wave tests and the optional GPU sampling probe. Verify derivative/continuity/bounds checks and the screenshot gate in §2.6. Debug buttons change heading and time without yet adding boat handling. The game still runs as a floating-water visual showcase, with pause and resize working. Do not move on while the water is visually unconvincing.

3. **Playable launch.** Implement buoyancy, hydrodynamics, input normalization, follow camera, wake, and spray. Keyboard and touch both work now. Verify in `--suite handling`: flat-water equilibrium after 15 s is within 0.02 m of target immersion; flat-water pitch/roll approach zero; after 30 s full ahead speed is 7.5–8.5 m/s; full reverse settles between -2.4 and -1.8 m/s; full-speed turn settles at 0.38–0.48 rad/s; neutral coast from 8 to 1 m/s takes 8–15 s; neutral yaw decays instead of spinning. In live waves, all states remain finite for 10 simulated minutes and normal tilt stays inside operating bounds. Compare identical fixed-step trajectories driven by synthetic 30/60/120 Hz render schedules. Browser-check simultaneous rudder/throttle, releasing off-button, reverse steering, portrait/landscape, and a stable horizon. The game is now an endless open-water boat toy.

4. **One unquestionably solid island.** Add a development fixture with one circle, shore wall, terrain mesh, continuous sweep, overlap recovery, camera obstruction, and shore foam. Add collision assertions before adding streaming. Test head-on/tangent/oblique/reverse hits, rest against shore, coincident spawn, and displacement lengths from 0 through 10,000 m in a single call. Include a thin target crossed entirely between endpoints and a hit exactly on a chunk boundary. Render wireframe circles and record a full-speed impact, slide, and reverse escape. No hull vertex may enter the circle, no camera may enter stone, and impact cannot launch the boat vertically. The game runs with one explorable island.

5. **Endless deterministic archipelago.** Add chunk hashing, descriptors, streaming, all three island profiles, LOD, rebasing, and bounded caches. In `--suite world`, query 10,000 positive/negative chunks in different orders and compare byte-for-byte descriptors, shore gaps, and spawn clearance. In `--suite collision`, run 100,000 seeded randomized movement cases including unloaded targets, huge sweeps, exact contacts, and initial overlap. Validate the invariant after every result. Browser-sail across ±256 m rebases and chunk boundaries, teleport via test mode to `(1e7,-1e7)`, and confirm stable phases, intact collision, no visible water seams, and bounded memory after a 20 km simulated route. The game runs with an endless sea and islands even if no discovery UI is present yet.

6. **Complete exploration loop.** Add all six landmarks/postcards, first-sail hint, compass pinning, chart, ordinary-island names, save/load, sound, and atlas completion. Node tests verify each landmark is discoverable outside its collider, speed/dwell gating, one-time atlas rewards, correct next marker, validated saves, corrupted-save recovery, and bounded ordinary records. Browser-complete all six via controlled test positioning plus real dwell/input, reload and check persistence, then continue sailing after completion. Manually sail Lantern Key from spawn without test teleport. The complete intended game now runs.

7. **Mobile performance and final visual gate.** Add/finish adaptive quality, instance limits, all visibility/pointer cancellation behavior, reduced motion, and diagnostics. Run the dense-scene and open-water fixtures for 10 minutes on a physical modern Android Chrome phone and an iPhone Safari, including landscape/portrait changes, charging/thermal warm-up, background/resume, and repeated chart openings. Record device/OS/browser, tier changes, drawing-buffer size, p50/p90/p99 frame intervals, draw calls, triangles, and memory plateau. Require sustained ≥30 fps with 60 fps as the normal target; investigate recurrent >33.3 ms frames. Capture real standard/low water views, shore impact, atlas, and portrait helm. Fix console exceptions, shader diagnostics, failed requests, unresponsive touch, or renderer anomalies before acceptance. The final game remains a directly loadable static folder.

Verification commands for the later implementation, from repository root:

```sh
node gms/3d/sunwake/tools/sim.mjs
node gms/3d/sunwake/tools/sim.mjs --suite collision
curl -I http://127.0.0.1:8888/gms/3d/sunwake/
```

Use the existing server at 8888 if it serves this checkout; otherwise start `python3 -m http.server 8888` from repository root. Never serve only the SUNWAKE directory, because its relative vendored imports need the repository tree. The repository's `gms/3d/longshot/tools/cdp.mjs` supplies a working dependency-free CDP transport example. For a machine with the documented launcher, use `~/.claude/bin/cdp start --port 9223`, then:

```sh
CDP_PORT=9223 BASE=http://127.0.0.1:8888/gms/3d/sunwake/ node gms/3d/sunwake/tools/browser.mjs
```

The new CDP harness uses Node's built-in fetch and WebSocket; use Node 22 or newer. It must create its own test tab, close it afterward, record console/runtime/network/shader errors, use real `Input.dispatchKeyEvent` and `Input.dispatchTouchEvent`, and save screenshots under `docs/evidence/`. Add `window.sunwake` read-only metrics and `?test=1`-only `window.sunwakeTest` methods: `reset(seed)`, `setPose({x,z,yaw})` through collision validation, `setInput(input)`, `advance(ticks)`, `setQuality(tier)`, `snapshot()`, and `probeWaves()`. Controlled ticks suspend normal RAF stepping and render once afterward; diagnostics must not double-step the simulation.

If Chrome/CDP or a physical phone is unavailable, record the exact missing gate in `docs/VERIFY.md`. Node success cannot stand in for verified water appearance, actual touch dispatch, Safari behavior, or physical-device performance. No commit, push, deployment, registry change, or shared screenshot creation is part of this plan's implementation scope; registration in `/projects.js` happens later by hand.

## 11. Three principal risks

1. **Water looks flat, sparkly, or detached from the boat.** Mitigation: finish the visual water milestone before world content; keep one authoritative wave table, exact CPU sampling, shared render-origin phases, GPU probe comparison, distance-aware geometric detail, and derivative-filtered specular. Protect macro swells, Fresnel, and sun reflection through every quality tier. Fix alignment/math before adding more effects.

2. **Shore collision disagrees with scenery or fails at chunk/high-speed boundaries.** Mitigation: build shore walls directly from the same circle descriptor; enclose the whole hull with the boat collision radius; enumerate the full swept path independently of rendered chunks; resolve earliest contact and resweep the remainder; discard residual travel on iteration exhaustion. Require randomized invariant checks plus real impact/slide/reverse screenshots before streaming content is accepted.

3. **Phone fill rate, streaming spikes, or camera motion undermine the experience.** Mitigation: one opaque water pass, strict pixel/draw/triangle caps, no reflections/post effects/shadows, bounded pools and 2 ms streaming work, adaptive resolution with hysteresis, and a level-horizon camera that rejects hull roll/pitch. Verify sustained performance and comfort on actual Android/iPhone hardware; unresolved sub-30 fps behavior blocks device qualification and release acceptance.
