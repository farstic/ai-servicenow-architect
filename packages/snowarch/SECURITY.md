# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | Yes |
| 1.x (`snow-mcp`) | No — superseded by 2.0.0; see `CHANGELOG.md` for the migration |

## Reporting a vulnerability

Open a **private security advisory** on the repository:
<https://github.com/farstic/ai-servicenow-architect/security/advisories/new>

Please do not open a public issue for a vulnerability, and please do not include a real instance
URL, username, password, token or customer record in the report — a masked description of the shape
of the problem is enough to reproduce it, and the report itself becomes another copy of whatever it
contains.

## What this server does with credentials

- Credentials live in the **store** (`instances.json`), which must be `0600` in a `0700` directory
  on POSIX. The server refuses to load a group- or world-readable store rather than reading
  credentials out of one.
- **Nothing logs a secret value.** Redaction is on unless `REDACT_SENSITIVE_DATA` is exactly
  `false`, and it scrubs both keys that look sensitive and credential-shaped string values wherever
  they appear. A lint rule additionally forbids passing HTTP headers to the logger anywhere in
  `src/servicenow/`, because redaction is a runtime behaviour with an opt-out and a lint failure is
  not.
- **The audit trail records what was done, never what was written.** No payload values, no
  credentials, no instance URL — the instance label is enough to identify it, and that file ends up
  in tickets. `query` strings *are* recorded and can contain personal data; the README says so, and
  `SNOW_AUDIT_FILE=off` turns the trail off.
- **The doctor's output is written to be pasted**: masked paths, no clear usernames, no values.

## What gates a change to your instance

Six flags, off by default, and a tool that changes state is refused while its flag is off. A `prod`
instance raised above `read-only` is refused entirely unless `prodWriteAck` is set on it — arming
writes against production should be a decision someone made on purpose, on a date, in a file. See
the README for the preset table.

## Corporate TLS interception

If your network intercepts TLS, set `NODE_EXTRA_CA_CERTS` to your organisation's root CA in PEM
form. **Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`** — it disables certificate verification for the
whole process, which on such a network means trusting the interceptor and every other certificate
too. The server never suggests it.
