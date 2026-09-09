import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  envPath, globalStorePath, isUnderCloudSyncFolder, maskPath, maskUsername, projectStorePath,
  resolveStorePath,
} from '../../src/store/paths.js';

const KEYS = ['SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'APPDATA'] as const;
let saved: Record<string, string | undefined>;
let tmp: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  tmp = mkdtempSync(join(tmpdir(), 'snowarch-paths-'));
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  rmSync(tmp, { recursive: true, force: true });
});

const store = (dir: string) => {
  mkdirSync(join(dir, '.local'), { recursive: true });
  const p = join(dir, '.local', 'instances.json');
  writeFileSync(p, '{}');
  return p;
};

describe('envPath — empty string means unset', () => {
  it('treats "" as unset, because .mcp.json passes ${SNOW_STORE:-}', () => {
    process.env.SNOW_STORE = '';
    expect(envPath('SNOW_STORE')).toBeUndefined();
    process.env.SNOW_STORE = '/tmp/a.json';
    expect(envPath('SNOW_STORE')).toBe('/tmp/a.json');
  });

  it('an empty CLAUDE_PROJECT_DIR falls back to cwd, not to the filesystem root', () => {
    process.env.CLAUDE_PROJECT_DIR = '';
    expect(projectStorePath()).toBe(join(process.cwd(), '.local', 'instances.json'));
  });
});

describe('resolveStorePath — criterion 1', () => {
  it('SNOW_STORE wins over a present project store', () => {
    const explicit = join(tmp, 'explicit.json');
    writeFileSync(explicit, '{}');
    process.env.SNOW_STORE = explicit;
    process.env.CLAUDE_PROJECT_DIR = tmp;
    store(tmp);
    const r = resolveStorePath();
    expect(r.source).toBe('env');
    expect(r.path).toBe(explicit);
  });

  it('SNOW_STORE pointing at a missing file still wins — it does NOT fall back', () => {
    // The ruling: an explicit override that is wrong must be an error, never a silent
    // load of a different instance than the one asked for.
    process.env.SNOW_STORE = join(tmp, 'missing.json');
    process.env.CLAUDE_PROJECT_DIR = tmp;
    store(tmp);
    const r = resolveStorePath();
    expect(r.source).toBe('env');
    expect(r.candidates[0].exists).toBe(false);
  });

  it('SNOW_STORE="" resolves to the project store', () => {
    process.env.SNOW_STORE = '';
    process.env.CLAUDE_PROJECT_DIR = tmp;
    const p = store(tmp);
    const r = resolveStorePath();
    expect(r.source).toBe('project');
    expect(r.path).toBe(p);
  });

  it('with neither, every candidate is reported as missing and the source is none', () => {
    process.env.CLAUDE_PROJECT_DIR = tmp;
    const r = resolveStorePath();
    expect(r.source).toBe('none');
    expect(r.path).toBeNull();
    expect(r.candidates.every((c) => !c.exists)).toBe(true);
    expect(r.candidates).toHaveLength(2);
  });
});

describe('globalStorePath', () => {
  it.skipIf(process.platform === 'win32')('POSIX: ~/.config/snowarch/instances.json', () => {
    expect(globalStorePath()).toBe(join(homedir(), '.config', 'snowarch', 'instances.json'));
  });
  it.skipIf(process.platform !== 'win32')('Windows: %APPDATA%\\snowarch\\instances.json', () => {
    process.env.APPDATA = 'C:\\Users\\x\\AppData\\Roaming';
    expect(globalStorePath()).toBe(join('C:\\Users\\x\\AppData\\Roaming', 'snowarch', 'instances.json'));
  });
});

describe('masking — criterion 6 of the architect ruling', () => {
  it('replaces the home prefix with ~ and never leaks the account name', () => {
    const p = join(homedir(), 'work', 'repo', '.local', 'instances.json');
    const masked = maskPath(p);
    expect(masked.startsWith('~')).toBe(true);
    expect(masked).not.toContain(homedir());
  });

  it('prefers <checkout> over ~ when the checkout is inside home', () => {
    const checkout = join(homedir(), 'work', 'repo');
    process.env.CLAUDE_PROJECT_DIR = checkout;
    expect(maskPath(join(checkout, '.local', 'instances.json'))).toBe(join('<checkout>', '.local', 'instances.json'));
  });

  it('leaves an unrelated absolute path alone', () => {
    expect(maskPath('/opt/shared/instances.json')).toBe('/opt/shared/instances.json');
  });

  it('maskUsername keeps only the first character, and the domain when there is one', () => {
    expect(maskUsername('cvetomir@corp.com')).toBe('c***@corp.com');
    expect(maskUsername('admin')).toBe('a***');
    expect(maskUsername('')).toBe('');
  });
});

describe('isUnderCloudSyncFolder — criterion 8', () => {
  it('macOS CloudStorage with a tenant suffix', () => {
    expect(isUnderCloudSyncFolder('/Users/x/Library/CloudStorage/OneDrive-Corp/repo/.local/instances.json')).toBe(true);
  });
  it('a Windows path, even when the test runs on POSIX', () => {
    expect(isUnderCloudSyncFolder('C:\\Users\\x\\OneDrive\\repo\\.local\\instances.json')).toBe(true);
  });
  it('iCloud Drive on disk', () => {
    expect(isUnderCloudSyncFolder('/Users/x/Library/Mobile Documents/com~apple~CloudDocs/repo/instances.json')).toBe(true);
  });
  it('Dropbox and Google Drive', () => {
    expect(isUnderCloudSyncFolder('/Users/x/Dropbox/repo/instances.json')).toBe(true);
    expect(isUnderCloudSyncFolder('/Users/x/Google Drive/repo/instances.json')).toBe(true);
  });
  it('an ordinary working copy is not flagged', () => {
    expect(isUnderCloudSyncFolder('/Users/x/work/repo/.local/instances.json')).toBe(false);
  });
  it('a folder that merely contains the word is not flagged', () => {
    expect(isUnderCloudSyncFolder('/Users/x/my-onedrive-notes/instances.json')).toBe(false);
  });
});
