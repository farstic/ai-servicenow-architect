import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handoffCommand, templates, FRAGMENT } from '../scripts/handoff-command.mjs';

/**
 * ARC-07-S09 — the command the skill prints is the command a user would type.
 *
 * That claim is the whole point of the hand-off: the credential is typed into a terminal, so the
 * line the skill hands over has to be one the CLI actually accepts. There is ONE definition of its
 * shape — the template in `docs/snippets/terminal-handoff.md` — and this asserts that rendering it
 * with ARC-07-S09's own acceptance answers produces exactly the line the story wrote.
 *
 * The story's line is quoted here as a literal on purpose: it is the ACCEPTANCE criterion, and a
 * test that derived it from the same template it is checking would agree with itself about
 * anything.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AC1 = './snowarch instance add pdi --url https://dev12345.service-now.com --env pdi --auth basic --preset full --default';

test('AC 1 — PDI / Basic / full renders the story\'s line, byte for byte', () => {
  assert.equal(handoffCommand({
    label: 'pdi', url: 'https://dev12345.service-now.com', env: 'pdi', auth: 'basic', preset: 'full',
  }), AC1);
});

test('the Windows spelling is the same command with the runnable name', () => {
  const windows = handoffCommand({
    label: 'pdi', url: 'https://dev12345.service-now.com', env: 'pdi', auth: 'basic', preset: 'full',
    shell: 'powershell',
  });
  // `./snowarch` is not a command in PowerShell or cmd; everything after the name is identical.
  assert.equal(windows, AC1.replace('./snowarch', 'snowarch.cmd'));
  assert.equal(handoffCommand({ label: 'pdi', url: 'u', env: 'pdi', auth: 'basic', preset: 'full', shell: 'cmd' }),
    handoffCommand({ label: 'pdi', url: 'u', env: 'pdi', auth: 'basic', preset: 'full', shell: 'powershell' }));
});

test('`--default` is the only optional part, and it comes off cleanly', () => {
  const second = handoffCommand({
    label: 'uat', url: 'https://acme.service-now.com', env: 'test', auth: 'oauth_ropc',
    preset: 'read-only', makeDefault: false,
  });
  assert.equal(second,
    './snowarch instance add uat --url https://acme.service-now.com --env test --auth oauth_ropc --preset read-only');
  assert.doesNotMatch(second, /--default/);
});

test('the template is the fragment\'s, and every placeholder is filled', () => {
  const { posix, windows } = templates();
  for (const template of [posix, windows]) {
    for (const placeholder of ['<label>', '<url>', '<env>', '<auth>', '<preset>']) {
      assert.ok(template.includes(placeholder), `${FRAGMENT} lost ${placeholder}`);
    }
  }
  // Nothing unfilled survives into a rendered command — a `<placeholder>` reaching a user is a
  // line they paste and watch fail.
  assert.doesNotMatch(AC1, /[<>]/);
  assert.doesNotMatch(handoffCommand({ label: 'a', url: 'b', env: 'c', auth: 'd', preset: 'e' }), /[<>]/);
});

test('the skill body and the install page carry the SAME template, not a copy of the command', () => {
  const skill = readFileSync(join(root, '.claude/skills/snowarch/SKILL.md'), 'utf8');
  const install = readFileSync(join(root, 'docs/INSTALL.md'), 'utf8');
  const { posix } = templates();
  for (const [name, text] of [['the skill', skill], ['the install page', install]]) {
    assert.ok(text.includes(posix), `${name} does not carry the template line`);
    // And neither of them spells a CONCRETE command: a filled-in example beside a template is the
    // copy that goes stale, and it is the one a reader would paste.
    assert.ok(!text.includes(AC1), `${name} spells a concrete command instead of the template`);
  }
});
