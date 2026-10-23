// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C221 — the store's own names, masked by value: one definition for a user's finding (finding.mjs) and for the
// doctor's JSON boundary, which can only mask an instance it is told about by pattern (`INSTANCE_HOST`) and misses a
// custom domain or a bare host.
//
// THE NON-CREDENTIAL TIER, and only it, lives here: labels, URL hosts and host stems. It is read the way
// `readStoreSummaries` reads (packages/snowarch/src/store/label.ts:133): each field named, never a spread of an entry,
// never the credential block. Usernames and secrets are finding.mjs's alone, read through the store loader that
// registers the secrets as it parses (instance-file.mjs:135), so no second reader of credentials exists.
import { readFileSync } from 'node:fs';

/** The store schema's environment enum (instance-file.mjs ENVIRONMENTS): words too common to mask as names. */
export const ENV_WORDS = new Set(['pdi', 'dev', 'test', 'prod']);

const SN_HOST = /\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)$/i;
const NONE = Object.freeze({ read: false, labels: [], hosts: [], stems: [] });

/** A host's stem: the instance name of a ServiceNow host, the organisation part of any other. */
export function stemOf(host) {
  const parts = host.toLowerCase().split('.');
  return SN_HOST.test(host) ? parts[0] : parts[parts.length - 2] ?? parts[0];
}

/** Labels, URL hosts and stems from the instance store at `storePath`; `read: false` when it cannot be read. */
export function storeHostValues(storePath) {
  let raw;
  try { raw = JSON.parse(readFileSync(storePath, 'utf8')); } catch { return { ...NONE }; }
  const instances = raw?.instances;
  if (!instances || typeof instances !== 'object') return { ...NONE };
  const labels = [];
  const hosts = [];
  for (const [label, entry] of Object.entries(instances)) {
    labels.push(label);
    const url = typeof entry?.url === 'string' ? entry.url : null; // the one field taken from the entry
    if (url) { try { hosts.push(new URL(url).hostname.toLowerCase()); } catch { /* not a URL: nothing to mask by */ } }
  }
  const uniqueHosts = [...new Set(hosts)];
  return { read: true, labels, hosts: uniqueHosts, stems: [...new Set(uniqueHosts.map(stemOf))] };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A name bounded by non-alphanumerics, case-insensitive: `_` and `-` separate, so x_acme_itsm and ACME-ITSM match. */
export const nameRe = (source) => new RegExp(`(?<![A-Za-z0-9])${source}(?![A-Za-z0-9])`, 'gi');

/** A multi-word value with any separator or none: "acme-bank" ~ "Acme Bank" ~ "AcmeBank" ~ "acme_bank". */
export const flexible = (value) => value.trim().split(/[-_\s.]+/).filter(Boolean).map(escape).join('[-_\\s.]?');

/**
 * The by-value entries, longest first: `[kind, source]` with `source` a regex source. A store stem also matches with a
 * suffix, so `acmebankdev` is caught by `acmebank`. Environment words are never names.
 */
export function byValueEntries({ engagement = '', aliases = [], labels = [], stems = [], usernames = [] } = {}) {
  const STEM = '[a-z0-9]*';
  // Sorted by the VALUE's length, as the red-team's measured masker sorts, so the longer name wins where two overlap.
  return [
    ...[engagement, ...aliases].filter((v) => v && v !== '_unfiled').map((v) => ['engagement', v]),
    ...labels.filter((l) => !ENV_WORDS.has(l)).map((l) => ['instance', l]),
    ...stems.map((s) => ['instance', `${escape(s)}${STEM}`]),
    ...usernames.map((u) => ['user', u]),
  ].sort((a, b) => b[1].length - a[1].length)
    .map(([kind, v]) => [kind, kind === 'instance' && v.endsWith(STEM) ? v : flexible(v)]);
}

/** Replace every by-value match; `to(kind, match)` names what replaces it. */
export function maskByValue(text, entries, to) {
  let out = text;
  for (const [kind, source] of entries) out = out.replace(nameRe(source), (m) => to(kind, m));
  return out;
}
