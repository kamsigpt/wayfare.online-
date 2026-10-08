# Game Systems

All rules below live in `shared/` and are executed identically by the server and
the offline client.

## Archetypes

Chosen at character creation. Each archetype has base stats and a health/mana/
stamina pool, and shapes which abilities unlock.

| Archetype | Role | Focus |
| --- | --- | --- |
| Wayfarer | All-rounder | Adaptable, survival, exploration |
| Vanguard | Tank | Heavy armor, shield, control |
| Strider | Ranged | Bow, mobility, kiting |
| Arcanist | Caster | Magic damage, area effects |
| Warden | Support | Healing, shields, regeneration |
| Reaver | Melee damage | Aggression, lifesteal, bleed |

## Leveling

- Character XP curve: `XP_CURVE(level) = floor(120 * level^1.55)`.
- Skill XP curve: `SKILL_XP_CURVE(level) = floor(60 * level^1.4)`.
- XP is granted on enemy kills, gathering, crafting, and quests.

## Stats and derived values

Characters have five core stats: strength, dexterity, intelligence, vitality,
spirit. Base stats come from the archetype and gain +1 per level. Equipment adds
stats and modifiers. Derived values (`shared/src/sim/stats.ts`):

- `maxHealth = archetype.health + vitality*8 + (level-1)*10 + bonuses`
- `maxMana = archetype.mana + intelligence*5 + spirit*3 + (level-1)*4 + bonuses`
- `maxStamina = archetype.stamina + dexterity*2 + (level-1)*2`
- `armor += floor(vitality * 0.5)` plus equipment armor
- Crit chance gains `dexterity * 0.004`, capped at 0.6.
- Weapon skills scale weapon damage: +2% per skill level above 1, by weapon
  class (sword/dagger/axe/hammer, bow, staff/wand).

## Combat

`computeDamage` (`shared/src/sim/combat.ts`):

1. Roll damage between weapon `min` and `max`, plus bonuses.
2. Roll crit at `critChance` (capped 0.75); crits multiply by `critDamage`.
3. Apply armor mitigation: `100 / (100 + armor * 2.2)`.
4. Roll block; a successful block multiplies damage by 0.4.
5. Round up to a minimum of 1.

Combat also features:

- **Momentum**: builds as you fight and decays over time; some abilities and
  effects consume or scale with it.
- **Dodge**: a directional roll on `Shift` that briefly avoids attacks.
- **Statuses**: stun, slow, root, burn, poison, bleed, frozen, haste, weaken,
  invulnerable, stealth. Movement and damage multipliers are applied in
  `movementMultiplier` / `damageMultiplier`.

## Abilities

Abilities are data-driven (`shared/src/content/abilities.ts`) with cooldown,
resource cost, range, cast/windup, damage, and effects (damage, heal, damage over
time, heal over time, status, dash, shield, taunt, pull, knockback, buff,
summon).

Unlocked examples by archetype:

- Vanguard: Cleave, Shield Wall, Charge, War Cry.
- Strider: Multishot, Tumbling Strike, Snipe, Arrow Volley.
- Arcanist: Firebolt, Frost Nova, Veil Blink, Arcane Barrage.
- Warden: Mend, Renewing Light, Guardian Spirit.
- Reaver: Bloodlust, Siphon, Reave, Whirlwind, Execution.
- Shared: Dash Strike, Gust.

New abilities unlock as you level; the server announces them with
`ability_unlocked`.

## Enemy AI

Each enemy runs a finite-state machine (`shared/src/sim/world.ts`) with states:

`idle -> patrol -> detect -> chase -> attack -> hurt -> flee -> dead -> return`

- **idle/patrol**: wander or hold near a spawn anchor.
- **detect**: notice a target within aggro range and telegraph before engaging.
- **chase**: pursue the target, returning home if it leaves leash range.
- **attack**: strike when in range, respecting attack timers.
- **hurt/flee**: react to damage; low-health enemies may flee.
- **return**: walk back to the spawn anchor when the fight ends.
- **dead**: removed from active combat and scheduled to respawn.

Enemy definitions specify archetype (brute, hunter, swarm, assassin, guardian,
caster), which drives damage, speed, and behavior.

## Items

Items (`shared/src/content/items.ts`) have a kind, rarity
(common/uncommon/rare/epic/legendary), optional equipment slot, damage/armor/
block, stat bonuses, modifiers, and weight. Stackable items respect `maxStack`.
Equipment slots: weapon, offhand, head, chest, legs, feet, trinket.

## Loot

Enemy loot tables (`shared/src/content/enemies.ts`) list item chances and quantity
ranges. On kill, `shared/src/sim/loot.ts` rolls the table, awards gold, and drops
ground items. Bosses have guaranteed drops (for example the Hollow Warden drops a
`warden_sigil`). Ground loot is picked up with the interact key or click.

## Gathering and crafting

Gathering skills and their resource nodes:

- mining (copper, iron, veil crystal)
- woodcutting (oak, ironwood)
- herbalism (moonleaf, emberbloom)
- fishing (fishing spots)

Crafting (`shared/src/content/recipes.ts`) consumes inputs and awards skill XP:

- blacksmithing, alchemy, enchanting, cooking, plus mining/woodcutting/herbalism/
  fishing for gathering.

Recipes require a skill level and specific materials; success emits
`craft_result` and an inventory update.

## Quests

Quests (`shared/src/content/quests.ts`) have multiple stages with objective types:
kill, collect, talk, reach, gather, craft, deliver. Rewards include XP, gold,
items, and reputation. Quest state is tracked per character (active/complete/
turned_in/failed) and survives relog. A repeatable gathering quest is included.

## Reputation and factions

Reputation is tracked per faction and can gate content or rewards. Faction
definitions live alongside content data and surface in quest rewards.
