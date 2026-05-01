import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db/client.ts';
import type {
    TaskResultBody,
    LoginRequestStatusBody,
    SessionUpdateBody,
    HeartbeatBody,
} from '@anjelbuff/shared';

export const api = Router();

function requireWorkerAuth(req: Request, res: Response): boolean {
    if (req.headers['x-worker-secret'] !== process.env.WORKER_SECRET) {
        res.status(401).json({ error: 'unauthorized' });
        return false;
    }
    return true;
}

// Взять следующую задачу из очереди (атомарный SELECT FOR UPDATE SKIP LOCKED)
api.get('/tasks/next', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const worker_id = req.query.worker_id as string;

    const result = await db.query(
        `UPDATE jobs SET status = 'locked', locked_by = $1, locked_at = NOW()
         WHERE id = (
             SELECT id FROM jobs
             WHERE status = 'pending' AND scheduled_for <= NOW()
             ORDER BY priority ASC, scheduled_for ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [worker_id],
    );

    if (result.rows.length === 0) return res.sendStatus(204);
    res.json({ job: result.rows[0] });
});

// Записать результат выполненной задачи
api.post('/tasks/:id/result', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const { id } = req.params;
    const worker_id = req.query.worker_id as string;
    const body = req.body as TaskResultBody;

    await db.query(`UPDATE jobs SET status = $1 WHERE id = $2`, [body.status, id]);
    await db.query(
        `INSERT INTO job_runs (job_id, worker_id, finished_at, status, currency_earned, error_message, screenshot_path)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
        [id, worker_id, body.status, body.currency_earned ?? null, body.error_message ?? null, body.screenshot_path ?? null],
    );

    res.json({ ok: true });
});

// Взять следующий запрос на логин
api.get('/login-requests/next', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const worker_id = req.query.worker_id as string;

    const result = await db.query(
        `UPDATE login_requests SET status = 'in_progress', worker_id = $1, updated_at = NOW()
         WHERE id = (
             SELECT id FROM login_requests
             WHERE status = 'pending'
             ORDER BY created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [worker_id],
    );

    if (result.rows.length === 0) return res.sendStatus(204);
    res.json({ login_request: result.rows[0] });
});

// Обновить статус login request (вызывается воркером)
api.post('/login-requests/:id/status', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const { id } = req.params;
    const body = req.body as LoginRequestStatusBody;

    await db.query(
        `UPDATE login_requests SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
        [body.status, body.error_message ?? null, id],
    );

    // Удалить credentials сразу после успешного логина
    if (body.status === 'done') {
        await db.query(
            `UPDATE login_requests SET login_enc = NULL, password_enc = NULL WHERE id = $1`,
            [id],
        );
    }

    res.json({ ok: true });
});

// Бот кладёт credentials для pending login request
api.post('/login-requests/:id/credentials', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { login, password } = req.body as { login: string; password: string };

    await db.query(
        `UPDATE login_requests SET login_enc = $1, password_enc = $2, status = 'awaiting_credentials', updated_at = NOW()
         WHERE id = $3 AND status = 'in_progress'`,
        [login, password, id],
    );

    res.json({ ok: true });
});

// Создать/обновить сессию после логина
api.post('/sessions/:accountId/update', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const { accountId } = req.params;
    const worker_id = req.query.worker_id as string;
    const body = req.body as SessionUpdateBody;

    await db.query(
        `INSERT INTO sessions (account_id, profile_path, status, last_used_at, expires_at, worker_id)
         VALUES ($1, $2, $3, NOW(), $4, $5)
         ON CONFLICT (account_id) DO UPDATE SET
             profile_path = EXCLUDED.profile_path,
             status       = EXCLUDED.status,
             last_used_at = NOW(),
             expires_at   = EXCLUDED.expires_at,
             worker_id    = EXCLUDED.worker_id`,
        [accountId, body.profile_path, body.status, body.expires_at ?? null, worker_id],
    );

    // Обновить статус аккаунта
    await db.query(`UPDATE site_accounts SET status = $1 WHERE id = $2`, [body.status, accountId]);

    res.json({ ok: true });
});

// Heartbeat от воркера
api.post('/workers/heartbeat', async (req: Request, res: Response) => {
    if (!requireWorkerAuth(req, res)) return;
    const body = req.body as HeartbeatBody;

    await db.query(
        `INSERT INTO workers (id, last_heartbeat, status)
         VALUES ($1, NOW(), 'online')
         ON CONFLICT (id) DO UPDATE SET last_heartbeat = NOW(), status = 'online'`,
        [body.worker_id],
    );

    res.json({ ok: true });
});
