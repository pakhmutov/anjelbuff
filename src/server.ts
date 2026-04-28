import express from 'express';
import type { Request, Response } from 'express';
import { CookieJar } from 'tough-cookie';
import type { Cookie } from 'tough-cookie';
import axios from 'axios';
import { proxyGet, proxyPost, TARGET } from './proxy.ts';
import { saveSession } from './sessions.ts';

function getPath(param: string | string[]): string {
    if (Array.isArray(param)) return '/' + param.join('/');
    return '/' + param;
}

function isLoggedIn(cookies: Cookie[]): boolean {
    return cookies.some((c) => c.key === 'mangabuff_session' || c.key.startsWith('remember_web_'));
}

export const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use((req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Frame-Options');
    next();
});

const tempJars = new Map<string, CookieJar>();

app.get('/static/:userId/*path', async (req: Request, res: Response) => {
    const path = getPath(req.params.path as string | string[]);
    const fullUrl = `${TARGET}${path}${Object.keys(req.query).length ? '?' + new URLSearchParams(req.query as any).toString() : ''}`;

    console.log('Static request:', fullUrl);

    try {
        const response = await axios.get(fullUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Referer: `${TARGET}/login`,
                Origin: TARGET,
                Accept: '*/*',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        const contentType = response.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', String(contentType));
        res.send(Buffer.from(response.data));
    } catch (e: any) {
        console.error('Static error:', fullUrl, e.message);
        res.status(500).send('Static error: ' + e.message);
    }
});

app.get('/proxy/:userId/*path', async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    const path = getPath(req.params.path);
    const proxyBase = `${process.env.PROXY_HOST}/proxy/${userId}`;

    if (!tempJars.has(userId)) {
        tempJars.set(userId, new CookieJar());
    }

    const jar = tempJars.get(userId)!;

    try {
        const { html, status } = await proxyGet(path, proxyBase, jar, userId);
        res.status(status).send(html);
    } catch (e: any) {
        res.status(500).send('Proxy error: ' + e.message);
    }
});

app.get('/', (req: Request, res: Response) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
        </head>
        <body>
            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.sendData(JSON.stringify({ success: true }));
                    setTimeout(() => window.Telegram.WebApp.close(), 500);
                }
            </script>
            <p>✅ Авторизация успешна!</p>
        </body>
        </html>
    `);
});

app.post('/proxy/:userId/*path', async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    const path = getPath(req.params.path);

    const jar = tempJars.get(userId) ?? new CookieJar();

    try {
        const { cookies } = await proxyPost(path, req.body, jar);

        if (isLoggedIn(cookies)) {
            saveSession(Number(userId), cookies);
            tempJars.delete(userId);

            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: true, _proxy_success: true }));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ status: false }));
        }
    } catch (e: any) {
        res.status(500).send('Login error: ' + e.message);
    }
});

app.listen(3000, () => console.log('🚀 Proxy server on :3000'));
