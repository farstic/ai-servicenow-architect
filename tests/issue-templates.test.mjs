/**
 * ARC-10-S10 — the way a stranger reports a problem, and the claim that the product never reports
 * anything by itself.
 *
 * TWO HALVES, and they are not the same kind of check.
 *
 * The FORMS half asserts the issue forms parse, ask for the doctor's JSON, and never ask for a
 * credential. It parses YAML with a deliberately small reader (`parseForm` below) that REFUSES
 * every construct it does not understand — anchors, flow collections, multi-document files, tabs.
 * A parser that guesses is worse than none here: it would read a broken form as a valid one and
 * report a pass on a template GitHub will not render. Refusing is the feature.
 *
 * The NO-TELEMETRY half is the load-bearing one, because acceptance criterion 2 is a claim about
 * the whole tree — and this repository's own rule (CONTRIBUTING, *when a change claims a property
 * of the WHOLE TREE*) is that such a claim carries the search that proves it. Three rules, each
 * measured against the tree on 2026-09-12 rather than assumed:
 *
 *   1. VOCABULARY — no telemetry vendor or verb anywhere in product code. Measured: zero hits.
 *   2. CALL SITES — exactly three modules open a socket: `probe-net.mjs`, `probe-auth.mjs`,
 *      `servicenow/http.ts`. The precise pattern below finds those three whether or not comments
 *      are stripped; the reason the rule strips them anyway is the scan a person reaches for FIRST.
 *      A bare-word scan for `undici|node:net|fetch(` returns SEVEN files raw and three stripped —
 *      `reachability.ts`, `net-errors.ts`, `lib/docs/sync.mjs` and `net-sentences.mjs` all discuss
 *      network in prose. Four false members is the difference between a list that is true and a
 *      list nobody trusts, and the control below asserts exactly that gap.
 *   3. URL HOSTS — every URL literal in product code is a host on the allow-list, and the list
 *      distinguishes a host the product CONTACTS from one it merely NAMES. `code.claude.com`
 *      appears twice as a remedy string and is never fetched; rule 2 is what proves it cannot be.
 *
 * The word `analytics` is NOT an offence and is not on any list here. All twenty of its hits are
 * ServiceNow's own vocabulary in the server's tool surface (Performance Analytics, and the mobile
 * app-usage analytics tool), zero in the engine or the hook — a ServiceNow API the product READS on
 * the user's instance is the opposite of a service the product sends to. The rule that carries that
 * distinction is the boundary, asserted below: the engine and the hook may not contain the word.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');
/** Report paths with forward slashes, on every platform (CONTRIBUTING). */
const posix = (p) => p.split(sep).join('/');

// ─── A YAML reader that refuses what it does not understand ──────────────────────────────────

const REFUSED = [
  [/^\s*<</m, 'a merge key'],
  [/(^|\s)[*&][A-Za-z0-9_-]+/m, 'an anchor or alias'],
  [/^---\s*$[\s\S]*^---\s*$/m, 'more than one document'],
  [/^\t| \t/m, 'a tab'],
  [/:\s*[[{]/m, 'a flow collection'],
];

/**
 * The GitHub issue-form subset: scalars, block sequences, nested maps, `|` and `>-` blocks.
 * Throws on anything else — see the note at the top of this file.
 */
export function parseForm(text) {
  for (const [re, what] of REFUSED) {
    if (re.test(text.replace(/^\s*#.*$/gm, ''))) throw new Error(`refused: ${what}`);
  }
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  let i = 0;
  const indentOf = (l) => l.length - l.trimStart().length;
  const scalar = (raw) => {
    const v = raw.trim();
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?\d+$/.test(v)) return Number(v);
    const m = /^(['"])([\s\S]*)\1$/.exec(v);
    return m ? m[2] : v;
  };
  const skippable = (l) => l.trim() === '' || l.trimStart().startsWith('#');

  /** A block scalar (`|`, `>-`, `>`): every deeper-indented line, folded or not. */
  const block = (style, indent) => {
    const out = [];
    while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > indent)) {
      out.push(lines[i].slice(indent + 2));
      i += 1;
    }
    while (out.length && out.at(-1).trim() === '') out.pop();
    return style.startsWith('>') ? out.join(' ').replace(/\s+/g, ' ').trim() : out.join('\n');
  };

  const value = (rest, indent) => {
    if (/^[|>][-+]?$/.test(rest.trim())) { const s = rest.trim(); i += 1; return block(s, indent); }
    if (rest.trim() !== '') { i += 1; return scalar(rest); }
    i += 1;
    return node(indent);
  };

  const node = (parentIndent) => {
    while (i < lines.length && skippable(lines[i])) i += 1;
    if (i >= lines.length) return null;
    const indent = indentOf(lines[i]);
    if (indent <= parentIndent) return null;
    if (lines[i].trimStart().startsWith('- ')) {
      const out = [];
      while (i < lines.length) {
        if (skippable(lines[i])) { i += 1; continue; }
        if (indentOf(lines[i]) !== indent || !lines[i].trimStart().startsWith('- ')) break;
        const inline = lines[i].trimStart().slice(2);
        const m = /^([A-Za-z0-9_-]+):(.*)$/.exec(inline);
        if (m) {
          // `- key: value` — the item is a map whose first pair sits on the dash line.
          lines[i] = ' '.repeat(indent + 2) + inline;
          out.push(node(indent + 1));
        } else { i += 1; out.push(scalar(inline)); }
      }
      return out;
    }
    const map = {};
    while (i < lines.length) {
      if (skippable(lines[i])) { i += 1; continue; }
      if (indentOf(lines[i]) !== indent) break;
      const m = /^([A-Za-z0-9_.-]+|"[^"]+"):(.*)$/.exec(lines[i].trim());
      if (!m) throw new Error(`refused: unparsable line ${i + 1}: ${lines[i].trim().slice(0, 40)}`);
      map[m[1].replace(/^"|"$/g, '')] = value(m[2], indent);
    }
    return map;
  };
  const doc = node(-1);
  if (doc === null || typeof doc !== 'object') throw new Error('refused: not a mapping');
  return doc;
}

// ─── The forms ───────────────────────────────────────────────────────────────────────────────

const DIR = '.github/ISSUE_TEMPLATE';
const FORMS = () => readdirSync(join(root, DIR)).filter((f) => f.endsWith('.yml') && f !== 'config.yml').sort();

test('AC 1 — both forms parse, and the parser refuses what it cannot read', () => {
  assert.deepEqual(FORMS(), ['install-problem.yml', 'migration-problem.yml']);
  for (const f of FORMS()) {
    const form = parseForm(read(`${DIR}/${f}`));
    assert.ok(form.name && form.description, `${f}: no name/description`);
    assert.ok(Array.isArray(form.body) && form.body.length > 0, `${f}: no body`);
    for (const el of form.body) {
      assert.ok(el && typeof el.type === 'string', `${f}: an element with no type`);
      assert.ok(el.attributes && typeof el.attributes === 'object', `${f}: ${el.type} has no attributes`);
      if (el.type !== 'markdown') assert.ok(el.id, `${f}: a ${el.type} with no id`);
    }
  }

  // The refusals, each planted into a real form so the control cannot pass on a parse of nothing.
  const real = read(`${DIR}/install-problem.yml`);
  for (const [bad, why] of [
    ['name: Install problem', 'name: &a Install problem'],
    ['labels:\n  - install', 'labels: [install]'],
    ['title: "install: "', 'title: "install: "\n\tbad: tab'],
  ]) {
    assert.throws(() => parseForm(real.replace(bad, why)), /refused/, `not refused: ${why}`);
  }
  assert.doesNotThrow(() => parseForm(real), 'the real form is refused');
});

test('AC 1 — the doctor-JSON field is required, on both forms', () => {
  for (const f of FORMS()) {
    const form = parseForm(read(`${DIR}/${f}`));
    const field = form.body.find((e) => e.id === 'doctor-json');
    assert.ok(field, `${f}: no doctor-json field`);
    assert.equal(field.type, 'textarea');
    assert.equal(field.validations?.required, true, `${f}: the doctor JSON is optional`);
    assert.equal(field.attributes.render, 'json', `${f}: the paste is not fenced as JSON`);
    // It asks for `--json`, which is the masked form — not the text report, which is not.
    assert.match(field.attributes.label, /--json/, `${f}: the label does not name --json`);
    assert.match(field.attributes.description, /<label>[\s\S]*<host>/,
      `${f}: the note does not quote the masking the report actually does`);
  }
});

test('AC 1 — no field asks for a credential, a URL or an account name', () => {
  // The forms may NAME these words to tell somebody not to paste them; what is forbidden is a FIELD
  // that asks for one. So the scan is over labels, descriptions and placeholders of input fields,
  // and the checkbox that says "read what you pasted" is not an offence.
  const ASKS = /\b(password|token|secret|api[- ]key|credential|username|user name|account name|instance url|instance address)\b/i;
  const findings = [];
  for (const f of FORMS()) {
    for (const el of parseForm(read(`${DIR}/${f}`)).body) {
      if (el.type === 'markdown' || el.type === 'checkboxes') continue;
      for (const k of ['label', 'description', 'placeholder']) {
        const v = el.attributes?.[k];
        if (typeof v === 'string' && ASKS.test(v)) findings.push(`${f}: ${el.id}.${k}: ${v.slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(findings, [], `${findings.length} field(s) ask for something secret`);
  // Not vacuous: the pattern fires on a field that does ask.
  assert.equal(ASKS.test('Your instance URL and username'), true);
});

test('AC 1 — blank issues are off and every contact link points at a file that exists', () => {
  const cfg = parseForm(read(`${DIR}/config.yml`));
  assert.equal(cfg.blank_issues_enabled, false, 'a blank issue is still offered');
  assert.ok(cfg.contact_links?.length >= 1, 'no contact links');
  for (const link of cfg.contact_links) {
    assert.ok(link.name && link.about, 'a contact link with no name or description');
    const m = /^https:\/\/github\.com\/farstic\/ai-servicenow-architect\/blob\/[^/]+\/(.+)$/.exec(link.url);
    assert.ok(m, `not a link into this repository: ${link.url}`);
    assert.ok(existsSync(join(root, m[1])), `${m[1]} does not exist — the link would 404`);
  }
});

// ─── No telemetry: three rules, each measured ────────────────────────────────────────────────

/** Product code: the engine, the hook and the server's sources. Never tests or fixtures. */
function productFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = posix(join(dir, e.name));
      if (e.isDirectory()) {
        if (/(^|\/)(tests?|fixtures|node_modules|dist|spikes)$/.test(rel)) continue;
        walk(rel);
      } else if (/\.(mjs|ts|js)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(rel);
    }
  };
  walk('tools/snowarch');
  walk('packages/snowarch/src');
  return out.sort();
}

/** Every source scan strips comments (CONTRIBUTING) — see the note at the top for what it cost. */
export const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

export const TELEMETRY = /\btelemetry\b|phone.?home|posthog|sentry|segment\.io|mixpanel|amplitude|gtag/i;

test('AC 2 — no telemetry vocabulary anywhere in product code', () => {
  const files = productFiles();
  assert.ok(files.length > 100, `only ${files.length} product file(s) scanned — the walk is wrong`);
  const hits = [];
  for (const rel of files) {
    read(rel).split('\n').forEach((line, i) => {
      if (TELEMETRY.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} telemetry hit(s):\n  ${hits.join('\n  ')}`);
  assert.equal(TELEMETRY.test("import posthog from 'posthog-node'"), true, 'the pattern stopped firing');
});

/** The three modules that may open a socket, and why each is allowed to. */
export const NETWORK_MODULES = new Map([
  ['tools/snowarch/lib/probe-net.mjs', 'the reachability probe: the user’s instance, and github.com'],
  ['tools/snowarch/lib/probe-auth.mjs', 'the authentication probe: the user’s instance'],
  ['packages/snowarch/src/servicenow/http.ts', 'every ServiceNow call the server makes'],
]);

test('AC 2 — exactly three modules open a socket, and the list is complete in both directions', () => {
  const NET = /from ['"](?:node:)?(?:https?|net|tls|dgram)['"]|from ['"]undici['"]|\bfetch\s*\(|\bXMLHttpRequest\b/;
  const found = productFiles().filter((rel) => NET.test(stripComments(read(rel))));
  assert.deepEqual(found, [...NETWORK_MODULES.keys()].sort(),
    'the set of modules that can reach the network changed');

  // Both directions: each listed module really does contain network code, so the list cannot rot
  // into names of files that no longer have any.
  for (const rel of NETWORK_MODULES.keys()) {
    assert.ok(NET.test(stripComments(read(rel))), `${rel} is on the list but opens no socket`);
  }
  // Why the rule strips comments, measured rather than asserted: the scan a person reaches for
  // first is a bare word, and it over-reports by four files that only DISCUSS the network.
  const LOOSE = /node:(?:https?|net|tls|dgram)|undici|\bfetch\s*\(/;
  const looseRaw = productFiles().filter((rel) => LOOSE.test(read(rel)));
  const looseStripped = productFiles().filter((rel) => LOOSE.test(stripComments(read(rel))));
  assert.deepEqual(looseStripped, found, 'stripped, the loose scan agrees with the precise one');
  assert.deepEqual(looseRaw.filter((r) => !found.includes(r)).sort(), [
    'packages/snowarch/src/servicenow/net-errors.ts',
    'packages/snowarch/src/servicenow/reachability.ts',
    'tools/snowarch/lib/docs/sync.mjs',
    'tools/snowarch/lib/net-sentences.mjs',
  ], 'the prose-only files changed — re-measure before editing this list');
});

/** A host a URL literal may name, and whether the product ever CONTACTS it. */
export const HOSTS = new Map([
  ['github.com', 'contacted — the reachability probe and the bootstrap preflight'],
  ['code.claude.com', 'named only — the install page, in a remedy string'],
]);
/** Hosts that are examples in a comment, a doc-string or an error message's sample. */
const EXAMPLE = /^(?:[a-z0-9-]*\.)?(?:service-now\.com|example\.com|example)$|^(?:acme|proxy|user|x)$/;

test('AC 2 — every URL literal in product code is an allow-listed or example host', () => {
  const findings = [];
  const hosts = new Set();
  for (const rel of productFiles()) {
    read(rel).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g)) {
        hosts.add(m[1]);
        if (!HOSTS.has(m[1]) && !EXAMPLE.test(m[1])) {
          findings.push(`${rel}:${i + 1}: ${m[1]} — ${line.trim().slice(0, 60)}`);
        }
      }
    });
  }
  assert.deepEqual(findings, [], `${findings.length} URL(s) to an unknown host`);
  // Not vacuous, and both allow-listed hosts are really present.
  assert.ok(hosts.size >= 5, `only ${hosts.size} host(s) found — the scan is wrong`);
  for (const h of HOSTS.keys()) assert.ok(hosts.has(h), `${h} is allow-listed but appears nowhere`);
  assert.equal(EXAMPLE.test('telemetry.acme.io'), false, 'the example pattern is too wide');
});

test('AC 2 — the engine and the hook never say `analytics`; the server may, and it is ServiceNow’s', () => {
  // The boundary IS the rule. `analytics` in the server's tool surface is ServiceNow's own word for
  // an API the product reads on the user's instance; the same word in the engine — which runs on the
  // user's machine, outside any instance session — would be something else entirely.
  const engine = productFiles().filter((rel) => rel.startsWith('tools/snowarch/'));
  const hits = engine.filter((rel) => /analytics/i.test(read(rel)));
  assert.deepEqual(hits, [], `the engine names analytics: ${hits.join(', ')}`);

  // The server's hits are counted, not banned — a number that moves is a thing to read, not a fail.
  const server = productFiles().filter((rel) => rel.startsWith('packages/snowarch/src/'))
    .filter((rel) => /analytics/i.test(read(rel)));
  assert.ok(server.length > 0, 'no analytics hit in the server at all — the scan is wrong');
  for (const rel of server) {
    assert.match(rel, /^packages\/snowarch\/src\/(tools|servicenow)\//,
      `${rel} is outside the ServiceNow tool surface`);
  }
});

test('AC 2 — CONTRIBUTING carries the sentence the criterion names', () => {
  // Lower-cased on both sides for one reason only: the criterion quotes the sentence mid-phrase
  // and the document opens a paragraph with it, so the two differ by the capital and nothing else.
  const SENTENCE = 'the product sends nothing; reports are pasted by people';
  assert.ok(read('docs/CONTRIBUTING.md').toLowerCase().includes(SENTENCE),
    'the sentence acceptance criterion 2 names is not in CONTRIBUTING');
});
