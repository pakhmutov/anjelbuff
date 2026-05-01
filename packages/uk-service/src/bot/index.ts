import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { db } from '../db/client.ts';

type AuthStep = 'awaiting_login' | 'awaiting_password';

interface AuthState {
    step: AuthStep;
    accountId: string;
    login?: string;
    loginMsgId?: number;
}

const pendingAuth = new Map<number, AuthState>();

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

    bot.command('connect', async (ctx) => {
        const userId = ctx.from.id;

        if (pendingAuth.has(userId)) {
            pendingAuth.delete(userId);
        }

        await db.query(
            `INSERT INTO users (id, username) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
            [userId, ctx.from.username ?? null],
        );

        const accountResult = await db.query(
            `INSERT INTO site_accounts (user_id, label, status)
             VALUES ($1, 'default', 'pending')
             ON CONFLICT (user_id, label) DO UPDATE SET status = 'pending'
             RETURNING id`,
            [userId],
        );
        const accountId = accountResult.rows[0].id as string;

        pendingAuth.set(userId, { step: 'awaiting_login', accountId });

        await ctx.reply('Введи логин (email) от аккаунта на сайте:');
    });

    bot.command('status', async (ctx) => {
        const result = await db.query(
            `SELECT sa.label, sa.status, s.last_used_at
             FROM site_accounts sa
             LEFT JOIN sessions s ON s.account_id = sa.id
             WHERE sa.user_id = $1`,
            [ctx.from.id],
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

    bot.command('disconnect', async (ctx) => {
        pendingAuth.delete(ctx.from.id);

        await db.query(
            `UPDATE site_accounts SET status = 'paused'
             WHERE user_id = $1 AND status != 'paused'`,
            [ctx.from.id],
        );

        ctx.reply('⏸ Аккаунт поставлен на паузу. /connect чтобы возобновить.');
    });

    // Обработка текстовых сообщений — сбор credentials
    bot.on(message('text'), async (ctx) => {
        const userId = ctx.from.id;
        const state = pendingAuth.get(userId);

        if (!state) return;

        if (state.step === 'awaiting_login') {
            state.login = ctx.message.text;
            state.loginMsgId = ctx.message.message_id;
            state.step = 'awaiting_password';

            await ctx.reply('Теперь введи пароль:\n⚠️ Сообщение удалится сразу после отправки.');
            return;
        }

        if (state.step === 'awaiting_password') {
            const password = ctx.message.text;
            const passwordMsgId = ctx.message.message_id;

            pendingAuth.delete(userId);

            // Удалить сообщения с credentials
            await Promise.allSettled([
                ctx.deleteMessage(passwordMsgId),
                state.loginMsgId ? ctx.deleteMessage(state.loginMsgId) : Promise.resolve(),
            ]);

            // Создать login_request с credentials — воркер сразу логинится
            await db.query(
                `INSERT INTO login_requests (account_id, status, login_enc, password_enc)
                 VALUES ($1, 'pending', $2, $3)`,
                [state.accountId, state.login, password],
            );

            await ctx.reply('⏳ Подключаю... Воркер залогинится и уведомит тебя.');
        }
    });

    return bot;
}
