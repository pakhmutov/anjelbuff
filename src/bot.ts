import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { initDb, hasSession, getSession, deleteSession, cookiesToHeader } from './sessions.ts';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios from 'axios';
import { parse } from 'node-html-parser';
import './server.ts';

const agent = new SocksProxyAgent('socks5h://127.0.0.1:1082');

const bot = new Telegraf(process.env.BOT_TOKEN!, {
    telegram: {
        agent: agent as any,
    },
});

const PROXY_HOST = process.env.PROXY_HOST!;

bot.command('login', async (ctx) => {
    const userId = ctx.from.id;

    if (hasSession(userId)) {
        return ctx.reply('Ты уже авторизован. /logout чтобы выйти.');
    }

    await ctx.reply('Открой браузер и авторизуйся:', {
        reply_markup: {
            keyboard: [
                [
                    {
                        text: '🌐 Войти на сайт',
                        web_app: { url: `${PROXY_HOST}/proxy/${userId}/login` },
                    },
                ],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
        },
    });
});

bot.on(message('web_app_data'), async (ctx) => {
    console.log('web_app_data received:', ctx.webAppData?.data.text());
    try {
        const data = JSON.parse(ctx.webAppData!.data.text());
        if (data.success) {
            await ctx.reply('✅ Авторизация прошла! Теперь можешь использовать команды.');
        }
    } catch (e) {
        await ctx.reply('❌ Ошибка при авторизации');
    }
});

bot.command('me', async (ctx) => {
    const cookies = getSession(ctx.from.id);
    if (!cookies) return ctx.reply('❌ Сначала /login');

    const cookieHeader = cookiesToHeader(cookies as any);
    const headers = {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/html, */*',
    };

    const { data: html } = await axios.get('https://mangabuff.ru/', { headers });

    const root = parse(html);

    // 1. Inertia.js: <div id="app" data-page='{"props":{"auth":{"user":{...}}}}'>
    const inertiaEl = root.querySelector('#app[data-page]');
    if (inertiaEl) {
        try {
            const pageData = JSON.parse(inertiaEl.getAttribute('data-page')!);
            console.log('Inertia data-page keys:', Object.keys(pageData?.props ?? {}));
            const user = pageData?.props?.auth?.user ?? pageData?.props?.user;
            if (user) {
                const lines = [`👤 *${user.name ?? user.username ?? user.login}*`];
                if (user.email) lines.push(`📧 ${user.email}`);
                if (user.id) lines.push(`🆔 ${user.id}`);
                return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
            }
        } catch (_) {}
    }

    // 2. window.__NUXT__ / window.__INITIAL_STATE__ / window.auth в <script>
    for (const script of root.querySelectorAll('script:not([src])')) {
        const src = script.text;

        // Nuxt
        const nuxtMatch = src.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;/);
        if (nuxtMatch) {
            console.log('Found __NUXT__, snippet:', nuxtMatch[1].slice(0, 300));
        }

        // Любой JSON с полем user/auth
        const userMatch = src.match(/"user"\s*:\s*(\{[^{}]*\})/);
        if (userMatch) {
            try {
                const user = JSON.parse(userMatch[1]);
                console.log('Found user in script:', JSON.stringify(user).slice(0, 300));
                if (user.name || user.username || user.login) {
                    const name = user.name ?? user.username ?? user.login;
                    const lines = [`👤 *${name}*`];
                    if (user.email) lines.push(`📧 ${user.email}`);
                    if (user.id) lines.push(`🆔 ${user.id}`);
                    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
                }
            } catch (_) {}
        }
    }

    // 3. Ничего не нашли — логируем структуру для диагностики
    const appEl = root.querySelector('#app, #__nuxt, #root, [data-page]');
    console.log('Root app element:', appEl?.outerHTML?.slice(0, 500) ?? 'not found');
    console.log('Script tags count:', root.querySelectorAll('script:not([src])').length);
    console.log('HTML head:', html.slice(0, 2000));

    await ctx.reply('⚠️ Не удалось найти данные профиля. Смотри логи сервера для диагностики.');
});

bot.command('logout', async (ctx) => {
    const userId = ctx.from.id;
    if (!hasSession(userId)) {
        return ctx.reply('Ты и так не авторизован.');
    }
    deleteSession(userId);
    await ctx.reply('👋 Вышел из аккаунта. Используй /login чтобы войти снова.');
});

async function main() {
    await initDb();
    bot.launch();
    console.log('🤖 Бот запущен');
}

main().catch(console.error);
