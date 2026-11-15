import React, { useState } from 'react';
import { navigate } from '../App';
import AnimatedBackground from '../components/common/AnimatedBackground';
import TitleBar from '../components/ui/TitleBar';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import { useAsync } from '../hooks/useAppInfo';
import type { MasterlistServer, MarketPrice, Territory, WikiCategory, WikiEntry } from '@shared/types';
import { t } from '../i18n';

/**
 * Wiki window: transport / property / items / characters, map territories,
 * masterlist servers and market prices. Data comes from the bundled seed
 * (placeholder content until the forum/wiki sync fills it in).
 */

const CATEGORY_TABS = [
  { id: 'transport', labelKey: 'wiki.transport' },
  { id: 'property', labelKey: 'wiki.property' },
  { id: 'items', labelKey: 'wiki.items' },
  { id: 'characters', labelKey: 'wiki.characters' },
  { id: 'map', labelKey: 'wiki.map' },
  { id: 'masterlist', labelKey: 'wiki.masterlist' },
  { id: 'market', labelKey: 'wiki.market' }
];

export default function WikiPage(): React.JSX.Element {
  const [tab, setTab] = useState<string>('transport');
  const [query, setQuery] = useState('');

  const isWikiCategory = (id: string): id is WikiCategory =>
    ['transport', 'property', 'items', 'characters'].includes(id);

  const entries = useAsync<WikiEntry[]>(
    () => window.api.getWikiEntries(isWikiCategory(tab) ? tab : 'all'),
    [tab]
  );
  const territories = useAsync<Territory[]>(() => window.api.getTerritories(), []);
  const servers = useAsync<MasterlistServer[]>(() => window.api.getMasterlistServers(), []);
  const market = useAsync<MarketPrice[]>(() => window.api.getMarketPrices(), []);

  const filteredEntries = (entries.data ?? []).filter((e) =>
    query.trim()
      ? `${e.title} ${e.subtitle ?? ''} ${Object.values(e.fields).join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase())
      : true
  );

  return (
    <div style={{ position: 'relative', height: '100%', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
      <AnimatedBackground density={8} speed={0.3} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TitleBar title={t('wiki.title')} />
        <div style={{ padding: '14px 22px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <input
              className="input no-drag"
              placeholder={t('wiki.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button size="s" icon="refresh" variant="ghost" onClick={() => void window.api.refreshWiki()}>
            {t('wiki.refresh')}
          </Button>
          <Button size="s" icon="book" variant="ghost" onClick={() => navigate('/rules')}>
            {t('nav.rules')}
          </Button>
        </div>
        <div style={{ padding: '10px 22px 0' }}>
          <Tabs tabs={CATEGORY_TABS.map((c) => ({ id: c.id, label: t(c.labelKey) }))} active={tab} onChange={setTab} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isWikiCategory(tab) && (
            <>
              {entries.loading && <Skeleton height={80} />}
              {filteredEntries.map((e) => (
                <div key={e.id} className="card selectable">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 800 }}>{e.title}</span>
                    {e.subtitle && <span className="card-sub">{e.subtitle}</span>}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 8
                    }}
                  >
                    {Object.entries(e.fields).map(([k, v]) => (
                      <div key={k} className="glass" style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>{k}</div>
                        <div style={{ fontSize: 'var(--fs-s)', fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!entries.loading && filteredEntries.length === 0 && (
                <div className="glass" style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)' }}>
                  {t('wiki.empty')}
                </div>
              )}
            </>
          )}

          {tab === 'map' && (
            <>
              <div className="glass" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                <Icon name="map" size={16} />
                <span className="card-sub">{t('map.placeholderNote')}</span>
              </div>
              {territories.data?.map((terr) => (
                <div key={terr.id} className="card" style={{ borderLeft: `4px solid ${terr.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 800 }}>{terr.name}</span>
                    <Badge label={terr.faction} />
                  </div>
                  {terr.description && <div className="card-sub" style={{ marginTop: 6 }}>{terr.description}</div>}
                </div>
              ))}
            </>
          )}

          {tab === 'masterlist' && (
            <>
              {servers.data?.map((s) => (
                <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span
                    className={s.online ? 'pulse-dot' : ''}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: s.online ? 'var(--success)' : 'var(--text-3)'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <div className="card-sub">{tFormatSafe('wiki.players', { players: s.players, max: s.maxPlayers })}</div>
                  </div>
                  <Badge variant={s.online ? 'success' : 'muted'} label={s.online ? t('wiki.online') : t('wiki.offline')} />
                </div>
              ))}
            </>
          )}

          {tab === 'market' && (
            <>
              {market.data?.map((m) => (
                <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Icon name="coins" size={16} />
                  <div style={{ flex: 1, fontWeight: 700 }}>{m.item}</div>
                  <div style={{ fontWeight: 800, color: 'var(--accent)' }}>$ {m.price.toLocaleString('uk-UA')}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function tFormatSafe(key: string, values: Record<string, string | number>): string {
  let text = t(key);
  for (const [k, v] of Object.entries(values)) text = text.replace(`{${k}}`, String(v));
  return text;
}
