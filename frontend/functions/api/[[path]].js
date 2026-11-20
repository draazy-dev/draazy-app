const ORIGIN_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/;

const BODYLESS = new Set(['GET', 'HEAD']);

const UNTRUSTED_REQUEST_HEADERS = [
    'forwarded',
    'x-real-ip',
    'true-client-ip',
    'x-client-ip',
    'x-forwarded-port',
    'x-forwarded-prefix',
    'x-forwarded-ssl',
    'x-original-url',
    'x-rewrite-url',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cf-visitor',
    'cf-worker',
];

const UNTRUSTED_RESPONSE_HEADERS = [
    'server',
    'x-powered-by',
    'content-encoding',
    'content-length',
    'access-control-allow-origin',
    'access-control-allow-credentials',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-expose-headers',
];

export async function onRequest({ request, env, waitUntil }) {
    const origin = (env.API_ORIGIN || '').trim().replace(/\/+$/, '');

    if (!ORIGIN_PATTERN.test(origin)) {
        return Response.json(
            {
                error: 'api_proxy_misconfigured',
                message:
                    'API_ORIGIN is unset or is not a bare https origin. Set it in the Pages '
                    + 'environment, e.g. https://api.draazy.com — scheme and host only.',
            },
            { status: 502 },
        );
    }

    const incoming = new URL(request.url);

    const originSecret = (env.ORIGIN_SHARED_SECRET || '').trim();
    if (!originSecret) {
        return Response.json(
            {
                error: 'api_proxy_misconfigured',
                message: 'ORIGIN_SHARED_SECRET is unset. Set it as a Pages secret to the same '
                    + 'value as the backend\'s ORIGIN_SHARED_SECRET.',
            },
            { status: 502 },
        );
    }

    if (incoming.pathname !== '/api' && !incoming.pathname.startsWith('/api/')) {
        return new Response(null, { status: 404 });
    }

    const clientIp = request.headers.get('CF-Connecting-IP');
    if (!clientIp) {
        return Response.json(
            {
                error: 'api_proxy_no_client_ip',
                message: 'CF-Connecting-IP absent; refusing to forward an unattributed request.',
            },
            { status: 502 },
        );
    }

    const cache = edgeCacheable(request) ? globalThis.caches?.default : undefined;
    const hit = cache && await cache.match(request);
    if (hit) {
        return hit;
    }

    const target = new URL(origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    for (const header of UNTRUSTED_REQUEST_HEADERS) {
        headers.delete(header);
    }

    headers.set('X-Forwarded-For', clientIp);
    headers.set('X-Proxy-Auth', originSecret);
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', incoming.host);
    headers.delete('Host');

    const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: BODYLESS.has(request.method) ? undefined : request.body,
        redirect: 'manual',
    });

    const response = new Response(upstream.body, upstream);
    for (const header of UNTRUSTED_RESPONSE_HEADERS) {
        response.headers.delete(header);
    }
    if (cache && shareable(response)) {
        waitUntil(cache.put(request, response.clone()));
    }
    return response;
}

function edgeCacheable(request) {
    const asked = (request.headers.get('Cache-Control') || '').toLowerCase();
    return request.method === 'GET'
        && !request.headers.has('Authorization')
        && !asked.includes('no-cache')
        && !asked.includes('max-age=0');
}

function shareable(response) {
    const control = (response.headers.get('Cache-Control') || '').toLowerCase();
    return response.status === 200
        && !response.headers.has('Set-Cookie')
        && /\bpublic\b/.test(control)
        && /\bmax-age=[1-9]/.test(control)
        && !/\b(private|no-store|no-cache)\b/.test(control);
}
