export async function fetchNaverSearchScreenshotPng(searchUrl: string, timeoutMs = 30_000): Promise<Uint8Array> {
  const api = new URL('https://api.microlink.io/');
  api.searchParams.set('url', searchUrl);
  api.searchParams.set('screenshot', 'true');
  api.searchParams.set('meta', 'false');
  api.searchParams.set('viewport.width', '1280');
  api.searchParams.set('viewport.height', '800');
  api.searchParams.set('waitFor', '1500');
  api.searchParams.set('embed', 'screenshot.url');

  const res = await fetch(api.toString(), {
    headers: { Accept: 'image/png' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`microlink HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.startsWith('image/')) {
    throw new Error(`microlink returned non-image (${ct}): ${(await res.text()).slice(0, 200)}`);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
