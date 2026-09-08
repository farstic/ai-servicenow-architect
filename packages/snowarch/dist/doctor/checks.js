/**
 * SV-00 … SV-08. One function per check, each answering one question a user could act on.
 *
 * Every `detail` and `remedy` string here reaches a terminal, a log and — through ARC-08's
 * report — a pasted bug report. So: masked paths, no clear usernames, secrets as `set (len n)`
 * and never as values. That is not a formality; the doctor is the tool people run *because*
 * something is wrong, which is exactly when they screenshot it.
 */
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { instanceManager } from '../servicenow/instances.js';
import { isUnderCloudSyncFolder } from '../store/index.js';
import { maskPath, resolveStorePath } from '../store/paths.js';
import { FLAG_NAMES, checkProdPosture } from '../utils/permissions.js';
import { resolveAuditPath } from '../audit/writer.js';
const isWindows = process.platform === 'win32';
/**
 * Where `dist/` is, relative to this module once built.
 *
 * `fileURLToPath`, never `new URL(...).pathname`. On Windows the pathname of a file URL is
 * `/C:/…` — a leading slash before the drive letter, which is not a filesystem path. The first
 * version used it, so `dist/contract.json` was never found on any Windows cell: SV-05 skipped,
 * SV-01 failed, and the report read as a broken installation on a perfectly good one.
 */
const distDir = () => resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (id, title, detail) => ({ id, title, status: 'ok', detail, fixable: false });
const warn = (id, title, detail, remedy) => ({ id, title, status: 'warn', detail, ...(remedy ? { remedy } : {}), fixable: false });
const fail = (id, title, detail, remedy) => ({ id, title, status: 'fail', detail, ...(remedy ? { remedy } : {}), fixable: false });
const skip = (id, title, detail, remedy) => ({ id, title, status: 'skip', detail, ...(remedy ? { remedy } : {}), fixable: false });
// ─── SV-00 — Node floor ──────────────────────────────────────────────────────
export const svNodeFloor = {
    id: 'SV-00',
    title: 'Node version',
    severity: 'fail',
    network: false,
    async run() {
        const major = Number(process.versions.node.split('.')[0]);
        // The floor the package declares, not the floor CI happens to run. A machine on Node 18
        // will fail here rather than three stack frames into an unsupported syntax error.
        return major >= 20
            ? ok('SV-00', 'Node version', `node ${process.versions.node} (floor 20)`)
            : fail('SV-00', 'Node version', `node ${process.versions.node} is below the floor of 20`, 'install Node 20 or newer');
    },
};
// ─── SV-01 — dist present and importable ─────────────────────────────────────
export const svDist = {
    id: 'SV-01',
    title: 'dist artefacts',
    severity: 'fail',
    network: false,
    async run() {
        const server = join(distDir(), 'server.js');
        const contract = join(distDir(), 'contract.json');
        const missing = [server, contract].filter((p) => !existsSync(p));
        if (missing.length > 0) {
            return fail('SV-01', 'dist artefacts', `missing: ${missing.map((p) => maskPath(p)).join(', ')}`, 'run npm run build in packages/snowarch');
        }
        try {
            const text = readFileSync(contract, 'utf8');
            const parsed = JSON.parse(text);
            const sha = createHash('sha256').update(text).digest('hex');
            return ok('SV-01', 'dist artefacts', `server.js present, contract ${parsed.toolCount} tools, sha256 ${sha.slice(0, 12)}`);
        }
        catch (e) {
            return fail('SV-01', 'dist artefacts', `contract.json is not readable JSON: ${e.message}`, 'run npm run build in packages/snowarch');
        }
    },
};
// ─── SV-02 — the store ───────────────────────────────────────────────────────
export const svStore = {
    id: 'SV-02',
    title: 'store',
    severity: 'fail',
    network: false,
    async run() {
        const res = resolveStorePath();
        if (res.path === null) {
            // Not an error: an unconfigured checkout is a legitimate state, and the server starts in
            // it deliberately (ARC-04-S04). Saying "fail" here would send a first-time user looking
            // for a broken installation.
            return warn('SV-02', 'store', 'no store found — the server starts unconfigured', '/snowarch setup-instance');
        }
        const notes = [`source ${res.source}, ${maskPath(res.path)}`];
        let status = 'ok';
        let remedy;
        if (isWindows) {
            notes.push('mode check skipped (Windows: permissions are ACL-inherited, not POSIX bits)');
        }
        else if (existsSync(res.path)) {
            const fileMode = statSync(res.path).mode & 0o777;
            const dirMode = statSync(dirname(res.path)).mode & 0o777;
            if ((fileMode & 0o077) !== 0) {
                status = 'fail';
                notes.push(`mode ${fileMode.toString(8).padStart(4, '0')} is group/world-readable`);
                remedy = `chmod 600 ${maskPath(res.path)}`;
            }
            else if ((dirMode & 0o022) !== 0) {
                status = 'fail';
                notes.push(`directory mode ${dirMode.toString(8).padStart(4, '0')} is group/world-writable`);
                remedy = `chmod 700 ${maskPath(dirname(res.path))}`;
            }
            else {
                notes.push(`mode ${fileMode.toString(8).padStart(4, '0')}`);
            }
        }
        if (isUnderCloudSyncFolder(res.path) && status === 'ok') {
            status = 'warn';
            notes.push('the store is under a cloud-sync folder; 0600 does not prevent synchronisation');
            remedy = 'move the store outside the synced folder, or use --global';
        }
        // The mode finding wins when there is one. A 0644 store ALSO produces a
        // `STORE_PERMISSIONS_TOO_OPEN` config error, and reporting that generic error instead threw
        // away the specific remedy — the reader got "correct the store file" where they could have
        // had the exact `chmod`. Anything else the store reported is surfaced below.
        if (status !== 'fail') {
            const errors = instanceManager.getReport().configErrors;
            if (errors.length > 0) {
                return fail('SV-02', 'store', `${notes.join('; ')}; ${errors[0].code}: ${errors[0].message}`, 'correct the store file; ./snowarch instance list shows what loaded');
            }
        }
        return { id: 'SV-02', title: 'store', status, detail: notes.join('; '),
            ...(remedy ? { remedy } : {}), fixable: false };
    },
};
// ─── SV-03 — per instance ────────────────────────────────────────────────────
export const svInstances = {
    id: 'SV-03',
    title: 'instances',
    severity: 'fail',
    network: false,
    async run() {
        const report = instanceManager.getReport();
        const loaded = instanceManager.listAll().filter((i) => i.status === 'loaded');
        // A refusal recorded at load time is the authority here. `checkProdPosture` is re-run below
        // for loaded instances, but an instance refused for prod posture never becomes an entry, so
        // reading only the loaded set would report "0 problems" on exactly the store that has one.
        const prodRefusals = report.notLoaded.filter((n) => n.code === 'PROD_WRITE_NOT_ACKNOWLEDGED');
        if (prodRefusals.length > 0) {
            const first = prodRefusals[0];
            return fail('SV-03', 'instances', first.message, `./snowarch instance set-preset ${first.label} <preset> --ack-prod`);
        }
        if (loaded.length === 0 && report.notLoaded.length === 0) {
            return skip('SV-03', 'instances', 'no instances configured');
        }
        const problems = [];
        const notes = [];
        let remedy;
        for (const i of loaded) {
            const entry = instanceManager.getEntry(i.name);
            if (!entry)
                continue;
            if (!/^https:\/\/[^/]+$/.test(entry.url)) {
                problems.push(`${i.name}: url is not a bare https origin`);
                remedy ??= `./snowarch instance set-url ${i.name} https://<host>`;
            }
            const declared = FLAG_NAMES.filter((f) => entry.flags[f] !== undefined);
            if (declared.length < FLAG_NAMES.length) {
                notes.push(`${i.name}: FLAGS_INCOMPLETE (${declared.length}/${FLAG_NAMES.length} explicit)`);
            }
            const posture = checkProdPosture(entry);
            if (!posture.ok) {
                problems.push(posture.message ?? `${i.name}: prod posture`);
                remedy ??= `./snowarch instance set-preset ${i.name} ${entry.preset} --ack-prod`;
            }
            if (entry.toolPackage !== 'full') {
                notes.push(`${i.name}: toolPackage ${entry.toolPackage} (a subset of the catalogue)`);
            }
            for (const w of entry.warnings)
                notes.push(`${i.name}: ${w}`);
            if (problems.length === 0 && notes.length === 0) {
                notes.push(`${i.name}: flags explicit, preset ${entry.preset}`);
            }
        }
        for (const n of report.notLoaded) {
            problems.push(`${n.label}: ${n.code}`);
            remedy ??= 'read the reason in ./snowarch instance list';
        }
        if (problems.length > 0) {
            return fail('SV-03', 'instances', problems.join('; '), remedy);
        }
        const warnings = notes.filter((n) => /FLAGS_INCOMPLETE|toolPackage|dependency/i.test(n));
        return warnings.length > 0
            ? warn('SV-03', 'instances', notes.join('; '), 'set every flag explicitly: ./snowarch instance set-preset <label> <preset>')
            : ok('SV-03', 'instances', notes.join('; '));
    },
};
// ─── SV-04 — network probes (stub until ARC-07-S03) ──────────────────────────
export const svProbes = {
    id: 'SV-04',
    title: 'instance probes',
    severity: 'fail',
    network: true,
    async run(ctx) {
        if (ctx.noNetwork) {
            return skip('SV-04', 'instance probes', 'skipped: --no-network');
        }
        const labels = instanceManager.listNames();
        if (labels.length === 0)
            return skip('SV-04', 'instance probes', 'no instances configured');
        const r = await ctx.probes.runAll(labels[0]);
        return { id: 'SV-04', title: 'instance probes', status: r.status, detail: r.detail,
            ...(r.remedy ? { remedy: r.remedy } : {}), fixable: false };
    },
};
/**
 * Speak MCP to our own `dist/server.js` over stdio.
 *
 * Hand-rolled JSON-RPC rather than the SDK client: the doctor must work from a plain install
 * with no dev dependencies, and it is diagnosing the very thing the SDK would be talking to —
 * a failure inside a client library would be reported as a server fault.
 *
 * `[UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental` appears on stderr the first time
 * the proxy agent is built. Stderr is IGNORED here for exactly that reason: a server that warns
 * is not a server that failed, and treating any stderr output as an error would make this check
 * red on every machine.
 */
async function handshake(serverPath) {
    return new Promise((done) => {
        const child = spawn(process.execPath, [serverPath], {
            stdio: ['pipe', 'pipe', 'ignore'],
            env: { ...process.env, SNOW_LOG_LEVEL: 'error' },
        });
        let buffer = '';
        const seen = {};
        const finish = (h) => { child.kill(); done(h); };
        const timer = setTimeout(() => finish({ tools: [], capabilities: null, error: 'timed out after 20s' }), 20_000);
        const send = (id, method, params = {}) => {
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        };
        child.on('error', (e) => { clearTimeout(timer); finish({ tools: [], capabilities: null, error: e.message }); });
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            let nl = buffer.indexOf('\n');
            while (nl !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                nl = buffer.indexOf('\n');
                if (!line)
                    continue;
                let msg;
                try {
                    msg = JSON.parse(line);
                }
                catch {
                    continue;
                }
                if (msg.id === undefined)
                    continue;
                seen[msg.id] = msg.result;
                if (msg.id === 1) {
                    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
                    send(2, 'tools/list');
                }
                else if (msg.id === 2) {
                    const tools = (msg.result?.tools ?? []).map((t) => t.name);
                    send(3, 'tools/call', { name: 'snow_core_capabilities_read', arguments: {} });
                    seen[2] = tools;
                }
                else if (msg.id === 3) {
                    clearTimeout(timer);
                    const text = msg.result?.content?.[0]?.text;
                    let capabilities = null;
                    try {
                        capabilities = text ? JSON.parse(text) : null;
                    }
                    catch {
                        capabilities = null;
                    }
                    finish({ tools: seen[2] ?? [], capabilities });
                }
            }
        });
        send(1, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'snowarch-doctor', version: '0' },
        });
    });
}
/** Cached across SV-05 and SV-06 so the server is spawned once, not twice. */
let handshakeCache;
const getHandshake = () => {
    handshakeCache ??= handshake(join(distDir(), 'server.js'));
    return handshakeCache;
};
/** Test seam: forget the cached handshake between fixtures. */
export function resetHandshakeCache() { handshakeCache = undefined; }
export const svHandshake = {
    id: 'SV-05',
    title: 'stdio handshake',
    severity: 'fail',
    network: false,
    async run() {
        const contractPath = join(distDir(), 'contract.json');
        if (!existsSync(contractPath)) {
            return skip('SV-05', 'stdio handshake', 'no contract to compare against (SV-01 says why)');
        }
        const h = await getHandshake();
        if (h.error) {
            return fail('SV-05', 'stdio handshake', `the server did not answer: ${h.error}`, 'run node packages/snowarch/dist/server.js and read its stderr');
        }
        const declared = JSON.parse(readFileSync(contractPath, 'utf8'))
            .tools.map((t) => t.name);
        if (instanceManager.loadedCount() === 0) {
            // Unconfigured mode advertises five tools deliberately. Comparing against the full
            // contract here would report a 392-name difference for a server behaving correctly.
            return h.tools.length === 5
                ? ok('SV-05', 'stdio handshake', `unconfigured: ${h.tools.length} core tools advertised`)
                : fail('SV-05', 'stdio handshake', `unconfigured mode advertised ${h.tools.length} tools, expected 5: ${h.tools.join(', ')}`, 'run node packages/snowarch/dist/server.js and read its stderr');
        }
        const advertised = new Set(h.tools);
        const declaredSet = new Set(declared);
        const missing = declared.filter((n) => !advertised.has(n));
        const extra = h.tools.filter((n) => !declaredSet.has(n));
        if (missing.length === 0 && extra.length === 0) {
            return ok('SV-05', 'stdio handshake', `${h.tools.length} tools advertised, matching the contract`);
        }
        // The differing NAMES, not a count: "3 tools differ" tells nobody which build is stale.
        const parts = [
            missing.length > 0 ? `in the contract but not advertised: ${missing.slice(0, 10).join(', ')}` : '',
            extra.length > 0 ? `advertised but not in the contract: ${extra.slice(0, 10).join(', ')}` : '',
        ].filter(Boolean);
        return fail('SV-05', 'stdio handshake', parts.join('; '), 'the contract and the build disagree — run npm run build in packages/snowarch');
    },
};
export const svCapabilities = {
    id: 'SV-06',
    title: 'capabilities match the store',
    severity: 'fail',
    network: false,
    async run() {
        if (instanceManager.loadedCount() === 0) {
            return skip('SV-06', 'capabilities match the store', 'no instance loaded');
        }
        const h = await getHandshake();
        if (h.error || !h.capabilities) {
            return skip('SV-06', 'capabilities match the store', 'the handshake did not return capabilities (SV-05 says why)');
        }
        const entry = instanceManager.getEntry();
        if (!entry)
            return skip('SV-06', 'capabilities match the store', 'no current instance');
        const c = h.capabilities;
        const differences = [];
        const compare = (field, live, stored) => {
            if (JSON.stringify(live) !== JSON.stringify(stored)) {
                differences.push(`${field}: server ${JSON.stringify(live)} vs store ${JSON.stringify(stored)}`);
            }
        };
        compare('instance', c.instance, entry.label);
        compare('preset', c.preset, entry.preset);
        compare('environment', c.environment, entry.environment);
        compare('maxRecords', c.maxRecords, entry.maxRecords);
        if (c.flags)
            compare('flags', c.flags, entry.flags);
        if (c.effectiveFlags)
            compare('effectiveFlags', c.effectiveFlags, entry.effectiveFlags);
        return differences.length === 0
            ? ok('SV-06', 'capabilities match the store', `${entry.label}: preset ${entry.preset}, ${entry.environment}, maxRecords ${entry.maxRecords}`)
            : fail('SV-06', 'capabilities match the store', differences.join('; '), 'the running server is not reading the store this doctor read — restart it, and check SNOW_STORE');
    },
};
// ─── SV-07 — the audit file is writable ──────────────────────────────────────
export const svAudit = {
    id: 'SV-07',
    title: 'audit trail',
    severity: 'warn',
    network: false,
    async run() {
        const p = resolveAuditPath();
        if (p === null) {
            return warn('SV-07', 'audit trail', 'disabled by SNOW_AUDIT_FILE=off — no §2.1 evidence is being kept', 'unset SNOW_AUDIT_FILE to record mutating calls again');
        }
        // Probe the DIRECTORY, not the file: the file may legitimately not exist yet, and a check
        // that only reported "no file" would be silent about the read-only volume that is the real
        // problem.
        const dir = dirname(p);
        try {
            accessSync(existsSync(p) ? p : dir, constants.W_OK);
            return ok('SV-07', 'audit trail', `${maskPath(p)}${existsSync(p) ? '' : ' (not created yet)'}`);
        }
        catch {
            return warn('SV-07', 'audit trail', `${maskPath(p)} is not writable — mutating calls will not be recorded`, `make ${maskPath(dir)} writable, or set SNOW_AUDIT_FILE to a path you own`);
        }
    },
};
// ─── SV-08 — ancestor .claude/skills directories ─────────────────────────────
/**
 * Every ancestor of `dir` that holds a `.claude/skills`.
 *
 * Ported from `scripts/ci/skill-listing-check.mjs`, which is the measured implementation behind
 * the S-13 addendum. Kept as a separate exported function so ARC-08 can re-home this check as
 * an engine check without moving the walk.
 */
export function pollutingAncestors(dir) {
    const found = [];
    let cur = resolve(dir);
    for (;;) {
        if (existsSync(join(cur, '.claude', 'skills')))
            found.push(cur);
        const up = dirname(cur);
        if (up === cur || cur === parse(cur).root)
            break;
        cur = up;
    }
    return found;
}
export const svAncestorSkills = {
    id: 'SV-08',
    title: 'ancestor skill directories',
    severity: 'warn',
    network: false,
    async run(ctx) {
        // The checkout's OWN `.claude/skills` is expected and is not the finding — the finding is
        // any directory ABOVE it, because Claude Code loads project skills from every one of them
        // and the roster silently doubles (S-13 addendum).
        const ancestors = pollutingAncestors(ctx.cwd).filter((p) => resolve(p) !== resolve(ctx.cwd));
        return ancestors.length === 0
            ? ok('SV-08', 'ancestor skill directories', 'no .claude/skills above the checkout')
            : warn('SV-08', 'ancestor skill directories', `skills are also loaded from: ${ancestors.map((p) => maskPath(p)).join(', ')} — `
                + 'the roster is larger than this repository defines and the listing budget is spent twice', 'move the checkout out from under those directories, or disable their skills with /skills');
    },
};
export const ALL_CHECKS = [
    svNodeFloor, svDist, svStore, svInstances, svProbes, svHandshake, svCapabilities, svAudit,
    svAncestorSkills,
];
/** Exported so a caller can resolve `dist/` the same way the checks do. */
export { distDir, pathToFileURL };
