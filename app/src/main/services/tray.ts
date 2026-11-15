import { app, Menu, nativeImage, Tray } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config-loader';
import { logger } from './logger';

let tray: Tray | null = null;

function trayIconPath(): string | null {
  const dev = join(app.getAppPath(), 'build', 'tray.png');
  if (existsSync(dev)) return dev;
  const packed = join(process.resourcesPath ?? '', 'build', 'tray.png');
  return existsSync(packed) ? packed : null;
}

export function createTray(onOpenLauncher: () => void, onToggleOverlay: () => void): void {
  if (tray) return;
  const cfg = loadConfig();
  const iconPath = trayIconPath();
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip(cfg.product.name);

  const menu = Menu.buildFromTemplate([
    { label: `Відкрити ${cfg.product.name}`, click: onOpenLauncher },
    { label: 'Показати оверлей', click: onToggleOverlay },
    { type: 'separator' },
    {
      label: 'Вихід',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', onOpenLauncher);
  logger.info('tray: created', { iconPath });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
