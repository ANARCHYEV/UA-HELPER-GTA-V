import { config } from '../config';

export type SubscriptionProvider = 'telegram' | 'discord' | 'either';

export interface SubscriptionResult {
  required: boolean;
  allowed: boolean;
  provider: SubscriptionProvider;
  reason?: 'not_configured' | 'not_subscribed' | 'unavailable';
}

async function telegramMember(userId: string): Promise<boolean> {
  if (!config.tgBotToken || !config.telegramSubscriptionChat) throw new Error('telegram subscription is not configured');
  const url = `https://api.telegram.org/bot${config.tgBotToken}/getChatMember?chat_id=${encodeURIComponent(config.telegramSubscriptionChat)}&user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`telegram membership check failed (${res.status})`);
  const data = (await res.json()) as { ok?: boolean; result?: { status?: string } };
  return Boolean(data.ok && data.result && ['creator', 'administrator', 'member'].includes(data.result.status ?? ''));
}

async function discordMember(userId: string): Promise<boolean> {
  if (!config.discordBotToken || !config.discordGuildId) throw new Error('discord subscription is not configured');
  const res = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(config.discordGuildId)}/members/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bot ${config.discordBotToken}` },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`discord membership check failed (${res.status})`);
  const data = (await res.json()) as { roles?: string[] };
  return !config.discordRoleId || Boolean(data.roles?.includes(config.discordRoleId));
}

export async function checkSubscription(input: { provider: SubscriptionProvider; telegramUser?: string; discordUser?: string }): Promise<SubscriptionResult> {
  const provider = input.provider;
  const telegramReady = Boolean(config.tgBotToken && config.telegramSubscriptionChat && input.telegramUser);
  const discordReady = Boolean(config.discordBotToken && config.discordGuildId && input.discordUser);
  const required = provider === 'telegram' ? Boolean(config.telegramSubscriptionChat) : provider === 'discord' ? Boolean(config.discordGuildId) : Boolean(config.telegramSubscriptionChat || config.discordGuildId);
  if (!required) return { required: false, allowed: true, provider, reason: 'not_configured' };
  try {
    if (provider === 'telegram') return { required: true, allowed: telegramReady ? await telegramMember(input.telegramUser!) : false, provider, reason: telegramReady ? undefined : 'unavailable' };
    if (provider === 'discord') return { required: true, allowed: discordReady ? await discordMember(input.discordUser!) : false, provider, reason: discordReady ? undefined : 'unavailable' };
    const checks: Promise<boolean>[] = [];
    if (telegramReady) checks.push(telegramMember(input.telegramUser!));
    if (discordReady) checks.push(discordMember(input.discordUser!));
    if (!checks.length) return { required: true, allowed: false, provider, reason: 'unavailable' };
    const results = await Promise.all(checks);
    return { required: true, allowed: results.some(Boolean), provider, reason: results.some(Boolean) ? undefined : 'not_subscribed' };
  } catch {
    return { required: true, allowed: false, provider, reason: 'unavailable' };
  }
}
