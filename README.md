# WAYFARE.ONLINE

A lightweight browser MMORPG. Explore **Elaris**, **Greenreach**, and **The Hollow**;
fight, gather, craft, quest, and trade in a world behind the veil.

The gameplay is a single authoritative simulation shared by the server and the
client, so the same rules run online (multiplayer) and offline (single player in
the browser). The client is a static Vite + Babylon.js app and is playable with no
backend via **Play Offline**.

## Highlights

- Authoritative 20 Hz server simulation, 10 Hz network snapshots.
- Same shared simulation used for offline single-player in the browser.
- Six archetypes, twelve abilities each shaped by role, momentum/dodge combat.
- AI finite-state machines: idle, patrol, detect, chase, attack, hurt, flee, dead, return.
- Gathering, crafting, quests, factions, loot tables, boss encounter.
- Lightweight: no external assets, procedural Web Audio, low draw distance options.

## Requirements

- Node.js 20+ (developed on Node 26)
- npm

## Install

```
npm install
```

## Run the game

Offline (no server needed):

```
npm run dev:client
```

Then open the printed URL and click **Play Offline**.

Online (server + client):

```
# terminal 1
npm start

# terminal 2
npm run dev:client
```

The client reaches the server at `ws://localhost:8081/ws` in development via the
Vite proxy. Use the **Server** field on the start screen to point at another host.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:server` | Run the server with file watching (`tsx watch`) |
| `npm run dev:client` | Run the Vite dev server at `http://localhost:5173` |
| `npm start` | Run the server (`tsx server/src/index.ts`) |
| `npm run build` | Build the static client into `client/dist` |
| `npm run typecheck` | Type-check the whole monorepo |
| `npm test` | Deterministic sim tests + multiplayer bot integration tests |

## Project layout

```
shared/src/     Content data + the authoritative Simulation (server and client)
  content/      items, abilities, enemies, recipes, quests, npcs, zones
  sim/          collision, pathfinding, stats, loot, combat, world, simulation
server/src/     HTTP + WebSocket server, sessions, persistence
client/src/     Babylon.js renderer, UI, transports (online + offline)
docs/           Architecture, systems, world, networking, database, roadmap
```

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` builds the static client and deploys it to GitHub
Pages on every push to `main`. Because GitHub Pages cannot host the WebSocket
server, the deployed build is intended for **Play Offline**; online play requires
running the server elsewhere and entering its URL on the start screen.

The Pages build uses base path `/wayfare.online-/`. Override with `VITE_BASE`
when building for a custom domain.

## License

See the repository for licensing details.
