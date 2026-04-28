# anjelbuff

A Telegram bot that lets users authenticate on a third-party website via a Telegram Web App and check their account status.

## How it works

The bot runs an Express server that proxies the target site's login page inside a Telegram Web App. The user fills in their credentials directly in the bot — Playwright intercepts the form, captures the session cookies, and stores them in SQLite.

## Commands

| Command   | Description                               |
| --------- | ----------------------------------------- |
| `/login`  | Opens the login form via Telegram Web App |
| `/me`     | Shows account status (ID, Pro)            |
| `/logout` | Deletes the saved session                 |

## Environment variables

Create a `.env` file:

```env
BOT_TOKEN=your_bot_token_from_BotFather
PROXY_HOST=https://your-server.com  # public address of the Express server
```

## Running

```bash
pnpm install
pnpm dev        # development (nodemon + ts-node)
```

Production with PM2:

```bash
pnpm build
pm2 start dist/bot.js --name anjelbuff
```

## Deployment

Automatic deployment via GitHub Actions on push to `main`.

Required repository secrets (`Settings → Secrets and variables → Actions`):

| Secret     | Value           |
| ---------- | --------------- |
| `SSH_HOST` | Server IP       |
| `SSH_USER` | Server username |
| `SSH_KEY`  | Private SSH key |

## Stack

- [Telegraf](https://telegraf.js.org/) — Telegram Bot API
- [Playwright](https://playwright.dev/) — browser automation for login
- [Express](https://expressjs.com/) — proxy server for the Web App
- [sql.js](https://github.com/sql-js/sql.js) — session storage
