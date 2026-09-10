/**
 * `docs/TROUBLESHOOTING.md` — one section per error code, from the registry.
 *
 * The page used to be hand-seeded with the handful of codes somebody had met. That is the wrong
 * shape for a troubleshooting page: the code you are looking up is, by definition, the one you have
 * not met before. Every code the server can throw has a section here, and nothing per code is
 * hand-written — a code without a remedy cannot ship, because the remedy is a required field of the
 * registry entry that makes the code exist at all.
 */

const PREAMBLE = `Every error code this server can return, with what it means and what to do about
it. Nothing per code is written by hand: the source is the error registry in
\`packages/snowarch/src/errors/codes.ts\`, which is also what the session rule file, the instance
wizard and the doctor render from. If a remedy is wrong, correct it there and every surface follows.

**Where you will see a code.** In a Claude session, as the \`code\` of a refused tool call. In the
terminal, from \`./snowarch instance …\` while configuring an instance. And from \`./snowarch doctor\`,
which reports the same codes for the same conditions before you meet them in a call.

## What \`--fix\` will and will not do

\`./snowarch doctor --fix\` repairs a CLOSED list of seven drifts and prints a plan before it
touches anything: install the server dependencies, sync or re-sparse the documentation corpus,
check the corpus out onto its pin, write the flags a store entry never stated, restore the store
directory's mode, rewrite the mode toggles, and clear a stale doctor cache. Each one reports
\`applied\`, \`noop\` or \`failed\`, and running it twice changes nothing the second time.

It never edits credentials, \`.mcp.json\`, \`.claude/settings.json\`, \`engine.config.json\` or
anything under \`~/.claude\`. Those appear under REFUSED with the exact command to run by hand —
which is the point: a repair that guessed at one of them would be guessing about a decision, and
the four files it declines are the four where a wrong guess is expensive.

## Two things that are true of several codes at once

**With no instance configured, the server stays up.** It does not exit — an unconfigured checkout
used to, which meant the moment you most needed the server to explain itself was the moment it was
gone. Five tools need no instance: status, capabilities, reload, the instance listing and the
current instance. Start with status: it names every path that was searched and whether anything was
there. After adding an instance, call the reload tool rather than restarting Claude Code — the
server re-advertises its catalogue in the same session.

**On a corporate network, three failures look identical and are not.** Node's \`fetch\` reports
\`TypeError: fetch failed\` for a DNS failure, an untrusted certificate and an unreachable proxy
alike, with the real reason two \`cause\` levels down; the server classifies them so the message
names which it was. The thing people check first — their credentials — is usually the one that is
fine. Two rules go with that: never set \`NODE_TLS_REJECT_UNAUTHORIZED=0\` (it is the first search
result for the TLS error and it disables certificate verification for the entire process), and know
that an empty value counts as unset — \`HTTPS_PROXY=""\` is what \`\${HTTPS_PROXY:-}\` expands to when
the launching shell has no such variable, so the server deletes empty proxy and CA variables at
start-up, before the HTTP agent is built.`;

/**
 * Which surface reports a code, by family rather than by a per-code list.
 *
 * A per-code list would be a second registry to keep in step. The families are how the codes are
 * actually grouped: the wizard owns URL, OAuth and store shapes; the doctor reports what it can
 * detect before a call is made; a session sees what a refused call returns.
 */
function reportedBy(e) {
  const surfaces = [];
  if (e.showInRule || e.httpStatus) surfaces.push('a Claude session');
  if (/^(URL_|OAUTH_|STORE_)/.test(e.code)) surfaces.push('`./snowarch instance` (the wizard)');
  if (/^(STORE_|DNS_|TLS_|PROXY_|CONNECTION_|NETWORK_)/.test(e.code) || e.code === 'FLUENT_NOT_INSTALLED') {
    surfaces.push('`./snowarch doctor`');
  }
  if (surfaces.length === 0) surfaces.push('a Claude session');
  return surfaces.join(' · ');
}

export const target = 'docs/TROUBLESHOOTING.md';

export function render(ctx) {
  const { contract, header } = ctx;
  const codes = [...contract.errorCodes].sort((a, b) => a.code.localeCompare(b.code));

  const section = (e) => {
    const out = [`### ${e.code}`, ''];
    out.push(`**Meaning.** ${e.meaning}${e.httpStatus ? ` The instance returned HTTP ${e.httpStatus}.` : ''}`, '');
    out.push(`**Remedy.** ${e.remedy}`);
    if (e.command) out.push('', '```', e.command, '```');
    out.push('', `**Also reported by:** ${reportedBy(e)}`);
    return out.join('\n');
  };

  return `${header}
# Troubleshooting

${PREAMBLE}

${codes.length} codes.

${codes.map(section).join('\n\n')}
`;
}
