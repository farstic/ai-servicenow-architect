# Test fixtures

Data the tests read rather than derive, and stand-ins for things that do not exist yet.

| Fixture | What it is |
|---|---|
| `contract-literals-allowlist.json` | The four places a contract name may be written out, with the reason. |
| `docs-corpus/` | A miniature ServiceNowDocs tree, for the citation checks. |
| `forthcoming-paths.json` | Paths a governing text may cite before the story that creates them. |
| `rootless-citation-allowlist.json` | Citations that are correct without a repository-root prefix. |
| `snowarch-doctor-stub.sh` | A stand-in for `./snowarch doctor` — copy it into a scratch checkout as `./snowarch` and set `SNOWARCH_STUB_MODE` (`live` · `design-only` · `unbootstrapped` · `absent`) to exercise `/snowarch` before ARC-07/ARC-08 build the real launcher. |
| `vocabulary-allowlist.json` | Terms the vocabulary sweep would otherwise flag, with the reason. |
