import { randomBytes } from 'crypto';
import { row, run } from '../db/db';
import { config } from '../config';

const TTL_MS = 10 * 60 * 1000;

export interface DiscordStart {
  state: string;
  expiresAt: number;
  authUrl: string;
}

function configured(): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret && config.discordRedirectUri);
}

export function generateDiscordState(): DiscordStart {
  if (!configured()) throw new Error('discord oauth is not configured');
  const state = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + TTL_MS;
  run(
    'INSERT INTO discord_auth_states (state, status, created_at, expires_at) VALUES (?, ?, ?, ?)',
    state,
    'pending',
    Date.now(),
    expiresAt
  );
  const params = new URLSearchParams({
    client_id: config.discordClientId,
    response_type: 'code',
    redirect_uri: config.discordRedirectUri,
    scope: 'identify',
    state
  });
  return { state, expiresAt, authUrl: `https://discord.com/oauth2/authorize?${params.toString()}` };
}

export async function handleDiscordCallback(code: string, state: string): Promise<void> {
  const rec = row<{ status: string; expires_at: number }>(
    'SELECT status, expires_at FROM discord_auth_states WHERE state = ?',
    state
  );
  if (!rec || rec.expires_at < Date.now() || rec.status !== 'pending') throw new Error('invalid or expired oauth state');
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.discordRedirectUri
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!tokenRes.ok) throw new Error(`discord token exchange failed (${tokenRes.status})`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('discord token exchange returned no access token');
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!userRes.ok) throw new Error(`discord user lookup failed (${userRes.status})`);
  const user = (await userRes.json()) as { id?: string; username?: string; global_name?: string };
  if (!user.id) throw new Error('discord user lookup returned no id');
  run(
    'UPDATE discord_auth_states SET status = ?, discord_user = ?, nickname = ? WHERE state = ?',
    'approved',
    user.id,
    user.global_name || user.username || `Discord-${user.id}`,
    state
  );
}

export function pollDiscordState(state: string): {
  status: 'pending' | 'approved' | 'expired' | 'not_found';
  nickname?: string;
  discordUser?: string;
} {
  const rec = row<{ status: string; discord_user: string | null; nickname: string | null; expires_at: number }>(
    'SELECT status, discord_user, nickname, expires_at FROM discord_auth_states WHERE state = ?',
    state
  );
  if (!rec) return { status: 'not_found' };
  if (rec.expires_at < Date.now()) {
    run('DELETE FROM discord_auth_states WHERE state = ?', state);
    return { status: 'expired' };
  }
  if (rec.status !== 'approved' || !rec.discord_user) return { status: 'pending' };
  run('DELETE FROM discord_auth_states WHERE state = ?', state);
  return { status: 'approved', nickname: rec.nickname ?? undefined, discordUser: rec.discord_user };
}

export function cleanupExpiredDiscordStates(): void {
  run('DELETE FROM discord_auth_states WHERE expires_at < ?', Date.now());
}

export function discordConfigured(): boolean {
  return configured();
}
