import 'dotenv/config';
import express from 'express';
import { migrate } from './db/migrate.ts';
import { api } from './api/index.ts';
import { createBot } from './bot/index.ts';
import { startNotifier } from './bot/notifier.ts';

async function main() {
    await migrate();

    // REST API для ru-worker
    const app = express();
    app.use(express.json());
    app.use('/api/v1', api);
    app.listen(3001, () => console.log('🚀 API on :3001'));

    // Telegram bot
    const bot = createBot();
    bot.launch();
    startNotifier(bot);
    console.log('🤖 Bot started');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
