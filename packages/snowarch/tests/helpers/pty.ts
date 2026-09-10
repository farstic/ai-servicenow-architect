/**
 * A pseudo-terminal, without a native dependency.
 *
 * The wizard's masked prompt needs a REAL terminal: `readline` turns echo off through the tty, and
 * a plain `spawn` gives the child a pipe, where there is nothing to turn off. Every unit test in
 * this package injects around that seam — which is right, and which is also why the seam itself has
 * never been exercised. This helper is how the live suite exercises it: `script(1)` allocates a pty,
 * runs the command inside it, and hands back everything the terminal saw.
 *
 * `script` ships with macOS (BSD) and with util-linux on every Linux runner, and the two take their
 * arguments differently — BSD wants `script -q <typescript-file> <command…>`, util-linux wants
 * `script -qec "<command>" <typescript-file>`. Both are here; the workflow proves the binary exists
 * before any case runs, because "the tool is present" was an assumption in the story rather than a
 * measured fact.
 *
 * WINDOWS HAS NO `script(1)` and no equivalent that does not pull in a native module. The Windows
 * job runs the `--password-stdin` cases only, which is a real path a user takes rather than a
 * concession — a CI pipeline pipes the secret in exactly that way.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { platform } from 'node:process';

export interface PtyRun {
  /** Everything the terminal saw, in order — prompts included. */
  output: string;
  code: number | null;
  /** The child's pid while it ran, for the `ps` / `/proc` snapshot case 1 takes. */
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

/** The two `script(1)` dialects, as data — the workflow's presence check prints which one it found. */
export function scriptArgv(command: readonly string[]): { file: string; args: string[] } {
  const joined = command.map((c) => (/[\s"]/.test(c) ? JSON.stringify(c) : c)).join(' ');
  return platform === 'darwin'
    // BSD: the typescript file comes first, then the command and its arguments.
    ? { file: 'script', args: ['-q', '/dev/null', ...command] }
    // util-linux: `-e` returns the child's exit code, `-c` takes the whole command as one string.
    : { file: 'script', args: ['-qec', joined, '/dev/null'] };
}

/**
 * Run a command inside a pty and drive its prompts.
 *
 * The script is a list of (prompt, answer) pairs rather than a fixed sequence of writes: a wizard
 * that asked in a different order, or asked one question fewer, would still consume a blind write
 * list and the test would pass for the wrong reason. Waiting for the prompt is the assertion.
 */
export function runInPty(command: readonly string[], options: PtyOptions = {}): Promise<PtyRun> {
  const { file, args } = scriptArgv(command);
  const child: ChildProcessWithoutNullStreams = spawn(file, args, {
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
