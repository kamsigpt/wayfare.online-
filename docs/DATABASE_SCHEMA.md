# Database Schema

## Current implementation

Persistence is behind the `StorageAdapter` interface
(`server/src/persistence.ts`). The shipped adapter is `FileStorageAdapter`, which
stores JSON on disk under `server/data/`:

```
server/data/
  accounts.json         index: [{ account, file }]
  characters.json       index: [{ id, file }]
  world.json            { flags, events }
  accounts/<name>.json  AccountRecord
  characters/<account>__<id>.json  CharacterRecord
```

Writes are atomic: JSON is written to a `.tmp` file and then renamed over the
target. Passwords are stored as scrypt hashes with a per-account random salt and
verified with a constant-time comparison.

This keeps the project runnable with zero external services. It is a legitimate
storage backend, not a placeholder: the server reads and writes through it.

## Target adapter

A PostgreSQL (or Supabase) adapter implements the same `StorageAdapter` methods so
gameplay code is unchanged. The schema below is the target design.

### accounts

```sql
CREATE TABLE accounts (
  account        TEXT PRIMARY KEY,              -- lowercased
  password_hash  TEXT NOT NULL,                 -- scrypt hex
  salt           TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  last_login     BIGINT NOT NULL,
  banned         BOOLEAN NOT NULL DEFAULT FALSE
);
```

### characters

The full `PlayerState` is stored as JSONB for forward compatibility; frequently
queried summary columns are denormalized for listings.

```sql
CREATE TABLE characters (
  id           TEXT PRIMARY KEY,
  account      TEXT NOT NULL REFERENCES accounts(account) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  level        INT  NOT NULL DEFAULT 1,
  archetype    TEXT NOT NULL,
  zone_id      TEXT NOT NULL,
  play_seconds BIGINT NOT NULL DEFAULT 0,
  state        JSONB NOT NULL,                  -- serialized PlayerState
  created_at   BIGINT NOT NULL,
  last_seen    BIGINT NOT NULL,
  UNIQUE (account, name)
);

CREATE INDEX characters_account_idx ON characters (account);
```

### world_state

```sql
CREATE TABLE world_state (
  id     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  flags  JSONB NOT NULL DEFAULT '{}'::jsonb,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at BIGINT NOT NULL
);
```

### Optional normalized tables

For analytics or cross-character queries, the following can be introduced without
changing gameplay: `inventory_items`, `quest_progress`, `skill_progress`,
`reputation`, and a `world_events` append-only log. Until then, `state` (JSONB)
remains the source of truth for a character.

## Interface contract

Any adapter must implement:

| Method | Purpose |
| --- | --- |
| `init()` | Prepare storage (directories, migrations) |
| `getAccount(account)` | Fetch an account record |
| `saveAccount(record)` | Upsert an account |
| `getCharacters(account)` | List a player's characters |
| `getCharacter(id)` | Fetch one character |
| `saveCharacter(record)` | Upsert a character |
| `loadWorld()` / `saveWorld(record)` | Global flags and events |

Swapping in a Postgres adapter requires only constructing it instead of
`FileStorageAdapter` when launching the server.
