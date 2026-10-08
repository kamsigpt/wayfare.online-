import { Simulation, type SimHooks } from '@shared/sim/simulation.js';
import { ENEMIES } from '@shared/content/enemies.js';
import type { PlayerState } from '@shared/types.js';

const results: { label: string; pass: boolean }[] = [];
const check = (pass: boolean, label: string) => {
  results.push({ label, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${label}`);
};

const calls = {
  progress: 0,
  groundLoot: 0,
  combat: 0,
  quest: 0,
  death: 0,
  respawn: 0,
  gathering: 0,
  craft: 0,
  world: 0,
  dialogue: 0,
  chat: 0,
  ability: 0,
  inventory: 0,
  zone: 0,
};

const hooks: SimHooks = {
  emitCombat: () => void calls.combat++,
  emitZone: () => void calls.zone++,
  onInventoryChanged: () => void calls.inventory++,
  onProgress: () => void calls.progress++,
  onQuestUpdate: () => void calls.quest++,
  onGatheringResult: () => void calls.gathering++,
  onCraftResult: () => void calls.craft++,
  onDeath: () => void calls.death++,
  onRespawn: () => void calls.respawn++,
  onWorldEvent: () => void calls.world++,
  onDialogue: () => void calls.dialogue++,
  onChat: () => void calls.chat++,
  onGroundLoot: () => void calls.groundLoot++,
  onAbilityUnlocked: () => void calls.ability++,
};

function main() {
  const sim = new Simulation(hooks);
  const player: PlayerState = sim.createPlayerState(1, 'Tester', 'vanguard', {
    bodyColor: '#b71c1c',
    hairColor: '#3e2723',
    skinTone: '#e0ac69',
    height: 1,
    archetype: 'vanguard',
  }, 'tester');
  player.zoneId = 'greenreach';
  sim.addPlayer(player);

  // --- movement + world tick -------------------------------------------------
  const world = sim.getWorld(player.zoneId);
  check(world.id === 'greenreach', 'world created for player zone');

  sim.handleMessage(player, { t: 'move', seq: 1, mx: 0, mz: -1, heading: 0 });
  const beforeZ = player.z;
  const beforeX = player.x;
  for (let i = 0; i < 20; i++) sim.tick(1 / 20);
  check(player.z !== beforeZ || player.x !== beforeX, 'player position changed while moving');
  check(player.moving === true, 'player flagged as moving');

  // --- enemy kill yields xp, loot, and hooks ---------------------------------
  const wolves = [...world.enemies.values()].filter((e) => e.defId === 'grove_wolf' && !e.dead);
  const target = wolves[0] ?? [...world.enemies.values()].find((e) => !e.dead);
  check(target !== undefined, 'found a live enemy to fight');
  check(wolves.length > 0, 'grove wolves spawned in greenreach');

  if (target) {
    const xpBefore = player.progress.xp;
    const groundBefore = world.ground.length;
    const lootHookBefore = calls.groundLoot;
    const progressBefore = calls.progress;
    world.damageEnemy(target, player.id, 999_999, false, Date.now());
    check(target.dead === true, 'enemy died from lethal damage');
    check(player.progress.xp > xpBefore, 'player gained xp from kill');
    check(world.ground.length > groundBefore, 'loot dropped on the ground');
    check(calls.groundLoot > lootHookBefore, 'onGroundLoot hook fired');
    check(calls.progress > progressBefore, 'onProgress hook fired');
  }

  // --- loot table sanity -----------------------------------------------------
  check((ENEMIES.grove_wolf.lootTable?.length ?? 0) > 0, 'grove wolf has a loot table');
  check(ENEMIES.hollow_warden.boss === true, 'hollow warden is flagged as a boss');

  // --- quest accept + progress ----------------------------------------------
  sim.handleMessage(player, { t: 'accept_quest', questId: 'first_steps' });
  check(player.quests.some((q) => q.questId === 'first_steps'), 'quest accepted and stored');
  check(calls.quest > 0, 'quest update hook fired');

  // --- inventory / equipment -------------------------------------------------
  const itemBefore = calls.inventory;
  player.inventory[0] = { uid: 'test-sword', defId: 'rustic_sword', qty: 1 };
  sim.handleMessage(player, { t: 'equip', uid: 'test-sword' });
  check(player.equipment.weapon?.defId === 'rustic_sword', 'equipped starter sword');
  check(calls.inventory > itemBefore, 'inventory changed hook fired on equip');

  // --- crafting --------------------------------------------------------------
  const craftBefore = calls.craft;
  player.inventory[5] = { uid: 'test-iron', defId: 'iron_ingot', qty: 4 };
  player.inventory[6] = { uid: 'test-logs', defId: 'oak_logs', qty: 4 };
  sim.handleMessage(player, { t: 'craft', recipeId: 'forge_rustic_sword' });
  check(calls.craft > craftBefore, 'crafting triggered a result hook');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(failed.length === 0 ? 'ALL SIM TESTS PASSED' : 'SOME SIM TESTS FAILED');
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();