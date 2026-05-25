import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

let libsExtracted = false;

function findLibInTree(root: string): string | null {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isFile() && e === 'libnss3.so') return full;
      if (st.isDirectory()) stack.push(full);
    }
  }
  return null;
}

function extractSparticuzLibsToTmp(): { found: string | null; logs: string[] } {
  const logs: string[] = [];
  if (libsExtracted) return { found: '/tmp (cached)', logs: ['cached'] };
  const existing = findLibInTree('/tmp');
  if (existing) {
    libsExtracted = true;
    return { found: existing, logs: ['already on disk'] };
  }
  const binDir = path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin');
  const candidates = ['al2023.tar.br', 'al2.tar.br'];
  for (const name of candidates) {
    const file = path.join(binDir, name);
    if (!fs.existsSync(file)) {
      logs.push(`${name}: missing`);
      continue;
    }
    const compressed = fs.readFileSync(file);
    const tarBuf = zlib.brotliDecompressSync(compressed);
    const tarPath = path.join('/tmp', `_sparticuz_${name}.tar`);
    fs.writeFileSync(tarPath, tarBuf);
    const r = spawnSync('tar', ['-xf', tarPath, '-C', '/tmp'], { stdio: 'pipe' });
    logs.push(`${name}: tar status=${r.status} stderr=${r.stderr?.toString().slice(0, 200) ?? ''}`);
    fs.rmSync(tarPath, { force: true });
    const found = findLibInTree('/tmp');
    if (found) {
      libsExtracted = true;
      return { found, logs };
    }
  }
  return { found: null, logs };
}

export async function debugExtractLibs() {
  const result = extractSparticuzLibsToTmp();
  return { ...result, tmpListing: fs.readdirSync('/tmp') };
}

export async function launchChromium(): Promise<Browser> {
  const r = extractSparticuzLibsToTmp();
  if (!r.found) {
    throw new Error('lib extract failed: ' + JSON.stringify(r.logs));
  }
  const libDir = path.dirname(r.found);
  process.env.LD_LIBRARY_PATH = [libDir, '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

  chromium.setGraphicsMode = false;

  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}
