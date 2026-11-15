import React, { useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import Badge from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../hooks/useAppInfo';
import type { LawItem, RuleItem, RuleSection, SearchHit } from '@shared/types';
import { t, tFormat } from '../i18n';

/**
 * Rules & laws browser with search (local BM25), sections and punishments.
 */
export default function RulesPage(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [showLaws, setShowLaws] = useState(false);
  const toast = useToast();

  const sections = useAsync<RuleSection[]>(() => window.api.getRuleSections(), []);
  const items = useAsync<RuleItem[]>(() => window.api.getRuleItems(), []);
  const laws = useAsync<LawItem[]>(() => window.api.getLaws(), []);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const doSearch = async (): Promise<void> => {
    if (!query.trim()) {
      setHits(null);
      return;
    }
    const results = await window.api.quickSearch(query);
    setHits(results);
  };

  const visibleSections = useMemo(() => sections.data ?? [], [sections.data]);

  const visibleItems = useMemo(() => {
    if (hits) return null;
    const all = items.data ?? [];
    return sectionId ? all.filter((r) => r.sectionId === sectionId) : all;
  }, [hits, items.data, sectionId]);

  const syncNow = async (): Promise<void> => {
    const res = await window.api.syncRules();
    if (res.ok) {
      toast.show('success', tFormat('rules.syncDone', { added: res.added, updated: res.updated }));
      items.reload();
      laws.reload();
      sections.reload();
    } else {
      toast.show('warning', t('rules.offlineCache'));
    }
  };

  return (
    <div className="content-page rules-page">
      <div className="content-page-header">
        <h1>{showLaws ? t('laws.title') : t('rules.title')}</h1>
        <div className="rules-toolbar">
          <Button size="s" variant={showLaws ? 'primary' : 'ghost'} onClick={() => setShowLaws((v) => !v)}>
            {t('rules.showLaws')}
          </Button>
          <Button size="s" icon="refresh" onClick={() => void syncNow()}>
            {t('rules.sync')}
          </Button>
        </div>
      </div>

      {/* search */}
      <div className="rules-search">
        <div className="rules-search-field">
          <input
            className="input no-drag"
            style={{ paddingLeft: 38 }}
            placeholder={showLaws ? t('laws.searchPlaceholder') : t('rules.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doSearch();
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}>
            <Icon name="search" size={16} />
          </span>
        </div>
        <Button onClick={() => void doSearch()} icon="search">
          {t('common.search')}
        </Button>
        {hits && (
          <Button variant="ghost" onClick={() => { setHits(null); setQuery(''); }}>
            {t('common.reset')}
          </Button>
        )}
      </div>

      {/* sections */}
      {!hits && !showLaws && visibleSections.length > 0 && (
        <div className="rules-filters">
          <Badge label={t('rules.allSections')} onClick={() => setSectionId(null)} active={sectionId === null} />
          {visibleSections.map((s) => (
            <Badge
              key={s.id}
              label={s.title}
              active={sectionId === s.id}
              onClick={() => setSectionId(s.id)}
            />
          ))}
        </div>
      )}

      {/* results */}
      {hits && (
        <div className="rules-list">
          <span className="card-sub">{tFormat('search.results', { count: hits.length })}</span>
          {hits.map((h) => (
            <div key={`${h.kind}-${h.id}`} className="rule-entry selectable">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Badge label={h.kind === 'law' ? t('rules.lawTag') : t('rules.ruleTag')} />
                <span style={{ fontWeight: 700 }}>{h.id}</span>
                {h.sectionTitle && <span className="card-sub">· {h.sectionTitle}</span>}
              </div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{h.title}</div>
              <div style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>{h.text}</div>
            </div>
          ))}
          {hits.length === 0 && <EmptyState text={t('rules.notFound')} />}
        </div>
      )}

      {/* rules list */}
      {!hits && !showLaws && (
        <div className="rules-list">
          {(visibleItems ?? []).map((r) => (
            <div key={r.id} className="rule-entry selectable">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{r.id}</span>
                {r.title && <span style={{ fontWeight: 700 }}>{r.title}</span>}
              </div>
              <div style={{ color: 'var(--text-1)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>{r.text}</div>
              {r.punishment && (
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-warning">{t('rules.punishment')}: {r.punishment}</span>
                </div>
              )}
              {r.notes && (
                <div className="card-sub" style={{ marginTop: 6 }}>{t('rules.notes')}: {r.notes}</div>
              )}
            </div>
          ))}
          {(visibleItems ?? []).length === 0 && !items.loading && <EmptyState text={t('rules.empty')} />}
        </div>
      )}

      {/* laws list */}
      {!hits && showLaws && (
        <div className="rules-list">
          {(laws.data ?? []).map((l) => (
            <div key={l.id} className="rule-entry selectable">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, color: 'var(--accent-2)' }}>{l.id}</span>
                <span style={{ fontWeight: 700 }}>{l.title}</span>
              </div>
              <div style={{ color: 'var(--text-1)', fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>{l.text}</div>
              {l.punishment && (
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-warning">{t('rules.punishment')}: {l.punishment}</span>
                </div>
              )}
            </div>
          ))}
          {(laws.data ?? []).length === 0 && !laws.loading && <EmptyState text={t('laws.empty')} />}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="glass" style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)' }}>
      {text}
    </div>
  );
}
