export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');
    if (!target) {
      return cors(json({ error: 'Paramètre url manquant.' }, 400));
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return cors(json({ error: 'URL cible invalide.' }, 400));
    }

    if (targetUrl.protocol !== 'https:') {
      return cors(json({ error: 'Seules les URLs HTTPS sont autorisées.' }, 400));
    }

    const upstreamHeaders = new Headers();
    for (const name of ['range', 'if-none-match', 'if-modified-since', 'accept', 'accept-encoding']) {
      const value = request.headers.get(name);
      if (value) upstreamHeaders.set(name, value);
    }
    upstreamHeaders.set('user-agent', 'PipiReaderProxy/1.0');

    const upstream = await fetch(targetUrl.toString(), {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      cf: { cacheEverything: false },
    });

    const headers = new Headers();
    for (const name of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified',
      'content-disposition',
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS');
    headers.set('access-control-allow-headers', 'Range,If-None-Match,If-Modified-Since,Accept,Content-Type');
    headers.set('access-control-expose-headers', 'Accept-Ranges,Content-Length,Content-Range,Content-Type,ETag,Last-Modified,Content-Disposition');
    headers.set('x-pipi-reader-proxy', '1');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  headers.set('access-control-allow-headers', 'Range,If-None-Match,If-Modified-Since,Accept,Content-Type');
  headers.set('access-control-expose-headers', 'Accept-Ranges,Content-Length,Content-Range,Content-Type,ETag,Last-Modified,Content-Disposition');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
