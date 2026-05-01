import type { Telegraf } from 'telegraf';
import { db } from '../db/client.ts';

export function startNotifier(bot: Telegraf) {
    setInterval(() => pollNotifications(bot), 10_000);
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
