# IPC-каналы

Единственный источник: `app/src/shared/ipc-channels.ts`. Типы payload/ответов — `app/src/shared/types.ts` (интерфейс `Api`).

## Запросы (invoke)

| Группа | Канал | Назначение |
|---|---|---|
| app | `app:info:get` | конфиг + версии (бренд, модели, проекты) |
| app | `app:external:open` | открыть http(s) в системном браузере |
| app | `app:cli:get-args` | `--hidden`, `--no-launcher`, `--project=` |
| window | `window:control` | minimize / hide / close |
| window | `window:pin:toggle`, `window:pin:get` | закрепление поверх |
| window | `window:opacity:set` | прозрачность оверлея 0.3–1 |
| window | `window:streamer:set` | защита от захвата экрана |
| window | `window:overlay:toggle` | показать/скрыть оверлей |
| window | `window:ai:open`, `window:wiki:open` | открыть окна ИИ/вики |
| window | `window:fullscreen:check` | koffi + SHQueryUserNotificationState |
| window | `window:on-top:set` | always-on-top вкл/выкл |
| hotkeys | `hotkeys:get-all`, `hotkeys:set` | глобальные клавиши (overlay/PTT) |
| settings | `settings:get-all`, `settings:patch` | настройки (autoLaunch применяется в ОС) |
| settings | `settings:stats:get` | запросы к ИИ: сегодня / всего |
| settings | `settings:history:clear` | очистка истории ИИ |
| account | `account:mode:get` | способ входа из конфига |
| account | `account:profile:get`, `account:nickname:set`, `account:logout` | профиль |
| account | `account:telegram:start`, `account:telegram:poll` | вход по коду (демо — при недоступном VPS) |
| rules | `rules:sections:get`, `rules:items:get` | база знаний |
| rules | `rules:sync:start` | синхронизация (сервер → кэш) |
| rules | `rules:changes:get`, `rules:changes:mark-read` | лента изменений |
| rules | `rules:last-sync:get` | время/источник последнего синка |
| laws | `laws:all:get`, `laws:search` | законы + BM25 |
| search | `search:quick` | быстрый поиск rules+laws |
| ai | `ai:status:get` | есть ключ / валиден / модель |
| ai | `ai:key:set`, `ai:key:remove` | BYOK-ключ (safeStorage + live-проверка) |
| ai | `ai:models:list` | живой список моделей OpenRouter |
| ai | `ai:ask` → jobId, `ai:cancel` | запрос со стримингом / отмена |
| ai | `ai:history:list/delete/rate` | история (поиск, удаление, 👍/👎) |
| ai | `ai:nickname:check` | проверка ника (mode='nickname') |
| voice | `voice:devices:get` | микрофоны (navigator в preload) |
| voice | `voice:transcribe` | буфер → VPS → текст |
| wiki | `wiki:entries:get`, `wiki:map:territories:get` | вики/карта |
| wiki | `masterlist:servers:get`, `market:prices:get`, `wiki:refresh` | серверы/цены |
| updates | `updates:check/download/install` | electron-updater |

## События (main → renderer)

| Канал | Payload |
|---|---|
| `event:ai:chunk` | `{ jobId, delta }` |
| `event:ai:done` | `{ jobId, answer, modelId, latencyMs, historyId }` |
| `event:ai:error` | `{ jobId, code, message(uk), suggestFallback? }` |
| `event:ai:fallback` | `{ jobId, fromModel, toModel, auto, reason }` |
| `event:voice:ptt` | push-to-talk toggle |
| `event:updates:state` | `{ status, version?, progress?, error? }` |
| `event:backend:status` | `{ online, checkedAt }` |
| `event:rules:update-available` | `{ unread }` |

Preload открывает события только через whitelist (`LISTENABLE_CHANNELS`).
