# AI ServiceNow Architect

**v2.0.0-rc.1** · Apache-2.0 · Claude Code ≥ 2.1.214

![version](https://img.shields.io/badge/version-2.0.0--rc.1-blue)

A virtual ServiceNow consulting team that runs inside Claude Code. You describe what you need; a Chief
Architect routes the request to the right specialist, reviews what comes back, and hands you the
artefact — a design, a set of stories, a Script Include, a test suite. It runs **design-only** — no
instance, no credentials — or **live**, connected through the bundled MCP server, where every write
is gated on your explicit approval and captured into an update set. Baseline-first throughout: a
custom table or scoped application needs your approval, never the model's own.
