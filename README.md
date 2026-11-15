# UA Helper

Оверлей-помічник для рольової гри **Ukraine GTA 5**: швидкий пошук по правилах і законах, база знань, ШІ-асистент (BYOK через OpenRouter), голосовий введення, вики, карта, мастерлист і цини ринку — плюс власний легкий бекенд на твоєму VPS.

## Ключові принципи

- **Власний продукт, а не форк**: код написано з нуля, логіка й набір функцій — за описом оригінальної збірки.
- **Без телеметрії**. Нічого не відправляється на чужі сервери. Єдині зовнішні виклики: твої запити до OpenRouter (з твоїм ключом, напряму з main-процесу) і твій VPS.
- **Брендинг через конфіг**: назва, слоган, кольори, URL бекенду, рекомендовані моделі — в `app/config/app.config.json`. Зміна назви/категорій = правка одного файлу + перезбірка.
- **Офлайн-first**: правила, закони та пошук працюють на локальному кеші (SQLite), якщо VPS недоступний.
- **BYOK**: кожен користувач використовує свій ключ OpenRouter; ключ зберігається зашифрованим (Electron `safeStorage`) і не покидає компʼютер.

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
(і, за потребости, `"auth": { "mode": "local" }` для входу без бота).
Докладніше про ABI нативних модулів — `docs/BUILD.md`.

Демо-режим: без налаштованого VPS і Telegram-бота вхід працює через «демо-гостя» (код підтверджується автоматично через ~5 секунд) або локальний профіль.

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
