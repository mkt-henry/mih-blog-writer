import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('reports failed uploads as a failure and still attempts every input', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mih-upload-test-'));
  try {
    const result = spawnSync(process.execPath, [
      resolve('scripts/upload-local-images.mjs'), 'test-only', 'missing1.jpg', 'missing2.jpg',
    ], { cwd, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[1/2]');
    expect(result.stderr).toContain('[2/2]');
    expect(result.stderr).toContain('missing1.jpg');
    expect(result.stderr).toContain('missing2.jpg');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
