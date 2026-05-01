import { chromium, type BrowserContext } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const PROFILES_DIR = process.env.PROFILES_DIR ?? './profiles';

export function getProfilePath(accountId: string): string {
    return join(PROFILES_DIR, accountId);
}

export async function openProfile(accountId: string): Promise<BrowserContext> {
    const profilePath = getProfilePath(accountId);
    await mkdir(profilePath, { recursive: true });

    const context = await chromium.launchPersistentContext(profilePath, {
        headless: true,
        viewport: { width: 1280, height: 900 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
        ...(process.env.PROXY_SERVER
            ? {
                  proxy: {
                      server: process.env.PROXY_SERVER,
                      username: process.env.PROXY_USER,
                      password: process.env.PROXY_PASS,
                  },
              }
            : {}),
    });

    return context;
}

export async function isLoggedIn(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
        await page.goto('https://mangabuff.ru/', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        // Проверяем признак авторизованного пользователя
        const loggedIn = (await page.$('.user-balance, [data-user-id]')) !== null;
        return loggedIn;
    } finally {
        await page.close();
    }
}
