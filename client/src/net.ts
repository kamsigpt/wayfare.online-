import type { ClientMessage, ServerMessage } from '@shared/protocol.js';
import type { NetStatus, Transport } from './transport.js';

export class OnlineTransport implements Transport {
  readonly online = true;
  private ws: WebSocket | null = null;
  private messageCbs: ((msg: ServerMessage) => void)[] = [];
  private statusCbs: ((status: NetStatus, detail?: string) => void)[] = [];
  private pingTimer: number | null = null;
  private pingId = 1;

  constructor(private url: string) {}

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(cb: (msg: ServerMessage) => void) {
    this.messageCbs.push(cb);
  }

  onStatus(cb: (status: NetStatus, detail?: string) => void) {
    this.statusCbs.push(cb);
  }

  connect() {
    this.emitStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.emitStatus('error', (e as Error).message);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.emitStatus('online');
      this.send({ t: 'hello', protocol: 1 });
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', id: this.pingId++ }), 5000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      for (const cb of this.messageCbs) cb(msg);
    };
    ws.onclose = () => {
      this.emitStatus('offline');
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    };
    ws.onerror = () => {
      this.emitStatus('error', 'Could not reach the server. Try offline mode.');
    };
  }

  private emitStatus(status: NetStatus, detail?: string) {
    for (const cb of this.statusCbs) cb(status, detail);
  }

  dispose() {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
