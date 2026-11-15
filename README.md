# UA Helper

Оверлей для **Ukraine GTA 5**: пошук правил і законів, відповіді ШІ, голосове введення та журнал змін правил.

## Можливості

- Оверлей поверх гри з налаштовуваними гарячими клавішами.
- Пошук у локальному кеші правил і законів.
- Відповіді ШІ через OpenRouter з особистим API ключем.
- Синхронізація та журнал змін правил.

Передавання й зберігання даних описані в [документації](docs/TRANSPARENCY.md).

## Структура репозиторію

```
app/       Electron-додаток (electron-vite + TypeScript + React 19)
  config/app.config.json     бренд, бекенд, проєкти, моделі ШІ, оновлення
  src/main/                  головний процес: вікна, ipc/, services/, база знань
  src/preload/               типізований contextBridge (window.api)
  src/renderer/              інтерфейс (українською): сторінки, дизайн-система, i18n
  src/shared/                ЄДИНИЙ список IPC-каналів + типи + константи
server/     Бекенд на Node.js (Fastify 5) + SQLite + cron-воркер форуму
  deploy/    nginx.conf, systemd-юнит, backup.sh
  whisper/   sidecar faster-whisper (Docker profile "voice")
  scripts/   генерація latest.yml, встановлення Telegram-вебхука, демо-синк
docs/       ARCHITECTURE.md, BUILD.md, IPC.md
```

## Швидкий старт (розробка)

```bash
npm install          # з кореня монорепо
npm run dev          # Electron-додаток у режимі розробки (сам оновлює ABI нативного модуля)
npm run server:dev   # бекенд на :3000 (окремо)
```

Щоб під'єднати застосунок до локального бекенда — тимчасово постав
`app/config/app.config.json → backend.baseUrl = "http://localhost:3000"`
і налаштуй Telegram-бота за інструкцією `app/config/AUTH_SETUP.md`.
Докладніше про ABI нативних модулів — `docs/BUILD.md`.

## Збірка Windows-установщика

```bash
cd app
npm run build:win    # NSIS + portable у app/release/
```

Потрібен Windows (або CI з Windows runner). Деталі — `docs/BUILD.md`.

## Що потрібно заповнити (параметри)

| Де | Що |
|---|---|
| `app/config/app.config.json` | `product.name`, `branding.accent`, `backend.baseUrl`, `updates.url`, `forum.*`, `auth.telegramBotUsername` |
| `app/electron-builder.yml` | `productName`, `appId`, `publish.url` (синхронно з конфігом) |
| `server/.env` | `TG_BOT_TOKEN`, `FORUM_RULES_URL`, `FORUM_LAWS_URL`, `DOWNLOADS_PUBLIC_URL`, `ADMIN_TOKEN` |
| `app/src/renderer/src/assets/` | `partner-badge.png` (партнерська плашка), `guide/step-N.gif` (кроки визарда ШІ) |
| `app/build/` | можна замінити `icon.ico`/`icon.png`/`tray.png` (згенеровані плейсхолдери) |

## Документація

- `docs/ARCHITECTURE.md` — схема модулів, потоки даних, БД.
- `docs/BUILD.md` — збірка, підпис, portable-версія.
- `docs/IPC.md` — повний список каналів IPC.
- `server/deploy/DEPLOY.md` — деплой на VPS покроково (Docker, nginx, HTTPS, бекапи, бот).
