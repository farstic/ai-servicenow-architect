# ARC-03-S09 — `docs-bump --dry-run`, real upstream, 2026-09-09

The acceptance criterion's dry run. **Run locally, not through `workflow_dispatch`** — see the note
below. Exit 0, tree restored, pin unmoved.

```
- [ ] newly dead citations remapped (or none)
- [ ] `node scripts/docs.mjs verify` → `dead: 0`
- [ ] release notes skimmed: `vendor/ServiceNowDocs/markdown/release-notes/`

```
docs pin: ba513f2 (2026-07-09) → 11b39be (2026-08-28)
citations: checked: 180 | dead: 0 → checked: 180 | dead: 1
newly dead (1):
  DEAD .claude/skills/now-assist-genai/SKILL.md:40 markdown/intelligent-experiences/ai-control-tower/ai-gateway-overview.md
healed (0)
staged: engine.config.json, vendor/ServiceNowDocs — review, then: git commit -m "chore(docs): bump ServiceNowDocs to 11b39be"
```

_Opened by `.github/workflows/docs-bump.yml`. Never auto-merged._

docs-bump: dry run — tree restored, porcelain empty, nothing staged
::warning::docs-bump: 1 newly dead citation(s) if the pin moves to 11b39be — see the body above
```

## Why this is a local run

`gh workflow run docs-bump.yml --ref arc-03/docs-corpus -f dry_run=true` returns **HTTP 404**:
GitHub resolves a `workflow_dispatch` by filename against the **default branch**, and the workflow
does not exist there until this pull request merges. The `--ref` selects which ref the job runs
*from*, not where the definition is looked up.

So the dry run above exercises the same script the workflow's one substantive step calls,
`node scripts/docs-bump.mjs --dry-run`, against the real upstream. What it does **not** cover is the
YAML around it — the branch/PR/label/supersede steps, none of which a dry run reaches anyway.
`actionlint` covers the file's syntax from this PR onwards; the first `workflow_dispatch` is the
maintainer's to trigger after merge.
