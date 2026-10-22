// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C220 — every repository the licence fixtures make has git's automatic maintenance and automatic gc off, as
 * every repository the engine's tests make has since ARC-09-C219. On the runners' git 2.55 a commit starts maintenance
 * DETACHED, and it can still be writing in a repository while the suite's `afterEach` removes it.
 *
 * The guard in `tests/fixture-git.test.mjs` holds the calls. This holds what they leave in each repository: the bare
 * list repository, its work repository, and releaseCheckout's. The values are read from the repository's own config,
 * so a machine-wide setting cannot pass for one.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_GIT_CONFIG } from '../../../../tools/snowarch/tests/helpers/fixture-git.mjs';
import { listRepo, pair, releaseCheckout, removeFixtureDirs } from './fixtures.js';

afterEach(removeFixtureDirs);

/** One key of a repository's own config, or '(unset)'. */
function localConfig(dir: string, key: string): string {
  const args = ['-C', dir, 'config', '--local', '--get', key];
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return '(unset)';
  }
}

describe('ARC-09-C220 — the licence fixtures\' repositories have automatic maintenance and automatic gc off', () => {
  it('the settings are the two ARC-09-C219 measured', () => {
    const settings = FIXTURE_GIT_CONFIG.map(([key, value]) => `${key}=${value}`);
    expect(settings).toEqual(['maintenance.auto=false', 'gc.auto=0']);
  });

  it('listRepo: the bare list repository and its work repository', () => {
    const bare = fileURLToPath(listRepo({ 'list.json': '{}\n' }));
    for (const dir of [bare, join(dirname(bare), 'work')]) {
      for (const [key, value] of FIXTURE_GIT_CONFIG) expect(localConfig(dir, key), `${key} in ${dir}`).toBe(value);
    }
  });

  it('releaseCheckout: the tagged release repository', () => {
    const root = releaseCheckout({ key: pair() });
    for (const [key, value] of FIXTURE_GIT_CONFIG) expect(localConfig(root, key), `${key} in ${root}`).toBe(value);
  });
});
