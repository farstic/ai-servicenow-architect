// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectIcloudFolders, findCloudSync, finderKeyReader, icloudKey, type IcloudSeams } from '../../src/store/icloud.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';

/**
 * ARC-09-C305 — a checkout in `~/Documents` or `~/Desktop`, with iCloud's "Desktop & Documents Folders" on.
 *
 * The path of such a checkout says nothing (`/Users/me/Documents/AI-Arch`), so the named-vendor rules in `detectCloudSync` cannot see it,
 * and the setting is not in the path. This rule asks the path first and the setting only on a hit:
 *
 *   1. darwin only, and never as root (the reader would read root's preferences, not the user's);
 *   2. the real path of the checkout is inside `<home>/Desktop` or `<home>/Documents`, by segments, case ignored;
 *   3. that folder is a real directory (not a link, not missing);
 *   4. only then `defaults read com.apple.finder FXICloudDrive<Folder>` for THAT folder, and only exactly `1` is ON.
 *
 * The cases are NOT written here. They are `icloudFolders[]` in `tests/fixtures/cloud-sync-paths.json`, the file the engine's E-34 and B01
 * read as well, and each row says which Finder keys the reader must have been asked for: an empty list is how a row says that the reader
 * was never reached, which is the property that keeps a spawn out of every run that is not in one of the two folders.
 * No test here runs the real `defaults` except the last, which holds the shape of what it returns.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../fixtures/cloud-sync-paths.json');

interface Row {
  path: string; home: string; platform: NodeJS.Platform; euid: number | null;
  keys: Record<string, string>; links?: Record<string, string>; missing?: string[];
  folder: 'Desktop' | 'Documents' | null; asked: string[]; why: string;
}
const rows = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { icloudFolders: Row[] }).icloudFolders;

/** The row's machine: links resolve by prefix (longest first), a link or a missing path is not a directory, the reader logs what it was asked. */
function machine(row: Row): { seams: IcloudSeams; asked: string[] } {
  const links = row.links ?? {};
  const asked: string[] = [];
  const resolveLinks = (p: string): string => {
    let at = p;
    for (let i = 0; i < 8; i += 1) {
      const from = Object.keys(links).filter((l) => at === l || at.startsWith(`${l}/`)).sort((a, b) => b.length - a.length)[0];
      if (from === undefined) return at;
      at = `${links[from]}${at.slice(from.length)}`;
    }
    return at;
  };
  const missing = new Set(row.missing ?? []);
  return {
    asked,
    seams: {
      platform: row.platform, home: row.home, euid: row.euid,
      realpath: resolveLinks,
      isDirectory: (p) => !(p in links) && !missing.has(p),
      read: (key) => { asked.push(key); return key in row.keys ? (row.keys[key] as string) : null; },
    },
  };
}

describe('detectIcloudFolders — the fixture is the specification', () => {
  it('has rows to run: a loop over nothing proves nothing', () => {
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.filter((r) => r.folder !== null).length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => r.folder === null).length).toBeGreaterThanOrEqual(15);
  });

  it('answers every row, and asks the reader for exactly the keys the row names', () => {
    for (const row of rows) {
      const { seams, asked } = machine(row);
      const hit = detectIcloudFolders(row.path, seams);
      const say = `${row.path} — ${row.why}`;
      if (row.folder === null) {
        expect(hit, say).toBeNull();
      } else {
        expect(hit?.provider, say).toBe('iCloud Drive');
        expect(hit?.folder, say).toBe(row.folder);
        // The folder to move the checkout OUT of, spelled as the user knows it: <home>/<Folder>.
        expect(hit?.root, say).toBe(`${row.home}/${row.folder}`);
      }
      expect(asked, `the reader was asked for the wrong keys — ${say}`).toEqual(row.asked);
    }
  });

  it('names the Finder key of each folder, and no other', () => {
    expect(icloudKey('Documents')).toBe('FXICloudDriveDocuments');
    expect(icloudKey('Desktop')).toBe('FXICloudDriveDesktop');
  });

  it('as root the process\'s own id decides, with no id passed in', () => {
    // The `euid` seam is how a row says it; this is the same refusal reached the way the product reaches it.
    const real = process.geteuid;
    const asked: string[] = [];
    try {
      (process as { geteuid?: () => number }).geteuid = () => 0;
      const hit = detectIcloudFolders('/Users/me/Documents/AI-Arch', {
        platform: 'darwin', home: '/Users/me', realpath: (p) => p, isDirectory: () => true, read: (k) => { asked.push(k); return '1\n'; },
      });
      expect(hit).toBeNull();
      expect(asked).toEqual([]);
    } finally {
      (process as { geteuid?: () => number }).geteuid = real;
    }
  });

  it('with no home folder there is no answer, and a relative path is not taken to be inside "Documents"', () => {
    // The fixture row for an empty home uses an absolute path, which the folder's name could never match. A relative one could: `Documents/work/repo` is
    // inside a folder called `Documents` if the home folder is simply left out, and the reader would then be asked about a place nobody named.
    const asked: string[] = [];
    const hit = detectIcloudFolders('Documents/work/repo', {
      platform: 'darwin', home: '', euid: 501, realpath: (p) => p, isDirectory: () => true, read: (k) => { asked.push(k); return '1\n'; },
    });
    expect(hit).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('finderKeyReader — the one place that starts a process', () => {
  const asks = (out: string | Error) => {
    const calls: Array<{ file: string; args: string[]; options: Record<string, unknown> }> = [];
    const run = ((file: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ file, args, options });
      if (out instanceof Error) throw out;
      return out;
    }) as unknown as Parameters<typeof finderKeyReader>[0];
    return { calls, read: finderKeyReader(run) };
  };

  it('runs the system\'s defaults by its absolute path, with no shell, a short timeout and a closed stdin', () => {
    const { calls, read } = asks('1\n');
    expect(read('FXICloudDriveDocuments')).toBe('1\n');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe('/usr/bin/defaults');
    expect(calls[0]?.args).toEqual(['read', 'com.apple.finder', 'FXICloudDriveDocuments']);
    const options = calls[0]?.options ?? {};
    expect(options.shell).toBeUndefined();
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(5000);
    expect((options.stdio as string[])[0]).toBe('ignore');
  });

  it('answers null whenever the process fails: an absent key (exit 1), a timeout, no such program', () => {
    for (const error of [Object.assign(new Error('exit 1'), { status: 1 }), Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
      Object.assign(new Error('no such file'), { code: 'ENOENT' })]) {
      expect(asks(error).read('FXICloudDriveDesktop'), error.message).toBeNull();
    }
  });

  it('the real reader never throws and answers a string or null (shape only: this machine\'s setting is not the CI runner\'s)', () => {
    const shape = (v: unknown): boolean => v === null || typeof v === 'string';
    for (const key of ['FXICloudDriveDesktop', 'FXICloudDriveDocuments', 'FXICloudDriveNoSuchKeyProbe']) {
      expect(shape(finderKeyReader()(key)), key).toBe(true);
    }
    // The instrument can fail: the same check rejects what a broken reader would hand back.
    expect(shape(1)).toBe(false);
    expect(shape(undefined)).toBe(false);
  });
});

describe('findCloudSync — the named vendors first, iCloud\'s folders after', () => {
  const documents: IcloudSeams = {
    platform: 'darwin', home: '/Users/me', euid: 501, realpath: (p) => p, isDirectory: () => true,
    read: () => '1\n',
  };

  it('is what detectCloudSync says whenever that says anything, and does not ask the reader', () => {
    const asked: string[] = [];
    const hit = findCloudSync('/Users/me/Documents/Dropbox/repo', { env: {}, realpath: (p) => p,
      icloud: { ...documents, read: (k) => { asked.push(k); return '1\n'; } } });
    expect(hit?.provider).toBe('Dropbox');
    expect(asked).toEqual([]);
  });

  it('adds Documents and Desktop where detectCloudSync is silent', () => {
    expect(findCloudSync('/Users/me/Documents/AI-Arch', { env: {}, realpath: (p) => p, icloud: documents })?.provider).toBe('iCloud Drive');
    expect(findCloudSync('/Users/me/work/AI-Arch', { env: {}, realpath: (p) => p, icloud: documents })).toBeNull();
  });

  it('is given the realpath of the call when the seams bring none, so one stand-in answers for both rules', () => {
    // A checkout that is a link into Documents: the real path is what both rules compare, and the call's `realpath` is the one that knows the link.
    const linked = (p: string): string => (p.startsWith('/Users/me/work/arch') ? p.replace('/Users/me/work/arch', '/Users/me/Documents/arch') : p);
    const without: IcloudSeams = { ...documents };
    delete without.realpath;
    expect(findCloudSync('/Users/me/work/arch', { env: {}, realpath: linked, icloud: without })?.provider).toBe('iCloud Drive');
  });
});

describe('the real file system, with the defaults of the rule: a link in place of Documents is not read, a real folder is', () => {
  /** A home folder in a temp tree, which the process removes however the case ends. The real `realpath` and `lstat` are what answer here: only the platform, the user and the reader are pretended. */
  const tree = (): { base: string; home: string } => {
    const base = trackTempDir(mkdtempSync(join(tmpdir(), 'icloud-folders-')));
    const home = join(base, 'home');
    mkdirSync(home, { recursive: true });
    return { base, home };
  };

  it('a Documents that is a link to a directory starts nothing: the check is lstat, which does not follow it', () => {
    const { base, home } = tree();
    try {
      const target = join(base, 'elsewhere', 'Documents');
      mkdirSync(join(target, 'work', 'repo'), { recursive: true });
      try { symlinkSync(target, join(home, 'Documents'), 'dir'); } catch { return; }       // a system that cannot make a link has nothing to check here
      const asked: string[] = [];
      const hit = detectIcloudFolders(join(home, 'Documents', 'work', 'repo'),
        { platform: 'darwin', home, euid: 501, read: (key) => { asked.push(key); return '1\n'; } });
      expect(hit).toBeNull();
      expect(asked).toEqual([]);
    } finally {
      removeTempDir(base);
    }
  });

  it('a real Documents folder with the setting on is a hit, named under the home folder as it was given', () => {
    const { base, home } = tree();
    try {
      mkdirSync(join(home, 'Documents', 'work', 'repo'), { recursive: true });
      const asked: string[] = [];
      const hit = detectIcloudFolders(join(home, 'Documents', 'work', 'repo'),
        { platform: 'darwin', home, euid: 501, read: (key) => { asked.push(key); return '1\n'; } });
      expect(hit?.provider).toBe('iCloud Drive');
      expect(hit?.folder).toBe('Documents');
      expect(hit?.root).toBe(join(home, 'Documents').replace(/\\/g, '/'));
      expect(asked).toEqual(['FXICloudDriveDocuments']);
    } finally {
      removeTempDir(base);
    }
  });

  it('a path that is not there yet is resolved through its nearest ancestor that is, as the folder it is compared with is', () => {
    // The wizard asks BEFORE it makes `.local/`, so the folder it hands over may not exist. The folder `<home>/Documents` is resolved through any link above it
    // (a home kept on another volume; macOS's own /var for a temp folder), and a path left as written would then never be inside it.
    const { base } = tree();
    try {
      const real = join(base, 'volume', 'me');
      mkdirSync(join(real, 'Documents', 'work', 'repo'), { recursive: true });
      const linkedHome = join(base, 'linked-home');
      try { symlinkSync(real, linkedHome, 'dir'); } catch { return; }                          // a system that cannot make a link has nothing to check here
      const asked: string[] = [];
      const hit = detectIcloudFolders(join(linkedHome, 'Documents', 'work', 'repo', '.local', 'deeper'),
        { platform: 'darwin', home: linkedHome, euid: 501, read: (key) => { asked.push(key); return '1\n'; } });
      expect(hit?.folder).toBe('Documents');
      expect(asked).toEqual(['FXICloudDriveDocuments']);
    } finally {
      removeTempDir(base);
    }
  });
});

describe('the server\'s start-up line asks the same question as the wizard', () => {
  /** The source without the lines that are only comments, as the guide's test reads the product: a comment that names the call is not the call. */
  const server = readFileSync(resolve(here, '../../src/server.ts'), 'utf8').split('\n').filter((l) => !/^\s*(?:\/\/|\/\*|\*)/.test(l)).join('\n');

  it('calls findCloudSync with the store path, and no longer the named vendors alone', () => {
    expect(server).toMatch(/\bfindCloudSync\(report\.path\)/);
    expect(server).not.toMatch(/\bisUnderCloudSyncFolder\(/);
  });
});
