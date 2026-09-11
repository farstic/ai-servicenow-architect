/**
 * THE hand-off command, rendered from the one definition of it.
 *
 * `docs/snippets/terminal-handoff.md` carries the template line; this reads those bytes and
 * substitutes what the `/snowarch setup-instance` skill collected. A second copy of the command
 * shape — in the skill body, in the install page, in a test — is how a user ends up typing a
 * command that no longer matches the CLI's grammar, which is exactly the failure the fragment
 * exists to prevent. So there is no second copy: the skill quotes the fragment, and anything that
 * needs a CONCRETE command calls this.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FRAGMENT = 'docs/snippets/terminal-handoff.md';

/** The POSIX and Windows template lines, exactly as the fragment writes them. */
export function templates(text = readFileSync(join(root, FRAGMENT), 'utf8')) {
  const posix = /^\s*2\. Run:\s+(\.\/snowarch instance add .+)$/m.exec(text);
  const windows = /\(Windows PowerShell\/cmd:\s+(snowarch\.cmd instance add .+?)\)$/m.exec(text);
  if (!posix || !windows) throw new Error(`${FRAGMENT}: no command template found`);
  return { posix: posix[1].trim(), windows: windows[1].trim() };
}

/**
 * One concrete command. `shell` picks the spelling a user can actually run: `./snowarch` is not a
 * command in PowerShell or cmd, and a line somebody cannot run is a line that ends the setup.
 */
export function handoffCommand({ label, url, env, auth, preset, makeDefault = true, shell = 'bash' },
  text = undefined) {
  const template = templates(text)[shell === 'powershell' || shell === 'cmd' ? 'windows' : 'posix'];
  const filled = template
    .replace('<label>', label)
    .replace('<url>', url)
    .replace('<env>', env)
    .replace('<auth>', auth)
    .replace('<preset>', preset);
  return makeDefault ? filled : filled.replace(/ --default$/, '');
}
