import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import * as tar from 'tar';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function debugChromiumSpawn() {
  const r = await extractSparticuzLibsToTmp();
  if (!r.found) return { libExtract: r };
  const libDir = path.dirname(r.found);
  const ldPath = [libDir, '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  const execPath = await chromium.executablePath();
  const out = spawnSync(execPath, ['--version'], {
    env: { ...process.env, LD_LIBRARY_PATH: ldPath },
    timeout: 10_000,
  });
  return {
    libExtract: r,
    libDirContents: fs.readdirSync(libDir),
    execPath,
    ldPath,
    status: out.status,
    signal: out.signal,
    stdout: out.stdout?.toString().slice(0, 500),
    stderr: out.stderr?.toString().slice(0, 2000),
    error: out.error?.message,
  };
}

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

async function extractSparticuzLibsToTmp(): Promise<{ found: string | null; logs: string[] }> {
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
    try {
      const compressed = fs.readFileSync(file);
      const tarBuf = zlib.brotliDecompressSync(compressed);
      await pipeline(Readable.from(tarBuf), tar.x({ cwd: '/tmp' }));
      const found = findLibInTree('/tmp');
      if (found) {
        libsExtracted = true;
        return { found, logs };
      }
      logs.push(`${name}: untar done but libnss3.so not found`);
    } catch (e) {
      logs.push(`${name}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return { found: null, logs };
}

export async function debugExtractLibs() {
  const result = await extractSparticuzLibsToTmp();
  return { ...result, tmpListing: fs.readdirSync('/tmp') };
}

export async function launchChromium(): Promise<Browser> {
  const r = await extractSparticuzLibsToTmp();
  if (!r.found) {
    throw new Error('lib extract failed: ' + JSON.stringify(r.logs));
  }
  const libDir = path.dirname(r.found);
  const ldPath = [libDir, '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  process.env.LD_LIBRARY_PATH = ldPath;

  chromium.setGraphicsMode = false;

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    dumpio: true,
    env: { ...process.env, LD_LIBRARY_PATH: ldPath } as Record<string, string>,
  });
}
