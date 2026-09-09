import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The `.editorconfig` rules nothing was enforcing.
 *
 * The file declares `end_of_line = lf` and `insert_final_newline = true` for every path, and until
 * now no check read it: a generator dropped a page's terminating newline and all nineteen CI cells
 * stayed green on a malformed file. A declaration nobody verifies is a preference, not a rule.
 *
 * Scope is deliberately narrower than `[*]`. Three kinds of file are excluded because a fix would
 * be a lie rather than a repair:
 *
 *   vendor/**                    not ours; it is what upstream published
 *   packages/snowarch/dist/**    build output; the fix belongs to the build, not to the artefact
 *   ** /fixtures/**              several fixtures are deliberately malformed — that is their subject
 *   scripts/legacy/**            the v2 engine exactly as imported (ARC-01-S02)
 *   docs/spikes/**               records of what was run and found, kept as written
 *
 * `.ps1` and `.cmd` are outside the extension list on purpose: `.editorconfig` gives them CRLF, and
 * a check that assumed LF everywhere would be wrong about the two files the config is explicit on.
 */
export const EXTENSIONS = ['.md', '.mjs', '.ts', '.json', '.yml', '.yaml'];

export const EXCLUDED = [
  'vendor/',
  'packages/snowarch/dist/',
  'scripts/legacy/',
  'docs/spikes/',
];

const isExcluded = (rel) => EXCLUDED.some((p) => rel.startsWith(p)) || rel.includes('/fixtures/');

/** Tracked files in scope, POSIX-separated, sorted — `git ls-files` already reports them that way. */
export function filesInScope(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\0')
    .filter(Boolean)
    .filter((rel) => EXTENSIONS.some((e) => rel.endsWith(e)))
    .filter((rel) => !isExcluded(rel));
}

/**
 * `insert_final_newline` and `end_of_line = lf`, as findings.
 *
 * "Exactly one" rather than "at least one": trailing blank lines at the end of a file are the other
 * half of the same rule, and a file that grows one every time it is regenerated is the failure mode
 * this catches early.
 */
export function lintLineEndings(root, files) {
  const findings = [];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (text.length === 0) continue;                        // an empty file has nothing to terminate
    if (text.includes('\r')) findings.push(`${rel}: CR present (end_of_line = lf)`);
    if (!text.endsWith('\n')) findings.push(`${rel}: no final newline (insert_final_newline = true)`);
    else if (text.endsWith('\n\n')) findings.push(`${rel}: blank line(s) at end of file`);
  }
  return findings;
}

/**
 * A word split across a wrap boundary in markdown prose.
 *
 * Not an `.editorconfig` rule — a rule about what re-wrapping does to a document. `non-\nproduction`
 * renders as "non- production" once markdown joins the lines, and it survives review because the
 * source looks like an ordinary wrap. Fenced blocks and tables are skipped: a hyphen at the end of a
 * line inside a code block is code, and a table row is not prose.
 */
export function lintHyphenSplits(root, files) {
  const findings = [];
  for (const rel of files.filter((f) => f.endsWith('.md'))) {
    const lines = readFileSync(join(root, rel), 'utf8').split('\n');
    let fenced = false;
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('```')) { fenced = !fenced; return; }
      if (fenced || line.trimStart().startsWith('|')) return;
      const next = lines[i + 1] ?? '';
      if (/\w-$/.test(line) && /^\s*\w/.test(next)) {
        findings.push(`${rel}:${i + 1}: word split across the wrap — "${line.trim().split(' ').pop()}${next.trim().split(' ')[0]}"`);
      }
    });
  }
  return findings;
}
