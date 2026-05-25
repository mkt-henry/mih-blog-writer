export type PostScreenshotArgs = {
  webhookUrl: string;
  keyword: string;
  searchUrl: string;
  pngBuffer: Uint8Array;
};

export async function postScreenshotToDiscord(args: PostScreenshotArgs): Promise<void> {
  const { webhookUrl, keyword, searchUrl, pngBuffer } = args;

  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: `🔎 ${keyword}\n${searchUrl}` }));

  const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
  const safeName = keyword.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 64) || 'screenshot';
  fd.append('files[0]', new File([blob], `${safeName}.png`, { type: 'image/png' }));

  const res = await fetch(webhookUrl, { method: 'POST', body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${text}`.slice(0, 500));
  }
}
