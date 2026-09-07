// ARC-02-S02 — the parser's contract. It is small on purpose: it accepts exactly what the roster
// writes and names anything else, so it cannot quietly stop catching mistakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, asList, FrontmatterError } from './lib/frontmatter.mjs';

const fm = (body) => `---\n${body}\n---\nbody\n`;

test('plain and quoted scalars, and which were quoted', () => {
  const { data, quoted } = parseFrontmatter(fm('name: developer\ndescription: "Does: things"'));
  assert.equal(data.name, 'developer');
  assert.equal(data.description, 'Does: things');
  assert.equal(quoted.description, true);
  assert.equal(quoted.name, false);
});

test('a one-level nested map', () => {
  const { data } = parseFrontmatter(fm('name: x\nmetadata:\n  version: 1.2.3\n  owner: arc-02'));
  assert.deepEqual(data.metadata, { version: '1.2.3', owner: 'arc-02' });
});

test('both list forms — flow and indented items', () => {
  assert.deepEqual(parseFrontmatter(fm('tools: [Read, Write]')).data.tools, ['Read', 'Write']);
  assert.deepEqual(parseFrontmatter(fm('skills:\n  - developer\n  - atf-author')).data.skills,
    ['developer', 'atf-author']);
});

test('a comma-separated scalar is read as a list by asList — the form the agents use', () => {
  assert.deepEqual(asList('Read, Write, Edit'), ['Read', 'Write', 'Edit']);
  assert.deepEqual(asList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(asList(undefined), []);
});

test('CRLF is accepted — the Windows cell reads the same files', () => {
  const { data } = parseFrontmatter('---\r\nname: x\r\ndescription: y\r\n---\r\nbody\r\n');
  assert.equal(data.name, 'x');
});

test('unsupported syntax fails by name, with file and line', () => {
  assert.throws(() => parseFrontmatter(fm('name: x\n  this is not valid'), 'skills/x/SKILL.md'),
    (e) => {
      assert.ok(e instanceof FrontmatterError);
      assert.match(e.message, /^skills\/x\/SKILL\.md:3: unsupported frontmatter syntax/);
      return true;
    });
});

test('a missing frontmatter block fails rather than returning empty', () => {
  assert.throws(() => parseFrontmatter('# just a heading\n', 'x.md'), /no frontmatter block/);
});
