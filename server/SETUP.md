# UA Helper backend

## Первый запуск

1. Скопируйте `.env.example` в `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Откройте `server/.env` и заполните значения интеграций:

   - `TG_BOT_TOKEN` — токен, который выдаёт `@BotFather`;
   - `TG_BOT_USERNAME` — username бота без `@`;
   - `TG_WEBHOOK_SECRET` — новый длинный случайный секрет;
   - `TELEGRAM_SUBSCRIPTION_CHAT` — `@channel` или numeric chat id, если нужна проверка подписки;
   - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` — OAuth Discord;
   - `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ROLE_ID` — проверка Discord-сервера/роли.
   - `ADMIN_TOKEN` — отдельный длинный случайный токен для оператора сервера;
     он открывает только ручной sync и диагностические статусы.

   Токены и client secret хранятся только в `server/.env`. Не вставляйте их в
   `app.config.json` и не отправляйте вместе с portable-сборкой.

3. Запустите API:

   ```powershell
   npm install
   npm run build
   npm start
   ```

4. Для Telegram задайте webhook после публикации API:

   ```powershell
   npm run tg:set-webhook -- https://api.example.org
   ```

## Клиентская настройка

В `%APPDATA%/UA Helper/app.config.json` указываются только публичные значения:

```json
{
  "backend": { "baseUrl": "https://api.example.org", "timeoutMs": 12000 },
  "auth": {
    "mode": "both",
    "telegramBotUsername": "your_bot_username",
    "discordClientId": "123456789012345678",
    "discordRedirectUri": "https://api.example.org/v1/auth/discord/callback",
    "subscription": {
      "enabled": true,
      "provider": "either",
      "telegramChannel": "@your_channel",
      "discordGuildId": "123456789012345678",
      "discordRoleId": "123456789012345678"
    }
  }
}
```

`subscription.enabled: false` отключает gate полностью.

`ADMIN_TOKEN`, токены ботов и Discord client secret остаются исключительно на
сервере. В portable-клиенте должен быть только `backend.baseUrl` вида
`https://api.example.org` и публичные идентификаторы OAuth.

## Импорт правил

Парсер проходит весь раздел XenForo: основной раздел, подразделы, пагинацию и
все видимые темы. Он сохраняет номер пункта, тематический заголовок, санкцию,
примечания и ссылку на исходную тему. По умолчанию настроены официальные
разделы проекта:

```env
FORUM_RULES_URL=https://forum.ukraine-gta5.com.ua/forums/%D0%97%D0%B0%D0%B3%D0%B0%D0%BB%D1%8C%D0%BD%D1%96-%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0-%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82%D1%83.4/
FORUM_LAWS_URL=https://forum.ukraine-gta5.com.ua/forums/%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%D0%B8.61/
```

Импорт запускается автоматически при старте API (`SYNC_ON_START=true`) и далее
по `SYNC_CRON` (по умолчанию каждые шесть часов). Повторно скачиваются только
изменившиеся страницы: используются ETag и Last-Modified, между запросами есть
пауза `CRAWLER_DELAY_MS`. При временной сетевой ошибке или Cloudflare challenge
backend делает не более трёх обычных повторов с паузами 15, 60 и 180 минут
(`SYNC_RETRY_MINUTES`, значения меньше пяти минут игнорируются); это не
обходит защиту и не создаёт частый трафик.
Ручной запуск нужен только для немедленной проверки:

```powershell
npm run sync:run
```

Перед удалением записей синхронизатор проверяет полноту обхода. Если форум,
одна из тем или DNS недоступны, он не стирает предыдущий кэш. Cloudflare и
другие анти-DDoS проверки не обходятся: нужно разрешить IP сервера у владельца
форума либо получить их официальный экспорт/API.

### Офлайн-импорт без доступа к форуму

Если сервер не может открыть форум, импорт можно выполнить из вручную
сохранённого JSON-снимка. Этот путь **не запускает браузер, не делает HTTP
запросов и не эмулирует пользователя**. Он принимает только страницы
`forum.ukraine-gta5.com.ua` из настроенных разделов правил и законов; неполный
снимок завершится ошибкой до изменения базы.

Формат `forum-snapshot.json`:

```json
{
  "version": 1,
  "rules": {
    "rootUrl": "https://forum.ukraine-gta5.com.ua/forums/...",
    "pages": [
      { "url": "https://forum.ukraine-gta5.com.ua/forums/...", "html": "<!doctype html>..." },
      { "url": "https://forum.ukraine-gta5.com.ua/threads/...", "html": "<!doctype html>..." }
    ]
  },
  "laws": {
    "rootUrl": "https://forum.ukraine-gta5.com.ua/forums/...",
    "pages": []
  }
}
```

В `pages` должны быть корневой раздел, все найденные подразделы, страницы
пагинации и темы, на которые они ссылаются. Секцию `laws` можно временно не
добавлять: тогда существующие законы не меняются. Запуск:

```powershell
npm run sync:import -- C:\path\to\forum-snapshot.json
```
