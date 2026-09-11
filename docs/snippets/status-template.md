<!-- ONE SOURCE. This fragment is the `/snowarch status` output template: the skill quotes the
     fenced block below byte-for-byte (`tests/snowarch-skill.test.mjs` fails if the two drift), and
     ARC-08-S10's T-07 record quotes the same file rather than a copy of it.

     Every bracketed name is a key of the doctor's schema-v1 JSON (`--quick --json`), and
     `tests/doctor/status-template.test.mjs` resolves each one against a real report — a template
     naming a key nobody writes is a template the model fills with an invention. -->

# The `/snowarch status` output

```
Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools (contract)   [modeLineDetailed]
Engine: snowarch 2.0.0 · tag v2.0.0 · contract a1b2c3d                                       [engine.version, engine.tag, engine.contractSha]
Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse · citations checked: 181 | dead: 0 [engine.docs]
Roster: 28 skills / 9 agents                                                                 [engine.roster]
Capabilities: docx yes (python3) · PDF QA no · draw.io yes · Mermaid no                       [engine.capabilities]
Instances: pdi (pdi, custom, default) · uat (test, read-only)                                 [server.instances]
Doctor: 41 ok, 1 warn, 0 fail — quick run 2026-09-10 10:00 · full report: ./snowarch doctor   [summary, ranAt, options.quick]
```

Line 1 is `modeLineDetailed` **verbatim**. The skill never re-derives the mode, and never adds a
word about it that the doctor did not print.

A line whose key is `null` is **omitted**, not guessed. Two are routinely null on a `--quick` run,
because the checks that fill them spawn a process or walk the corpus and are therefore outside the
quick subset: `engine.capabilities` (E-04) and the citation half of `engine.docs` (E-16). When
either is missing, the skill says so once, at the end:

```
Capability packs and citation counts are not probed on a quick run — ./snowarch doctor reports them.
```

`Instances:` is omitted entirely in design-only: there are none, and a line saying so would be a
sentence about an absence the Mode line has already explained.

When `summary.fail > 0`, one line per failing check follows the seven, and then the fix sentence
when there is anything to fix:

```
  E-16 FAIL citations: 2 dead — remedy: maintainer: fix the citation; users: ./snowarch docs sync
Run ./snowarch doctor --fix for the fixable ones (2).
```

WARNs are never listed one by one — that is `/snowarch doctor`.
