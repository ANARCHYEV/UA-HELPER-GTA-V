# Підключення авторизації та підписки

Для готової програми створіть файл `%APPDATA%/UA Helper/app.config.json`.
Він автоматично накладається на вбудований конфіг після перезапуску і підходить
для portable та встановлюваної версії. Для розробки можна редагувати
`app/config/app.config.json` **до збірки**. Не зберігайте в жодному з них токен
Telegram-бота або Discord client secret.

## 1. Налаштувати Telegram-бота на сервері

У папці `server` скопіюйте `.env.example` у `.env` і замініть три значення:

```env
TG_BOT_TOKEN=PASTE_NEW_BOTFATHER_TOKEN_HERE
TG_BOT_USERNAME=gtavhelper_bot         # без символу @
TG_WEBHOOK_SECRET=replace_with_a_long_random_secret

# якщо потрібна перевірка підписки в Telegram:
TELEGRAM_SUBSCRIPTION_CHAT=@your_channel
```

Значення `TG_BOT_TOKEN` вставте в `server/.env` **без лапок**, а не в JSON
клієнта. Файл `server/.env` не комітьте і не віддавайте разом із portable.

Після запуску API на VPS виконайте:

```bash
npm run tg:set-webhook -- https://api.gtavhelper.pp.ua
```

Токен бота **не** вказується у клієнтському JSON: інакше його зможе витягти
будь-хто з portable-збірки.

Для Discord додайте в той самий `server/.env`:

```env
DISCORD_CLIENT_ID=PASTE_DISCORD_APPLICATION_ID_HERE
DISCORD_CLIENT_SECRET=PASTE_DISCORD_CLIENT_SECRET_HERE
DISCORD_REDIRECT_URI=https://api.example.org/v1/auth/discord/callback
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN_HERE
DISCORD_GUILD_ID=123456789012345678
DISCORD_ROLE_ID=123456789012345678
```

У Discord Developer Portal цей самий Redirect URL має бути доданий у OAuth2.
`DISCORD_CLIENT_SECRET` і `DISCORD_BOT_TOKEN` ніколи не вставляються у portable.

## 3. Discord Rich Presence

Rich Presence працює локально через встановлений Discord Desktop і не потребує
backend-а або bot token. У клієнтському `app.config.json` достатньо вказати
публічний `auth.discordClientId`. Для картинок створіть у Discord Developer
Portal → Rich Presence → Art Assets ключі `ua_helper` (велика і мала картинка).
Якщо Discord або asset не налаштовані, програма продовжить працювати без RPC.

## 2. Увімкнути методи входу у клієнті

У `%APPDATA%/UA Helper/app.config.json` вставте лише цей override (публічні
значення). За основу можна взяти `app.config.override.example.json`:

```json
"backend": {
  "baseUrl": "https://api.gtavhelper.pp.ua",
  "timeoutMs": 12000
},
"auth": {
  "mode": "telegram",
  "telegramBotUsername": "gtavhelper_bot",
  "discordClientId": "",
  "discordRedirectUri": "",
  "subscription": {
    "enabled": false,
    "provider": "telegram",
    "telegramChannel": "",
    "discordGuildId": "",
    "discordRoleId": ""
  }
}
```

Значення `mode`: `telegram`, `discord` або `both`. Локального профілю в новій
версії немає.

`subscription.enabled: false` повністю вимикає перевірку підписки. Увімкніть її
лише після того, як сервер уже відповідає на endpoint нижче.

## 4. Що розмістити на сервері

Desktop-клієнт уже викликає ці JSON endpoint-и відносно `backend.baseUrl`:

| Endpoint | Призначення |
| --- | --- |
| `POST /v1/auth/telegram/start` | Створює короткоживучий код для `/start` у боті. |
| `POST /v1/auth/telegram/poll` | Приймає `{ "code": "ABC123" }`, повертає стан входу. |
| `POST /v1/auth/discord/start` | Створює Discord OAuth state і повертає URL авторизації. |
| `POST /v1/auth/discord/poll` | Приймає `{ "state": "..." }`, повертає стан входу. |
| `POST /v1/auth/subscription/check` | Перевіряє членство в каналі/сервері та роль. |

При успіху `telegram/poll` або `discord/poll` сервер повертає:

```json
{ "status": "approved", "nickname": "Player", "telegramUser": "123" }
```

або для Discord:

```json
{ "status": "approved", "nickname": "Player", "discordUser": "123" }
```

Endpoint перевірки підписки повертає:

```json
{ "required": true, "allowed": true, "provider": "either" }
```

`client_secret`, токен Telegram-бота, Discord bot token та доступ до ролей мають
зберігатися тільки у змінних оточення backend-а. Клієнт передає тільки
ідентифікатори користувача, отримані після авторизації.
