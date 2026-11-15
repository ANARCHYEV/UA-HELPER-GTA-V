import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import {
  getSections,
  getRuleItems,
  getChanges,
  markChangesRead,
  setMeta
} from '../services/storage';
import { syncNow, getLastSync } from '../services/rules-sync';
import { invalidateIndex } from '../services/retrieval';
import type { RuleItem, RuleChange, RulesSyncResult, RulesLastSync } from '@shared/types';

export function registerRulesIpc(): void {
  ipcMain.handle(IPC.RulesSectionsGet, () => getSections());

  ipcMain.handle(IPC.RulesItemsGet, (_e, sectionId?: string): RuleItem[] =>
    getRuleItems(sectionId)
  );

  ipcMain.handle(IPC.RulesSyncStart, async (_e, manual?: boolean): Promise<RulesSyncResult> => {
    const result = await syncNow(manual !== false);
    if (result.ok) {
      // remember that content came from the server (for last-sync badge)
      setMeta('syncSource', 'server');
    }
    invalidateIndex();
    return result;
  });

  ipcMain.handle(IPC.RulesChangesGet, (_e, unreadOnly?: boolean): RuleChange[] =>
    getChanges(unreadOnly)
  );

  ipcMain.handle(IPC.RulesChangesMarkRead, (_e, ids: string[]) => {
    markChangesRead(ids);
  });

  ipcMain.handle(IPC.RulesLastSyncGet, (): RulesLastSync => {
    const last = getLastSync();
    return {
      lastSyncAt: last.lastSyncAt,
      source: last.source,
      unreadChanges: last.unreadChanges
    };
  });
}
