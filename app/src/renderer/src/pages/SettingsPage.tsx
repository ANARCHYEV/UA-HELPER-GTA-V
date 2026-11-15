import React, { useEffect, useState } from 'react';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import HotkeyCapture from '../components/ui/HotkeyCapture';
import GuideWizard from '../components/common/GuideWizard';
import { useToast } from '../components/ui/Toast';
import { loadAppInfo } from '../hooks/useAppInfo';
import type { AiStatus, AppInfo, AppSettings, AiUsageStats, VoiceDevice } from '@shared/types';
import { t, tFormat } from '../i18n';

/**
 * Settings: hotkeys, autolaunch, pin, streamer mode, overlay opacity,
 * language, updates, rules sync, AI key & model, stats, history and product help.
 */
export default function SettingsPage(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [devices, setDevices] = useState<VoiceDevice[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hotkeys, setHotkeys] = useState<{ overlay: string; ptt: string }>({ overlay: '', ptt: '' });
  const toast = useToast();

  const reloadAll = React.useCallback(async (): Promise<void> => {
    const [s, st, ai, hk] = await Promise.all([
      window.api.getSettings(),
      window.api.getStats(),
      window.api.getAiStatus(),
      window.api.getHotkeys()
    ]);
    setSettings(s);
    setStats(st);
    setAiStatus(ai);
    setHotkeys(hk);
  }, []);

  useEffect(() => {
    void loadAppInfo().then(setInfo);
    void reloadAll();
    void window.api.getVoiceDevices().then(setDevices).catch(() => setDevices([]));
  }, [reloadAll]);

  const patch = async (p: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.patchSettings(p);
    setSettings(next);
  };

  const patchWithToast = async (p: Partial<AppSettings>, message: string): Promise<void> => {
    await patch(p);
    toast.show('success', message);
  };

  const applyHotkey = async (id: 'overlay' | 'ptt', accelerator: string): Promise<boolean> => {
    const ok = await window.api.setHotkey(id, accelerator);
    toast.show(ok ? 'success' : 'error', ok ? t('settings.hotkeySaved') : t('settings.hotkeyBusy'));
    void reloadAll();
    return ok;
  };

  const syncNow = async (): Promise<void> => {
    setSyncing(true);
    const res = await window.api.syncRules();
    setSyncing(false);
    if (res.ok) {
      toast.show('success', tFormat('rules.syncDone', { added: res.added, updated: res.updated }));
    } else {
      toast.show('warning', t('rules.offlineCache'));
    }
  };

  const checkUpdates = async (): Promise<void> => {
    const state = await window.api.checkUpdates();
    if (state.status === 'available') toast.show('info', tFormat('home.updateAvailable', { version: state.version ?? '' }));
    else if (state.status === 'not-available') toast.show('success', t('home.upToDate'));
    else if (state.status === 'error') toast.show('error', t('home.updateError'));
  };

  const removeKey = async (): Promise<void> => {
    await window.api.removeAiKey();
    toast.show('success', t('settings.keyRemoved'));
    void reloadAll();
  };

  const clearHistory = async (): Promise<void> => {
    await window.api.clearAiHistory();
    toast.show('success', t('settings.historyCleared'));
    void reloadAll();
  };

  const [tab, setTab] = useState('general');
  const tabs = [
    { id: 'general', label: t('settings.tabGeneral') },
    { id: 'ai', label: t('settings.tabAi') },
    { id: 'voice', label: t('settings.tabVoice') },
    { id: 'content', label: t('settings.tabContent') }
  ];

  const aiEnabled = aiStatus?.hasKey === true;

  return (
    <div className="settings-page">
      <h1>{t('nav.settings')}</h1>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'general' && settings && (
        <>
        <div className="card settings-panel">
          <Row label={t('settings.hotkeyOverlay')} hint={t('settings.hotkeyHint')}>
            <HotkeyCapture value={hotkeys.overlay} onApply={(acc) => applyHotkey('overlay', acc)} />
          </Row>
          <Row label={t('settings.hotkeyPtt')} hint={t('settings.pttHint')}>
            <HotkeyCapture value={hotkeys.ptt} onApply={(acc) => applyHotkey('ptt', acc)} />
          </Row>
          <Row label={t('settings.autoLaunch')} hint={t('settings.autoLaunchHint')}>
            <Switch checked={settings.autoLaunch} onChange={(v) => void patchWithToast({ autoLaunch: v }, t('common.saved'))} />
          </Row>
          <Row label={t('settings.pinWindow')} hint={t('settings.pinHint')}>
            <Switch checked={settings.pinWindow} onChange={(v) => void patchWithToast({ pinWindow: v }, t('common.saved'))} />
          </Row>
          <Row label={t('settings.streamerMode')} hint={t('settings.streamerHint')}>
            <Switch checked={settings.streamerMode} onChange={(v) => void patchWithToast({ streamerMode: v }, t('common.saved'))} />
          </Row>
          <Row label={t('settings.opacity')} hint={`${Math.round(settings.overlayOpacity * 100)}%`}>
            <input
              type="range"
              className="no-drag"
              min={30}
              max={100}
              value={Math.round(settings.overlayOpacity * 100)}
              onChange={(e) => void patch({ overlayOpacity: Number(e.target.value) / 100 })}
              style={{ width: 220, accentColor: 'var(--accent)' }}
            />
          </Row>
          <Row label={t('settings.language')} hint={t('settings.languageHint')}>
            <select className="input no-drag" style={{ width: 160 }} value={settings.language} disabled>
              <option value="uk">Українська</option>
            </select>
          </Row>
          <Row label={t('settings.updatesOnStart')} hint={t('settings.updatesHint')}>
            <Switch checked={settings.checkUpdatesOnStart} onChange={(v) => void patchWithToast({ checkUpdatesOnStart: v }, t('common.saved'))} />
          </Row>
          <Row label={t('settings.checkUpdatesNow')} hint={t('settings.updateNowHint')}>
            <Button size="s" icon="refresh" onClick={() => void checkUpdates()}>
              {t('home.checkUpdates')}
            </Button>
          </Row>
        </div>

        </>
      )}

      {tab === 'ai' && aiStatus && (
        <div className="card settings-panel">
          <Row label={t('settings.aiEnabled')} hint={aiEnabled ? (aiStatus.keyValid ? t('settings.keyValid') : t('settings.keyNotValidated')) : t('settings.keyMissing')}>
            {aiEnabled ? (
              <Button size="s" variant="danger" icon="close" onClick={() => void removeKey()}>
                {t('settings.removeKey')}
              </Button>
            ) : (
              <Button size="s" variant="primary" icon="sparkles" onClick={() => setWizardOpen(true)}>
                {t('settings.enableAi')}
              </Button>
            )}
          </Row>
          <Row label={t('settings.aiModel')} hint={aiStatus.modelId ?? ''}>
            <Button size="s" icon="list" onClick={() => setWizardOpen(true)}>
              {t('settings.changeModel')}
            </Button>
          </Row>
          <Row label={t('settings.autoFallback')} hint={t('settings.autoFallbackHint')}>
            <Switch
              checked={settings?.aiAutoFallback ?? true}
              onChange={(v) => void patchWithToast({ aiAutoFallback: v }, t('common.saved'))}
            />
          </Row>
          <Row label={t('settings.stats')} hint={stats ? tFormat('settings.statsDetail', { today: stats.today, total: stats.total }) : '…'}>
            <Button size="s" icon="trash" variant="danger" onClick={() => void clearHistory()}>
              {t('settings.clearHistory')}
            </Button>
          </Row>
          <div className="glass" style={{ padding: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-3)', lineHeight: 1.6 }}>
            {t('settings.byokNote')}
          </div>
        </div>
      )}

      {tab === 'voice' && (
        <div className="card settings-panel">
          <Row label={t('settings.microphone')} hint={t('settings.microphoneHint')}>
            <select
              className="input no-drag"
              style={{ width: 320 }}
              value={settings?.micDeviceId ?? ''}
              onChange={(e) => void patchWithToast({ micDeviceId: e.target.value || null }, t('common.saved'))}
            >
              <option value="">{t('settings.micDefault')}</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </Row>
          <div className="glass" style={{ padding: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-3)', lineHeight: 1.6 }}>
            {t('settings.voiceNote')}
          </div>
        </div>
      )}

      {tab === 'content' && settings && (
        <div className="card settings-panel">
          <Row label={t('settings.rulesSync')} hint={t('settings.rulesSyncHint')}>
            <Button size="s" icon="refresh" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? t('common.syncing') : t('rules.sync')}
            </Button>
          </Row>
          <Row label={t('settings.forumUrls')} hint={t('settings.forumHint')}>
            <Button size="s" icon="external" variant="ghost" onClick={() => void window.api.openExternal(info?.config.forum.rulesUrl ?? '')}>
              {t('settings.openForumRules')}
            </Button>
          </Row>
        </div>
      )}

      <GuideWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          void reloadAll();
        }}
        config={info?.config ?? ({
          product: { name: '', slogan: '', version: '' },
          branding: { accent: '#00A8FF', accent2: '#22D3EE', partner: { label: '', logoAsset: '', url: '' } },
          backend: { baseUrl: '', timeoutMs: 0 },
          auth: {
            mode: 'telegram',
            subscription: { enabled: false, provider: 'either' }
          },
          projects: [],
          ai: { openRouterBaseUrl: '', maxHistoryItems: 0, maxContextItems: 0, recommendedModels: [] },
          guide: [],
          updates: { provider: 'generic', url: '' },
          voice: { maxRecordSeconds: 30, maxFileMb: 10 },
          forum: { rulesUrl: '', lawsUrl: '' }
        } as AppInfo['config'])}
      />
    </div>
  );
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-label">
          {label}
        </div>
        {hint && <div className="card-sub">{hint}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
