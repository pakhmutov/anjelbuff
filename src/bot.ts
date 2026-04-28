import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { initDb, hasSession, getSession, deleteSession, cookiesToHeader } from './sessions.ts';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios from 'axios';
import './server.ts';

const agent = new SocksProxyAgent('socks5h://127.0.0.1:1081');

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
            inline_keyboard: [
                [
                    {
                        text: '🌐 Войти на сайт',
                        web_app: { url: `${PROXY_HOST}/proxy/${userId}/login` },
                    },
                ],
            ],
        },
    });
});

bot.on('web_app_data', async (ctx) => {
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

    const { data } = await axios.get('https://mangabuff.ru/', {
        headers: { Cookie: cookiesToHeader(cookies as any) },
    });

    await ctx.reply('Данные получены: ' + data.slice(0, 200));
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
