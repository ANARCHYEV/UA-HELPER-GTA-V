import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DiffText from '../components/common/DiffText';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useAsync } from '../hooks/useAppInfo';
import type { RuleChange } from '@shared/types';
import { t, tFormat } from '../i18n';

/**
 * Rules changes feed: added / removed / edited items with word-level
 * highlighting (old -> new), dates, forum links and "mark as read".
 */
export default function ChangesPage(): React.JSX.Element {
  const changes = useAsync<RuleChange[]>(() => window.api.getRuleChanges(false), []);
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    // refresh unread counter in the sidebar whenever the page is open
    void window.api.getLastSync();
  }, []);

  const markRead = async (ids: string[]): Promise<void> => {
    setBusyId(ids.join(','));
    await window.api.markChangesRead(ids);
    changes.reload();
    setBusyId(null);
    toast.show('success', t('changes.markedRead'));
  };

  const kindBadge = (kind: RuleChange['kind']): React.JSX.Element => {
    switch (kind) {
      case 'add':
        return <Badge variant="success" label={t('changes.kindAdd')} />;
      case 'remove':
        return <Badge variant="danger" label={t('changes.kindRemove')} />;
      case 'edit_text':
        return <Badge variant="warning" label={t('changes.kindText')} />;
      case 'edit_punishment':
        return <Badge variant="warning" label={t('changes.kindPunishment')} />;
      case 'edit_notes':
        return <Badge variant="muted" label={t('changes.kindNotes')} />;
      default:
        return <></>;
    }
  };

  const unread = (changes.data ?? []).filter((c) => !c.isRead);

  return (
    <div className="content-page changes-page">
      <div className="content-page-header">
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>{t('changes.title')}</h1>
        {unread.length > 0 && (
          <Button
            size="s"
            variant="primary"
            icon="check"
            disabled={busyId !== null}
            onClick={() => void markRead(unread.map((c) => c.id))}
          >
            {t('changes.markAllRead')} ({unread.length})
          </Button>
        )}
      </div>

      {changes.loading && (
        <div className="rules-list">
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      )}

      {changes.data?.length === 0 && !changes.loading && (
        <div className="glass" style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>
          {t('changes.empty')}
        </div>
      )}

      <div className="rules-list changes-list">
        {(changes.data ?? []).map((c) => (
          <div
            key={c.id}
            className="rule-entry change-entry"
            style={{ borderColor: c.isRead ? 'var(--glass-border)' : 'rgba(0,168,255,.4)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {kindBadge(c.kind)}
              <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{c.entityId}</span>
              <span className="card-sub">
                {tFormat('changes.date', { date: new Date(c.createdAt).toLocaleString('uk-UA') })}
              </span>
              {!c.isRead && <Badge variant="danger" label={t('changes.unread')} />}
              <span style={{ flex: 1 }} />
              {c.forumUrl && (
                <Button size="s" variant="ghost" icon="external" onClick={() => void window.api.openExternal(c.forumUrl as string)}>
                  {t('changes.openForum')}
                </Button>
              )}
              {!c.isRead && (
                <Button
                  size="s"
                  icon="check"
                  disabled={busyId !== null}
                  onClick={() => void markRead([c.id])}
                >
                  {t('changes.markRead')}
                </Button>
              )}
            </div>
            <DiffText oldText={c.oldText} newText={c.newText} />
          </div>
        ))}
      </div>
    </div>
  );
}
