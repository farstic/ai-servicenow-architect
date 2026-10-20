// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C208 — the reader that finds product text the redactor would print as a first.last name.
 *
 * Every line this CLI writes goes through `redact` (log.mjs), and every doctor detail through the runner's
 * `redactResult`. Rule (c) masks a bare `word.word` as a username unless its second word is a known extension or
 * domain, so a key in our own sentence, `docs.pin is not a 40-character sha`, was printed as `d***.p*** is not …`.
 *
 * IT READS THE STATIC TEXT OF EVERY PROSE LITERAL, one containing whitespace, not only the arguments of a log call.
 * A sentence is often built in one place and printed in another (a check's detail, a remedy table, a thrown
 * message), so a rule keyed on call sites would miss exactly the lines that travel. A template is read as its static
 * parts, the text between its `${…}`, so the code inside an expression is never mistaken for prose. It PARSES, with
 * the `typescript` already pinned for `spawn-scan.mjs`, because a regex literal or an apostrophe inside an expression
 * throws a hand tokenizer off.
 *
 * A single-token literal is not prose: `core.longpaths=true` is a git argument nobody reads, and a key such as
 * `'docs.pin'` is spliced into a sentence elsewhere, which this reader cannot see. The doctor's case for that is
 * `tests/doctor/printed-keys.test.mjs`, which runs the checks and reads what they print.
 *
 * Exported as one function so the planted controls and the repository are read by the same code.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { redact } from '../../lib/redact.mjs';

/** `{ masked, files, parts }`: masked as `path:line  "text"  →  "printed"`, with the counts actually read. */
export async function scanPrintedText({ roots = [], read = readFileSync, sources = null } = {}) {
  const ts = (await import('typescript')).default;

  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'tests' || e.name === 'fixtures') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.mjs$/.test(e.name)) files.push(p);
    }
  };
  for (const root of roots) walk(root);

  // `sources`, `{ name: text }`, is how a control feeds planted code through the same reader.
  const inputs = sources ? Object.entries(sources) : files.map((f) => [f, String(read(f, 'utf8'))]);
  const masked = [];
  let parts = 0;
  for (const [name, text] of inputs) {
    const src = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      const texts = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? [node.text]
        : ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
          : [];
      for (const t of texts) {
        parts += 1;
        if (!/\s/.test(t)) continue;
        const printed = redact(t);
        if (printed !== t) {
          const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
          masked.push(`${name}:${line}  ${JSON.stringify(t)}  →  ${JSON.stringify(printed)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return { masked, files: inputs.length, parts };
}
