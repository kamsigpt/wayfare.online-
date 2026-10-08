# Development Roadmap

This document records what the current build contains and where it can go next.
It intentionally lists only things that either already work or are clearly scoped.

## Current build

Working end to end (server and offline client share the same simulation):

- Account register/login (scrypt), character creation, character select.
- Persistent characters and quest state across relog.
- Authoritative 20 Hz simulation, 10 Hz snapshots, 80-unit interest radius.
- Zones: Elaris, Greenreach, The Hollow, with portals and a level gate.
- Combat: basic attacks, crits, armor/block mitigation, momentum, dodge, statuses.
- Abilities: data-driven, unlocked by level, per archetype.
- Enemy AI FSM with aggro, chase, leash/return, flee, and respawn.
- Loot tables, ground loot, gold, boss drops (Hollow Warden).
- Gathering (mining, woodcutting, herbalism, fishing) and crafting
  (blacksmithing, alchemy, enchanting, cooking).
- Quests across three zones including a repeatable quest and boss finale.
- Inventory, equipment, skills, quests, and crafting UI panels.
- World chat, toasts, floating combat text, minimap, settings.
- Offline single-player (no server) and online multiplayer.
- Deterministic sim tests + multiplayer bot integration tests (`npm test`).
- Static client build and GitHub Pages deployment workflow.

## Near-term

- Postgres/Supabase `StorageAdapter` implementing the schema in
  `docs/DATABASE_SCHEMA.md`.
- Party and guild systems (protocol, UI, shared state).
- Player trading and a functional shop UI for merchants (currently merchants are
  present as NPC roles but the shop screen is not yet implemented).
- More abilities and status interactions (crowd control diminishing returns).
- Expanded PvP (flagging rules, arenas) beyond the current zone-safe flag.
- Touch controls for mobile browsers.

## Medium-term

- More zones and dungeon instances (separate world instances per group).
- Auction house / player marketplace.
- Professions depth: specializations, rare recipes, gathering nodes by tier.
- Faction reputation vendors and gated content.
- Emote and social systems (friends, ignore, mail).
- Server sharding/zone-to-process scaling.

## Long-term

- Multi-region deployment with a gateway and session routing.
- Analytics and live-ops tooling (event scheduling, seasonal content).
- Localization and accessibility passes.
- Modding/content pipeline from data files.

## Testing strategy

- `server/test/sim.ts`: deterministic unit coverage of the shared simulation
  (movement, combat rewards, loot, quests, equipment, crafting).
- `server/test/bots.ts`: end-to-end over real WebSockets (register, enter,
  combat events, chat, quest accept, persistence across relog).
- Extend both suites alongside any gameplay change; keep `npm test` green.

## Engineering constraints

- Gameplay rules live in `shared/` only.
- Keep dependencies minimal; no external runtime assets.
- Must remain playable on low-end devices (draw distance options, no heavy
  shaders, procedural audio).
- UI must never claim a feature works unless it does.
