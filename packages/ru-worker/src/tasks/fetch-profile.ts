import type { BrowserContext } from 'playwright';
import type { ProfileData } from '@anjelbuff/shared';

export async function fetchProfile(context: BrowserContext): Promise<ProfileData> {
    const page = await context.newPage();

    try {
        await page.goto('https://mangabuff.ru/', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });

        const userId = await page.$eval('[data-user-id]', (el) =>
            el.getAttribute('data-user-id') ?? '',
        );

        const username = await page.$eval('.menu__name', (el) =>
            el.textContent?.trim() ?? '',
        );

        const balanceText = await page.$eval('.menu__balance', (el) =>
            el.textContent ?? '',
        );
        const balance = parseInt(balanceText.replace(/\D/g, ''), 10) || 0;

        return { user_id: userId, username, balance };
    } finally {
        await page.close();
    }
}
