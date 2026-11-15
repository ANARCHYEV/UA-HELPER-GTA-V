import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import TitleBar from '../components/ui/TitleBar';
import Icon, { type IconName } from '../components/ui/Icon';
import { useToast } from '../components/ui/Toast';
import { loadAppInfo } from '../hooks/useAppInfo';
import LauncherHome from './LauncherHome';
import RulesPage from './RulesPage';
import ChangesPage from './ChangesPage';
import SettingsPage from './SettingsPage';
import { IPC_EVENTS } from '@shared/ipc-channels';
import type { AppInfo, Profile } from '@shared/types';
import { t } from '../i18n';
import uaLogo from '../assets/ua-logo.png';

type PageId = 'home' | 'rules' | 'changes' | 'settings';

const NAV: Array<{ id: PageId; icon: IconName; labelKey: string; number: string }> = [
  { id: 'home', icon: 'home', labelKey: 'nav.home', number: '01' },
  { id: 'rules', icon: 'book', labelKey: 'nav.rules', number: '02' },
  { id: 'changes', icon: 'history', labelKey: 'nav.changes', number: '03' },
  { id: 'settings', icon: 'settings', labelKey: 'nav.settings', number: '04' }
];

export default function Launcher({ initialPage = 'home' }: { initialPage?: PageId }): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState<PageId>(initialPage);
  const [unreadChanges, setUnreadChanges] = useState(0);
  const toast = useToast();

  useEffect(() => setPage(initialPage), [initialPage]);
  useEffect(() => {
    void loadAppInfo().then(setInfo);
    void window.api.getProfile().then(setProfile);
    void window.api.getLastSync().then((s) => setUnreadChanges(s.unreadChanges));
    const off = window.api.on(IPC_EVENTS.RulesUpdateAvailable, (payload: unknown) => {
      const update = payload as { unread: number };
      setUnreadChanges(update.unread);
      toast.show('info', t('rules.updateAvailable'));
    });
    return off;
  }, [toast]);

  const goto = (next: PageId): void => {
    setPage(next);
    navigate(next === 'home' ? '/launcher' : `/${next}`);
  };

  const content = (() => {
    switch (page) {
      case 'rules': return <RulesPage />;
      case 'changes': return <ChangesPage />;
      case 'settings': return <SettingsPage />;
      default: return <LauncherHome onNavigate={goto} />;
    }
  })();
  const active = NAV.find((item) => item.id === page) ?? NAV[0];

  return (
    <div className="launcher-shell">
      <TitleBar title={info?.config.product.name ?? 'UA Helper'} showPin />
      <div className="launcher-frame">
        <aside className="launcher-sidebar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true"><img src={uaLogo} alt="" /></div>
            <div className="brand-copy">
              <strong>{info?.config.product.name ?? 'UA Helper'}</strong>
              <span>ТВІЙ ПОМІЧНИК У ГРІ</span>
            </div>
          </div>
          <div className="sidebar-section-label">НАВІГАЦІЯ <span>01 — 04</span></div>
          <nav className="sidebar-nav" aria-label="Основна навігація">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sidebar-link no-drag ${page === item.id ? 'is-active' : ''}`}
                aria-current={page === item.id ? 'page' : undefined}
                aria-label={t(item.labelKey)}
                title={t(item.labelKey)}
                onClick={() => goto(item.id)}
              >
                <span className="sidebar-link-icon"><Icon name={item.icon} size={18} /></span>
                <span className="sidebar-link-label">{t(item.labelKey)}</span>
                {item.id === 'changes' && unreadChanges > 0
                  ? <span className="sidebar-count">{unreadChanges}</span>
                  : <span className="sidebar-number">{item.number}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {profile && (
              <div className="sidebar-profile">
                <div className="profile-avatar"><Icon name="user" size={18} /></div>
                <div className="profile-copy">
                  <strong title={profile.nickname}>{profile.nickname}</strong>
                  <span>{profile.authMode === 'telegram' ? 'Telegram' : 'Discord'}</span>
                </div>
                <button
                  type="button"
                  className="profile-logout no-drag"
                  title={t('nav.logout')}
                  aria-label={t('nav.logout')}
                  onClick={() => void window.api.logout().then(() => navigate('/login'))}
                ><Icon name="external" size={15} /></button>
              </div>
            )}
          </div>
        </aside>
        <div className="launcher-workspace">
          <header className="workspace-header">
            <div className="workspace-breadcrumb"><span>UA HELPER</span><b>/</b><strong>{t(active.labelKey)}</strong></div>
            <div className="workspace-header-right">
              {profile && <span className="workspace-account"><Icon name="user" size={13} />{profile.nickname}</span>}
              {profile && (
                <button
                  type="button"
                  className="workspace-signout no-drag"
                  onClick={() => void window.api.logout().then(() => navigate('/login'))}
                >
                  Вийти
                </button>
              )}
            </div>
          </header>
          <main className={`workspace-content ${page === 'home' ? 'workspace-content-home' : ''}`} key={page}>{content}</main>
        </div>
      </div>
    </div>
  );
}
