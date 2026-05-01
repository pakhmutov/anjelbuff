import type { Telegraf } from 'telegraf';
import { db } from '../db/client.ts';

export function startNotifier(bot: Telegraf) {
    setInterval(() => {
        pollNotifications(bot);
        pollProfileResults(bot);
    }, 10_000);
}

async function pollNotifications(bot: Telegraf) {
    // Найти завершённые login_request'ы о которых ещё не уведомили
    const result = await db.query(`
        UPDATE login_requests SET notified_at = NOW()
        WHERE id IN (
            SELECT lr.id FROM login_requests lr
            WHERE lr.status IN ('done', 'failed')
              AND lr.notified_at IS NULL
            LIMIT 10
        )
        RETURNING id, account_id, status, error_message
    `);

    for (const row of result.rows) {
        const accountResult = await db.query(
            `SELECT user_id FROM site_accounts WHERE id = $1`,
            [row.account_id],
        );
        const userId = accountResult.rows[0]?.user_id;
        if (!userId) continue;

        if (row.status === 'done') {
            await bot.telegram.sendMessage(userId, '✅ Аккаунт успешно подключён! Автоматизация запущена.');
        } else {
            const reason = row.error_message ?? 'неизвестная ошибка';
            await bot.telegram.sendMessage(
                userId,
                `❌ Не удалось подключить аккаунт.\nПричина: ${reason}\n\nПопробуй /connect снова.`,
            );
        }
    }
}

async function pollProfileResults(bot: Telegraf) {
    const result = await db.query(`
        UPDATE job_runs SET notified_at = NOW()
        WHERE id IN (
            SELECT jr.id FROM job_runs jr
            JOIN jobs j ON j.id = jr.job_id
            WHERE j.job_type = 'fetch_profile'
              AND jr.status = 'success'
              AND jr.notified_at IS NULL
              AND jr.profile_data IS NOT NULL
            LIMIT 10
        )
        RETURNING job_id, profile_data
    `);

    for (const row of result.rows) {
        const accountResult = await db.query(
            `SELECT sa.user_id FROM site_accounts sa JOIN jobs j ON j.account_id = sa.id WHERE j.id = $1`,
            [row.job_id],
        );
        const userId = accountResult.rows[0]?.user_id;
        if (!userId) continue;

        const p = row.profile_data;
        await bot.telegram.sendMessage(
            userId,
            `👤 Профиль\nНик: ${p.username}\nID: ${p.user_id}\nБаланс: 💎 ${p.balance}`,
        );
    }
}
