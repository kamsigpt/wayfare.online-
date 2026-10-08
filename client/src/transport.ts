import type { ClientMessage, ServerMessage } from '@shared/protocol.js';

export type NetStatus = 'connecting' | 'online' | 'offline' | 'error';

export interface Transport {
  readonly online: boolean;
  send(msg: ClientMessage): void;
  onMessage(cb: (msg: ServerMessage) => void): void;
  onStatus(cb: (status: NetStatus, detail?: string) => void): void;
  dispose(): void;
}

// Entity-id helpers mirrored from the server so the client can address
// NPCs / resource nodes / portals that are not given ids in snapshots.
export function npcEntityId(npcId: string): number {
  let h = 2_000_000;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) >>> 0;
  return (h % 1_000_000) + 2_000_000;
}

export function nodeEntityId(_zone: string, nodeId: number): number {
  return 4_000_000 + nodeId;
}

export function portalEntityId(_zone: string, portalId: string): number {
  let h = 5_000_000;
  for (let i = 0; i < portalId.length; i++) h = (h * 31 + portalId.charCodeAt(i)) >>> 0;
  return (h % 500_000) + 5_000_000;
}

export function round(n: number, places = 1): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

export function defaultServerUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8081/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
