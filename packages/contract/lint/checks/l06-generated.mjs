/**
 * L06 — a generated file that is not what its generator would produce.
 *
 * The failure this catches is specific and has happened: a maintainer accepts a contract change
 * with `pin.mjs`, the sha moves, and every generated file's header — and the tables rendered from
 * the contract — are now stale. Nothing else notices, because each generated file is still valid
 * markdown and the tests that read the contract read the contract, not the documents about it.
 *
 * Every generator's own `--check` is the judge, from the one list in `scripts/lib/generators.mjs`.
 * Re-deriving "is it current" here would be a second opinion, and the one that is wrong when they
 * disagree is always the copy.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { GENERATORS } from '../../../../scripts/lib/generators.mjs';

export const id = 'L06';
export const title = 'every generated file matches what its generator produces';

export function run(ctx) {
  const findings = [];
  const selfRoot = ctx.root;

  for (const gen of GENERATORS) {
    if (!gen.supportsRoot && !ctx.isSelfRoot) {
      // Said out loud rather than passed over: these two resolve from their own location, so
      // against a fixture tree they would check the real repository and report a reassuring pass
      // about a tree nobody asked about.
      ctx.skipNotes?.push(`L06: ${gen.id} takes no --root, so it is not checked against a fixture tree`);
      continue;
    }
    const args = [join(selfRoot, gen.script), '--check', ...(gen.supportsRoot ? ['--root', selfRoot] : [])];
    try {
      execFileSync(process.execPath, args, { cwd: selfRoot, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      // Exit 2 is the generators' "cannot run" — a missing input, not a stale output. Reporting it
      // as a difference would tell a reader to regenerate a file whose source is not there.
      if (e.status === 2) {
        ctx.skipNotes?.push(`L06: ${gen.id} could not run here — ${out.trim().split('\n')[0]}`);
        continue;
      }
      // The generator's own diff already names the target and the line. Carry the first changed
      // line through rather than a count: "README.md differs" sends a reader to regenerate blindly,
      // and the line tells them what moved and therefore whether they expected it.
      const first = out.split('\n').find((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
      const target = out.split('\n').find((l) => l.startsWith('--- a/'))?.slice(6)
        ?? gen.targets[0];
      findings.push({
        file: target,
        line: 1,
        message: `differs from generator output (${gen.id})`
          + `${first ? ` — first change: ${first.trim().slice(0, 100)}` : ''}`
          + ` — run node ${gen.script}`,
      });
    }
  }
  return findings;
}
