import type { LoginRequest } from '@anjelbuff/shared';
import { openProfile, getProfilePath } from '../browser/profile.ts';
import { ukApi } from '../api-client.ts';

export async function handleLoginRequest(req: LoginRequest): Promise<void> {
    const { id, account_id } = req;

    if (!req.login_enc || !req.password_enc) {
        await ukApi.updateLoginRequestStatus(id, {
            status: 'failed',
            error_message: 'Credentials missing',
        });
        return;
    }

    const context = await openProfile(account_id);
    const page = await context.newPage();

    try {
        await page.goto('https://mangabuff.ru/login', {
            waitUntil: 'networkidle',
            timeout: 30_000,
        });

        await page.waitForSelector('input[name="email"]', { state: 'visible', timeout: 10_000 });

        await page.fill('input[name="email"]', req.login_enc);
        await page.fill('input[name="password"]', req.password_enc);
        await page.waitForSelector('button.login-button:not([disabled])', { timeout: 10_000 });
        await page.click('button.login-button');

        await page
            .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
            .catch(() => {});

        const loginOk = !page.url().includes('/login');

        if (!loginOk) {
            await ukApi.updateLoginRequestStatus(id, {
                status: 'failed',
                error_message: 'Login page still visible after submit',
            });
            return;
        }

        await ukApi.updateSession(account_id, {
            profile_path: getProfilePath(account_id),
            status: 'active',
        });
        await ukApi.updateLoginRequestStatus(id, { status: 'done' });
        console.log(`[login] ${account_id}: ✅ success`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await page.screenshot({ path: `./screenshots/login-fail-${id}.png`, fullPage: true }).catch(() => {});
        await ukApi.updateLoginRequestStatus(id, { status: 'failed', error_message: msg });
        console.error(`[login] ${account_id}: ❌`, msg);
    } finally {
        await context.close();
    }
}
