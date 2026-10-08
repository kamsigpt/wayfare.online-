import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PlayerState, ZoneId } from '@shared/types.js';

export interface AccountRecord {
  account: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  lastLogin: number;
  banned?: boolean;
}

export interface CharacterRecord {
  id: string;
  account: string;
  name: string;
  state: PlayerState;
  createdAt: number;
  lastSeen: number;
}

export interface WorldStateRecord {
  flags: Record<string, number | string | boolean>;
  events: { id: string; type: string; data: Record<string, unknown>; at: number }[];
}

/**
 * StorageAdapter is the persistence boundary. The default implementation writes
 * JSON to disk. A PostgreSQL/Supabase adapter can implement the same interface
 * (see docs/DATABASE_SCHEMA.md) without touching gameplay code.
 */
export interface StorageAdapter {
  init(): Promise<void>;
  getAccount(account: string): Promise<AccountRecord | null>;
  saveAccount(record: AccountRecord): Promise<void>;
  getCharacters(account: string): Promise<CharacterRecord[]>;
  getCharacter(id: string): Promise<CharacterRecord | null>;
  saveCharacter(record: CharacterRecord): Promise<void>;
  loadWorld(): Promise<WorldStateRecord>;
  saveWorld(record: WorldStateRecord): Promise<void>;
}

export class FileStorageAdapter implements StorageAdapter {
  private dir: string;
  private accountsDir: string;
  private charactersDir: string;
  private accountCache = new Map<string, AccountRecord>();
  private characterCache = new Map<string, CharacterRecord>();
  private accountIndex = new Map<string, string>();

  constructor(dir: string) {
    this.dir = dir;
    this.accountsDir = join(dir, 'accounts');
    this.charactersDir = join(dir, 'characters');
  }

  async init() {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true });
    if (!existsSync(this.accountsDir)) await mkdir(this.accountsDir, { recursive: true });
    if (!existsSync(this.charactersDir)) await mkdir(this.charactersDir, { recursive: true });
    await this.loadIndex();
  }

  private async loadIndex() {
    const indexPath = join(this.dir, 'accounts.json');
    if (existsSync(indexPath)) {
      try {
        const raw = JSON.parse(await readFile(indexPath, 'utf8')) as { account: string; file: string }[];
        for (const entry of raw) this.accountIndex.set(entry.account.toLowerCase(), entry.file);
      } catch {
        /* corrupt index, start fresh */
      }
    }
    const charsPath = join(this.dir, 'characters.json');
    if (existsSync(charsPath)) {
      try {
        const raw = JSON.parse(await readFile(charsPath, 'utf8')) as { id: string; file: string }[];
        for (const entry of raw) this.characterIndex.set(entry.id, entry.file);
      } catch {
        /* ignore */
      }
    }
  }

  private characterIndex = new Map<string, string>();

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  }

  async getAccount(account: string): Promise<AccountRecord | null> {
    const key = account.toLowerCase();
    if (this.accountCache.has(key)) return this.accountCache.get(key)!;
    const file = this.accountIndex.get(key);
    if (!file) return null;
    try {
      const rec = JSON.parse(await readFile(join(this.accountsDir, file), 'utf8')) as AccountRecord;
      this.accountCache.set(key, rec);
      return rec;
    } catch {
      return null;
    }
  }

  async saveAccount(record: AccountRecord): Promise<void> {
    const key = record.account.toLowerCase();
    const file = `${this.safeName(record.account)}.json`;
    this.accountIndex.set(key, file);
    this.accountCache.set(key, record);
    await this.writeAtomic(join(this.accountsDir, file), record);
    await this.writeAtomic(
      join(this.dir, 'accounts.json'),
      [...this.accountIndex.entries()].map(([account, f]) => ({ account, file: f })),
    );
  }

  async getCharacters(account: string): Promise<CharacterRecord[]> {
    const out: CharacterRecord[] = [];
    for (const [id, file] of this.characterIndex) {
      if (!file.startsWith(`${this.safeName(account)}__`)) continue;
      const rec = await this.getCharacter(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  async getCharacter(id: string): Promise<CharacterRecord | null> {
    if (this.characterCache.has(id)) return this.characterCache.get(id)!;
    const file = this.characterIndex.get(id);
    if (!file) return null;
    try {
      const rec = JSON.parse(await readFile(join(this.charactersDir, file), 'utf8')) as CharacterRecord;
      this.characterCache.set(id, rec);
      return rec;
    } catch {
      return null;
    }
  }

  async saveCharacter(record: CharacterRecord): Promise<void> {
    const file = `${this.safeName(record.account)}__${record.id}.json`;
    this.characterIndex.set(record.id, file);
    this.characterCache.set(record.id, record);
    await this.writeAtomic(join(this.charactersDir, file), record);
    await this.writeAtomic(
      join(this.dir, 'characters.json'),
      [...this.characterIndex.entries()].map(([id, f]) => ({ id, file: f })),
    );
  }

  async loadWorld(): Promise<WorldStateRecord> {
    const path = join(this.dir, 'world.json');
    if (!existsSync(path)) return { flags: {}, events: [] };
    try {
      return JSON.parse(await readFile(path, 'utf8')) as WorldStateRecord;
    } catch {
      return { flags: {}, events: [] };
    }
  }

  async saveWorld(record: WorldStateRecord): Promise<void> {
    await this.writeAtomic(join(this.dir, 'world.json'), record);
  }

  private async writeAtomic(path: string, data: unknown) {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(data), 'utf8');
    await rename(tmp, path);
  }
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString('hex');
  const hash = scryptSync(password, s, 64).toString('hex');
  return { hash, salt: s };
}

export function verifyPassword(password: string, record: AccountRecord): boolean {
  const { hash } = hashPassword(password, record.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(record.passwordHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function characterIdFor(account: string, name: string): string {
  const base = `${account}_${name}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return base.slice(0, 24) + Math.abs(hashStr(base)).toString(36).slice(0, 6);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export type { ZoneId };
