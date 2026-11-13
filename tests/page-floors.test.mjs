// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-09-C275 — a floor a page states is the floor B00 enforces.
 *
 * README.md, docs/INSTALL.md and docs/INSTALL-WINDOWS.md said "git 2.25". `engine.config.json` has said 2.34.1 since its first commit
 * (ADR-0008, 2026-09-07, moved the floor off ADR-0001's 2.25.0), and B00 refuses below it with "git 2.30.0 found, >= 2.34.1 required". A reader
 * with git 2.30 followed the page, was told they were ready, and was refused at the first check. Nothing tied the pages to the file, so the
 * numbers agreed only until one of them moved: this file is the tie, for the class and not for those three lines.
 *
 * WHAT IS DERIVED. Every expected number is read from `engine.config.json` → `floors`, the file `bootstrap.sh` and `bootstrap.ps1` read when
 * B00 compares (the first test says so of both launchers, and `tests/launcher-parity.test.mjs` pins the message B00 prints). No number is
 * copied into this file: a floor that moves in the config moves here with it, and every page that still says the old one fails by name.
 *
 * WHAT IS READ. A page states a floor in one of three shapes, and these are the ones read:
 *   a comparison       `git ≥ **2.34.1**`, `Node.js ≥ 20`, `Claude Code >= 2.1.214`
 *   a table row        `| Git | 2.34.1 |`: the tool alone in the first cell, the number first in the second
 *   a floor sentence   `Node meets the declared floor of 20`
 * A page that states a floor in some other shape is not read, and nothing says so: that is why the three pages that must state all three
 * floors are checked for the statements themselves (the third test), so a page cannot slide into prose this reading cannot see. A number is
 * compared as bootstrap.sh's `ge` reads it — three numeric fields, a missing one 0 — so `20` is the floor `20.0.0` and `2.34` is not `2.34.1`.
 *
 * WHICH PAGES. README.md and the pages directly under docs/, except the changelog, which is a log: each entry says what was true on its
 * day. Plans, decisions, spikes and validation records are not swept either; they are records of what was decided or measured when, and
 * ADR-0001's "git ≥ 2.25" is one of them, kept on purpose. README.md is composed from docs/INSTALL.md (`scripts/gen-readme.mjs`).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Text, whatever the checkout's line endings and whether an editor added a byte-order mark: the pages are read as text, not as bytes.
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const FLOORS = JSON.parse(read('engine.config.json')).floors;

/** How a page names the tool each floor belongs to. A floor in the config that is not listed here fails the first test, so none goes unread. */
const NAMES = { claudeCode: ['Claude Code'], node: ['Node.js', 'Node'], git: ['Git', 'git'] };
const KEY = new Map(Object.entries(NAMES).flatMap(([key, names]) => names.map((name) => [name, key])));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME = [...KEY.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'); // `Node.js` before `Node`
const NUMBER = String.raw`v?(\d+(?:\.\d+){0,2})`; // 20 · v20 · 2.25 · 2.34.1

const SHAPES = [
  { shape: 'a comparison', re: new RegExp(String.raw`(?<![\w.])(${NAME})\s*(?:≥|>=)\s*\**${NUMBER}`, 'g') },
  { shape: 'a table row', re: new RegExp(String.raw`^\|\s*\**(${NAME})\**\s*\|\s*\**${NUMBER}`, 'gm') },
  { shape: 'a floor sentence', re: new RegExp(String.raw`(?<![\w.])(${NAME})\b[^|\n.]{0,40}?\bfloor (?:of|is) \**${NUMBER}`, 'g') },
];

/** Every floor a text states: the tool, the number as written, where the number starts, and the line. */
function statements(text) {
  const found = [];
  for (const { shape, re } of SHAPES) {
    for (const m of text.matchAll(re)) {
      found.push({
        shape, tool: m[1], key: KEY.get(m[1]), stated: m[2],
        at: m.index + m[0].lastIndexOf(m[2]), line: text.slice(0, m.index).split('\n').length,
      });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Three numeric fields, a missing one 0 — the way bootstrap.sh's `ge` and bootstrap.ps1's `VersionGe` read a version. */
const fields = (v) => { const p = v.split('.').map(Number); while (p.length < 3) p.push(0); return p.join('.'); };
const same = (stated, floor) => floor !== undefined && fields(stated) === fields(floor);

/** The statements of a text that are not the config's floor for their tool. */
const wrong = (text, floors = FLOORS) => statements(text).filter((s) => !same(s.stated, floors[s.key]));

/** `version` written over every statement of one floor, so a real page can be shown to fail the way it once did. */
function plant(text, key, version) {
  let out = text;
  for (const s of statements(text).filter((x) => x.key === key).reverse()) out = out.slice(0, s.at) + version + out.slice(s.at + s.stated.length);
  return out;
}

const INSTALL_PAGES = ['README.md', 'docs/INSTALL.md', 'docs/INSTALL-WINDOWS.md'];
const LOGS = ['docs/CHANGELOG.md'];
const SWEPT = ['README.md', ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).sort().map((f) => `docs/${f}`)]
  .filter((rel) => !LOGS.includes(rel));

test('ARC-09-C275 — the guard reads every floor the config holds, and B00 reads that same file', () => {
  assert.deepEqual(Object.keys(FLOORS).sort(), Object.keys(NAMES).sort(),
    'engine.config.json holds a floor this test does not read, or lost one it does: add its name to NAMES, and say which pages state it');
  for (const [key, floor] of Object.entries(FLOORS)) assert.match(floor, /^\d+(\.\d+){0,2}$/, `floors.${key} is not a version: ${floor}`);
  // The same file, by the two launchers' own text: the number a page is compared with is the number B00 compares the machine with.
  const sh = read('bootstrap.sh');
  assert.match(sh, /^floor\(\) \{.*"\$ROOT\/engine\.config\.json".*\}$/m, 'bootstrap.sh no longer reads its floors from engine.config.json');
  assert.ok(sh.includes('ge "$GIT_V" "$(floor git)"'), 'B00 in bootstrap.sh no longer compares git with floors.git');
  const ps = read('bootstrap.ps1');
  assert.match(ps, /function Floor\(\[string\]\$Name\) \{\s+\$line = Select-String -Path "\$Root\\engine\.config\.json"/,
    'bootstrap.ps1 no longer reads its floors from engine.config.json');
  assert.ok(ps.includes("VersionGe $GitV (Floor 'git')"), 'B00 in bootstrap.ps1 no longer compares git with floors.git');
});

test('ARC-09-C275 — the README, the install page and the Windows guide each state all three floors in a shape this test reads', () => {
  for (const rel of INSTALL_PAGES) {
    const keys = new Set(statements(read(rel)).map((s) => s.key));
    for (const key of Object.keys(NAMES)) {
      assert.ok(keys.has(key), `${rel} states no floor for ${NAMES[key][0]} in a shape this test reads (a comparison, a table row or a floor sentence): `
        + 'either the page lost the floor, or it moved into prose the guard cannot see');
    }
  }
});

test('ARC-09-C275 — no page states a floor other than the one in engine.config.json', () => {
  const problems = [];
  for (const rel of SWEPT) {
    for (const s of wrong(read(rel))) {
      problems.push(`${rel}:${s.line}  ${s.tool} ${s.stated} (${s.shape}) — engine.config.json says floors.${s.key} is ${FLOORS[s.key]}`);
    }
  }
  assert.deepEqual(problems, [],
    `a page states a floor B00 does not enforce. A page that says less sends a reader with a version in between past the page and into B00's refusal; `
    + 'README.md is composed from docs/INSTALL.md, so change that and run `node scripts/gen-readme.mjs`');
});

test('ARC-09-C275 — the reading can fail: each shape, each tool, a number that is lower, higher or a prefix, and the pages as they were', () => {
  const bump = (floor, at, by) => { const p = fields(floor).split('.').map(Number); p[at] += by; return p.join('.'); };
  const PLANTED = {
    'a comparison': (tool, v) => `| Everything | ${tool} ≥ **${v}** | a reason |`,
    'a table row': (tool, v) => `| ${tool} | v${v}. A sentence after it. |`,
    'a floor sentence': (tool, v) => `| SV-00 | ${tool} meets the declared floor of ${v} |`,
  };
  let planted = 0;
  for (const [key, names] of Object.entries(NAMES)) {
    const floor = FLOORS[key];
    const lower = bump(floor, 0, -1);
    const higher = bump(floor, 2, 1);
    const prefix = fields(floor).split('.').slice(0, 2).join('.'); // `2.34` for `2.34.1`: B00 reads it as 2.34.0, which is below the floor
    const right = [floor, fields(floor).replace(/(\.0)+$/, '')]; // `20.0.0` and `20` are one floor
    for (const tool of names) {
      for (const [shape, write] of Object.entries(PLANTED)) {
        for (const v of right) assert.deepEqual(wrong(write(tool, v)), [], `${shape}, ${tool} ${v}: the floor itself was reported`);
        for (const v of [lower, higher, ...(same(prefix, floor) ? [] : [prefix])]) {
          const found = wrong(write(tool, v));
          assert.equal(found.length, 1, `${shape}, ${tool} ${v}: expected the one statement to be found, got ${found.length}`);
          assert.deepEqual([found[0].shape, found[0].key, found[0].stated], [shape, key, v], `${shape}, ${tool} ${v}`);
          planted += 1;
        }
      }
    }
  }
  assert.ok(planted >= 24, `the planted cases ran ${planted} times`);
  // The pages as they were: git's number put back to ADR-0001's, over every git statement the real pages carry, and each one is found.
  let rewritten = 0;
  for (const rel of SWEPT) {
    const text = read(rel);
    const gits = statements(text).filter((s) => s.key === 'git');
    if (gits.length === 0) continue;
    const back = wrong(plant(text, 'git', '2.25')).filter((s) => s.key === 'git');
    assert.equal(back.length, gits.length, `${rel}: ${gits.length} git statement(s), ${back.length} found once git 2.25 is written over them`);
    assert.ok(back.every((s) => s.stated === '2.25'), `${rel}: a statement kept its own number`);
    rewritten += back.length;
  }
  assert.ok(rewritten >= INSTALL_PAGES.length, `only ${rewritten} git statements were rewritten across the pages`);
});
