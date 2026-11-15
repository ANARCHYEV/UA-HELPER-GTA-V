import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { loadConfig } from '../config-loader';
import { serverClient } from '../services/server-client';
import { getProfile, setProfile, clearProfile } from '../services/storage';
import { logger } from '../services/logger';
import type {
  AuthMode,
  DiscordPollResult,
  DiscordStartResult,
  Profile,
  SubscriptionCheckResult,
  TelegramPollResult,
  TelegramStartResult
} from '@shared/types';

/**
 * Account & login.
 * Primary flow: Telegram code login (user enters /start <code> in our bot).
 * Authentication is provided by the configured community providers.
 * There is no local-profile fallback in the release build.
 */

export function registerAccountIpc(): void {
  ipcMain.handle(IPC.AccountModeGet, (): AuthMode => loadConfig().auth.mode);

  ipcMain.handle(IPC.AccountProfileGet, (): Profile | null => getProfile());

  ipcMain.handle(IPC.AccountLogout, () => {
    clearProfile();
  });

  ipcMain.handle(IPC.AccountTelegramStart, async (): Promise<TelegramStartResult> => {
    const cfg = loadConfig();
    if (!cfg.auth.telegramBotUsername) throw new Error('Telegram-бота ще не налаштовано');
    return serverClient.authTelegramStart();
  });

  ipcMain.handle(IPC.AccountTelegramPoll, async (_e, code: string): Promise<TelegramPollResult> => {
    try {
      const result = await serverClient.authTelegramPoll(code);
      // server returns { status, token?, nickname?, telegramUser? }
      if (result.status === 'approved' && result.nickname) {
        const saved = setProfile({
          nickname: result.nickname,
          authMode: 'telegram',
          telegramUser: result.telegramUser
        });
        return { status: 'approved', profile: saved };
      }
      return { status: result.status };
    } catch (err) {
      logger.warn('account: poll failed', err instanceof Error ? err.message : err);
      return { status: 'pending' };
    }
  });

  ipcMain.handle(IPC.AccountDiscordStart, async (): Promise<DiscordStartResult> => {
    const cfg = loadConfig();
    if (!cfg.auth.discordClientId || !cfg.auth.discordRedirectUri) {
      throw new Error('Discord авторизацію ще не налаштовано');
    }
    return serverClient.authDiscordStart();
  });

  ipcMain.handle(IPC.AccountDiscordPoll, async (_e, state: string): Promise<DiscordPollResult> => {
    const result = await serverClient.authDiscordPoll(state);
    if (result.status === 'approved' && result.nickname) {
      const profile = setProfile({
        nickname: result.nickname,
        authMode: 'discord',
        discordUser: result.discordUser
      });
      return { status: 'approved', profile };
    }
    return { status: result.status };
  });

  ipcMain.handle(IPC.AccountSubscriptionCheck, async (): Promise<SubscriptionCheckResult> => {
    const cfg = loadConfig();
    const gate = cfg.auth.subscription;
    if (!gate.enabled) return { required: false, allowed: true, provider: gate.provider };

    const profile = getProfile();
    if (!profile) return { required: true, allowed: false, provider: gate.provider, reason: 'not_subscribed' };
    try {
      return await serverClient.checkSubscription({
        provider: gate.provider,
        telegramUser: profile.telegramUser,
        discordUser: profile.discordUser
      });
    } catch (err) {
      logger.warn('account: subscription check failed', err instanceof Error ? err.message : err);
      return { required: true, allowed: false, provider: gate.provider, reason: 'unavailable' };
    }
  });
}
