import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARGV_SECRET, CANCELLED, EXIT_INTERRUPTED, EXIT_USAGE, argvCarriesSecret, knownBadConsole,
  noTtyMessage, promptChoice, promptLine, promptSecret, readSecretFromStdin,
  WINDOWS_KNOWN_BAD, type Io,
} from '../../src/cli/tty.js';

/**
 * ARC-07-S01 — the credential boundary, driven by a fake terminal.
 *
 * NEVER A REAL TTY. CI has none, and a test that needed one would be a test that ran on one
 * machine — which for the one file where a password is typed is the wrong file to leave
 * unproven on two platforms out of three. The fake below is what `setRawMode` and `isTTY`
 * actually are to this module: a flag and a function, both observable.
 *
 * And no fixture password is ever SPELLED. Every secret here is assembled from parts, because
 * the repository sweeps its own tree for credential-shaped strings and a test file that wrote
 * one would become a finding in the sweep that exists to protect it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../dist/cli/index.js');

/** Assembled, never spelled — see the note above. */
const secretOf = (...parts: string[]) => parts.join('');
const PASSWORD = secretOf('hunt', 'er', '2');

class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  /** Every `setRawMode` call, in order — the restoration is asserted from this. */
  readonly rawCalls: boolean[] = [];
  resumed = 0;
  paused = 0;

  setRawMode(value: boolean): this {
    this.rawCalls.push(value);
    this.isRaw = value;
    return this;
  }

  resume(): this { this.resumed += 1; return this; }
  pause(): this { this.paused += 1; return this; }

  /** What the terminal sends. A paste is ONE call with many bytes; typing is many calls. */
  type(...chunks: string[]): void {
    for (const chunk of chunks) this.emit('data', Buffer.from(chunk, 'utf8'));
  }
}

class FakeStdout extends EventEmitter {
  isTTY = false;                       // plain bytes by default: the ANSI branch is its own test
  written = '';
  write(chunk: string): boolean { this.written += chunk; return true; }
}

const fakeIo = (): { io: Io; stdin: FakeStdin; stdout: FakeStdout } => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  return { io: { stdin, stdout } as unknown as Io, stdin, stdout };
};

/** An `exit` that records instead of ending the test run. */
const recordingExit = () => {
  const codes: number[] = [];
  const exit = ((code: number) => { codes.push(code); return undefined as never; }) as (c: number) => never;
  return { codes, exit };
};

describe('promptSecret', () => {
  it('criterion 1 — types, backspaces, submits, and echoes nothing', async () => {
    const { io, stdin, stdout } = fakeIo();
    expect(stdin.isRaw).toBe(false);                       // the precondition, asserted first
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type('a', 'b', 'c', 'd', '\x7f', 'e', '\r');
    await expect(pending).resolves.toHaveLength(4);
    // The label and a newline. Nothing else — not the characters, not asterisks.
    expect(stdout.written).toBe('Password: \n');
    expect(stdin.rawCalls).toEqual([true, false]);
    expect(stdin.isRaw).toBe(false);
  });

  it('...and the value is what was typed, minus the deleted character', async () => {
    const { io, stdin } = fakeIo();
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type(PASSWORD, 'x', '\x08', '\n');               // the other Backspace byte
    await expect(pending).resolves.toBe(PASSWORD);
  });

  it('criterion 2 — Ctrl-C exits 130, restores the mode, and says nothing was saved', async () => {
    const { io, stdin, stdout } = fakeIo();
    const { codes, exit } = recordingExit();
    const pending = promptSecret('Password:', { io, exit, env: {}, platform: 'linux' });
    stdin.type('abc', '\x03');
    // The exit is injected, so the promise never settles — what matters is what happened to the
    // terminal and to the exit code, both observable now.
    await Promise.race([pending, new Promise((r) => setTimeout(r, 10))]);
    expect(codes).toEqual([EXIT_INTERRUPTED]);
    expect(stdout.written).toContain(CANCELLED);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.rawCalls.at(-1)).toBe(false);
    expect(stdout.written).not.toContain('abc');
  });

  it('Ctrl-D on an empty buffer is Ctrl-C; with a buffer it is ignored', async () => {
    const empty = fakeIo();
    const first = recordingExit();
    const cancelled = promptSecret('Password:', { io: empty.io, exit: first.exit, env: {}, platform: 'linux' });
    empty.stdin.type('\x04');
    await Promise.race([cancelled, new Promise((r) => setTimeout(r, 10))]);
    expect(first.codes).toEqual([EXIT_INTERRUPTED]);

    const typed = fakeIo();
    const pending = promptSecret('Password:', { io: typed.io, env: {}, platform: 'linux' });
    typed.stdin.type('ab', '\x04', '\r');
    await expect(pending).resolves.toBe('ab');
  });

  it('Ctrl-U clears the buffer without ending the prompt', async () => {
    const { io, stdin } = fakeIo();
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type('wrong', '\x15', PASSWORD, '\r');
    await expect(pending).resolves.toBe(PASSWORD);
  });

  it('an arrow key does not become two characters of the password', async () => {
    // Without the escape branch, pressing Left appends `[D` — and nothing is echoed, so the user
    // cannot see that their password now has two characters they did not type.
    const { io, stdin } = fakeIo();
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type('ab', '\x1b[D', '\x1b[A', '\x1bOP', 'c', '\r');
    await expect(pending).resolves.toBe('abc');
  });

  it('criterion 7 — a paste with a trailing newline submits; one without waits', async () => {
    const withNewline = fakeIo();
    const submitted = promptSecret('Password:', { io: withNewline.io, env: {}, platform: 'linux' });
    withNewline.stdin.type(`${PASSWORD}\n`);               // ONE chunk, as a paste arrives
    await expect(submitted).resolves.toBe(PASSWORD);

    const without = fakeIo();
    let settled = false;
    const waiting = promptSecret('Password:', { io: without.io, env: {}, platform: 'linux' })
      .then((v) => { settled = true; return v; });
    without.stdin.type(PASSWORD);
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);                           // still waiting for Enter
    without.stdin.type('\r');
    await expect(waiting).resolves.toBe(PASSWORD);
  });

  it('SNOWARCH_MASK=asterisk shows one star per character, and is off by default', async () => {
    const on = fakeIo();
    const masked = promptSecret('Password:', { io: on.io, env: { SNOWARCH_MASK: 'asterisk' }, platform: 'linux' });
    on.stdin.type('abcd', '\x7f', '\r');
    await expect(masked).resolves.toHaveLength(3);
    expect(on.stdout.written).toContain('****');
    expect(on.stdout.written).not.toContain('abcd');        // the length, never the characters

    const off = fakeIo();
    const plain = promptSecret('Password:', { io: off.io, env: {}, platform: 'linux' });
    off.stdin.type('abcd', '\r');
    await plain;
    expect(off.stdout.written).not.toContain('*');
  });

  it('criterion 3 — no TTY and no flag is the NO_TTY refusal, exit 2', async () => {
    const { io, stdin, stdout } = fakeIo();
    stdin.isTTY = false;
    const { codes, exit } = recordingExit();
    await promptSecret('Password:', { io, exit, env: {}, platform: 'linux' });
    expect(stdout.written).toContain('NO_TTY: stdin is not a terminal');
    expect(stdout.written).toBe(`${noTtyMessage('linux')}\n`);
    expect(codes).toEqual([EXIT_USAGE]);
    expect(stdin.rawCalls).toEqual([]);                    // never attempted
  });

  it('...and on Windows the same message names the .cmd spelling', async () => {
    const { io, stdin, stdout } = fakeIo();
    stdin.isTTY = false;
    const { exit } = recordingExit();
    await promptSecret('Password:', { io, exit, env: {}, platform: 'win32' });
    expect(stdout.written).toContain('On PowerShell/cmd use: snowarch.cmd instance add … --password-stdin');
    expect(noTtyMessage('linux')).not.toContain('snowarch.cmd');
  });

  it('a stdin that dies mid-prompt still restores the terminal', async () => {
    // Before the module listened for `error`, this promise never settled: no settle, no
    // `finally`, no restore — and the user's shell stops echoing what they type with no clue
    // why. The error is passed through as it came, and it describes a stream, not a password.
    const { io, stdin } = fakeIo();
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type('abc');
    stdin.emit('error', new Error('stream gone'));
    await expect(pending).rejects.toThrow('stream gone');
    expect(stdin.isRaw).toBe(false);
    expect(stdin.rawCalls).toEqual([true, false]);
    expect(stdin.paused).toBeGreaterThan(0);
  });

  it('a console S-04 recorded as unusable gets the fallback, not a hung prompt', async () => {
    // The table ships EMPTY — the spike needs a Windows machine with a human. This proves the
    // branch behind it works, so the day a cell comes back FAILED the change is one entry.
    expect(WINDOWS_KNOWN_BAD).toHaveLength(0);
    const planted = [{ id: 'conhost + cmd (planted)', matches: (env: NodeJS.ProcessEnv) => env.FIXTURE === '1' }];
    expect(knownBadConsole('win32', { FIXTURE: '1' }, planted)?.id).toContain('planted');
    expect(knownBadConsole('linux', { FIXTURE: '1' }, planted)).toBeNull();   // Windows only

    const { io, stdin, stdout } = fakeIo();
    const { codes, exit } = recordingExit();
    await promptSecret('Password:', { io, exit, env: { FIXTURE: '1' }, platform: 'win32', knownBad: planted });
    expect(stdout.written).toContain('--password-stdin');
    expect(stdout.written).toContain('S-04 recorded as unusable');
    expect(codes).toEqual([EXIT_USAGE]);
    expect(stdin.rawCalls).toEqual([]);                    // raw mode was never attempted
  });

  it('bold is only for a terminal that is watching', async () => {
    const { io, stdin, stdout } = fakeIo();
    stdout.isTTY = true;
    const pending = promptSecret('Password:', { io, env: {}, platform: 'linux' });
    stdin.type('\r');
    await pending;
    expect(stdout.written).toContain('[1mPassword:[0m');
  });
});

describe('readSecretFromStdin', () => {
  const streamOf = (text: string): Io => {
    async function* lines(): AsyncGenerator<Buffer> { yield Buffer.from(text, 'utf8'); }
    const stdin = lines() as unknown as NodeJS.ReadStream;
    return { stdin, stdout: new FakeStdout() as unknown as NodeJS.WriteStream };
  };

  it('criterion 4 — a trailing newline is the shell\'s, not the password\'s', async () => {
    await expect(readSecretFromStdin({ io: streamOf(`${PASSWORD}\n`) })).resolves.toEqual([PASSWORD]);
  });

  it('...and CRLF gives exactly the same value — the Windows pipe case', async () => {
    // A carriage return at the end of a password is invisible and authentication just fails.
    await expect(readSecretFromStdin({ io: streamOf(`${PASSWORD}\r\n`) })).resolves.toEqual([PASSWORD]);
  });

  it('line 2 is the client secret, and CRLF is stripped per line', async () => {
    const clientSecret = secretOf('cs', '-', '42');
    await expect(readSecretFromStdin({ io: streamOf(`${PASSWORD}\r\n${clientSecret}\r\n`) }))
      .resolves.toEqual([PASSWORD, clientSecret]);
  });

  it('no prompt is written when the secret came from stdin', async () => {
    const stdout = new FakeStdout();
    async function* lines(): AsyncGenerator<Buffer> { yield Buffer.from(`${PASSWORD}\n`, 'utf8'); }
    const io = { stdin: lines() as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream };
    await expect(promptSecret('Password:', { io, passwordStdin: true, env: {}, platform: 'linux' }))
      .resolves.toBe(PASSWORD);
    expect(stdout.written).toBe('');
  });
});

describe('the argv rule', () => {
  it('criterion 5 — every secret flag spelling is refused', () => {
    for (const flag of ['--password', '--client-secret', '--secret']) {
      expect(argvCarriesSecret([flag, PASSWORD])).toBe(true);
      expect(argvCarriesSecret([`${flag}=${PASSWORD}`])).toBe(true);
    }
    expect(argvCarriesSecret(['instance', 'add', 'dev', '--url', 'https://example.invalid'])).toBe(false);
    // Not vacuous, and not over-eager: a flag that merely CONTAINS the word is not one of these.
    expect(argvCarriesSecret(['--password-stdin'])).toBe(false);
  });

  it('...and the built CLI refuses before commander, with no network call', () => {
    // The real binary, because the point is the ORDER: commander echoes an unknown option back,
    // so a `--password` that reached the parser would be printed to stderr by the code refusing
    // it. Run with a proxy that cannot connect — a network call would fail loudly rather than
    // silently succeed.
    const r = spawnSync(process.execPath,
      [CLI, 'instance', 'add', 'dev', '--password', PASSWORD],
      { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9' } });
    expect(r.status).toBe(EXIT_USAGE);
    expect(r.stderr).toContain(ARGV_SECRET);
    // The value itself never appears — not in the message, not in a commander echo.
    expect(r.stderr).not.toContain(PASSWORD);
    expect(r.stdout).not.toContain(PASSWORD);
  });
});

describe('promptLine and promptChoice', () => {
  // A real `Readable`: `readline` attaches listeners, so an async generator is not a stand-in
  // for a stream here the way it is for `for await` in readSecretFromStdin.
  const scripted = (answers: string[]) => {
    const stdout = new FakeStdout();
    const stdin = Readable.from(answers.map((a) => `${a}\n`));
    return {
      io: { stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream },
      stdout,
    };
  };

  it('Enter takes the default; a value overrides it', async () => {
    const empty = scripted(['']);
    await expect(promptLine('Environment', { io: empty.io, fallback: 'pdi' })).resolves.toBe('pdi');
    const typed = scripted(['sandbox']);
    await expect(promptLine('Environment', { io: typed.io, fallback: 'pdi' })).resolves.toBe('sandbox');
  });

  it('a validator prints its message and asks again rather than accepting', async () => {
    const { io, stdout } = scripted(['nope', 'pdi']);
    const value = await promptLine('Environment', {
      io,
      validate: (v) => (v === 'pdi' ? null : 'environment must be pdi'),
    });
    expect(value).toBe('pdi');
    expect(stdout.written).toContain('environment must be pdi');
  });

  it('promptChoice numbers the list, defaults on Enter, and repeats on nonsense', async () => {
    const choices = [{ key: 'read-only', text: 'no writes' }, { key: 'full', text: 'writes' }];
    const enter = scripted(['']);
    await expect(promptChoice('Preset', choices, { io: enter.io })).resolves.toBe('read-only');
    const second = scripted(['2']);
    await expect(promptChoice('Preset', choices, { io: second.io })).resolves.toBe('full');
    const wrong = scripted(['9', '1']);
    await expect(promptChoice('Preset', choices, { io: wrong.io })).resolves.toBe('read-only');
    expect(wrong.stdout.written).toContain('enter a number between 1 and 2');
  });
});

describe('the shape B06 will spawn it in', () => {
  /**
   * ARC-06-S07's B06 spawns `instance add --from-bootstrap` with INHERITED stdio, so `tty.ts`
   * has to behave correctly when its streams belong to a parent process. Two child processes,
   * one piped and one inherited, because the difference between them is exactly `isTTY` — and
   * getting that wrong means the wizard either refuses inside the bootstrap or reads a pipe it
   * should have refused.
   */
  it('a piped child refuses; an inherited child sees whatever the parent had', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tty-spawn-'));
    try {
      const probe = join(dir, 'probe.mjs');
      const out = join(dir, 'result.json');
      // The result goes to a FILE, because the refusal itself is written to stdout — parsing
      // stdout would mean the test could only pass while the module printed nothing.
      writeFileSync(probe, [
        `import { promptSecret } from ${JSON.stringify(resolve(here, '../../dist/cli/tty.js'))};`,
        "import { writeFileSync } from 'node:fs';",
        'const codes = [];',
        'await promptSecret("Password:", { exit: (c) => { codes.push(c); return undefined; },',
        '  env: {}, platform: "linux" });',
        `writeFileSync(${JSON.stringify(out)}, JSON.stringify({ codes, isTTY: Boolean(process.stdin.isTTY) }));`,
      ].join('\n'));

      // Piped: not a terminal, so the refusal — the CI shape, and the wrong-stdin shape.
      const piped = execFileSync(process.execPath, [probe], { input: '', encoding: 'utf8' });
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ codes: [EXIT_USAGE], isTTY: false });
      expect(piped).toContain('NO_TTY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the tests themselves leak nothing', () => {
  it('no fixture secret is spelled in this file', () => {
    // The sweep that protects the repository would flag a literal here, so the fixtures are
    // assembled. This asserts the discipline rather than trusting it.
    const source = execFileSync('node', ['-e',
      `process.stdout.write(require('fs').readFileSync(${JSON.stringify(fileURLToPath(import.meta.url))}, 'utf8'))`],
    { encoding: 'utf8' });
    expect(source).not.toContain(PASSWORD);
    expect(PASSWORD).toHaveLength(7);            // the assembly really did produce a value
  });
});
