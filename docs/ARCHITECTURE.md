# Архитектура UA Helper

## Общая схема

```
┌─────────────────── Renderer (React 19, uk) ────────────────────┐
│  Splash → Login → Launcher (sidebar) ⇄ Overlay / AI / Wiki     │
│  дизайн-система: tokens.css + ui/* + AnimatedBackground        │
└──────────────▲─────────────────────────────────────────────────┘
               │ window.api — типизированный contextBridge (IPC.md)
┌──────────────┴──────────── Main-процесс (TypeScript) ───────────┐
│  windows/        launcher, overlay (always-on-top), ai, wiki    │
│  ipc/            по файлу на домен, каналы из shared/ipc-channels│
│  services/                                                      │
│   ├─ ai-client      ─► OpenRouter напрямую (BYOK, стриминг,     │
│   │                    fallback-цепочка, отмена через Abort)    │
│   ├─ rules-sync     ─► VPS /v1/rules → кэш SQLite → diff-события│
│   ├─ retrieval      BM25 по локальной базе знаний (оффлайн)     │
│   ├─ voice-recorder ─► VPS /v1/voice/transcribe (лимиты, ошибки)│
│   ├─ key-vault      ключ OpenRouter в safeStorage (DPAPI)       │
│   ├─ hotkeys/tray/auto-launch/updater/fullscreen-check          │
│   └─ storage        better-sqlite3 (userData/app.db)            │
└─────────────────────────────────────────────────────────────────┘
        │                                  ▲
        ▼                                  │
┌───── VPS: Fastify 5 + SQLite (WAL) ──┐   ┌─ Telegram-бот ─────────┐
│ routes: health, rules(+changes),     │   │ /start <код> → webhook │
│ laws, search, voice, app/version,    │   │ → код одобрен          │
│ auth/telegram, cron-воркер           │   └────────────────────────┘
│ forum-parser (robots.txt, ETag,      │
│ задержки) → diff → versions → DB     │
└──────────────────────────────────────┘
```

## Потоки данных

1. **Правила**: VPS cron парсит форум → diff (add/remove/edit_text/edit_punishment/edit_notes) → `changes` + `rule_versions`. Клиент синхронизируется при старте, раз в час и вручную: `/v1/rules?since=`, `/v1/rules/changes?since=`, кладёт в `rules_cache` и рассылает `event:rules:update-available`.
2. **ИИ**: renderer → `ai:ask` → retrieval (BM25, топ-N пунктов) → системный промпт (украинский, запрет галлюцинаций, ссылки на ID пунктов) → OpenRouter stream → `event:ai:chunk` → `event:ai:done`. Ошибки 401/402/429/5xx маппятся в украинские сообщения; при 402/429/5xx — fallback на следующую рекомендованную модель (авто или по кнопке).
3. **Голос**: MediaRecorder в renderer (webm/opus) → `voice:transcribe` → main POST multipart `/v1/voice/transcribe` → whisper-sidecar или внешний провайдер → текст в поле ввода. Лимиты: длина/размер на клиенте, rate-limit по IP на сервере.
4. **Вход**: `telegram:start` → код → пользователь шлёт `/start <код>` боту → webhook одобряет → `telegram:poll` возвращает профиль. Сервер недоступен → демо-гость (5 сек) или локальный профиль.
5. **Обновления**: electron-updater generic → `<VPS>/downloads/latest.yml` (+ NSIS-файл). Метаданные для UI: `/v1/app/version`.

## База данных

### Клиент (better-sqlite3, `%APPDATA%/UA Helper/app.db`)

| Таблица | Назначение |
|---|---|
| `profile` | текущий профиль (одна строка, id=1) |
| `settings` | настройки (JSON-значения), merged с DEFAULT_SETTINGS |
| `rules_cache`, `rule_sections`, `laws_cache` | локальная копия базы знаний |
| `rule_changes` | diff-записи (прочитанность — локальный флаг) |
| `ai_history` | история запросов к ИИ (prompt, answer, rating) |
| `usage_stats` | счётчик запросов по дням (сегодня/всего) |
| `kb_meta` | lastSyncAt, syncSource, aiKeyValid |

Ключ OpenRouter — НЕ в БД: `userData/keyring.bin`, шифрование safeStorage.

### Сервер (SQLite WAL, volume `/data`)

| Таблица | Назначение |
|---|---|
| `rules`, `laws` | активный контент + `deleted_at` (soft delete) |
| `rule_versions` | снимок каждой версии пункта (JSON) |
| `changes` | лента diff для клиентов (TTL 90 дней) |
| `sync_log` | журнал синхронизаций форума |
| `http_cache` | ETag/Last-Modified для бережного краулера |
| `auth_codes`, `auth_tokens` | вход по коду через Telegram |
| `voice_usage` | дневной лимит распознавания по IP-хэшу |
| `app_releases` | метаданные версий для /v1/app/version |

## Модули renderer

- `components/ui/*` — дизайн-система: Button, Input, Card (.card), Modal, Toast, Tabs, Badge, Skeleton, Tooltip, Switch, HotkeyCapture, TitleBar, Icon (inline SVG).
- `components/common/*` — AnimatedBackground (canvas-волны, ~30fps, `prefers-reduced-motion`), PartnerBadge, DiffText (LCS word-diff), GuideWizard.
- `pages/*` — Splash, Login, Launcher (sidebar), LauncherHome, RulesPage, ChangesPage, WikiPage, SettingsPage, AboutPage, AiPage, Overlay.
- `i18n/uk.json` — все строки интерфейса.

## Точки расширения

- **Новый проект/сервер** — добавить элемент в `config.projects[]` (UI подхватит список автоматически).
- **Новый язык** — добавить `uk2.json` + ключ в `settings.language` (селектор уже есть).
- **Другой провайдер распознавания** — `TRANSCRIBE_PROVIDER=external` + URL/ключ в `.env`.
- **GitHub-обновления** — `updates.provider: "github"` в конфиге.
- **Запуск из официального лаунчера** — флаги `--hidden`, `--no-launcher`, `--project=<id>` уже реализованы.
