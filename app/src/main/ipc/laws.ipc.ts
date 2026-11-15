import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { getLawItems } from '../services/storage';
import { searchLaws } from '../services/retrieval';
import type { LawItem } from '@shared/types';

export function registerLawsIpc(): void {
  ipcMain.handle(IPC.LawsAllGet, (): LawItem[] => getLawItems());

  ipcMain.handle(IPC.LawsSearch, (_e, query: string): LawItem[] =>
    searchLaws(query, 30)
  );
}
