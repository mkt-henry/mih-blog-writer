import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

let libsExtracted = false;

function extractSparticuzLibsToTmp(): void {
  if (libsExtracted || fs.existsSync('/tmp/libnss3.so')) {
    libsExtracted = true;
    return;
  }
  const binDir = path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin');
  const candidates = ['al2023.tar.br', 'al2.tar.br'];
  for (const name of candidates) {
    const file = path.join(binDir, name);
    if (!fs.existsSync(file)) continue;
    const compressed = fs.readFileSync(file);
    const tarBuf = zlib.brotliDecompressSync(compressed);
    const tarPath = path.join('/tmp', `_sparticuz_${name}.tar`);
    fs.writeFileSync(tarPath, tarBuf);
    const r = spawnSync('tar', ['-xf', tarPath, '-C', '/tmp'], { stdio: 'pipe' });
    fs.rmSync(tarPath, { force: true });
    if (r.status === 0 && fs.existsSync('/tmp/libnss3.so')) {
      libsExtracted = true;
      return;
    }
  }
  throw new Error('Failed to extract sparticuz OS lib bundle (libnss3.so missing after untar)');
}

export async function launchChromium(): Promise<Browser> {
  extractSparticuzLibsToTmp();
  process.env.LD_LIBRARY_PATH = ['/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

  chromium.setGraphicsMode = false;

  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}
