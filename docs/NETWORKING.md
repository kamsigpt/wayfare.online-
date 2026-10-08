# Networking

## Transport

- WebSocket, one persistent connection per client.
- Messages are JSON objects with a `t` discriminator.
- Server listens on port `8081`, path `/ws` (`ws://localhost:8081/ws`).
- HTTP endpoints on the same port: `/health` and `/`.
- `PROTOCOL_VERSION = 1` (`shared/src/protocol.ts`).

The online client sends `hello` on connect and expects `welcome`. A `ping`/`pong`
pair every 5 seconds keeps the connection alive on both sides.

## Connection flow

```
client                                  server
  | -- hello (protocol) -----------------> |
  | <-------- welcome (protocol,           |
  |            serverTime, characters) -- |
  | -- login / register -----------------> |   (validated)
  | <-------- login_ok (characters) ----- |
  | -- enter_world ---------------------> |
  | <-------- enter (player, abilities) --|
  | <-------- snapshot (10 Hz) -----------|
  | <-------- combat / loot / quest ... --|
```

`register` creates the account and a first character; `login` loads existing
characters. `create_character` is used to add further characters. `enter_world`
loads the selected character into its zone and begins snapshots.

## Client to server messages

| Type | Purpose |
| --- | --- |
| `hello` | Protocol handshake |
| `login` / `register` | Authenticate or create an account |
| `create_character` | Add a character to the account |
| `enter_world` | Load the character and start play |
| `move` | Movement intent with direction + heading (applied by simulation) |
| `move_to` | Click/tap destination (pathing) |
| `stop` | Cancel movement |
| `attack` | Basic attack, optional target |
| `ability` | Use an ability by id, optional target/aim |
| `dodge` | Dodge roll in a direction |
| `interact` | Talk to an NPC, gather a node, pick up ground loot, use a portal |
| `select_target` | Change selected target |
| `gather` | Gather from a resource node |
| `equip` / `unequip` / `use_item` / `drop_item` | Inventory actions |
| `pickup_ground` | Pick up a ground item |
| `accept_quest` / `turn_in_quest` | Quest actions |
| `craft` | Craft a recipe |
| `chat` | Send a chat line on a channel |
| `set_pvp` | Toggle PvP |
| `respawn` | Respawn after death |
| `ping` | Keepalive |
| `unload` | Client is closing |

## Server to client messages

| Type | Purpose |
| --- | --- |
| `welcome` | Protocol confirmation + character summaries |
| `login_ok` | Authentication succeeded |
| `error` | Recoverable error with a code and message |
| `enter` | Initial player state and unlocked abilities |
| `snapshot` | 10 Hz world state, your vitals, entity list, removals |
| `zone_change` | You entered a new zone |
| `combat` | Combat events since the last snapshot (damage, crit, heal, miss, xp) |
| `loot` | Ground items available |
| `chat` | A chat line |
| `quest_update` | Quest states changed |
| `inventory` | Inventory/equipment/gold changed |
| `progress` | XP, level, skill XP/levels, gold changed |
| `ability_unlocked` | A new ability was learned |
| `gathering_result` | Result of a gather attempt |
| `craft_result` | Result of a craft attempt |
| `death` | You died, with respawn timer and XP lost |
| `respawned` | You respawned with new state |
| `npc_dialogue` | Dialogue node and options |
| `pvp_change` | PvP flag changed |
| `pong` | Keepalive reply |
| `world_event` | Server-wide event (e.g. boss slain) |
| `player_joined` / `player_left` | Social notifications |
| `knockback` | Forced movement impulse |

## Snapshots and interest management

Snapshots are sent at `SNAPSHOT_RATE` (10 Hz). Each snapshot contains:

- `you`: the full serialized local player (vitals, inventory, quests, skills).
- `entities`: every entity within `INTEREST_RADIUS` (80 units) of the player —
  players, enemies, NPCs, resource nodes, ground loot, portals.
- `removed`: ids that left interest range or despawned.
- `events`: simulation events for that tick.

Snapshots are authoritative for the client: entity meshes are driven by snapshot
positions with client-side interpolation.

## Offline parity

`OfflineTransport` implements the same `Transport` interface and runs an actual
`Simulation` in the browser. It emits the same message types (`enter`, `snapshot`,
`combat`, `loot`, `quest_update`, ...) on the same schedule (20 Hz tick, 10 Hz
snapshot). `main.ts` cannot tell the two transports apart.
