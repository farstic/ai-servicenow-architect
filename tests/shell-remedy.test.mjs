/**
 * ARC-08-C26 — `shellRemedy`, the third and last site of the single-separator assumption.
 *
 * `maskPath` and `maskPathForShell` learned both spellings in ARC-08-C23, after the Windows cell
 * caught the second one. This branch still compared `norm + sep`, so on Windows a forward-slash
 * target under the checkout — which `git rev-parse --show-toplevel` produces, and a HOME set from
 * a bash shell carries — missed the checkout-relative form and fell through to `maskPathForShell`.
 *
 * NO LEAK: that masker is correct now, so the cost was a remedy naming an absolute `~/…` path
 * where a short relative one was available. A worse remedy rather than a wrong one — which is why
 * it was a queue note and not a fix-up, and why it is fixed with the other two rather than left as
 * the one site that still has the assumption.
 *
 * `shellRemedy` had no test at all before this file: it is reached only from `store/index.ts`, and
 * a function nothing asserts is a function whose defect waits for a person to read its output.
 *
 * Driven with an INJECTED separator, the way `underPrefix` is in `tests/cosmetics.test.mjs` and
 * `homeValues` is in `tests/doctor/json-boundary.test.mjs` — so every platform exercises the
 * Windows behaviour. A defect only one of three platforms can see is a defect that waits for that
 * platform.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shellRemedy } from '../packages/snowarch/dist/store/paths.js';

const CHECKOUT = 'C:\\Users\\someone\\checkout';

/** `CLAUDE_PROJECT_DIR` is read from the environment, so it is set and restored around each case. */
function withCheckout(value, fn) {
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = value;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
  }
}

test('a target under the checkout is relative, in either spelling', () => {
  withCheckout(CHECKOUT, () => {
    // Both spellings produce the SAME remedy — that is the property, not the string.
    const backslash = shellRemedy('cat', `${CHECKOUT}\\.local\\instances.json`, { sepChar: '\\' });
    const forward = shellRemedy('cat', 'C:/Users/someone/checkout/.local/instances.json',
      { sepChar: '\\' });

    assert.equal(backslash, 'Run, from the checkout: cat .local/instances.json');
    assert.equal(forward, backslash,
      'the forward-slash spelling fell through to the absolute form');

    // Rendered with `/` whichever way it arrived: this is a path for a SHELL, and every shell the
    // remedies target takes forward slashes — PowerShell and cmd included.
    assert.equal(backslash.includes('\\'), false, 'a backslash reached a pasteable remedy');
  });
});

test('the checkout itself is `.`, in either spelling and with or without a trailing separator', () => {
  withCheckout(CHECKOUT, () => {
    assert.equal(shellRemedy('cat', CHECKOUT, { sepChar: '\\' }),
      'Run, from the checkout: cat .');
    assert.equal(shellRemedy('cat', 'C:/Users/someone/checkout', { sepChar: '\\' }),
      'Run, from the checkout: cat .');
  });
  withCheckout(`${CHECKOUT}\\`, () => {
    assert.equal(shellRemedy('cat', CHECKOUT, { sepChar: '\\' }),
      'Run, from the checkout: cat .', 'a trailing separator made it a different checkout');
  });
});

test('a target outside the checkout keeps the path the user named', () => {
  withCheckout(CHECKOUT, () => {
    // SNOW_STORE points where the user chose; rewriting it would make the remedy point somewhere
    // they did not name. `maskPathForShell` gets the separator too, so its home match is not the
    // one left behind.
    assert.equal(shellRemedy('cat', 'D:/elsewhere/instances.json', { sepChar: '\\' }),
      'Run: cat D:/elsewhere/instances.json');
    // A neighbour whose name merely starts with the checkout's is not inside it.
    assert.equal(shellRemedy('cat', `${CHECKOUT}-backup\\x.json`, { sepChar: '\\' }),
      'Run: cat C:\\Users\\someone\\checkout-backup\\x.json');
  });
});

test('POSIX is unchanged: a backslash is a filename character, not a separator', () => {
  withCheckout('/home/a/checkout', () => {
    assert.equal(shellRemedy('cat', '/home/a/checkout/.local/instances.json', { sepChar: '/' }),
      'Run, from the checkout: cat .local/instances.json');
    // `/home/a/checkout\x` is a FILE called `checkout\x` — not something under the checkout.
    assert.equal(shellRemedy('cat', '/home/a/checkout\\x.json', { sepChar: '/' }).startsWith('Run: '),
      true, 'a POSIX filename containing a backslash was treated as a path under the checkout');
  });
});

test('with no checkout set, the remedy is the masked absolute path', () => {
  withCheckout(undefined, () => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (home.length < 4) return;
    const remedy = shellRemedy('cat', `${home}/x/instances.json`);
    assert.match(remedy, /^Run: cat ~[\\/]/);
    assert.equal(remedy.includes(home), false, 'the home directory survived into the remedy');
  });
});
