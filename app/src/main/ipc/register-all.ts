import { registerAppIpc } from './app.ipc';
import { registerWindowIpc } from './window.ipc';
import { registerHotkeysIpc } from './hotkeys.ipc';
import { registerSettingsIpc } from './settings.ipc';
import { registerAccountIpc } from './account.ipc';
import { registerRulesIpc } from './rules.ipc';
import { registerLawsIpc } from './laws.ipc';
import { registerSearchIpc } from './search.ipc';
import { registerAiIpc } from './ai.ipc';
import { registerVoiceIpc } from './voice.ipc';
import { registerWikiIpc } from './wiki.ipc';
import { registerUpdatesIpc } from './updates.ipc';

/** Registers every IPC domain. Call once from the main entry. */
export function registerAllIpc(): void {
  registerAppIpc();
  registerWindowIpc();
  registerHotkeysIpc();
  registerSettingsIpc();
  registerAccountIpc();
  registerRulesIpc();
  registerLawsIpc();
  registerSearchIpc();
  registerAiIpc();
  registerVoiceIpc();
  registerWikiIpc();
  registerUpdatesIpc();
}
