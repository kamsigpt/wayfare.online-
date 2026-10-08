import type { FactionDef, NPCDef } from '../types.js';

export const FACTIONS: Record<string, FactionDef> = {
  elaris: {
    id: 'elaris',
    name: 'Elaris Compact',
    description: 'The merchant coalition that keeps Elaris standing.',
    color: '#ffc107',
    homeZone: 'elaris',
  },
  wardens: {
    id: 'wardens',
    name: 'Veil Wardens',
    description: 'Scholars and soldiers who study the fractures.',
    color: '#42a5f5',
    homeZone: 'elaris',
  },
  greenreach_rangers: {
    id: 'greenreach_rangers',
    name: 'Greenreach Rangers',
    description: 'Wardens of the wild lands beyond the gate.',
    color: '#66bb6a',
    homeZone: 'greenreach',
  },
};

export const NPCS: Record<string, NPCDef> = Object.fromEntries(
  (
    [
      {
        id: 'quartermaster_ilya',
        name: 'Quartermaster Ilya',
        title: 'Elaris Compact',
        faction: 'elaris',
        x: -6,
        z: -4,
        zoneId: 'elaris',
        role: 'quest',
        color: '#ffca28',
        dialogue: [
          {
            id: 'greet',
            text: 'New Wayfarer, are you? Elaris has room for those willing to work. Start with the dummy out front — show me you can swing a blade.',
            options: [
              { text: 'I will begin the training.', next: 'thanks', action: { type: 'accept_quest', questId: 'first_steps' } },
              { text: 'Just browsing.', next: 'bye' },
            ],
          },
          {
            id: 'thanks',
            text: 'Good. Strike the dummy three times, then come back and we will talk about your next step.',
            options: [{ text: 'Understood.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Safe travels, Wayfarer.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        quests: ['first_steps'],
      },
      {
        id: 'captain_bren',
        name: 'Captain Bren',
        title: 'Elaris Watch',
        faction: 'elaris',
        x: 8,
        z: -8,
        zoneId: 'elaris',
        role: 'quest',
        color: '#ef5350',
        dialogue: [
          {
            id: 'greet',
            text: 'The road past the gate is not safe. Wolves, bandits, worse. If you are heading out, I have work for you.',
            options: [
              { text: 'Tell me about the wolves.', next: 'wolves', action: { type: 'accept_quest', questId: 'wolves_at_the_gate' } },
              { text: 'What about the bandits?', next: 'bandits', action: { type: 'accept_quest', questId: 'bandit_trouble' } },
              { text: 'Anything about The Hollow?', next: 'hollow', action: { type: 'accept_quest', questId: 'into_the_hollow' } },
              { text: 'Not now.', next: 'bye' },
            ],
          },
          {
            id: 'wolves',
            text: 'Six grove wolves have been shadowing the eastern road. Thin the pack and the caravans can move again.',
            options: [{ text: 'Consider it done.', next: 'bye' }],
          },
          {
            id: 'bandits',
            text: 'Cutthroats and brutes, preying on travellers. Put them down before someone else gets hurt.',
            options: [{ text: 'I will handle them.', next: 'bye' }],
          },
          {
            id: 'hollow',
            text: 'The Hollow is where the Veil frayed worst. Something ancient stirs down there. Bring back proof it is dead.',
            options: [{ text: 'I will enter The Hollow.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Watch yourself out there.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        quests: ['wolves_at_the_gate', 'bandit_trouble', 'into_the_hollow'],
      },
      {
        id: 'merchant_dax',
        name: 'Merchant Dax',
        title: 'Caravan Master',
        faction: 'elaris',
        x: 4,
        z: 6,
        zoneId: 'elaris',
        role: 'merchant',
        color: '#ffa726',
        dialogue: [
          {
            id: 'greet',
            text: 'Goods, wares, and a few curios from beyond the Veil. My caravan is missing — if you find my compass, I will pay well.',
            options: [
              { text: 'Let me see your wares.', next: 'greet', action: { type: 'open_shop' } },
              { text: 'I will look for your caravan.', next: 'quest', action: { type: 'accept_quest', questId: 'the_lost_caravan' } },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'quest',
            text: 'The road east, past the gate. We lost contact two days ago. My compass — a brass thing with a pale needle — it should still be there.',
            options: [{ text: 'I will find it.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Come back with coin or news, either way.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        shop: [
          { itemId: 'health_potion' },
          { itemId: 'mana_potion' },
          { itemId: 'stamina_tonic' },
          { itemId: 'fishing_rod' },
          { itemId: 'mining_pick' },
          { itemId: 'rustic_sword' },
          { itemId: 'hunting_bow' },
          { itemId: 'apprentice_staff' },
          { itemId: 'cloth_robe' },
          { itemId: 'leather_vest' },
          { itemId: 'oak_shield' },
        ],
        quests: ['the_lost_caravan'],
      },
      {
        id: 'smith_bran',
        name: 'Smith Bran',
        title: 'Forgekeeper',
        faction: 'elaris',
        x: -10,
        z: 8,
        zoneId: 'elaris',
        role: 'crafting',
        color: '#8d6e63',
        dialogue: [
          {
            id: 'greet',
            text: 'Hot work, honest work. Bring me ore and I will teach you what the forge can do.',
            options: [
              { text: 'I have ore for you.', next: 'ore', action: { type: 'accept_quest', questId: 'iron_for_the_forge' } },
              { text: 'Teach me to forge.', next: 'train', action: { type: 'train', abilityId: 'cleave', cost: 0 } },
              { text: 'Let me see your wares.', next: 'greet', action: { type: 'open_shop' } },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'ore',
            text: 'Six pieces of iron ore and we can talk about making you something that will not snap on the first swing.',
            options: [{ text: 'On it.', next: 'bye' }],
          },
          {
            id: 'train',
            text: 'Swing is swing, whether blade or hammer. Keep your shoulder into it.',
            options: [{ text: 'Thanks.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Mind the sparks.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        shop: [
          { itemId: 'iron_ingot' },
          { itemId: 'rustic_sword' },
          { itemId: 'oak_shield' },
          { itemId: 'iron_dagger' },
        ],
        quests: ['iron_for_the_forge', 'a_sharper_blade'],
      },
      {
        id: 'healer_mira',
        name: 'Healer Mira',
        title: 'Veil Wardens',
        faction: 'wardens',
        x: -4,
        z: 12,
        zoneId: 'elaris',
        role: 'quest',
        color: '#4dd0e1',
        dialogue: [
          {
            id: 'greet',
            text: 'The Veil leaves scars that no bandage reaches. I need moonleaf — and answers about what is leaking through.',
            options: [
              { text: 'I will gather moonleaf.', next: 'herbs', action: { type: 'accept_quest', questId: 'herbs_for_mira' } },
              { text: 'What do you know about the fractures?', next: 'fractures', action: { type: 'accept_quest', questId: 'wardens_call' } },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'herbs',
            text: 'Pale leaves that glow at dusk, growing wild in Greenreach. Five should be enough for now.',
            options: [{ text: 'I will find them.', next: 'bye' }],
          },
          {
            id: 'fractures',
            text: 'The Warden sent scouts into The Hollow. None returned. If you bring me veil shards, I can read what they tell.',
            options: [{ text: 'I will bring you shards.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Be well, Wayfarer.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        quests: ['herbs_for_mira', 'wardens_call'],
      },
      {
        id: 'innkeeper_sela',
        name: 'Innkeeper Sela',
        title: 'The Rested Wayfarer',
        faction: 'elaris',
        x: 12,
        z: 4,
        zoneId: 'elaris',
        role: 'innkeeper',
        color: '#ba68c8',
        dialogue: [
          {
            id: 'greet',
            text: 'Rooms, meals, and gossip — all three keep this town alive. Sit anywhere.',
            options: [
              { text: 'Any news?', next: 'news' },
              { text: 'Let me see the menu.', next: 'greet', action: { type: 'open_shop' } },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'news',
            text: 'Rangers saw lights in Greenreach again. And a Wayfarer walked into The Hollow last week. Alone. Not smart.',
            options: [{ text: 'Noted.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Rest well.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        shop: [
          { itemId: 'cooked_meat' },
          { itemId: 'health_potion' },
          { itemId: 'stamina_tonic' },
        ],
      },
      {
        id: 'archivist_pell',
        name: 'Archivist Pell',
        title: 'Veil Wardens',
        faction: 'wardens',
        x: -12,
        z: -10,
        zoneId: 'elaris',
        role: 'quest',
        color: '#9fa8da',
        dialogue: [
          {
            id: 'greet',
            text: 'Every fragment tells a story. Bring me materials and I will make it worth your while — repeatedly.',
            options: [
              { text: 'What do you need?', next: 'need', action: { type: 'accept_quest', questId: 'gathering_dust' } },
              { text: 'Tell me about the Veil.', next: 'lore' },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'need',
            text: 'Moonleaf, copper, shards, anything with a trace of the old world in it. I will keep the coin coming.',
            options: [{ text: 'Understood.', next: 'bye' }],
          },
          {
            id: 'lore',
            text: 'Before the fracture, the world was one place. Now we live on islands with seams between them. Wayfarers walk the seams.',
            options: [{ text: 'Fascinating.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Off you go.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
        quests: ['gathering_dust'],
      },
      {
        id: 'trainer_omar',
        name: 'Trainer Omar',
        title: 'Wayfarer Trainer',
        faction: 'elaris',
        x: 2,
        z: -12,
        zoneId: 'elaris',
        role: 'trainer',
        color: '#26a69a',
        dialogue: [
          {
            id: 'greet',
            text: 'Every path is open to a Wayfarer — but only those who train. What do you want to learn?',
            options: [
              { text: 'Teach me Dash Strike.', next: 'train', action: { type: 'train', abilityId: 'dash_strike', cost: 50 } },
              { text: 'Teach me Gust.', next: 'train', action: { type: 'train', abilityId: 'gust', cost: 50 } },
              { text: 'Tell me about paths.', next: 'paths' },
              { text: 'Goodbye.', next: 'bye' },
            ],
          },
          {
            id: 'train',
            text: 'Focus. The Veil moves with you when you stop hesitating.',
            options: [{ text: 'Ready.', next: 'bye' }],
          },
          {
            id: 'paths',
            text: 'At level 10, you choose a Path — Vanguard, Strider, Arcanist, Warden or Reaver. Later, paths can be combined. Choose how you fight, not what you are.',
            options: [{ text: 'Understood.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Train hard.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
      },
      {
        id: 'guard_tobin',
        name: 'Guard Tobin',
        title: 'Elaris Watch',
        faction: 'elaris',
        x: 18,
        z: -2,
        zoneId: 'elaris',
        role: 'guard',
        color: '#78909c',
        dialogue: [
          {
            id: 'greet',
            text: 'Gate is open. What lies beyond is not friendly — mind the road.',
            options: [
              { text: 'Where should I go first?', next: 'advice' },
              { text: 'Farewell.', next: 'bye' },
            ],
          },
          {
            id: 'advice',
            text: 'Greenreach has wolves and ore for the taking. The Hollow entrance is east past the ruins — but that is a group endeavour.',
            options: [{ text: 'Thanks.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Stay sharp.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
      },
      {
        id: 'ranger_cass',
        name: 'Ranger Cass',
        title: 'Greenreach Rangers',
        faction: 'greenreach_rangers',
        x: -24,
        z: 30,
        zoneId: 'greenreach',
        role: 'quest',
        color: '#aed581',
        dialogue: [
          {
            id: 'greet',
            text: 'Elaris sends its newcomers here to learn what wild means. You look no different — but prove me wrong.',
            options: [
              { text: "What's happening out here?", next: 'story' },
              { text: 'Farewell.', next: 'bye' },
            ],
          },
          {
            id: 'story',
            text: 'Wolves travel in packs now, boars are feral, and the wisps drift closer to the road each night. The Veil is thinning here.',
            options: [{ text: 'I will be careful.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'Keep your blade loose.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
      },
      {
        id: 'hermit_vae',
        name: 'Hermit Vae',
        title: 'Fracture Scholar',
        faction: 'wardens',
        x: 40,
        z: -42,
        zoneId: 'greenreach',
        role: 'flavor',
        color: '#ce93d8',
        dialogue: [
          {
            id: 'greet',
            text: 'Ah, a visitor. I camp near the old camp because the Veil sings loudest here. Can you hear it?',
            options: [
              { text: 'I hear nothing.', next: 'nothing' },
              { text: 'What happened at this camp?', next: 'camp' },
              { text: 'Farewell.', next: 'bye' },
            ],
          },
          {
            id: 'nothing',
            text: 'Not yet. You will. Those who cross the Veil always begin to hear it eventually.',
            options: [{ text: 'Comforting.', next: 'bye' }],
          },
          {
            id: 'camp',
            text: 'A caravan was dragged off three nights ago. Not by wolves. Whatever took it walked on two legs and left no footprints.',
            options: [{ text: 'I will investigate.', next: 'bye' }],
          },
          {
            id: 'bye',
            text: 'The Veil remembers, Wayfarer.',
            options: [{ text: 'Farewell.', next: 'bye', action: { type: 'close' } }],
          },
        ],
      },
    ] as NPCDef[]
  ).map((n) => [n.id, n]),
);
