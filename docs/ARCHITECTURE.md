# Architecture

## Overview

WAYFARE.ONLINE is a TypeScript monorepo with three layers:

```
                +-------------------------------+
                |            shared             |
                |  content data + Simulation    |
                +---------------+---------------+
                        |               |
          imports       |               |       imports
                        v               v
            +-----------+----+   +------+-----------+
            |     server     |   |      client      |
            | ws + HTTP + DB |   | Babylon + Vite   |
            +----------------+   +------------------+
```

The key design decision is that **all gameplay rules live in `shared/`**. The
server and the offline client instantiate the exact same `Simulation` class. The
server only adds transport, sessions, and persistence; the client only adds
rendering, input, and a transport.

## Why a shared simulation

- One source of truth for combat, loot, quests, AI, and movement.
- Offline single-player is genuinely the same game, not a reduced imitation.
- Deterministic, testable: `server/test/sim.ts` drives the shared simulation
  without any networking.

## Module responsibilities

### shared

| Path | Responsibility |
| --- | --- |
| `shared/src/types.ts` | All domain types (items, abilities, enemies, quests, state) |
| `shared/src/protocol.ts` | Wire contract: `ClientMessage`, `ServerMessage`, `PROTOCOL_VERSION` |
| `shared/src/constants.ts` | Tick/snapshot rates, interest radius, XP curves, rarity |
| `shared/src/math.ts` | Vector/angle helpers |
| `shared/src/content/*` | Static data: items, abilities, enemies, recipes, quests, npcs, zones |
| `shared/src/sim/simulation.ts` | The authoritative `Simulation`: validates and applies every action |
| `shared/src/sim/world.ts` | `ZoneWorld`: entity state, AI FSM, spawns, resources, ground loot |
| `shared/src/sim/combat.ts` | Damage, crits, mitigation, momentum |
| `shared/src/sim/stats.ts` | Derived stats from archetype, level, equipment, skills |
| `shared/src/sim/loot.ts` | Loot-table resolution and ground item spawning |
| `shared/src/sim/collision.ts` | Circle/AABB collision against zone obstacles |
| `shared/src/sim/pathfinding.ts` | Grid/nav sampling for AI and click-to-move |
| `shared/src/sim/serialize.ts` | Player state to `SerializedPlayer` |

### server

| Path | Responsibility |
| --- | --- |
| `server/src/index.ts` | Process entry: creates and starts the server |
| `server/src/launch.ts` | `launchServer()` reusable bootstrap (used by tests) |
| `server/src/gameServer.ts` | Sessions, message queue, snapshot broadcast, `SimHooks` |
| `server/src/persistence.ts` | `StorageAdapter` interface + `FileStorageAdapter` |

### client

| Path | Responsibility |
| --- | --- |
| `client/src/main.ts` | Bootstrap, screens, message dispatch, input wiring |
| `client/src/game.ts` | Babylon.js `GameView`: scene, meshes, camera, input, interpolation |
| `client/src/ui.ts` | HUD, side panels, dialogue, floaters, toasts, minimap |
| `client/src/transport.ts` | `Transport` interface, entity-id helpers, default URL |
| `client/src/net.ts` | `OnlineTransport` (WebSocket) |
| `client/src/offline.ts` | `OfflineTransport` (runs `Simulation` in the browser) |
| `client/src/audio.ts` | Procedural Web Audio effects |

## Server loop

The server keeps a fixed-step accumulator at `TICK_RATE` (20 Hz). Every tick it
calls `Simulation.tick(TICK_DT)` once per zone world. At `SNAPSHOT_RATE` (10 Hz)
it builds a per-player snapshot and broadcasts it. Movement/attack messages are
applied as intents through the simulation.

## Session model

Each WebSocket connection is a `Session`. Messages are processed through a
per-session promise chain (`queueMessage`) so that asynchronous setup (register,
load) cannot race gameplay messages such as `enter_world`.

## Persistence

Persistence sits behind the `StorageAdapter` interface. The default adapter is
`FileStorageAdapter`, which writes JSON atomically to `server/data/`. See
`docs/DATABASE_SCHEMA.md` for the target relational schema behind the same
interface.

## Testing

- `server/test/sim.ts` — deterministic unit tests of the shared simulation.
- `server/test/bots.ts` — end-to-end integration: two WebSocket clients
  register, enter, fight, chat, quest, and relog with persistence.
- `npm test` runs both.
