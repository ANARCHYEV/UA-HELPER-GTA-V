# Деплой UA Helper API на VPS

Универсальная инструкция (Linux x64, любой свежий дистрибутив: Ubuntu/Debian/Alma и т.д.).
Основной путь — production Docker Compose с автоматическим HTTPS; запасной —
systemd/pm2 (раздел в конце).

## 0. Предпосылки

- VPS: 1 vCPU / 1 ГБ RAM минимум (без Whisper), 2–4 ГБ RAM если нужен локальный Whisper
- Домен, указывающий на VPS (A-запись), например `api.example.com`
- Порты 80/443 открыты

## 1. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

## 2. Код и переменные окружения

```bash
git clone <твой-репозиторий> /opt/ua-helper
cd /opt/ua-helper/server
cp .env.example .env
nano .env
```

Заполни как минимум:
- `TG_BOT_TOKEN` — токен бота от @BotFather (вход через Telegram)
- `TG_BOT_USERNAME` — имя бота без @
- `TG_WEBHOOK_SECRET` — случайная строка (проверка запросов Telegram)
- `FORUM_RULES_URL` — корневой раздел правил Ukraine GTA 5 (готовый URL уже есть в `.env.example`)
- `FORUM_LAWS_URL` — отдельная тема законов, только если у проекта есть подтверждённый публичный URL
- `DOWNLOADS_PUBLIC_URL` — публичный URL каталога обновлений (https://…/downloads)
- `ADMIN_TOKEN` — случайная строка
- `API_DOMAIN` — домен API, например `api.example.com`; его DNS A/AAAA-запись
  должна уже указывать на VPS до запуска Caddy.

Для нативного systemd-развёртывания используйте отдельный шаблон
`deploy/server.env.production.example`: там backend слушает только
`127.0.0.1:3099` (`HOST=127.0.0.1`), а база хранится в `/var/lib/ua-helper`.

## 3. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api
curl https://api.example.com/v1/health
```

Production compose поднимает Caddy: TLS-сертификат выпускается и обновляется
автоматически. SQLite не опубликована наружу — она видна только контейнеру
`api` через volume `./data`. Порт 3000 также не пробрасывается на VPS.
Для безопасной проверки compose без реальных секретов можно использовать
`API_DOMAIN=api.example.org API_ENV_FILE=.env.example docker compose -f docker-compose.prod.yml config`.

Без локального Whisper (если VPS слабый) — оставь `TRANSCRIBE_PROVIDER=external`
и заполни `TRANSCRIBE_EXTERNAL_URL`/`KEY`, либо вообще не активируй голосовой ввод
в клиенте (кнопка просто покажет ошибку «сервер недоступен»).

С локальным Whisper (нужно ~1.5 ГБ RAM):
```bash
docker compose --profile voice up -d --build
# .env: TRANSCRIBE_PROVIDER=local, TRANSCRIBE_LOCAL_URL=http://whisper:8000
```

## 4. HTTPS

В `docker-compose.prod.yml` HTTPS обслуживает Caddy. Не нужны certbot, ручное
копирование ключей или открытый HTTP API: достаточно корректной A/AAAA-записи
домена и открытых на VPS портов 80/443. Старый `docker-compose.yml` с nginx
оставлен только для локальной разработки и миграций.

## 5. Telegram-вебхук

```bash
npx tsx scripts/set-webhook.ts https://api.example.com
read -rsp "ADMIN_TOKEN: " ADMIN_TOKEN; echo
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.example.com/v1/auth/telegram/status
```

## 6. Обновления приложения

```bash
mkdir -p /opt/ua-helper/server/downloads   # уже смонтирован в nginx как /var/www/downloads
# после сборки нового установщика (см. docs/BUILD.md):
npx tsx scripts/gen-latest-yml.ts 1.0.1 "./UA Helper-1.0.1-setup.exe"
cp "UA Helper-1.0.1-setup.exe" downloads/
```

`latest.yml` генерируется в `server/downloads/` — nginx отдаёт его по `/downloads/latest.yml`.

## 7. Синхронизация правил

- Cron уже внутри API (`SYNC_CRON=0 */6 * * *` в .env).
- Ручной запуск: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://api.example.com/v1/rules/sync`
- Статус: `curl https://api.example.com/v1/rules/status`

`ADMIN_TOKEN` нужен только оператору сервера. Перед ручным запросом задай его
в текущей shell-сессии через `read -rsp "ADMIN_TOKEN: " ADMIN_TOKEN; echo`.
Он не передаётся Electron-клиенту,
не добавляется в `app.config.json` и не должен попадать в логи. Без него ручной
sync и статусы авторизации отключены; штатный cron продолжает работать.

Парсер бережный: robots.txt, ETag/If-Modified-Since, пауза между запросами
(`CRAWLER_DELAY_MS`), рекурсивный обход разделов XenForo, пагинация, хэш каждого
пункта. Форум сейчас защищён Cloudflare: без согласованного allowlist IP VPS или
официального API/экспорта синхронизация намеренно остановится с понятной ошибкой
и не удалит ранее полученные правила. Не пытайся обходить challenge.

## 8. Бекапы

```bash
sudo apt install sqlite3
chmod +x /opt/ua-helper/server/deploy/backup.sh
# cron: ежедневно в 04:00
0 4 * * * /opt/ua-helper/server/deploy/backup.sh
```

Бэкапы хранятся 14 дней (`KEEP_DAYS` в скрипте).

## 9. Мониторинг

- `GET /v1/health` — liveness (для UptimeRobot/BetterStack)
- `docker compose logs -f` — логи (логирование включено на ключевых операциях)

## Запасной вариант: systemd / pm2 (без Docker)

```bash
sudo apt install nodejs npm sqlite3   # Node 20+
cd /opt/ua-helper/server
npm install && npm run build
sudo cp deploy/ua-helper-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ua-helper-api
```

pm2-вариант: `npm i -g pm2 && pm2 start dist/index.js --name ua-helper-api && pm2 save`.

nginx ставится отдельно (`apt install nginx`), конфиг тот же `deploy/nginx.conf`.

### Nginx + certbot на сервере с существующими сайтами

Если 80/443 уже обслуживаются системным nginx, не запускайте второй proxy.
Сначала скопируйте `deploy/nginx.ua-helper.http.conf` в `/etc/nginx/conf.d/`,
проверьте `sudo nginx -t` и перезагрузите nginx. После того как DNS домена уже
указывает на этот VPS, выпустите сертификат через webroot:

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot \
  -d gtavhelper.pp.ua -d www.gtavhelper.pp.ua -d api.gtavhelper.pp.ua
```

Затем замените HTTP-конфиг на `nginx.ua-helper.https.conf`, снова выполните
`sudo nginx -t && sudo systemctl reload nginx` и настройте автоматический
`certbot renew`.

## Чеклист после деплоя

- [ ] `curl https://api.example.com/v1/health` → `{"status":"ok"}`
- [ ] `curl -H "Authorization: Bearer $ADMIN_TOKEN" /v1/auth/telegram/status` → `configured: true`
- [ ] в приложении: вход по коду проходит, правила синхронизируются
- [ ] голосовое введение возвращает текст
- [ ] `updates.check` в настройках видит `latest.yml`
