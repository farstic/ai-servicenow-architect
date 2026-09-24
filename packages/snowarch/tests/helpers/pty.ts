/**
 * A pseudo-terminal, without a native dependency.
 *
 * The wizard's masked prompt needs a REAL terminal: `readline` turns echo off through the tty, and
 * a plain `spawn` gives the child a pipe, where there is nothing to turn off. Every unit test in
 * this package injects around that seam — which is right, and which is also why the seam itself has
 * never been exercised. This helper is how the live suite exercises it: it allocates a pty, runs
 * the command inside it, and hands back everything the terminal saw.
 *
 * ARC-07-C8 — WHY THIS IS `pty-driver.py` AND NOT `script(1)`. BSD `script(1)` was driven with
 * Node's default stdio, which is a socketpair on darwin, and `script` calls `tcgetattr` on its OWN
 * stdin to save the terminal state it restores on exit — a call meaningful only on a real tty, and
 * one that fails with `tcgetattr/ioctl: Operation not supported on socket` on anything else. Three
 * stdin shapes were measured, not guessed: the default pipe reproduces the error; `/dev/null` fixes
 * the spawn but ends stdin immediately, so no prompt can be answered; a FIFO is still a non-tty fd
 * and still fails the same call. `script(1)` cannot be driven from a socket no matter which of its
 * own stdio shapes it is given.
 *
 * `pty-driver.py` (stdlib `os.forkpty`) allocates the pty itself and gives the CHILD the pty as its
 * controlling terminal; this driver's own stdio — talking to Node — stays a plain pipe, exactly the
 * shape `script(1)` used to be handed and choked on, except this driver never calls `tcgetattr` on
 * it. python3 is already a doctor requirement on POSIX (`docx` generation), so this adds no new
 * dependency, and there is no dialect split to maintain — one driver, one invocation, on macOS and
 * Linux alike.
 *
 * WINDOWS HAS NO `os.forkpty()` and no equivalent that does not pull in a native module. The
 * Windows job runs the `--password-stdin` cases only, which is a real path a user takes rather than
 * a concession — a CI pipeline pipes the secret in exactly that way.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { platform } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The driver script, resolved relative to this file rather than to `process.cwd()`. */
export const DRIVER = join(HERE, 'pty-driver.py');

export interface PtyRun {
  /** Everything the terminal saw, in order — prompts included. */
  output: string;
  code: number | null;
  /** The driver's pid while it ran, for the `ps` / `/proc` snapshot case 1 takes. */
  pid: number | undefined;
}

export interface PtyOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Answers, in order: each is written when the prompt before it has appeared. */
  script?: Array<{ waitFor: RegExp; send: string }>;
  timeoutMs?: number;
  /** Called once the child is running, with its pid — where case 1 reads `ps` / `/proc`. */
  onStart?: (pid: number | undefined) => void | Promise<void>;
}

/** True when a pty can be allocated here at all. Windows: no. */
export const ptyAvailable = (): boolean => platform !== 'win32';

/**
 * Run a command inside a pty and drive its prompts.
 *
 * The script is a list of (prompt, answer) pairs rather than a fixed sequence of writes: a wizard
 * that asked in a different order, or asked one question fewer, would still consume a blind write
 * list and the test would pass for the wrong reason. Waiting for the prompt is the assertion.
 */
export function runInPty(command: readonly string[], options: PtyOptions = {}): Promise<PtyRun> {
  const child: ChildProcessWithoutNullStreams = spawn('python3', [DRIVER, ...command], {
    cwd: options.cwd,
    env: options.env ?? process.env,
  }) as ChildProcessWithoutNullStreams;

  let output = '';
  const pending = [...(options.script ?? [])];
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise<PtyRun>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`pty run timed out after ${timeoutMs} ms; saw:\n${output}`));
    }, timeoutMs);

    const pump = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      // One answer per matching prompt, in order. `shift` only when the head matches, so a prompt
      // that never appears leaves its answer unsent and the timeout reports what WAS seen.
      while (pending.length > 0 && pending[0] && pending[0].waitFor.test(output)) {
        const step = pending.shift();
        if (step) child.stdin.write(step.send);
      }
    };
    child.stdout.on('data', pump);
    child.stderr.on('data', pump);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ output, code, pid: child.pid });
    });

    void Promise.resolve(options.onStart?.(child.pid));
  });
}

/**
 * The same command with the secret on stdin — the path Windows takes, and the path a CI pipeline
 * takes everywhere. `\n` on POSIX, `\r\n` on Windows: a lone `\n` through a PowerShell pipe is not
 * what the reader on the other side is waiting for.
 */
export function stdinPayload(secret: string): string {
  return platform === 'win32' ? `${secret}\r\n` : `${secret}\n`;
}
