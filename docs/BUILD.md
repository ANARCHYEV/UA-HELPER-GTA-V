# Сборка UA Helper

## Требования

- Node.js >= 20 (рекомендуется 22 LTS)
- Windows 10/11 для NSIS/portable-сборки (на Linux собирается dev-сборка и `--dir`)
- npm 10+

## Установка

```bash
npm install        # из корня монорепо (workspaces app + server)
```

Примечание: `better-sqlite3` и `koffi` — нативные модули, но оба качают готовые
prebuild-бинарники (сборка из исходников с Python + MS Build Tools не требуется,
пока есть доступ к github.com). electron-builder при `build:win` сам пересобирает
их под Electron ABI в момент упаковки.

## Troubleshooting: "prebuild download failed" (Windows)

Если `npm run rebuild:electron` падает с ошибкой скачивания prebuild:

1. Проверь доступ к github.com — prebuild-архивы лежат в releases better-sqlite3.
   Сам Electron при `npm install` скачивается тоже с github.com, так что если
   установка прошла — доступ есть, просто запусти rebuild повторно.
2. Скрипт запускает prebuild-install напрямую через Node (минуя npm-шимы из
   `node_modules/.bin`, которые в cmd Windows не работают) — лог скачивания
   виден в консоли (`prebuild-install http 200 ...`).
3. Ручной вариант той же операции:
   ```bash
   cd node_modules\better-sqlite3
   node ..\prebuild-install\bin.js --runtime=electron --target=33.4.11 --force
   cd ..\..
   ```
   Версию Electron смотри в `node_modules\electron\package.json`.
4. Совсем без сети — сборка из исходников (нужны Python 3 + Visual Studio
   Build Tools):
   ```bash
   cd node_modules\better-sqlite3
   npx node-gyp rebuild --runtime=electron --target=33.4.11 --dist-url=https://electronjs.org/headers
   ```

## Нативный модуль и две среды исполнения

Приложение (Electron) и сервер (Node.js) используют одну и ту же версию
`better-sqlite3` (11.9.1), но требуют разных ABI.
npm ставит одну общую (hoisted) копию в корневой `node_modules`, поэтому её ABI
переключается скриптами:

- `npm run rebuild:electron` — общая копия -> Electron ABI (нужно для `npm run dev`;
  он запускает это автоматически перед стартом);
- `npm run rebuild:node` — общая копия -> Node ABI (нужно для сервера;
  `npm run server:dev` тоже делает это сам).

Из этого следует: в dev-режиме на одной машине приложение и сервер одновременно
не запустить — заверши одно, запусти другое (ABI переключится сам). В продакшене
проблемы нет: electron-builder пакует свою пересобранную копию в asar, а сервер
на VPS ставит свои зависимости отдельно.

## Режим разработки

```bash
npm run dev        # electron-vite dev (hot reload main/preload/renderer)
npm run server:dev # Fastify API на :3000 (отдельный терминал, опционально)
```

Чтобы подключить приложение к локальному серверу, временно поменяй
`app/config/app.config.json`:

```json
"backend": { "baseUrl": "http://localhost:3000", ... }
```

и при необходимости `"auth": { "mode": "local" }` — тогда вход будет по локальному
нику, без Telegram-бота. Не забудь вернуть значения перед сборкой релиза.

## Прод-сборка

```bash
cd app
npm run build:dir     # распакованная сборка в app/release/win-unpacked
npm run build:win     # NSIS-установщик + portable в app/release/
```

Артефакты:
- `UA Helper-1.0.0-setup.exe` — установщик (выбор директории, ярлыки)
- `UA Helper-1.0.0-portable.exe` — портативная версия
- `latest.yml` — генерируется отдельно для апдейтера (см. ниже)

## Что попадает в сборку

- `out/**` — бандлы main/preload/renderer (electron-vite)
- `config/app.config.json` — конфиг бренда (ВНУТРИ asar, но читается в рантайме)
- `build/` → `resources/build/` — иконки (extraResources)

## Иконка и брендинг

1. Замени `app/build/icon.ico` (256x256, PNG-in-ICO допустим), `icon.png`, `tray.png`.
2. Обнови `app/config/app.config.json` (название, слоган, акценты).
3. Обнови `app/electron-builder.yml` (`productName`, `appId`, `publish.url`) — держи синхронно с конфигом.
4. Замени `app/src/renderer/src/assets/partner-badge.png` и `assets/guide/step-N.gif`.

## Обновления через свой VPS

1. Собери установщик: `npm run build:win`.
2. Сгенерируй фид:
   ```bash
   cd ../server
   npx tsx scripts/gen-latest-yml.ts 1.0.1 ../app/release/"UA Helper-1.0.1-setup.exe"
   ```
3. Скопируй `latest.yml` + `.exe` в директорию, которую nginx раздаёт как `/downloads/`
   (см. `deploy/nginx.conf`).
4. `app/config/app.config.json → updates.url` должен указывать на этот путь.

electron-updater: проверка при старте (настройка), ручная проверка в настройках,
скачивание с прогрессом, установка при выходе.

## Подпись (опционально)

В `electron-builder.yml` добавь блок `win.certificateFile`/`certificatePassword`
или используй переменные окружения `CSC_LINK`, `CSC_KEY_PASSWORD`.

## Типовая проверка перед релизом

- `npm run typecheck` — без ошибок
- `npm run lint`
- `npm run build` — бандлы без warnings, кроме размера renderer (React)
- ручной сценарий: сплэш → вход (демо/Telegram) → лаунчер → оверлей → ШИ-визард →
  правила → изменения → настройки → проверка fullscreen-подсказки.
