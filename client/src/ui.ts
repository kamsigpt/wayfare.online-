import { ITEMS } from '@shared/content/items.js';
import { ABILITIES, ARCHETYPES } from '@shared/content/abilities.js';
import { QUESTS } from '@shared/content/quests.js';
import { RECIPES } from '@shared/content/recipes.js';
import { ENEMIES } from '@shared/content/enemies.js';
import { NPCS } from '@shared/content/npcs.js';
import { RARITY_COLORS, SKILL_XP_CURVE, XP_CURVE } from '@shared/constants.js';
import type { ClientMessage, SerializedPlayer, ServerMessage, SnapshotEntity } from '@shared/protocol.js';
import type { EquipSlot, ItemInstance, QuestObjective, QuestState } from '@shared/types.js';
import { ZONES } from '@shared/content/zones.js';

export interface UiHandlers {
  send: (msg: ClientMessage) => void;
  onRespawn: () => void;
}

const SLOT_ORDER: EquipSlot[] = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet', 'trinket'];

export class Hud {
  private el: (id: string) => HTMLElement;
  private you: SerializedPlayer | null = null;
  private abilities: { id: string; name: string; key: string }[] = [];
  private cooldowns: Record<string, number> = {};
  private tooltip: HTMLDivElement;
  private quests: QuestState[] = [];

  onAbilitySlot: ((slot: number) => void) | null = null;

  constructor(private h: UiHandlers) {
    const $ = (id: string) => document.getElementById(id) as HTMLElement;
    this.el = $;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    document.body.appendChild(this.tooltip);

    // panel open/close buttons
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => {
      b.addEventListener('click', () => this.closePanel(b.dataset.close!));
    });
    this.buildMinimapBase();
  }

  // ------------------------------------------------------------------ vitals
  setVitals(you: SerializedPlayer) {
    this.you = you;
    this.el('v-name').textContent = you.name;
    const arch = ARCHETYPES[you.archetype]?.name ?? you.archetype;
    this.el('v-sub').textContent = `Level ${you.level} ${arch}`;
    this.bar('bar-hp', 'txt-hp', you.health, you.maxHealth, `${Math.round(you.health)}/${you.maxHealth}`);
    this.bar('bar-mp', 'txt-mp', you.mana, you.maxMana, `${Math.round(you.mana)}/${you.maxMana}`);
    this.bar('bar-sp', 'txt-sp', you.stamina, you.maxStamina, `${Math.round(you.stamina)}/${you.maxStamina}`);
    this.bar('bar-xp', 'txt-xp', you.xp, you.xpToLevel, `${Math.round(you.xp)}/${you.xpToLevel}`);
    const momMax = you.momentumMax || 100;
    this.bar('bar-mom', 'txt-mom', you.momentum, momMax, `Momentum ${Math.round(you.momentum)}`);
  }

  private bar(fillId: string, txtId: string, val: number, max: number, text: string) {
    const pct = max > 0 ? Math.max(0, Math.min(1, val / max)) * 100 : 0;
    const fill = this.el(fillId);
    if (fill) fill.style.width = `${pct}%`;
    const txt = this.el(txtId);
    if (txt) txt.textContent = text;
  }

  setAbilities(list: { id: string; name: string }[]) {
    this.abilities = list.map((a, i) => ({ ...a, key: String(i + 1) }));
    const bar = this.el('actionbar');
    bar.innerHTML = '';
    this.abilities.forEach((a, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const ability = ABILITIES[a.id];
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="nm">${a.name}</span>`;
      slot.title = ability ? `${ability.name} — ${ability.description}` : a.name;
      slot.addEventListener('click', () => this.onAbilitySlot?.(i));
      bar.appendChild(slot);
    });
    // attack + dodge + interact
    const extra = [
      { key: 'LMB', name: 'Attack' },
      { key: 'Shift', name: 'Dodge' },
      { key: 'E', name: 'Interact' },
    ];
    for (const x of extra) {
      const slot = document.createElement('div');
      slot.className = 'slot locked';
      slot.innerHTML = `<span class="key">${x.key}</span><span class="nm">${x.name}</span>`;
      bar.appendChild(slot);
    }
  }

  setCooldowns(cooldowns: Record<string, number>) {
    this.cooldowns = cooldowns;
  }

  setInventory(inventory: (ItemInstance | null)[], equipment: Partial<Record<EquipSlot, ItemInstance>>, gold: number) {
    if (!this.you) return;
    this.you.inventory = inventory;
    this.you.equipment = equipment;
    this.you.gold = gold;
    if (!document.getElementById('panel-inventory')?.classList.contains('hidden')) this.renderInventory();
  }

  setZoneName(name: string) {
    this.el('zone-name').textContent = name;
  }

  setServerStatus(text: string) {
    this.el('server-status').textContent = text;
  }

  // ------------------------------------------------------------------ chat
  addChat(from: string, text: string, sys = false) {
    const log = this.el('chat-log');
    const div = document.createElement('div');
    div.className = 'msg';
    if (sys) {
      div.innerHTML = `<span class="sys">${escapeHtml(text)}</span>`;
    } else {
      div.innerHTML = `<span class="from">${escapeHtml(from)}:</span> ${escapeHtml(text)}`;
    }
    log.appendChild(div);
    while (log.childElementCount > 120) log.removeChild(log.firstChild!);
    log.scrollTop = log.scrollHeight;
  }

  toast(text: string) {
    const box = this.el('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  floater(x: number, y: number, text: string, cls: string) {
    const box = this.el('floaters');
    const f = document.createElement('div');
    f.className = `floater ${cls}`;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.textContent = text;
    box.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }

  // ------------------------------------------------------------------ target / interact
  setTarget(name: string, hp: number, max: number) {
    const frame = this.el('target-frame');
    frame.classList.remove('hidden');
    this.el('target-name').textContent = name;
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) * 100 : 0;
    this.el('bar-target-hp').style.width = `${pct}%`;
  }

  clearTarget() {
    this.el('target-frame').classList.add('hidden');
  }

  setInteractPrompt(text: string | null) {
    const p = this.el('interact-prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    p.textContent = text;
  }

  // ------------------------------------------------------------------ panels
  togglePanel(id: string) {
    const p = document.getElementById(id);
    if (!p) return;
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) this.refreshPanel(id);
  }

  closePanel(id: string) {
    document.getElementById(id)?.classList.add('hidden');
  }

  anyPanelOpen(): boolean {
    return ['panel-inventory', 'panel-skills', 'panel-quests', 'panel-crafting', 'panel-settings'].some((id) => !document.getElementById(id)?.classList.contains('hidden'));
  }

  private refreshPanel(id: string) {
    if (!this.you) return;
    if (id === 'panel-inventory') this.renderInventory();
    if (id === 'panel-skills') this.renderSkills();
    if (id === 'panel-quests') this.renderQuests();
    if (id === 'panel-crafting') this.renderCrafting();
  }

  private renderInventory() {
    const you = this.you!;
    this.el('inv-gold').textContent = String(you.gold);
    const eq = this.el('equipment');
    eq.innerHTML = '';
    for (const slot of SLOT_ORDER) {
      const item = you.equipment[slot];
      const d = document.createElement('div');
      d.className = `equip-slot ${item ? 'filled' : ''}`;
      d.innerHTML = `<div>${slot}</div><div>${item ? ITEMS[item.defId]?.name ?? item.defId : '—'}</div>`;
      if (item) d.addEventListener('click', () => this.h.send({ t: 'unequip', slot }));
      this.attachTooltip(d, item);
      eq.appendChild(d);
    }
    const grid = this.el('inventory');
    grid.innerHTML = '';
    you.inventory.forEach((item, i) => {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      if (item) {
        const def = ITEMS[item.defId];
        d.innerHTML = `<span class="nm">${def?.name ?? item.defId}${item.qty > 1 ? `<span class="qty">x${item.qty}</span>` : ''}</span>`;
        if (def) d.style.borderColor = RARITY_COLORS[(def.rarity ?? 'common') as keyof typeof RARITY_COLORS];
        d.addEventListener('click', () => this.useOrEquip(item));
        d.addEventListener('contextmenu', (e) => { e.preventDefault(); this.h.send({ t: 'drop_item', uid: item.uid, qty: 1 }); });
        this.attachTooltip(d, item);
      }
      grid.appendChild(d);
      void i;
    });
  }

  private useOrEquip(item: ItemInstance) {
    const def = ITEMS[item.defId];
    if (!def) return;
    if (def.kind === 'consumable') this.h.send({ t: 'use_item', uid: item.uid });
    else if (def.equipSlot) this.h.send({ t: 'equip', uid: item.uid, slot: def.equipSlot });
    else this.h.send({ t: 'use_item', uid: item.uid });
  }

  private attachTooltip(node: HTMLElement, item: ItemInstance | undefined) {
    if (!item) return;
    const def = ITEMS[item.defId];
    if (!def) return;
    node.addEventListener('mouseenter', () => {
      const stats: string[] = [];
      if (def.stats) for (const [k, v] of Object.entries(def.stats)) stats.push(`${k}: ${v > 0 ? '+' : ''}${v}`);
      if (def.modifiers) stats.push(`modifiers: ${def.modifiers.length}`);
      this.tooltip.innerHTML = `<div class="tname" style="color:${RARITY_COLORS[(def.rarity ?? 'common') as keyof typeof RARITY_COLORS]}">${def.name}</div>
        <div>${def.kind}${def.equipSlot ? ` · ${def.equipSlot}` : ''}</div>
        ${stats.length ? `<div class="tstat">${stats.join('<br>')}</div>` : ''}
        ${def.description ? `<div class="tflavor">${def.description}</div>` : ''}`;
      this.tooltip.classList.remove('hidden');
    });
    node.addEventListener('mousemove', (e) => {
      this.tooltip.style.left = `${e.clientX + 14}px`;
      this.tooltip.style.top = `${e.clientY + 14}px`;
    });
    node.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
  }

  private renderSkills() {
    const you = this.you!;
    const list = this.el('skill-list');
    list.innerHTML = '<h4 style="margin:0 0 6px">Skills</h4>';
    for (const [skill, level] of Object.entries(you.skillLevels)) {
      const xp = you.skillXp[skill as keyof typeof you.skillXp] ?? 0;
      const need = SKILL_XP_CURVE(level);
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = `<span>${skill}</span><span>Lv ${level} · ${Math.round(xp)}/${need}</span>`;
      list.appendChild(row);
    }
    const abilities = this.el('ability-list');
    abilities.innerHTML = '<h4 style="margin:0 0 6px">Abilities</h4>';
    for (const id of you.abilities) {
      const a = ABILITIES[id];
      if (!a) continue;
      const card = document.createElement('div');
      card.className = 'ability-card';
      const cd = a.cooldown ? `${a.cooldown}s cooldown` : 'no cooldown';
      const cost = [a.resourceCost?.mana ? `${a.resourceCost.mana} mana` : '', a.resourceCost?.stamina ? `${a.resourceCost.stamina} stamina` : ''].filter(Boolean).join(', ');
      card.innerHTML = `<div class="an">${a.name}</div><div class="ad">${a.description}</div><div class="cost">${cd}${cost ? ` · ${cost}` : ''}</div>`;
      abilities.appendChild(card);
    }
  }

  private renderQuests() {
    const you = this.you!;
    const list = this.el('quest-list');
    list.innerHTML = '';
    for (const q of you.quests) {
      const def = QUESTS[q.questId];
      if (!def) continue;
      const card = document.createElement('div');
      card.className = `quest-card ${q.status === 'active' ? 'active' : ''}`;
      const objs = def.stages[Math.min(q.stage, def.stages.length - 1)].objectives.map((o, i) => {
        const p = q.progress[i] ?? 0;
        return `<div class="obj">${describeObjective(o)} (${p}/${'count' in o ? o.count : 1})</div>`;
      }).join('');
      card.innerHTML = `<h5>${def.name}<span class="tag">${q.status}</span></h5><div class="obj">${def.description}</div>${objs}`;
      if (q.status === 'active' && this.questComplete(q)) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = 'Turn In';
        btn.addEventListener('click', () => this.h.send({ t: 'turn_in_quest', questId: q.questId }));
        card.appendChild(btn);
      }
      list.appendChild(card);
    }
    if (!list.childElementCount) list.innerHTML = '<p style="color:var(--muted)">No quests yet. Talk to NPCs in Elaris.</p>';
  }

  private questComplete(q: { questId: string; stage: number; progress: number[]; status: string }): boolean {
    const def = QUESTS[q.questId];
    if (!def) return false;
    const stage = def.stages[Math.min(q.stage, def.stages.length - 1)];
    return stage.objectives.every((o, i) => (q.progress[i] ?? 0) >= ('count' in o ? o.count : 1));
  }

  private renderCrafting() {
    const list = this.el('recipe-list');
    list.innerHTML = '';
    if (!this.you) return;
    for (const [id, r] of Object.entries(RECIPES)) {
      if (!r.outputs) continue;
      const card = document.createElement('div');
      card.className = 'recipe-card';
      const inputs = r.inputs.map((inp) => {
        const have = countInInventory(this.you!, inp.itemId);
        return `<span style="color:${have >= inp.qty ? 'var(--good)' : 'var(--bad)'}">${ITEMS[inp.itemId]?.name ?? inp.itemId} ${have}/${inp.qty}</span>`;
      }).join(', ');
      card.innerHTML = `<div class="an">${r.name}</div><div class="ad">${r.skill} Lv ${r.skillLevel} · ${inputs}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Craft';
      btn.addEventListener('click', () => this.h.send({ t: 'craft', recipeId: id }));
      card.appendChild(btn);
      list.appendChild(card);
    }
  }

  // ------------------------------------------------------------------ dialogue
  showDialogue(msg: Extract<ServerMessage, { t: 'npc_dialogue' }>) {
    const dlg = this.el('dialogue');
    dlg.classList.remove('hidden');
    this.el('dlg-npc').textContent = msg.npc.name;
    this.el('dlg-text').textContent = msg.text;
    const opts = this.el('dlg-options');
    opts.innerHTML = '';
    for (const o of msg.options) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = o.text;
      b.addEventListener('click', () => this.chooseDialogue(msg, o));
      opts.appendChild(b);
    }
  }

  private chooseDialogue(msg: Extract<ServerMessage, { t: 'npc_dialogue' }>, option: { text: string; next?: string; action?: string }) {
    if (option.action) {
      const action = JSON.parse(option.action) as { type: string; questId?: string; abilityId?: string; cost?: number };
      if (action.type === 'open_shop') this.toast('Shop coming soon');
      else if (action.type === 'open_bank') this.toast('Bank coming soon');
      else if (action.type === 'accept_quest' && action.questId) this.h.send({ t: 'accept_quest', questId: action.questId });
      else if (action.type === 'turn_in_quest' && action.questId) this.h.send({ t: 'turn_in_quest', questId: action.questId });
      else if (action.type === 'close') this.hideDialogue();
    }
    if (option.next) {
      this.h.send({ t: 'interact', targetId: npcEntityIdFor(msg.npcId), kind: 'npc' });
    } else {
      this.hideDialogue();
    }
  }

  hideDialogue() {
    this.el('dialogue').classList.add('hidden');
  }

  // ------------------------------------------------------------------ quest tracker
  setQuestTracker(quests: QuestState[]) {
    this.quests = quests;
    const box = this.el('quest-tracker');
    box.innerHTML = '<h4>Active Quests</h4>';
    let any = false;
    for (const q of quests) {
      if (q.status !== 'active') continue;
      const def = QUESTS[q.questId];
      if (!def) continue;
      any = true;
      const stage = def.stages[Math.min(q.stage, def.stages.length - 1)];
      const objs = stage.objectives.map((o, i) => `<div class="qt-obj">• ${describeObjective(o)} (${q.progress[i] ?? 0}/${'count' in o ? o.count : 1})</div>`).join('');
      const item = document.createElement('div');
      item.className = 'qt-item';
      item.innerHTML = `<div class="qt-name">${def.name}</div>${objs}`;
      box.appendChild(item);
    }
    if (!any) box.innerHTML = '';
  }

  // ------------------------------------------------------------------ minimap
  private minimapBase: HTMLCanvasElement | null = null;

  private buildMinimapBase() {
    this.minimapBase = this.el('minimap') as HTMLCanvasElement;
  }

  updateMinimap(you: SerializedPlayer, entities: SnapshotEntity[], zoneId: string) {
    const canvas = this.minimapBase;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const zone = ZONES[zoneId] ?? ZONES.elaris;
    const range = 70;
    const scale = canvas.width / (range * 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8,12,18,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const toMap = (x: number, z: number) => ({
      mx: canvas.width / 2 + (x - you.x) * scale,
      my: canvas.height / 2 + (z - you.z) * scale,
    });

    // obstacles faint
    ctx.fillStyle = 'rgba(90,105,125,0.35)';
    for (const o of zone.obstacles) {
      const p = toMap(o.x, o.z);
      ctx.fillRect(p.mx - 1, p.my - 1, 2.5, 2.5);
    }
    for (const e of entities) {
      const p = toMap(e.x, e.z);
      if (p.mx < 0 || p.my < 0 || p.mx > canvas.width || p.my > canvas.height) continue;
      if (e.kind === 'enemy') ctx.fillStyle = '#e05b5b';
      else if (e.kind === 'npc') ctx.fillStyle = '#ffd54f';
      else if (e.kind === 'player') ctx.fillStyle = '#4ea1ff';
      else if (e.kind === 'node') ctx.fillStyle = '#7bea90';
      else if (e.kind === 'ground') ctx.fillStyle = '#ffcc66';
      else continue;
      ctx.beginPath();
      ctx.arc(p.mx, p.my, e.kind === 'player' ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // self
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  setLoading(visible: boolean, text?: string) {
    const l = this.el('loading');
    l.classList.toggle('hidden', !visible);
    if (text) this.el('loading-text').textContent = text;
  }

  showDeath(xpLost: number) {
    this.el('death-overlay').classList.remove('hidden');
    this.el('death-xp').textContent = xpLost > 0 ? `You lost ${xpLost} experience.` : 'You awaken at the nearest shrine.';
  }

  hideDeath() {
    this.el('death-overlay').classList.add('hidden');
  }
}

function countInInventory(you: SerializedPlayer, itemId: string): number {
  let n = 0;
  for (const s of you.inventory) if (s && s.defId === itemId) n += s.qty;
  return n;
}

function describeObjective(o: QuestObjective): string {
  switch (o.type) {
    case 'kill': return `Defeat ${o.count} ${ENEMIES[o.enemyId]?.name ?? o.enemyId}`;
    case 'collect': return `Collect ${o.count} ${ITEMS[o.itemId]?.name ?? o.itemId}`;
    case 'gather': return `Gather with ${o.skill} ${o.count} times`;
    case 'reach': return `Travel to ${ZONES[o.zoneId]?.name ?? o.zoneId}`;
    case 'craft': return `Craft ${o.count} item(s)`;
    case 'talk': return `Talk to ${NPCS[o.npcId]?.name ?? o.npcId}`;
    case 'deliver': return `Deliver ${ITEMS[o.itemId]?.name ?? o.itemId} to ${NPCS[o.npcId]?.name ?? o.npcId}`;
    default: return String((o as { type: string }).type);
  }
}

function npcEntityIdFor(npcId: string): number {
  let h = 2_000_000;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) >>> 0;
  return (h % 1_000_000) + 2_000_000;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export { XP_CURVE, NPCS };
