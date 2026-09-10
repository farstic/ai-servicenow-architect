/**
 * ARC-07-S04 — a terminal that answers from a script.
 *
 * The review screen is a CONVERSATION: what it prints depends on what was typed, and what may be
 * typed next depends on what it printed. A test that could only assert the final value would pass
 * for a screen that asked the wrong question and got lucky — so this records every prompt and
 * every line written, in order, and hands back the answers one at a time.
 *
 * Running out of answers is deliberately `null` rather than a hang: end-of-input is a real state
 * (a closed pipe, a Ctrl-D) and the screen has to treat it as "nothing was chosen".
 */
export interface ScriptedTty {
  /** The answers still to be given, in order. */
  readonly remaining: string[];
  /** Every prompt the code asked, in order. */
  readonly prompts: string[];
  /** Everything written to the screen, joined. */
  readonly written: string;
  /** Each `write` call separately, for assertions about what was shown when. */
  readonly writes: string[];
  ask: (prompt: string) => Promise<string | null>;
  write: (text: string) => void;
}

export function scriptedTty(answers: readonly string[]): ScriptedTty {
  const remaining = [...answers];
  const prompts: string[] = [];
  const writes: string[] = [];
  return {
    remaining,
    prompts,
    writes,
    get written() { return writes.join(''); },
    async ask(prompt: string) {
      prompts.push(prompt);
      return remaining.length > 0 ? (remaining.shift() as string) : null;
    },
    write(text: string) { writes.push(text); },
  };
}
