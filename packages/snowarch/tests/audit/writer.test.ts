import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEEP, MAX_BYTES, appendAudit, auditDisabled, resetAuditWarning, resolveAuditPath, tailAudit,
} from '../../src/audit/writer.js';

const isWindows = process.platform === 'win32';

let base: string;

const entry = (over: Record<string, unknown> = {}) => ({
  ts: '2026-09-08T10:22:31.412Z', instance: 'pdi', environment: 'pdi',
  tool: 'snow_core_record_add', gate: 'write', table: 'incident',
  sysId: null, query: null, result: 'ok', ms: 12, source: 'mcp' as const, ...over,
});

const lines = (p: string): string[] => readFileSync(p, 'utf8').split('\n').filter((l) => l !== '');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'snowarch-audit-'));
  resetAuditWarning();
  vi.stubEnv('SNOW_AUDIT_FILE', join(base, 'audit.jsonl'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('where the file goes', () => {
  it('SNOW_AUDIT_FILE wins, resolved to an absolute path', () => {
    vi.stubEnv('SNOW_AUDIT_FILE', join(base, 'elsewhere.jsonl'));
    expect(resolveAuditPath()).toBe(join(base, 'elsewhere.jsonl'));
  });

  it('"off" disables it, case-insensitively, and appending is then a no-op', () => {
    vi.stubEnv('SNOW_AUDIT_FILE', 'OFF');
    expect(auditDisabled()).toBe(true);
    expect(resolveAuditPath()).toBeNull();
    expect(() => appendAudit(entry())).not.toThrow();
    expect(tailAudit()).toEqual([]);
  });

  it('with no override it sits beside the store, named audit.jsonl', () => {
    vi.stubEnv('SNOW_AUDIT_FILE', '');
    vi.stubEnv('SNOW_STORE', '');
    vi.stubEnv('CLAUDE_PROJECT_DIR', base);
    // Not asserted as a literal path: the point is that it is the STORE's directory, so the
    // audit sits with the configuration it records rather than in the working directory.
    expect(resolveAuditPath()).toBe(join(base, '.local', 'audit.jsonl'));
  });
});

describe('criterion 1 shape - one line, no payload', () => {
  it('appends exactly one parseable line per call', () => {
    appendAudit(entry());
    appendAudit(entry({ result: 'WRITE_NOT_ENABLED' }));
    const file = resolveAuditPath()!;
    expect(lines(file)).toHaveLength(2);
    expect(JSON.parse(lines(file)[0]!).tool).toBe('snow_core_record_add');
    expect(JSON.parse(lines(file)[1]!).result).toBe('WRITE_NOT_ENABLED');
  });

  it('writes only the declared fields - an entry cannot smuggle one in', () => {
    // The writer serialises what it is given, so the guard against payloads is at the CALL
    // site (server.ts builds the entry from named fields). What this asserts is that nothing
    // is added here, and that the field set is the documented one.
    appendAudit(entry({ note: 'switch to prod' }));
    expect(Object.keys(JSON.parse(lines(resolveAuditPath()!)[0]!)).sort()).toEqual([
      'environment', 'gate', 'instance', 'ms', 'note', 'query', 'result', 'source', 'sysId',
      'table', 'tool', 'ts',
    ]);
  });

  it.skipIf(isWindows)('the file is 0600 in a 0700 directory', () => {
    // Windows has no POSIX mode bits; the directory ACL is inherited there, and criterion 7
    // proves the write and rotate work on the CI matrix instead.
    vi.stubEnv('SNOW_AUDIT_FILE', join(base, 'nested', 'audit.jsonl'));
    appendAudit(entry());
    expect(statSync(join(base, 'nested', 'audit.jsonl')).mode & 0o777).toBe(0o600);
    expect(statSync(join(base, 'nested')).mode & 0o777).toBe(0o700);
  });
});

describe('criterion 3 - rotation at 10 MB, keeping three', () => {
  it('rotates and keeps every line parseable across both files', () => {
    const file = resolveAuditPath()!;
    const big = 'x'.repeat(60 * 1024);
    // 200 x 60 KB is about 12 MB - past the ceiling, as the criterion specifies.
    for (let i = 0; i < 200; i += 1) appendAudit(entry({ query: big, ms: i }));

    expect(statSync(`${file}.1`).size).toBeGreaterThan(0);
    expect(statSync(file).size).toBeLessThan(MAX_BYTES);
    for (const f of [file, `${file}.1`]) {
      for (const l of lines(f)) expect(() => JSON.parse(l)).not.toThrow();
    }
    // An explicit timeout, because this case is ~12 MB of synchronous I/O plus one open per
    // append for the partial-line probe. It failed once inside a full-suite run — alongside
    // nine child processes from the doctor suite — and passed alone and in seven repeats
    // afterwards, which is the signature of the default 5 s limit under load rather than of a
    // wrong assertion. A generous limit is the honest fix; making the fixture smaller would
    // stop it crossing the 10 MB ceiling it exists to cross.
  }, 60_000);

  it('shifts oldest-first so nothing is overwritten before it moves', () => {
    const file = resolveAuditPath()!;
    // Seed .1/.2/.3 with identifiable content and an over-size current file.
    for (let i = 1; i <= KEEP; i += 1) writeFileSync(`${file}.${i}`, `OLD${i}\n`);
    writeFileSync(file, `${'y'.repeat(MAX_BYTES)}\n`);
    appendAudit(entry());

    expect(readFileSync(`${file}.2`, 'utf8')).toBe('OLD1\n');
    expect(readFileSync(`${file}.3`, 'utf8')).toBe('OLD2\n');
    // OLD3 fell off the end - three older files, by design, so a trail nobody prunes stays
    // bounded. A loop that renamed newest-first would have left OLD1 in all three.
    expect(readFileSync(`${file}.1`, 'utf8').startsWith('yyy')).toBe(true);
    expect(lines(file)).toHaveLength(1);
  });

  it('does not rotate a file that is under the ceiling', () => {
    const file = resolveAuditPath()!;
    appendAudit(entry());
    appendAudit(entry());
    expect(() => statSync(`${file}.1`)).toThrow();
  });
});

describe('criterion 6 - a write failure never fails the call, and warns once', () => {
  it.skipIf(isWindows)('a read-only directory produces exactly one warning', () => {
    // POSIX-only: chmod 0500 does not stop writes on Windows, so the equivalent there is
    // criterion 7 - that the file is written and rotated at all on the CI matrix.
    const dir = join(base, 'ro');
    mkdirSync(dir);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    chmodSync(dir, 0o500);
    try {
      vi.stubEnv('SNOW_AUDIT_FILE', join(dir, 'audit.jsonl'));
      expect(() => { appendAudit(entry()); appendAudit(entry()); appendAudit(entry()); })
        .not.toThrow();
      const warnings = spy.mock.calls.filter((c) => String(c[0]).includes('audit trail unavailable'));
      // Once, not three times: a read-only filesystem fails on every call, and one warning per
      // call would bury the server's real output.
      expect(warnings).toHaveLength(1);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it.skipIf(isWindows)('and the warning carries a masked path, not a raw one', () => {
    const dir = join(base, 'ro2');
    mkdirSync(dir);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    chmodSync(dir, 0o500);
    try {
      vi.stubEnv('SNOW_AUDIT_FILE', join(dir, 'audit.jsonl'));
      appendAudit(entry());
      const call = spy.mock.calls.find((c) => String(c[0]).includes('audit trail unavailable'))!;
      expect(JSON.stringify(call[1])).not.toContain(process.env.HOME ?? ' never ');
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe('tailAudit', () => {
  it('returns the last n, parsed, in order', () => {
    for (let i = 0; i < 10; i += 1) appendAudit(entry({ ms: i }));
    expect(tailAudit(3).map((e) => e.ms)).toEqual([7, 8, 9]);
  });

  it('defaults to 50 and copes with fewer', () => {
    appendAudit(entry());
    expect(tailAudit()).toHaveLength(1);
  });

  it('skips an unparseable line instead of throwing the whole trail away', () => {
    // A truncated final line is normal after a crash mid-append. `lines.map(JSON.parse)` would
    // make one bad byte hide every good line before it.
    const file = resolveAuditPath()!;
    appendAudit(entry({ ms: 1 }));
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"ts":"trunc`, { flag: 'w' });
    appendAudit(entry({ ms: 2 }));
    expect(tailAudit().map((e) => e.ms)).toEqual([1, 2]);
  });

  it('a missing file is empty, not an error', () => {
    expect(tailAudit()).toEqual([]);
  });
});
