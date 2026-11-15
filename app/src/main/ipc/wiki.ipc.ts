import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { loadWikiSeed, clearWikiCache } from '../services/knowledge';
import type {
  MarketPrice,
  MasterlistServer,
  Territory,
  WikiCategory,
  WikiEntry
} from '@shared/types';

export function registerWikiIpc(): void {
  ipcMain.handle(IPC.WikiEntriesGet, (_e, category: WikiCategory | 'all'): WikiEntry[] => {
    const seed = loadWikiSeed();
    return category === 'all'
      ? seed.entries
      : seed.entries.filter((entry) => entry.category === category);
  });

  ipcMain.handle(IPC.WikiMapGet, (): Territory[] => loadWikiSeed().territories);

  ipcMain.handle(IPC.MasterlistServersGet, (): MasterlistServer[] => loadWikiSeed().masterlist);

  ipcMain.handle(IPC.MarketPricesGet, (): MarketPrice[] => loadWikiSeed().market);

  ipcMain.handle(IPC.WikiRefresh, () => {
    // Seed data is read-only for now; the in-memory cache is invalidated
    // so a rebuilt bundle with new content is picked up on next read.
    clearWikiCache();
    return true;
  });
}
