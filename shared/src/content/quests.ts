import type { QuestDef } from '../types.js';

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  (
    [
      {
        id: 'first_steps',
        name: 'First Steps',
        giver: 'quartermaster_ilya',
        levelReq: 1,
        prerequisites: [],
        type: 'main',
        description: 'Prove you can handle yourself before leaving Elaris.',
        stages: [
          {
            description: 'Strike the training dummy until it splinters.',
            objectives: [{ type: 'kill', enemyId: 'training_dummy', count: 3 }],
          },
          {
            description: 'Speak with Quartermaster Ilya again.',
            objectives: [{ type: 'talk', npcId: 'quartermaster_ilya' }],
          },
        ],
        rewards: { xp: 60, gold: 40, items: [{ itemId: 'health_potion', qty: 3 }] },
      },
      {
        id: 'herbs_for_mira',
        name: 'Herbs for Mira',
        giver: 'healer_mira',
        levelReq: 1,
        prerequisites: [],
        type: 'side',
        description: 'Mira needs moonleaf to restock her remedies.',
        stages: [
          {
            description: 'Gather moonleaf from Greenreach.',
            objectives: [{ type: 'collect', itemId: 'moonleaf', count: 5 }],
          },
        ],
        rewards: { xp: 45, gold: 25, items: [{ itemId: 'health_potion', qty: 2 }] },
      },
      {
        id: 'wolves_at_the_gate',
        name: 'Wolves at the Gate',
        giver: 'captain_bren',
        levelReq: 2,
        prerequisites: ['first_steps'],
        type: 'main',
        description: 'Grove wolves are pressing too close to the road.',
        stages: [
          {
            description: 'Cull the grove wolves prowling Greenreach.',
            objectives: [{ type: 'kill', enemyId: 'grove_wolf', count: 6 }],
          },
          {
            description: 'Report back to Captain Bren.',
            objectives: [{ type: 'talk', npcId: 'captain_bren' }],
          },
        ],
        rewards: { xp: 120, gold: 60, items: [{ itemId: 'leather_vest', qty: 1 }] },
      },
      {
        id: 'the_lost_caravan',
        name: 'The Lost Caravan',
        giver: 'merchant_dax',
        levelReq: 3,
        prerequisites: ['wolves_at_the_gate'],
        type: 'main',
        description: "Dax's caravan never arrived. Find what happened on the Greenreach road.",
        stages: [
          {
            description: 'Search the abandoned camp on the eastern road.',
            objectives: [{ type: 'reach', zoneId: 'greenreach', x: 42, z: -38, radius: 8 }],
          },
          {
            description: 'Put down whatever took the camp.',
            objectives: [{ type: 'kill', enemyId: 'marsh_stalker', count: 4 }],
          },
          {
            description: "Recover Dax's compass from the wreckage.",
            objectives: [{ type: 'collect', itemId: 'wayfinder_compass', count: 1 }],
          },
          {
            description: 'Return the compass to Merchant Dax.',
            objectives: [{ type: 'deliver', npcId: 'merchant_dax', itemId: 'wayfinder_compass', count: 1 }],
          },
        ],
        rewards: { xp: 220, gold: 140, items: [{ itemId: 'travelers_boots', qty: 1 }] },
      },
      {
        id: 'iron_for_the_forge',
        name: 'Iron for the Forge',
        giver: 'smith_bran',
        levelReq: 2,
        prerequisites: [],
        type: 'side',
        description: "Bran's ore pile is running low.",
        stages: [
          {
            description: 'Mine iron ore in Greenreach.',
            objectives: [{ type: 'collect', itemId: 'iron_ore', count: 6 }],
          },
          {
            description: 'Bring the ore to Smith Bran.',
            objectives: [{ type: 'deliver', npcId: 'smith_bran', itemId: 'iron_ore', count: 6 }],
          },
        ],
        rewards: { xp: 90, gold: 50, items: [{ itemId: 'iron_ingot', qty: 2 }] },
        repeatable: false,
      },
      {
        id: 'into_the_hollow',
        name: 'Into the Hollow',
        giver: 'captain_bren',
        levelReq: 5,
        prerequisites: ['wolves_at_the_gate', 'the_lost_caravan'],
        type: 'main',
        description: 'Something is stirring beneath the fractures. Enter The Hollow.',
        stages: [
          {
            description: 'Enter The Hollow.',
            objectives: [{ type: 'reach', zoneId: 'hollow', x: 0, z: 12, radius: 10 }],
          },
          {
            description: 'Destroy the Hollow Warden.',
            objectives: [{ type: 'kill', enemyId: 'hollow_warden', count: 1 }],
          },
          {
            description: 'Bring the Warden Sigil to Captain Bren.',
            objectives: [{ type: 'deliver', npcId: 'captain_bren', itemId: 'warden_sigil', count: 1 }],
          },
        ],
        rewards: { xp: 900, gold: 500, items: [{ itemId: 'greater_health_potion', qty: 3 }] },
      },
      {
        id: 'gathering_dust',
        name: 'Gathering Dust',
        giver: 'archivist_pell',
        levelReq: 1,
        prerequisites: [],
        type: 'repeatable',
        description: 'Archivist Pell always needs materials for her research.',
        stages: [
          {
            description: 'Collect moonleaf and copper ore for Pell.',
            objectives: [
              { type: 'collect', itemId: 'moonleaf', count: 4 },
              { type: 'collect', itemId: 'copper_ore', count: 4 },
            ],
          },
        ],
        rewards: { xp: 50, gold: 35 },
        repeatable: true,
      },
      {
        id: 'bandit_trouble',
        name: 'Bandit Trouble',
        giver: 'captain_bren',
        levelReq: 4,
        prerequisites: ['wolves_at_the_gate'],
        type: 'side',
        description: 'Bandits are raiding travellers on the Greenreach road.',
        stages: [
          {
            description: 'Thin the bandit numbers.',
            objectives: [
              { type: 'kill', enemyId: 'bandit_cutthroat', count: 3 },
              { type: 'kill', enemyId: 'bandit_brute', count: 2 },
            ],
          },
        ],
        rewards: { xp: 200, gold: 160, items: [{ itemId: 'knight_plate', qty: 1 }] },
      },
      {
        id: 'a_sharper_blade',
        name: 'A Sharper Blade',
        giver: 'smith_bran',
        levelReq: 4,
        prerequisites: ['iron_for_the_forge'],
        type: 'side',
        description: 'Prove your craft at the forge.',
        stages: [
          {
            description: 'Forge a rustic sword for Bran.',
            objectives: [{ type: 'craft', recipeId: 'forge_rustic_sword', count: 1 }],
          },
        ],
        rewards: { xp: 130, gold: 80, items: [{ itemId: 'iron_dagger', qty: 1 }] },
      },
      {
        id: 'wardens_call',
        name: "Warden's Call",
        giver: 'healer_mira',
        levelReq: 6,
        prerequisites: ['herbs_for_mira', 'wolves_at_the_gate'],
        type: 'faction',
        description: 'Mira believes the Veil fractures are widening. Gather evidence.',
        stages: [
          {
            description: 'Collect veil shards from the wisps and the Hollow.',
            objectives: [{ type: 'collect', itemId: 'veil_shard', count: 4 }],
          },
          {
            description: 'Bring the shards to Mira.',
            objectives: [{ type: 'deliver', npcId: 'healer_mira', itemId: 'veil_shard', count: 4 }],
          },
        ],
        rewards: { xp: 300, gold: 200, reputation: [{ faction: 'wardens', amount: 25 }] },
      },
    ] as QuestDef[]
  ).map((q) => [q.id, q]),
);
