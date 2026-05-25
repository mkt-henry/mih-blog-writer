import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function launchChromium(): Promise<Browser> {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: { width: 1280, height: 800 },
  });
}
