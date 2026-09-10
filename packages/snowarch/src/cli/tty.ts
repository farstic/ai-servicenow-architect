/**
 * ARC-07-S01 — the only place a secret is typed, and everything that keeps it there.
 *
 * `01` principle 3: the terminal is the one surface where a password can be entered without a
 * transcript, an argv entry or a file to forget about. That makes this file the credential
 * boundary, and its rules follow from what goes wrong when each is missing:
 *
 *   NOTHING IS ECHOED         — not the characters, not asterisks (asterisks reveal the length,
 *                               which is why `SNOWARCH_MASK=asterisk` exists and is off).
 *   RAW MODE IS ALWAYS RESTORED — including when the caller throws. A terminal left raw is a
 *                               shell that no longer echoes anything the user types afterwards.
 *   NO TTY IS A REFUSAL       — never a silent read of a pipe. A password read from an
 *                               unexpected stdin is a password in a CI log.
 *   THE ARGV SCAN IS ELSEWHERE — `cli/index.ts`, before commander sees anything (P-34).
 *
 * No dependency: `@inquirer/prompts` is what ARC-04-S01 removed (P-23), and re-adding a prompt
 * library for four functions would put the credential boundary inside somebody else's package.
 * `node:readline` and `node:process` only.
 */
// `node:readline/promises`: the callback form would put the one place a user answers a
// question behind a callback that cannot be awaited in a validation loop.
import { createInterface } from 'node:readline/promises';

/** The two streams every function takes, so a test never needs a terminal. */
export interface Io {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

/** Injected so a test can assert the code without ending its own process. */
export type ExitFn = (code: number) => never;

const defaultIo = (): Io => ({ stdin: process.stdin, stdout: process.stdout });
const defaultExit: ExitFn = (code) => process.exit(code) as never;

export const EXIT_USAGE = 2;
export const EXIT_INTERRUPTED = 130;   // 128 + SIGINT, the shell convention

export const CANCELLED = 'Cancelled — nothing saved.';

/** The argv rule's sentence. Exported so the CLI and its test cannot paraphrase it. */
export const ARGV_SECRET =
  'Secrets are never accepted on the command line (they would appear in ps output and shell '
  + 'history). Use the prompt or --password-stdin.';

/**
 * The no-TTY sentence, with the example that makes it actionable.
 *
 * It names a password manager on purpose: "pipe it" is advice a user has to turn into a command,
 * and the command they invent is usually `echo`, which puts the secret in shell history — the
 * exact thing this whole file exists to prevent.
 */
export function noTtyMessage(platform: NodeJS.Platform = process.platform): string {
  const base = 'NO_TTY: stdin is not a terminal, so the password cannot be typed with masking. '
    + 'Pipe it with --password-stdin (for example from a password manager: op read '
    + '"op://vault/item/password" | ./snowarch instance add …) or run the command in an '
    + 'interactive terminal.';
  return platform === 'win32'
    ? `${base}\nOn PowerShell/cmd use: snowarch.cmd instance add … --password-stdin`
    : base;
}

/**
 * Windows console combinations where raw mode is known NOT to work.
 *
 * EMPTY, and that is a statement about evidence rather than about Windows: S-04 (the 8-cell
 * matrix — Windows Terminal and conhost × PowerShell 5.1 and cmd × with and without Git Bash)
 * has not been run, because it needs a Windows machine with a human at it. It is a row in
 * `docs/spikes/OWNER-SITTING.md`.
 *
 * When a cell comes back FAILED, it is one entry here: the module then prints the
 * `--password-stdin` fallback for that combination instead of attempting raw mode and hanging.
 * The branch below is wired and tested against a planted entry, so the day the spike returns,
 * the change is data and not code.
 */
export interface KnownBad {
  /** What the spike recorded, for the message and for whoever reads this next. */
  readonly id: string;
  /** True when the current console is that combination. */
  readonly matches: (env: NodeJS.ProcessEnv) => boolean;
}

export const WINDOWS_KNOWN_BAD: readonly KnownBad[] = Object.freeze([]);

/** The recorded combination this console is, or null. Windows only, by construction. */
export function knownBadConsole(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  table: readonly KnownBad[] = WINDOWS_KNOWN_BAD,
): KnownBad | null {
  if (platform !== 'win32') return null;
  return table.find((entry) => entry.matches(env)) ?? null;
}

/** Bold, but only when someone is watching. A pipe gets plain bytes. */
const label = (text: string, io: Io): string =>
  (io.stdout.isTTY ? `\u001B[1m${text}\u001B[0m ` : `${text} `);

/**
 * Read one secret, echoing nothing.
 *
 * Byte by byte, because a paste arrives as ONE chunk: a reader that treated a chunk as a line
 * would submit a pasted password that had no newline, and would swallow the newline of one that
 * did. Every byte goes through the same table either way.
 */
export async function promptSecret(text: string, {
  io = defaultIo(),
  exit = defaultExit,
  env = process.env,
  platform = process.platform,
  passwordStdin = false,
  knownBad = WINDOWS_KNOWN_BAD,
}: Partial<{ io: Io; exit: ExitFn; env: NodeJS.ProcessEnv; platform: NodeJS.Platform;
  passwordStdin: boolean; knownBad: readonly KnownBad[] }> = {}): Promise<string> {
  if (passwordStdin) {
    const [first] = await readSecretFromStdin({ io });
    return first ?? '';
  }

  const bad = knownBadConsole(platform, env, knownBad);
  if (bad) {
    // Not an attempt-and-hope: the spike recorded that this console does not restore, and a
    // hung terminal is worse than a refusal that names the way through.
    io.stdout.write(`${noTtyMessage(platform)}\n`);
    io.stdout.write(`(this console is a combination S-04 recorded as unusable: ${bad.id})\n`);
    return exit(EXIT_USAGE);
  }

  if (!io.stdin.isTTY || typeof io.stdin.setRawMode !== 'function') {
    io.stdout.write(`${noTtyMessage(platform)}\n`);
    return exit(EXIT_USAGE);
  }

  const asterisk = env.SNOWARCH_MASK === 'asterisk';
  const wasRaw = io.stdin.isRaw === true;
  io.stdout.write(label(text, io));
  io.stdin.setRawMode(true);
  io.stdin.resume();

  let buffer = '';
  try {
    return await new Promise<string>((resolve, reject) => {
      const done = (value: string) => { io.stdin.off('data', onData); io.stdin.off('error', onError); resolve(value); };

      /**
       * A stdin that dies mid-prompt.
       *
       * Without this listener the promise never settles and the `finally` below never runs — the
       * terminal stays in raw mode and the user's shell silently stops echoing what they type.
       * The error is passed through as it came: it describes a stream, and the buffer is not in
       * it. (Found by the test that emits `error` on the fake stream.)
       */
      const onError = (e: Error) => {
        io.stdin.off('data', onData);
        io.stdin.off('error', onError);
        reject(e);
      };
      io.stdin.on('error', onError);

      const onData = (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
        for (let i = 0; i < bytes.length; i += 1) {
          const byte = bytes[i];

          // An arrow key is `\x1b[A`; a function key is longer. Skipping to the end of the
          // sequence keeps its letters out of the password — without this, pressing Left adds
          // `[D` to the value and the user cannot see that it happened.
          if (byte === 0x1b) {
            i += 1;
            if (bytes[i] === 0x5b || bytes[i] === 0x4f) {          // '[' or 'O'
              i += 1;
              while (i < bytes.length && bytes[i] >= 0x30 && bytes[i] <= 0x3f) i += 1;
            }
            continue;
          }

          if (byte === 0x0d || byte === 0x0a) {                    // Enter / a pasted newline
            io.stdout.write('\n');
            done(buffer);
            return;
          }
          if (byte === 0x7f || byte === 0x08) {                    // both spellings of Backspace
            if (buffer.length > 0) {
              buffer = buffer.slice(0, -1);
              if (asterisk) io.stdout.write('\b \b');
            }
            continue;
          }
          if (byte === 0x15) {                                     // Ctrl-U
            if (asterisk) io.stdout.write('\b \b'.repeat(buffer.length));
            buffer = '';
            continue;
          }
          if (byte === 0x03 || (byte === 0x04 && buffer.length === 0)) {   // Ctrl-C, Ctrl-D empty
            io.stdout.write(`\n${CANCELLED}\n`);
            io.stdin.off('data', onData);
            restore();
            // The terminal is restored BEFORE the exit, because `process.exit` runs no `finally`.
            // Nothing follows: a real `exit` never returns, and an injected one leaves this
            // promise pending on purpose — "the process was supposed to end here" is the honest
            // state, and rejecting instead would raise an unhandled rejection in the caller that
            // is about to be told the exit code.
            exit(EXIT_INTERRUPTED);
            return;
          }
          if (byte === 0x04) continue;                             // Ctrl-D with a buffer: ignore
          if (byte < 0x20) continue;                               // any other control byte

          buffer += String.fromCharCode(byte);
          if (asterisk) io.stdout.write('*');
        }
      };

      io.stdin.on('data', onData);
    });
  } finally {
    // EVERY path, including a throw from the promise body. A terminal left in raw mode stops
    // echoing what the user types into their own shell, and they have no way to know why.
    restore();
  }

  function restore(): void {
    try {
      if (typeof io.stdin.setRawMode === 'function') io.stdin.setRawMode(wasRaw);
      io.stdin.pause();
    } catch { /* a stream that cannot be restored is already gone */ }
  }
}

/** What a prompt says when stdin ran out before it was answered. */
export const INPUT_ENDED = 'no more input — nothing answered:';

/**
 * A visible line, with an optional default and a validator that repeats the prompt.
 *
 * Read through ONE interface's async iterator rather than repeated `rl.question()` calls.
 * `readline` closes the moment its input stream ends, so on a PIPED stdin — which is every
 * non-interactive caller, and every test — the second `question()` rejects with the internal
 * `readline was closed`, even when the answer it wanted was sitting in the buffer. A validator
 * loop is exactly the case that asks twice, so that failure would have shown up the first time
 * anybody typed something invalid into a piped run.
 *
 * When the input really has ended, the error names the prompt that went unanswered instead.
 */
export async function promptLine(text: string, {
  io = defaultIo(),
  fallback,
  validate,
}: Partial<{ io: Io; fallback: string; validate: (value: string) => string | null }> = {}): Promise<string> {
  const rl = createInterface({ input: io.stdin, output: io.stdout, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  try {
    for (;;) {
      io.stdout.write(fallback === undefined ? label(text, io) : `${label(text, io)}[${fallback}] `);
      const next = await lines.next();
      if (next.done) throw new Error(`${INPUT_ENDED} ${text}`);
      const answer = String(next.value).trim();
      const value = answer === '' && fallback !== undefined ? fallback : answer;
      const problem = validate ? validate(value) : null;
      if (problem === null) return value;
      io.stdout.write(`${problem}\n`);
    }
  } finally {
    rl.close();
  }
}

export interface Choice { key: string; text: string }

/** A numbered list. Enter takes the default; anything else repeats rather than guessing. */
export async function promptChoice(text: string, choices: readonly Choice[], {
  io = defaultIo(),
  fallback,
}: Partial<{ io: Io; fallback: string }> = {}): Promise<string> {
  if (choices.length === 0) throw new Error('promptChoice needs at least one choice');
  const defaultKey = fallback ?? choices[0].key;
  const defaultIndex = choices.findIndex((c) => c.key === defaultKey) + 1;
  io.stdout.write(`${text}\n`);
  for (const [i, choice] of choices.entries()) {
    io.stdout.write(`  ${i + 1}  ${choice.key}  ${choice.text}\n`);
  }
  return promptLine('choice', {
    io,
    fallback: String(defaultIndex),
    validate: (value) => {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= choices.length
        ? null
        : `enter a number between 1 and ${choices.length}`;
    },
  }).then((value) => choices[Number(value) - 1].key);
}

/**
 * Everything on stdin, as lines — `--password-stdin`.
 *
 * Line 1 is the password; line 2 is the client secret, and only `--auth oauth_ropc` reads it.
 * A trailing `\r` is stripped PER LINE, because a Windows pipe delivers CRLF and a password
 * with an invisible carriage return at the end fails authentication with no way to see why.
 */
export async function readSecretFromStdin({
  io = defaultIo(),
}: Partial<{ io: Io }> = {}): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of io.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  // A trailing newline is the shell's, not the user's: `printf 'p\n'` means the password `p`.
  return text.replace(/\r?\n$/, '').split('\n').map((line) => line.replace(/\r$/, ''));
}

/**
 * The argv scan, as a function so `cli/index.ts` and its test share one definition.
 *
 * `--password=x` and `--password x` both match, and so does `--client-secret` and `--secret`.
 * The VALUE is never echoed, quoted or included in the return: this function answers "was a
 * secret flag present", and the caller prints a fixed sentence.
 */
export function argvCarriesSecret(argv: readonly string[]): boolean {
  const FLAGS = ['--password', '--client-secret', '--secret'];
  return argv.some((arg) => FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
}
