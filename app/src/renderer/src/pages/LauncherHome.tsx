import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Icon, { type IconName } from '../components/ui/Icon';
import { useToast } from '../components/ui/Toast';
import { loadAppInfo, useAsync } from '../hooks/useAppInfo';
import type { AppConfig, RulesLastSync } from '@shared/types';
import { t, tFormat } from '../i18n';
import TopographicPattern from '../components/common/TopographicPattern';

type PageId = 'home' | 'rules' | 'changes' | 'settings';
type ModeId = 'overlay' | 'rules' | 'assistant' | 'settings';

interface Mode {
  id: ModeId;
  icon: IconName;
  title: string;
  description: string;
  action: string;
}

const MODES: Mode[] = [
  {
    id: 'overlay', icon: 'sparkles', title: 'Помічник, що завжди поруч',
    description: 'Відкрий оверлей поверх гри та знайди правило, закон або відповідь за кілька секунд.',
    action: 'Відкрити оверлей'
  },
  {
    id: 'rules', icon: 'book', title: 'Правила проєкту',
    description: 'Зберігай контекст гри: переглядай актуальні розділи та зміни без браузера.',
    action: 'Перейти до правил'
  },
  {
    id: 'assistant', icon: 'list', title: 'Розібрати ситуацію',
    description: 'Опиши ігровий випадок своїми словами — помічник підкаже, де шукати відповідь.',
    action: 'Запитати помічника'
  },
  {
    id: 'settings', icon: 'settings', title: 'Підготуйся до гри',
    description: 'Перевір гарячі клавіші, звук та поведінку вікна, щоб нічого не відволікало.',
    action: 'Відкрити налаштування'
  }
];

export default function LauncherHome({ onNavigate }: { onNavigate: (page: PageId) => void }): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const lastSync = useAsync<RulesLastSync>(() => window.api.getLastSync(), []);

  useEffect(() => {
    void loadAppInfo().then((info) => setConfig(info.config));
  }, []);

  const runAction = (id: ModeId): void => {
    if (id === 'overlay') void window.api.toggleOverlay();
    if (id === 'rules') onNavigate('rules');
    if (id === 'assistant') void window.api.openAiWindow();
    if (id === 'settings') onNavigate('settings');
  };

  const syncNow = async (): Promise<void> => {
    setSyncing(true);
    try {
      const result = await window.api.syncRules();
      if (result.ok) {
        toast.show('success', tFormat('rules.syncDone', { added: result.added, updated: result.updated }));
        lastSync.reload();
      } else {
        toast.show('warning', t('rules.offlineCache'));
      }
    } finally {
      setSyncing(false);
    }
  };

  const syncLabel = lastSync.data?.lastSyncAt
    ? new Date(lastSync.data.lastSyncAt).toLocaleString('uk-UA', { day: '2-digit', month: 'long' })
    : 'локальний кеш';
  const launchUrl = config?.projects[0]?.launchUrl ?? '';

  return (
    <main className="home-command">
      <TopographicPattern className="home-command-pattern" />
      <div className="home-command-inner">
        <section className="home-command-intro">
          <p className="home-command-eyebrow"><span className="live-dot" /> Ukraine GTA 5</p>
          <h1>Помічник, що<br />завжди поруч</h1>
          <span>Швидкий доступ до правил, законів і відповідей прямо поверх гри.</span>
          <div className="home-command-primary">
            <Button variant="primary" icon="sparkles" onClick={() => runAction('overlay')}>Відкрити оверлей</Button>
            {launchUrl ? <Button variant="ghost" icon="external" onClick={() => void window.api.openExternal(launchUrl)}>Запустити гру</Button> : null}
          </div>
          <div className="home-command-meta">
            <span><Icon name="book" size={14} /> База правил: {syncLabel}</span>
            <button type="button" disabled={syncing} onClick={() => void syncNow()}><Icon name="refresh" size={14} />{syncing ? t('common.syncing') : 'Оновити'}</button>
            <span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>O</kbd> оверлей</span>
          </div>
        </section>

        <section className="home-command-actions" aria-labelledby="home-actions-title">
          <div className="home-command-actions-head">
            <div>
              <p id="home-actions-title">Что нужно сейчас?</p>
              <span>Четыре быстрых действия</span>
            </div>
          </div>
          <div className="home-actions">
            {MODES.map((mode) => (
              <button key={mode.id} type="button" className="home-action" onClick={() => runAction(mode.id)}>
                <span className="home-action-icon"><Icon name={mode.icon} size={18} /></span>
                <span><b>{mode.action}</b><small>{mode.description}</small></span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
