import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function launchChromium(): Promise<Browser> {
  chromium.setGraphicsMode = false;

  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}
