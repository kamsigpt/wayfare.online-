# Rendering

WAYFARE.ONLINE uses Babylon.js with a deliberate **retro pixel-art 3D** look:
chunky low-poly geometry, hand-made-looking pixel textures generated at runtime,
and a low-resolution, nearest-neighbour pixel pipeline. There are no external art
assets — everything is produced procedurally or from shared content data.

## Goals

- A cohesive modern-retro aesthetic (think low-poly voxel/HD-2D worlds).
- Runs on modest hardware (targets ~2 GB RAM devices) with adjustable quality.
- Zero asset downloads: textures are generated in code, audio is procedural.
- Gameplay is unchanged: this is purely a visual layer over the shared simulation.

## The pixel pipeline

The screen is rendered at a fraction of its native resolution and then scaled up
with nearest-neighbour sampling, which produces crisp square pixels.

- `Engine` is created with a hardware scaling level (`engine.setHardwareScalingLevel`).
- The scaling level is the **pixel size** (1 = native, higher = chunkier and faster).
- `#game-canvas` in `client/src/styles.css` sets `image-rendering: pixelated`
  (with `crisp-edges` fallback) so the upscale is not smoothed.
- The DOM UI sits *on top* of the canvas and stays sharp; only the 3D scene is
  pixelated.
- Screen-space effects (damage floaters, nameplates, interaction prompts) convert
  world positions to CSS pixels through `GameView.projectToScreen`, which multiplies
  by the hardware scaling level so overlays line up with the low-res scene.

Pixel size is user-adjustable (Settings → Pixel size, 1–6) and each quality preset
has a default (low 4, medium 3, high 2).

## Procedural pixel textures

`client/src/textures.ts` (`TextureLibrary`) builds small RGBA textures once at
startup and caches them by name. They use `NEAREST` sampling and no mipmaps so
they stay sharp at any distance.

Textures include: `grass`, `grass_dark`, `dirt`, `stone`, `moss`, `wood`,
`leaves`, `leaves_dark`, `water`, `sand`, `snow`, `ruin`, `magic`, `glow`,
`shadow`, `sky`, `cloud`, `tuft`, `flower`, `mushroom`.

`GameView.pixelMat()` wraps a texture in a `StandardMaterial` and exposes options
for tint, unlit/emissive looks, alpha test/alpha blending, and per-material UV
tiling (`uv`), so a single texture can cover large ground planes without blurring.

## Terrain

`client/src/terrain.ts` provides a deterministic value-noise fBm height field:

- `terrainHeight(zoneId, x, z)` — world-space `y` of the rendered surface.
- `terrainSlope(zoneId, x, z)` — approximate slope for gentle prop alignment.

Each zone has a profile (amplitude, frequency, seed, a flat radius around the
origin). Open zones roll noticeably; hub areas are flattened for readability.

**Important:** collision and movement still happen on the authoritative XZ plane
in `shared/`. The height field is render-side only. The ground mesh, every
character, and every prop call the same `terrainHeight` function, so nothing
floats or sinks and gameplay stays fair across all settings.

## Scene composition

`GameView.buildZone()` assembles a zone from shared content plus procedural
dressing:

- **Sky dome** — large unlit sphere at "infinite distance" tinted per zone.
- **Clouds** — billboarded planes that drift slowly.
- **Mountains** — a low-poly ring around the play area for a sense of scale.
- **Floating islands** — decorative silhouettes above the horizon.
- **Terrain** — a subdivided ground mesh with vertex-colour height shading.
- **Props** — painted ground regions (roads, stone, dirt, lava) and scattered decor.
- **Obstacles** — styled by `Obstacle.kind`: trees (instanced canopies), rocks,
  buildings with pyramid roofs, walls, broken pillars, ruin clusters, fences,
  water (scrolling UVs), and pits. These mirror the simulation colliders.
- **Foliage** — instanced crossed planes (`tuft`, `flower`, `mushroom`).
- **Fireflies** — small drifting emissive sprites for atmosphere.

Characters are assembled from boxes and primitives (humanoids with animatable
limbs, quadrupeds, wisps, golems) with a simple procedural walk/attack idle driven
by snapshot state. Each entity gets a soft blob shadow on the ground.

## Entities and interpolation

Snapshots arrive at 10 Hz and are interpolated per frame toward target
position/heading, so motion looks smooth despite the low network rate. Entity
colour and look are derived from shared content definitions (archetype, enemy
`defId`, player appearance colours).

## Quality presets

| | foliage | clouds | tree scale | draw distance | fog | pixel |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 120 | 8 | 0.55 | 240 | 1.6× | 4 |
| Medium | 420 | 15 | 1.0 | 430 | 1.0× | 3 |
| High | 900 | 24 | 1.0 | 640 | 0.75× | 2 |

`GameView.applyQuality()` applies a preset and rebuilds the zone; `setQuality`,
`setDrawDistance`, `setPixelSize`, `setShake`, and `setInvertY` are the public
knobs wired to the Settings panel. If the frame rate stays below 24 FPS for
several seconds the renderer automatically drops one quality tier and notifies
the player.

## Public API used by the client

`client/src/main.ts` drives the view through:

- `setZone(zoneId, x, z)`, `applySnapshot(msg)`, `setTarget`-style callbacks.
- `projectToScreen(x, y, z)` for combat text and markers.
- `local` / `localPlayerId` for the local player.
- `setQuality`, `setPixelSize`/`getPixelSize`, `setDrawDistance`, `setShake`,
  `setInvertY`, `triggerShake`, `getFps`.
- `engine.resize()` on window resize, and `dispose()` on logout.
