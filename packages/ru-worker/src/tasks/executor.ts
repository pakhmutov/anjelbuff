import type { Job } from '@anjelbuff/shared';
import { type BrowserContext } from 'playwright';
import { openProfile, isLoggedIn } from '../browser/profile.ts';
import { ukApi } from '../api-client.ts';
import { fetchProfile } from './fetch-profile.ts';

// Лок: не запускать два таска на один аккаунт одновременно
const runningAccounts = new Set<string>();

export async function executeJob(job: Job): Promise<void> {
    if (runningAccounts.has(job.account_id)) {
        console.warn(`[executor] ${job.account_id}: already running, skipping ${job.id}`);
        return;
    }

    runningAccounts.add(job.account_id);
    const context = await openProfile(job.account_id);

    try {
        const loggedIn = await isLoggedIn(context);
        if (!loggedIn) {
            await ukApi.submitTaskResult(job.id, {
                status: 'relogin_required',
                error_message: 'Session expired',
            });
            await ukApi.updateSession(job.account_id, {
                profile_path: '',
                status: 'relogin_required',
            });
            return;
        }

        switch (job.job_type) {
            case 'daily_button':
                await runDailyButton(context, job);
                break;
            case 'chat_click':
                await runChatClick(context, job);
                break;
            case 'fetch_profile': {
                const profile = await fetchProfile(context);
                await ukApi.submitTaskResult(job.id, { status: 'success', profile_data: profile });
                console.log(`[fetch_profile] ${job.account_id}: ${profile.username} #${profile.user_id} 💎${profile.balance}`);
                break;
            }
            default:
                await ukApi.submitTaskResult(job.id, {
                    status: 'failed',
                    error_message: `Unknown job type: ${job.job_type}`,
                });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const screenshotPath = `./screenshots/${job.id}.png`;

        const page = context.pages()[0] ?? await context.newPage();
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

        await ukApi.submitTaskResult(job.id, {
            status: 'failed',
            error_message: msg,
            screenshot_path: screenshotPath,
        });
        console.error(`[executor] job ${job.id} failed:`, msg);
    } finally {
        await context.close();
        runningAccounts.delete(job.account_id);
    }
}

async function runDailyButton(context: BrowserContext, job: Job): Promise<void> {
    const page = await (context as Awaited<ReturnType<typeof openProfile>>).newPage();
    try {
        await page.goto('https://mangabuff.ru/', { waitUntil: 'domcontentloaded' });
        // TODO: найти и нажать ежедневную кнопку
        // await page.click('.daily-reward-button');
        await ukApi.submitTaskResult(job.id, { status: 'success' });
    } finally {
        await page.close();
    }
}

async function runChatClick(context: BrowserContext, job: Job): Promise<void> {
    const page = await context.newPage();
    try {
        await page.goto('https://mangabuff.ru/chat', { waitUntil: 'domcontentloaded' });
        // TODO: найти и нажать кнопку в чате
        // await page.click('.chat-reward-button');
        await ukApi.submitTaskResult(job.id, { status: 'success' });
    } finally {
        await page.close();
    }
}
