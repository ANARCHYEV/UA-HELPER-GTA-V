import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { searchAll } from '../services/retrieval';
import type { SearchHit } from '@shared/types';

export function registerSearchIpc(): void {
  ipcMain.handle(IPC.SearchQuick, (_e, query: string, kind?: 'rule' | 'law'): SearchHit[] =>
    typeof query === 'string' ? searchAll(query.slice(0, 8000), 25, kind) : []
  );
}
