import 'dotenv/config';
import { ukApi } from './api-client.ts';
import { executeJob } from './tasks/executor.ts';
import { handleLoginRequest } from './tasks/login.ts';

const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 60_000;

async function pollTasks(): Promise<void> {
    try {
        const res = await ukApi.getNextTask();
        if (res) {
            console.log(`[poll] job: ${res.job.job_type} (${res.job.id})`);
            // Не await — задачи выполняются параллельно для разных аккаунтов
            executeJob(res.job).catch((e) => console.error('[executor] uncaught:', e));
        }
    } catch (err) {
        console.error('[poll] tasks error:', err);
    }
}

async function pollLoginRequests(): Promise<void> {
    try {
        const res = await ukApi.getNextLoginRequest();
        if (res) {
            console.log(`[poll] login request: ${res.login_request.id}`);
            handleLoginRequest(res.login_request).catch((e) =>
                console.error('[login] uncaught:', e),
            );
        }
    } catch (err) {
        console.error('[poll] login-requests error:', err);
    }
}

async function main() {
    console.log('🤖 ru-worker started');

    // Запустить heartbeat
    setInterval(() => {
        ukApi.heartbeat().catch((e) => console.error('[heartbeat] error:', e));
    }, HEARTBEAT_INTERVAL_MS);

    // Polling loop
    setInterval(() => {
        pollTasks();
        pollLoginRequests();
    }, POLL_INTERVAL_MS);

    // Сразу при старте
    await pollTasks();
    await pollLoginRequests();
    await ukApi.heartbeat();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
