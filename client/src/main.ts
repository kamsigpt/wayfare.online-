import { ARCHETYPES } from '@shared/content/abilities.js';
import { ZONES } from '@shared/content/zones.js';
import { ITEMS } from '@shared/content/items.js';
import type { ClientMessage, SerializedPlayer, ServerMessage } from '@shared/protocol.js';
import type { ArchetypeId } from '@shared/types.js';
import { GameView } from './game.js';
import { Hud } from './ui.js';
import { OnlineTransport } from './net.js';
import { OfflineTransport } from './offline.js';
import { audio } from './audio.js';
import { defaultServerUrl, type NetStatus, type Transport } from './transport.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let transport: Transport | null = null;
let game: GameView | null = null;
let hud: Hud | null = null;
let selectedChar = 0;
let abilityIds: string[] = [];
let lastLevel = 1;
let pendingEnter = false;

function setServerStatus(status: NetStatus) {
  hud?.setServerStatus(status === 'online' ? 'connected' : status);
  void pendingEnter;
}

// ---------------------------------------------------------------- start screen

function buildArchetypePicker() {
  const picker = $('archetype-picker');
  picker.innerHTML = '';
  const ids = Object.keys(ARCHETYPES) as ArchetypeId[];
  const preferred: ArchetypeId[] = ['vanguard', 'strider', 'arcanist', 'wayfarer', 'warden', 'reaver'];
  const order = preferred.filter((p) => ids.includes(p));
  let selected: ArchetypeId = order[0] ?? ids[0];
  for (const id of order) {
    const a = ARCHETYPES[id];
    const div = document.createElement('div');
    div.className = `archetype ${id === selected ? 'sel' : ''}`;
    div.innerHTML = `<div class="dot" style="background:${a.color}"></div>${a.name}`;
    div.title = a.description;
    div.addEventListener('click', () => {
      selected = id;
      picker.querySelectorAll('.archetype').forEach((el) => el.classList.remove('sel'));
      div.classList.add('sel');
      picker.dataset.sel = id;
    });
    picker.appendChild(div);
  }
  picker.dataset.sel = selected;
}

function showStartError(msg: string) {
  $('start-error').textContent = msg;
}

function startConnection(transportImpl: Transport) {
  setServerStatus('connecting');
  transport = transportImpl;
  transport.onStatus((s, detail) => {
    setServerStatus(s);
    if (s === 'error' && detail) showStartError(detail);
    if (s === 'offline' && game) {
      hud?.addChat('system', 'Disconnected from server.', true);
    }
  });
  transport.onMessage(handleMessage);
  if (transportImpl instanceof OnlineTransport) transportImpl.connect();
}

function doLogin() {
  const account = $<HTMLInputElement>('in-account').value.trim();
  const password = $<HTMLInputElement>('in-password').value;
  if (account.length < 3 || password.length < 3) { showStartError('Account and password must be at least 3 characters.'); return; }
  const server = $<HTMLInputElement>('in-server').value.trim() || defaultServerUrl();
  localStorage.setItem('wf_account', account);
  localStorage.setItem('wf_server', server);
  showStartError('');
  startConnection(new OnlineTransport(server));
  const send = (m: ClientMessage) => transport?.send(m);
  // wait a tick for socket open via status handler
  transport!.onStatus((s) => {
    if (s === 'online') {
      send({ t: 'login', account, password });
    }
  });
}

function doRegister() {
  const account = $<HTMLInputElement>('in-account').value.trim();
  const password = $<HTMLInputElement>('in-password').value;
  const name = $<HTMLInputElement>('in-charname').value.trim() || account;
  const archetype = ($('archetype-picker').dataset.sel as ArchetypeId) ?? 'vanguard';
  if (account.length < 3 || password.length < 3) { showStartError('Account and password must be at least 3 characters.'); return; }
  if (name.length < 2) { showStartError('Character name must beat least 2 characters.'); return; }
  const server = $<HTMLInputElement>('in-server').value.trim() || defaultServerUrl();
  localStorage.setItem('wf_account', account);
  localStorage.setItem('wf_server', server);
  showStartError('');
  startConnection(new OnlineTransport(server));
  transport!.onStatus((s) => {
    if (s === 'online') transport!.send({ t: 'register', account, password, characterName: name, archetype });
  });
}

function doOffline() {
  const account = $<HTMLInputElement>('in-account').value.trim() || 'wanderer';
  const name = $<HTMLInputElement>('in-charname').value.trim() || 'Wanderer';
  const archetype = ($('archetype-picker').dataset.sel as ArchetypeId) ?? 'vanguard';
  showStartError('');
  const t = new OfflineTransport();
  startConnection(t);
  t.send({ t: 'register', account, password: 'offline', characterName: name, archetype });
}

// ---------------------------------------------------------------- server messages

function handleMessage(msg: ServerMessage) {
  switch (msg.t) {
    case 'welcome':
      break;
    case 'login_ok':
      renderCharacters(msg.characters);
      $('screen-start').classList.add('hidden');
      $('screen-characters').classList.remove('hidden');
      break;
    case 'error':
      if (game) hud?.addChat('system', msg.message, true);
      else showStartError(msg.message);
      break;
    case 'enter':
      beginGame(msg.player, msg.abilities);
      break;
    case 'snapshot':
      if (!game || !hud) return;
      game.applySnapshot(msg);
      hud.setVitals(msg.you);
      hud.setCooldowns(msg.you.cooldowns);
      hud.updateMinimap(msg.you, msg.entities, msg.you.zoneId);
      if (msg.you.level > lastLevel) { audio.levelUp(); hud.toast(`Level ${msg.you.level}!`); lastLevel = msg.you.level; }
      break;
    case 'zone_change':
      game?.setZone(msg.zoneId, msg.x, msg.z);
      hud?.setVitals(msg.you);
      hud?.toast(`Entered ${ZONES[msg.zoneId]?.name ?? msg.zoneId}`);
      audio.portal();
      break;
    case 'combat':
      handleCombat(msg);
      break;
    case 'loot':
      if (msg.ground.length) { audio.loot(); hud?.toast('Loot dropped nearby'); }
      break;
    case 'chat':
      hud?.addChat(msg.from, msg.text, msg.channel === 'system');
      break;
    case 'inventory':
      hud?.setInventory(msg.inventory, msg.equipment, msg.gold);
      break;
    case 'quest_update':
      hud?.setQuestTracker(msg.quests);
      autoQuestToasts(msg);
      break;
    case 'progress':
      if (msg.level > lastLevel) lastLevel = msg.level;
      break;
    case 'ability_unlocked':
      hud?.toast(`New ability: ${msg.ability.name}`);
      hud?.addChat('system', `You learned ${msg.ability.name}!`, true);
      break;
    case 'gathering_result':
      if (msg.success) { audio.gather(); hud?.toast(`Gathered ${msg.items.map((i) => ITEMS[i.defId]?.name ?? i.defId).join(', ')} (+${msg.xp} xp)`); }
      else hud?.toast('You cannot gather that yet');
      break;
    case 'craft_result':
      if (msg.success) { audio.loot(); hud?.toast(`Crafted ${msg.items.map((i) => ITEMS[i.defId]?.name ?? i.defId).join(', ')}`); }
      else hud?.toast('Missing materials or skill');
      break;
    case 'npc_dialogue':
      hud?.showDialogue(msg);
      break;
    case 'death':
      audio.death();
      hud?.showDeath(msg.xpLost);
      break;
    case 'respawned':
      hud?.hideDeath();
      game?.setZone(msg.you.zoneId, msg.you.x, msg.you.z);
      hud?.setVitals(msg.you);
      break;
    case 'world_event':
      if (msg.type === 'boss_slain') hud?.toast(`${(msg.data as { name?: string }).name ?? 'A boss'} has been defeated!`);
      break;
    case 'player_joined':
      hud?.addChat('system', `${msg.name} (Lv ${msg.level}) has entered the world.`, true);
      break;
    case 'player_left':
      hud?.addChat('system', `${msg.name} has left the world.`, true);
      break;
    default:
      break;
  }
}

function autoQuestToasts(msg: Extract<ServerMessage, { t: 'quest_update' }>) {
  if (msg.accepted) hud?.toast('Quest accepted');
  if (msg.turnedIn) { hud?.toast('Quest complete!'); audio.quest(); }
}

function handleCombat(msg: Extract<ServerMessage, { t: 'combat' }>) {
  if (!game || !hud) return;
  for (const e of msg.events) {
    if (e.kind === 'damage' || e.kind === 'crit') {
      const at = game.projectToScreen(e.atX ?? game.local.x, (e.atY ?? 1) + 0.6, e.atZ ?? game.local.z);
      if (at.visible) hud.floater(at.x, at.y, `${e.amount ?? 0}`, e.crit ? 'crit' : 'dmg');
      if (e.sourceId === game.localPlayerId || e.crit) { if (e.crit) audio.crit(); else audio.hit(); }
      if (e.crit) game.triggerShake(0.35);
    } else if (e.kind === 'heal') {
      const at = game.projectToScreen(game.local.x, 2.2, game.local.z);
      hud.floater(at.x, at.y, `+${e.amount ?? 0}`, 'heal');
      audio.heal();
    } else if (e.kind === 'miss' || e.kind === 'dodge' || e.kind === 'block') {
      const at = game.projectToScreen(e.atX ?? game.local.x, (e.atY ?? 1) + 0.6, e.atZ ?? game.local.z);
      if (at.visible) hud.floater(at.x, at.y, e.kind === 'block' ? 'Blocked' : 'Miss', 'miss');
      audio.miss();
    } else if (e.kind === 'death') {
      audio.death();
    } else if (e.kind === 'xp') {
      const at = game.projectToScreen(game.local.x, 2.6, game.local.z);
      hud.floater(at.x, at.y, e.label ?? '', 'xp');
    }
  }
}

function beginGame(player: SerializedPlayer, abilities: { id: string; name: string }[]) {
  $('screen-start').classList.add('hidden');
  $('screen-characters').classList.add('hidden');
  $('hud').classList.remove('hidden');
  hud = new Hud({ send: (m) => transport?.send(m), onRespawn: () => transport?.send({ t: 'respawn' }) });
  hud.onAbilitySlot = (slot) => {
    const id = abilityIds[slot];
    if (id) transport?.send({ t: 'ability', seq: Date.now() % 100000, abilityId: id });
  };
  abilityIds = abilities.map((a) => a.id);
  hud.setAbilities(abilities);
  lastLevel = player.level;

  if (!game) {
    const canvas = $<HTMLCanvasElement>('game-canvas');
    game = new GameView(canvas, {
      send: (m) => transport?.send(m),
      floater: (x, y, text, cls) => hud?.floater(x, y, text, cls),
      onTarget: (id, name, hp, max) => (id === null ? hud?.clearTarget() : hud?.setTarget(name, hp, max)),
      onInteractPrompt: (t) => hud?.setInteractPrompt(t),
      onZone: (z) => hud?.setZoneName(ZONES[z]?.name ?? z),
      onAbilitySlot: (n) => {
        const id = abilityIds[n];
        if (id) transport?.send({ t: 'ability', seq: Date.now() % 100000, abilityId: id });
      },
    });
  }
  game.setZone(player.zoneId, player.x, player.z);
  hud.setZoneName(ZONES[player.zoneId]?.name ?? player.zoneId);
  hud.setVitals(player);
  hud.addChat('system', 'Welcome to WAYFARE.ONLINE. Talk to NPCs with E, fight with LMB or Space.', true);
  const mode = transport?.online ? 'online' : 'offline single-player';
  hud.addChat('system', `Mode: ${mode}.`, true);
}

function renderCharacters(chars: { id: string; name: string; level: number; archetype: ArchetypeId; zoneId: string }[]) {
  const list = $('character-list');
  list.innerHTML = '';
  selectedChar = 0;
  if (!chars.length) {
    list.innerHTML = '<p style="color:var(--muted)">No characters. Create one to begin.</p>';
  }
  chars.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = `character-card ${i === 0 ? 'sel' : ''}`;
    card.innerHTML = `<div><b>${c.name}</b><br><small>Lv ${c.level} ${ARCHETYPES[c.archetype]?.name ?? c.archetype}</small></div><small>${ZONES[c.zoneId]?.name ?? c.zoneId}</small>`;
    card.addEventListener('click', () => {
      selectedChar = i;
      list.querySelectorAll('.character-card').forEach((el) => el.classList.remove('sel'));
      card.classList.add('sel');
      $<HTMLButtonElement>('btn-enter').disabled = false;
    });
    list.appendChild(card);
  });
  $<HTMLButtonElement>('btn-enter').disabled = chars.length === 0;
}

// ---------------------------------------------------------------- keyboard & buttons

function wireInput() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (e.code === 'Enter' && !typing && hud) {
      $<HTMLInputElement>('chat-input').focus();
      e.preventDefault();
      return;
    }
    if (typing) {
      if (e.code === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.code === 'Escape') {
        (e.target as HTMLInputElement).blur();
        $<HTMLInputElement>('chat-input').value = '';
      }
      return;
    }
    if (!hud) return;
    switch (e.code) {
      case 'KeyI': hud.togglePanel('panel-inventory'); break;
      case 'KeyK': hud.togglePanel('panel-skills'); break;
      case 'KeyJ': hud.togglePanel('panel-quests'); break;
      case 'KeyC': hud.togglePanel('panel-crafting'); break;
      case 'Escape':
        ['panel-inventory', 'panel-skills', 'panel-quests', 'panel-crafting', 'panel-settings'].forEach((p) => hud!.closePanel(p));
        hud.hideDialogue();
        break;
      case 'Slash':
        $<HTMLInputElement>('chat-input').focus();
        e.preventDefault();
        break;
    }
  });

  const chat = $<HTMLInputElement>('chat-input');
  chat.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      const text = chat.value.trim();
      if (text) transport?.send({ t: 'chat', channel: 'world', text });
      chat.value = '';
      chat.blur();
    }
  });
  chat.addEventListener('blur', () => {
    // gameplay keys resume; ensure no key sticks
  });

  $('btn-login').addEventListener('click', () => { audio.ui(); doLogin(); });
  $('btn-register').addEventListener('click', () => { audio.ui(); doRegister(); });
  $('btn-offline').addEventListener('click', () => { audio.ui(); doOffline(); });
  $('btn-enter').addEventListener('click', () => { audio.ui(); transport?.send({ t: 'enter_world' }); });
  $('btn-logout').addEventListener('click', () => {
    transport?.dispose();
    transport = null;
    game?.dispose();
    game = null;
    hud = null;
    $('hud').classList.add('hidden');
    $('screen-characters').classList.add('hidden');
    $('screen-start').classList.remove('hidden');
  });
  $('btn-respawn').addEventListener('click', () => transport?.send({ t: 'respawn' }));
  $('create-new')?.addEventListener('click', () => $('register-extra').setAttribute('open', 'open'));

  // settings
  $<HTMLSelectElement>('set-quality').addEventListener('change', (e) => game?.setQuality((e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high'));
  $<HTMLInputElement>('set-distance').addEventListener('input', (e) => game?.setDrawDistance(Number((e.target as HTMLInputElement).value)));
  $<HTMLInputElement>('set-pixel').addEventListener('input', (e) => game?.setPixelSize(Number((e.target as HTMLInputElement).value)));
  $<HTMLInputElement>('set-volume').addEventListener('input', (e) => audio.setVolume(Number((e.target as HTMLInputElement).value) / 100));
  $<HTMLInputElement>('set-invert').addEventListener('change', (e) => game?.setInvertY((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('set-shake').addEventListener('change', (e) => game?.setShake((e.target as HTMLInputElement).checked));

  // settings button (keyboard: O)
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'KeyO') hud?.togglePanel('panel-settings');
  });
}

function boot() {
  buildArchetypePicker();
  const acct = localStorage.getItem('wf_account');
  if (acct) $<HTMLInputElement>('in-account').value = acct;
  const srv = localStorage.getItem('wf_server');
  $<HTMLInputElement>('in-server').value = srv ?? defaultServerUrl();
  $('start-hint').textContent = `Tip: use Offline mode to play instantly, or run the server with "npm start" and use the server URL above.`;
  wireInput();

  window.addEventListener('resize', () => game?.engine.resize());
  window.addEventListener('beforeunload', () => transport?.send({ t: 'unload' }));
}

boot();
