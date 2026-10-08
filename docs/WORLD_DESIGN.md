# World Design

The world is a set of connected zones. Each zone is a flat, open area defined in
`shared/src/content/zones.ts` with a size, biome/colors, obstacles, spawns,
resource nodes, NPCs, and portals.

## Zones

### Elaris (size 90)

The starting hub. A safe zone (`PVP_SAFE_ZONES` includes Elaris) with vendors,
quest givers, a crafting station, and a training ground.

- NPCs: Quartermaster Ilya (quest), Captain Bren (quest), Merchant Dax (merchant),
  Smith Bran (crafting), Healer Mira (quest), Innkeeper Sela (innkeeper),
  Archivist Pell (quest), Trainer Omar (trainer), Guard Tobin (guard).
- Enemies: training dummies only.
- Portal: north gate to Greenreach.

### Greenreach (size 220)

The open wilds. Wolves, boars, marsh stalkers, wisps, a moss golem, and a bandit
camp. Rich in gathering nodes across mining, woodcutting, herbalism, and fishing.

- Enemies: grove wolf, thorn boar, marsh stalker, veil wisp, moss golem,
  bandit cutthroat, bandit brute.
- NPCs: Ranger Cass (quest), Hermit Vae (flavor).
- Portals: back to Elaris, and northeast to The Hollow (requires level 4).

### The Hollow (size 120)

The endgame rift. Ghouls, lurkers, wisps, rift guardians, and the zone boss.

- Enemies: hollow ghoul, hollow lurker, veil wisp, rift guardian,
  **Hollow Warden** (boss).
- Boss loot: the Hollow Warden guarantees a `warden_sigil` (quest item) plus
  veil shards and greater potions, and can drop `ember_axe`, `veilweave_staff`,
  and `veil_touched_hood`.
- Portal: back to Greenreach.

## Factions

- Elaris Compact
- Veil Wardens
- Greenreach Rangers

Reputation is tracked per character and used by quest rewards.

## Quest arc

The content supports a progression arc, largely around Elaris:

- `first_steps` (intro: kill training dummies, talk to the quartermaster)
- `herbs_for_mira` (collect moonleaf)
- `wolves_at_the_gate` (clear grove wolves, report to Captain Bren)
- `the_lost_caravan` (reach Greenreach, kill marsh stalkers, recover and deliver
  a wayfinder compass)
- `iron_for_the_forge` (mine iron, deliver to Smith Bran)
- `into_the_hollow` (reach The Hollow, slay the Hollow Warden, deliver its sigil)
- Side quests: `gathering_dust` (repeatable), `bandit_trouble`,
  `a_sharper_blade` (craft), `wardens_call` (collect veil shards)

## Gathering nodes

| Node | Skill |
| --- | --- |
| copper vein, iron vein, veil crystal | mining |
| oak tree, ironwood tree | woodcutting |
| moonleaf patch, emberbloom patch | herbalism |
| fishing spot | fishing |

## Day/night

The simulation tracks a day cycle (`DAY_LENGTH_SECONDS = 1200`) and reports
`dayTime` in snapshots, available for lighting and ambience.

## Design intent

- Small, readable zones that run well on low-end hardware.
- Safe hub -> open wilds -> dangerous rift progression.
- Every zone is reachable offline, so single-player has the full map.
