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
    const { data: html } = await axios.get('https://mangabuff.ru/', {
        headers: {
            Cookie: cookieHeader,
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    });

    const root = parse(html);
    let isAuth = 0,
        userId = 0,
        isPro = 0;

    for (const script of root.querySelectorAll('script:not([src])')) {
        const src = script.text;
        const authMatch = src.match(/window\.isAuth\s*=\s*(\d+)/);
        if (!authMatch) continue;
        isAuth = parseInt(authMatch[1]);
        const userIdMatch = src.match(/window\.user_id\s*=\s*(\d+)/);
        const isProMatch = src.match(/window\.isPro\s*=\s*(\d+)/);
        if (userIdMatch) userId = parseInt(userIdMatch[1]);
        if (isProMatch) isPro = parseInt(isProMatch[1]);
        break;
    }

    if (!isAuth) {
        return ctx.reply('❌ Сессия истекла. Сделай /logout и /login заново.');
    }

    const lines = [`✅ Авторизован`, `🆔 ID: ${userId}`];
    if (isPro) lines.push('⭐ Pro аккаунт');
    return ctx.reply(lines.join('\n'));
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
