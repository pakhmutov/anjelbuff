import { Telegraf } from 'telegraf';
import { db } from '../db/client.ts';

export function createBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN!);

    bot.command('start', (ctx) => {
        ctx.reply(
            'Привет! Я помогаю автоматизировать действия на сайте.\n\n' +
            '/connect — подключить аккаунт\n' +
            '/status — статус аккаунтов\n' +
            '/disconnect — отключить аккаунт',
        );
    });

    // Начать подключение нового аккаунта
    bot.command('connect', async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.username ?? null;

        // Upsert пользователя
        await db.query(
            `INSERT INTO users (id, username) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
            [userId, username],
        );

        // Создать аккаунт + login request
        const accountResult = await db.query(
            `INSERT INTO site_accounts (user_id, label, status)
             VALUES ($1, 'default', 'pending')
             ON CONFLICT (user_id, label) DO UPDATE SET status = 'pending'
             RETURNING id`,
            [userId],
        );
        const accountId = accountResult.rows[0].id as string;

        await db.query(
            `INSERT INTO login_requests (account_id, status) VALUES ($1, 'pending')`,
            [accountId],
        );

        await ctx.reply(
            '⏳ Запрос на подключение создан.\n\n' +
            'Воркер откроет браузер и попросит тебя ввести логин и пароль.\n' +
            'Ожидай сообщения...',
        );
    });

    // Статус аккаунтов пользователя
    bot.command('status', async (ctx) => {
        const userId = ctx.from.id;

        const result = await db.query(
            `SELECT sa.label, sa.status, s.last_used_at
             FROM site_accounts sa
             LEFT JOIN sessions s ON s.account_id = sa.id
             WHERE sa.user_id = $1`,
            [userId],
        );

        if (result.rows.length === 0) {
            return ctx.reply('Нет подключённых аккаунтов. Используй /connect');
        }

        const lines = result.rows.map((r) => {
            const lastUsed = r.last_used_at
                ? new Date(r.last_used_at).toLocaleString('ru')
                : 'никогда';
            return `• ${r.label}: ${r.status} (последняя активность: ${lastUsed})`;
        });

        ctx.reply(lines.join('\n'));
    });

    // Отключить аккаунт
    bot.command('disconnect', async (ctx) => {
        const userId = ctx.from.id;

        await db.query(
            `UPDATE site_accounts SET status = 'paused'
             WHERE user_id = $1 AND status != 'paused'`,
            [userId],
        );

        ctx.reply('⏸ Аккаунт поставлен на паузу. /connect чтобы возобновить.');
    });

    return bot;
}
