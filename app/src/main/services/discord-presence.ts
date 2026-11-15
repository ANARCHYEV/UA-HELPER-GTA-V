import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

/**
 * Small native Discord IPC client. Rich Presence is local-only: it talks to
 * the Discord desktop client through its named pipe and never uses the API
 * backend or exposes a bot/client secret.
 */
interface PresenceOptions {
  clientId: string;
  state?: string;
  details?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  partyId?: string;
  partySize?: number;
  partyMax?: number;
}

type JsonRecord = Record<string, unknown>;

const PIPE_PREFIX = '\\\\?\\pipe\\discord-ipc-';
const RECONNECT_MS = 15_000;

let socket: net.Socket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;
let activeOptions: PresenceOptions | null = null;

function frame(op: number, payload: JsonRecord): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function sendActivity(options: PresenceOptions): void {
  if (!socket || socket.destroyed) return;
  const activity: JsonRecord = {
    state: options.state ?? 'В головному меню',
    details: options.details ?? 'UA Helper · Ukraine GTA 5',
    timestamps: { start: Math.floor(Date.now() / 1000) },
    assets: {
      large_image: options.largeImageKey ?? 'ua_helper',
      large_text: options.largeImageText ?? 'UA Helper',
      small_image: options.smallImageKey ?? 'ua_helper',
      small_text: options.smallImageText ?? 'Ukraine GTA 5'
    }
  };
  if (options.partyId) {
    activity.party = {
      id: options.partyId,
      size: [options.partySize ?? 1, options.partyMax ?? 1]
    };
  }
  socket.write(frame(1, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: randomUUID()
  }));
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer || !activeOptions) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect(activeOptions as PresenceOptions);
  }, RECONNECT_MS);
}

async function connect(options: PresenceOptions): Promise<void> {
  if (stopped || socket || process.platform !== 'win32') return;
  for (let pipe = 0; pipe < 10 && !stopped; pipe += 1) {
    const candidate = `${PIPE_PREFIX}${pipe}`;
    const client = net.createConnection(candidate);
    const connected = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      client.once('connect', () => finish(true));
      client.once('error', () => finish(false));
      client.once('close', () => finish(false));
    });
    if (!connected) {
      client.destroy();
      continue;
    }

    socket = client;
    let activitySent = false;
    client.on('data', () => {
      // Discord replies to the handshake before accepting SET_ACTIVITY.
      if (!activitySent) {
        activitySent = true;
        sendActivity(options);
      }
    });
    client.on('error', () => {
      client.destroy();
    });
    client.on('close', () => {
      if (socket === client) socket = null;
      scheduleReconnect();
    });
    client.write(frame(0, { v: 1, client_id: options.clientId }));
    // Some Discord builds do not emit a handshake frame immediately.
    setTimeout(() => {
      if (!activitySent) {
        activitySent = true;
        sendActivity(options);
      }
    }, 350);
    logger.info('discord-presence: connected');
    return;
  }
  scheduleReconnect();
}

export function startDiscordPresence(options: PresenceOptions): void {
  stopDiscordPresence();
  if (!options.clientId || process.platform !== 'win32') return;
  stopped = false;
  activeOptions = options;
  void connect(options);
}

export function stopDiscordPresence(): void {
  stopped = true;
  activeOptions = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.destroy();
  socket = null;
}
