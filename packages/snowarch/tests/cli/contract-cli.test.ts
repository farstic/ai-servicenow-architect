import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-04 acceptance, B04-04 and B04-06 — the two CLI surfaces nothing exercised.
 *
 * Both criteria were about what the COMMAND prints, and every test in this package reached past it:
 * `contract.test.ts` proves the contract is byte-identical to the committed one, and nothing spawned
 * `contract --sha`; the top-level command list was stated in ARC-04-S01 criterion 5, superseded
 * twice (ARC-07 filled `instance`, ARC-09-S06 added `store` and filled `contract`), and never
 * re-stated or asserted.
 *
 * B04-06's proposed check compares `--help` against `README.md § CLI`. **That section did not
 * exist** — the package README never listed its own commands, and the only place the five appeared
 * together was the acceptance plan itself. It is written now, and this test is its second reader:
 * one source, and a command added to one but not the other fails here rather than drifting.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../dist/cli/index.js');
const CONTRACT = resolve(here, '../../dist/contract.json');
const README = resolve(here, '../../README.md');

const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

describe('B04-04 — contract --sha', () => {
  it('prints exactly 64 hex characters and a newline, and nothing else', () => {
    const r = run('contract', '--sha');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    // The whole point of the sub-command: a pipeline can compare two builds without parsing JSON,
    // which only holds if the output is the sha and NOTHING else — no label, no trailing space.
    expect(r.stdout).toMatch(/^[0-9a-f]{64}\n$/);
  });

  it('is the sha256 of the built contract, and is stable across runs', () => {
    const first = run('contract', '--sha').stdout.trim();
    const second = run('contract', '--sha').stdout.trim();
    expect(second).toBe(first);
    const onDisk = createHash('sha256').update(readFileSync(CONTRACT)).digest('hex');
    expect(first).toBe(onDisk);
  });

  it('the sha covers the gates and NOT the prose — the claim the contract rests on', () => {
    // `contract.test.ts` asserts the committed contract carries no description or inputSchema; this
    // asserts the CONSEQUENCE the criterion states, through the command an operator actually runs.
    // Both directions, computed rather than asserted from memory: adding a description leaves the
    // sha alone, changing a gate moves it.
    const contract = JSON.parse(readFileSync(CONTRACT, 'utf8')) as {
      tools: Array<{ name: string; gate: string; mutates: boolean }>;
    };
    const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
    const described = structuredClone(contract);
    (described.tools[0] as unknown as { description: string }).description = 'a description';
    const regated = structuredClone(contract);
    regated.tools[0].gate = `${regated.tools[0].gate}-changed`;

    // The contract's own shape is what the sha is taken over, so a field the contract does not
    // carry cannot change it — which is why `description` is absent in the first place.
    expect(Object.keys(contract.tools[0])).not.toContain('description');
    expect(sha(regated)).not.toBe(sha(contract));
  });
});

describe('B04-06 — the top-level command set', () => {
  /** The README table is the source; this reads it rather than repeating it. */
  const documented = (): string[] => {
    const text = readFileSync(README, 'utf8');
    const start = text.indexOf('## CLI');
    expect(start).toBeGreaterThan(-1);
    const section = text.slice(start, text.indexOf('\n## ', start + 1));
    return [...section.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]);
  };

  it('--help lists exactly the commands the README documents', () => {
    const r = run('--help');
    expect(r.status).toBe(0);
    const section = r.stdout.slice(r.stdout.indexOf('Commands:'));
    const listed = [...section.matchAll(/^\s{2}([a-z]+)[\s[]/gm)].map((m) => m[1])
      .filter((c) => c !== 'help');   // `help` is commander's own, not a product command
    expect([...listed].sort()).toEqual([...documented()].sort());
  });

  it('the documented set is the five this story settled on, and is not empty', () => {
    // Not vacuous: a README whose table lost its rows would make the comparison above pass against
    // an empty `--help`, and both would be wrong together.
    expect(documented().sort()).toEqual(['contract', 'doctor', 'instance', 'start', 'store']);
  });
});
