import React, { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import PartnerBadge from '../components/common/PartnerBadge';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import TopographicPattern from '../components/common/TopographicPattern';
import { loadAppInfo } from '../hooks/useAppInfo';
import type { AppConfig, DiscordStartResult, Profile, TelegramStartResult } from '@shared/types';
import { tFormat, t } from '../i18n';
import uaLogo from '../assets/ua-logo.png';

/**
 * Login screen.
 * Telegram and Discord only. Authentication never falls back to a local profile.
 */
export default function Login(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tab, setTab] = useState<'telegram' | 'discord'>('telegram');
  const [tg, setTg] = useState<TelegramStartResult | null>(null);
  const [discord, setDiscord] = useState<DiscordStartResult | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const pollRef = useRef<number | null>(null);

  const continueAfterApproval = async (profile: Profile): Promise<void> => {
    const subscription = await window.api.checkSubscription();
    if (subscription.required && !subscription.allowed) {
      toast.show('warning', subscription.reason === 'unavailable'
        ? 'Не вдалося перевірити підписку. Спробуйте ще раз пізніше.'
        : 'Для входу потрібна підписка спільноти.');
      return;
    }
    toast.show('success', t('login.welcome').replace('{name}', profile.nickname));
    navigate('/launcher');
  };

  useEffect(() => {
    void loadAppInfo().then((info) => {
      setConfig(info.config);
      const mode = info.config.auth.mode;
      setTab(
        mode === 'discord'
            ? 'discord'
            : info.config.auth.telegramBotUsername
              ? 'telegram'
              : info.config.auth.discordClientId
                ? 'discord'
                : 'telegram'
      );
    });
  }, []);

  // Telegram polling loop
  useEffect(() => {
    if (!polling || !tg) return;
    const id = window.setInterval(async () => {
      const res = await window.api.telegramPoll(tg.code);
      if (res.status === 'approved' && res.profile) {
        window.clearInterval(id);
        void continueAfterApproval(res.profile);
      } else if (res.status === 'expired') {
        window.clearInterval(id);
        setPolling(false);
        toast.show('warning', t('login.codeExpired'));
      }
    }, 2000);
    pollRef.current = id;
    return () => window.clearInterval(id);
  }, [polling, tg, toast]);

  useEffect(() => {
    if (!polling || !discord) return;
    const id = window.setInterval(async () => {
      const res = await window.api.discordPoll(discord.state);
      if (res.status === 'approved' && res.profile) {
        window.clearInterval(id);
        void continueAfterApproval(res.profile);
      } else if (res.status === 'expired') {
        window.clearInterval(id);
        setPolling(false);
        toast.show('warning', t('login.codeExpired'));
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [discord, polling, toast]);

  const startTelegram = async (): Promise<void> => {
    try {
      const result = await window.api.telegramStart();
      setTg(result);
      if (result.demo) {
        toast.show('info', t('login.demoMode'));
      }
      setPolling(true);
    } catch (err) {
      setPolling(false);
      toast.show('error', err instanceof Error ? err.message : 'Не вдалося запустити вхід через Telegram.');
    }
  };

  const startDiscord = async (): Promise<void> => {
    try {
      const result = await window.api.discordStart();
      setDiscord(result);
      setPolling(true);
      await window.api.openExternal(result.authUrl);
    } catch (err) {
      setPolling(false);
      toast.show('error', err instanceof Error ? err.message : 'Не вдалося запустити вхід через Discord.');
    }
  };

  const copyCode = async (): Promise<void> => {
    if (!tg) return;
    try {
      await window.api.copyText(tg.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show('error', 'Не вдалося скопіювати код.');
    }
  };

  return (
    <div className="login-page">
      <TopographicPattern className="login-topographic" />
      <div
        className="login-content"
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: 20
        }}
      >
        <div className="login-card fade-in" style={{ width: 430, padding: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <img src={uaLogo} className="login-logo" alt="UA Helper" />
            <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>{config?.product.name}</h1>
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)' }}>{config?.product.slogan}</p>
          </div>

          {/* tabs */}
          {config && config.auth.mode === 'both' && (config.auth.telegramBotUsername || config.auth.discordClientId) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {config.auth.telegramBotUsername ? <Button size="s" variant={tab === 'telegram' ? 'primary' : 'ghost'} onClick={() => setTab('telegram')}>Telegram</Button> : null}
              {config.auth.discordClientId ? <Button size="s" variant={tab === 'discord' ? 'primary' : 'ghost'} onClick={() => setTab('discord')}>Discord</Button> : null}
            </div>
          )}

          {tab === 'telegram' && config?.auth.telegramBotUsername && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!tg && (
                <>
                  <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
                    {t('login.tgIntro')}
                  </p>
                  <Button variant="primary" icon="user" onClick={() => void startTelegram()}>
                    {t('login.tgStart')}
                  </Button>
                </>
              )}
              {tg && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <>
                      <span style={{ fontSize: 'var(--fs-s)', color: 'var(--text-2)' }}>
                        {t('login.tgCodeHint')}
                      </span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div
                          className="glass"
                          style={{
                            padding: '12px 18px',
                            fontSize: 'var(--fs-xl)',
                            fontWeight: 800,
                            letterSpacing: 6
                          }}
                        >
                          {tg.code}
                        </div>
                        <Button size="s" icon={copied ? 'check' : 'copy'} onClick={() => void copyCode()}>
                          {copied ? t('common.copied') : t('common.copy')}
                        </Button>
                      </div>
                      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--text-2)', lineHeight: 1.6 }}>
                        {tFormat('login.tgOpenBot', { bot: `@${tg.botUsername}` })}
                        <br />
                        <code style={{ color: 'var(--accent-2)' }}>/start {tg.code}</code>
                      </p>
                      <Button
                        variant="ghost"
                        icon="external"
                        onClick={() =>
                          void window.api.openExternal(`https://t.me/${tg.botUsername}?start=${tg.code}`)
                        }
                      >
                        {t('login.openBot')}
                      </Button>
                  </>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />
                    <span style={{ fontSize: 'var(--fs-s)', color: 'var(--text-3)' }}>
                      {t('login.waitingApproval')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'discord' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
                Увійди через Discord у браузері та повернись сюди після підтвердження.
              </p>
              <Button variant="primary" icon="external" onClick={() => void startDiscord()}>
                Продовжити з Discord
              </Button>
              {discord ? <span style={{ fontSize: 'var(--fs-s)', color: 'var(--text-3)' }}>Очікуємо підтвердження…</span> : null}
            </div>
          )}

          {config && !config.auth.telegramBotUsername && !config.auth.discordClientId && (
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
              Авторизацію ще не налаштовано. Додай Telegram-бота або Discord Client ID у зовнішній конфіг програми.
            </p>
          )}
        </div>

        <PartnerBadge partner={config?.branding.partner ?? { label: t('partner.default'), logoAsset: '', url: '' }} />
      </div>
    </div>
  );
}
