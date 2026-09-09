// ARC-06-S02 — the exit codes, in one place, so a story cannot invent a sixth.
//
// A caller keys on these: bootstrap on PREREQ, CI on FAIL, a human on USAGE. Numbers scattered
// through sub-commands become numbers that disagree, and the disagreement only shows up in someone
// else's script months later.
export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;
export const EXIT_PREREQ = 3;
export const EXIT_INTERRUPTED = 130;   // 128 + SIGINT, the shell convention

/**
 * The `docs` family's own codes (3 missing · 4 dirty · 5 git · 6 upstream) live in
 * `lib/docs/sync.mjs` and are NOT redefined here. They are that family's vocabulary, documented in
 * `docs/ARCHITECTURE.md`'s one exit table; re-exporting them would create a second definition of a
 * number whose meaning is already settled. Note that 3 means "corpus missing" there and
 * "prerequisite missing" here — both are "the thing you need is not present", which is why the
 * overlap is tolerable, and the table says so rather than leaving a reader to notice.
 */
export const EXIT = Object.freeze({
  ok: EXIT_OK, fail: EXIT_FAIL, usage: EXIT_USAGE, prereq: EXIT_PREREQ, interrupted: EXIT_INTERRUPTED,
});
