/**
 * ARC-07-S04 — propose, review, apply. Nothing is imposed and nothing is decided by a probe.
 *
 * D-05, and it is worth being exact about what it rules, because the temptation runs the other
 * way: THE PROPOSAL IS A FUNCTION OF THE ENVIRONMENT ALONE. A probe that came back `not licensed`
 * changes the RECOMMENDATION TEXT on that line and never the toggle — because a probe is a
 * reading of the instance at one moment, and a wizard that silently turned a flag off on the
 * strength of one would produce an installation the user did not choose and cannot explain.
 *
 * Production is capped at `read-only` here with no override at all. Raising it is a separate,
 * named step in a different command (`set-preset --ack-prod`, ARC-07-S06), which is the point:
 * the moment you can raise production inside a wizard, raising production becomes something that
 * happens while you are doing something else.
 */
import { FLAG_NAMES, PRESETS, applyDependencyRule, dependentsOf, expandPreset, matchPreset, requiresOf, } from '../utils/permissions.js';
/** Every line this screen prints fits here. A wrapped hint is indented under its annotation. */
export const COLUMNS = 100;
/** The short label a reader sees, derived from the flag key — never a second list to maintain. */
export const labelOf = (flag) => flag.replace(/_ENABLED$/, '');
/** The widest label, so the annotations line up without a hard-coded column. */
const LABEL_WIDTH = Math.max(...FLAG_NAMES.map((f) => labelOf(f).length));
/**
 * What `?` prints. Kept beside the screen that prints it, and asserted against
 * `docs/MODES-AND-PRESETS.md` §4 — one meaning per flag, in the page's own words.
 */
export const FLAG_MEANINGS = Object.freeze({
    WRITE_ENABLED: 'create, update and delete records (incidents, catalog items, users, agile work, '
        + 'update sets). Without it everything is read-only.',
    CMDB_WRITE_ENABLED: 'additionally, CI and relationship reconciliation writes into the CMDB.',
    SCRIPTING_ENABLED: 'unlocks writing Script Includes, Business Rules, Client Scripts, ACLs, UI '
        + 'Actions and update-set changes. Reading them is always allowed.',
    ATF_ENABLED: 'execute ATF tests and suites; authoring and reading are always allowed.',
    NOW_ASSIST_ENABLED: 'the Now Assist / generative-AI tools; needs a Now Assist licence on the '
        + 'instance.',
    FLUENT_ENABLED: 'the ServiceNow SDK (Fluent) build and deploy tools; needs @servicenow/sdk, and '
        + 'deploys also need WRITE.',
});
/** P-25: written on every entry, whatever the preset. One constant, consumed by S05's save. */
export const ENTRY_DEFAULTS = Object.freeze({ toolPackage: 'full', maxRecords: 100 });
/** The proposal. The environment, and nothing else — see the note at the top of this file. */
export function proposePreset(environment) {
    return environment === 'prod' ? 'read-only' : 'full';
}
export const PROD_LOCKED = (label, flag) => `${labelOf(flag)} is locked on production — raise it later with: ./snowarch instance set-preset `
    + `${label} <preset> --ack-prod`;
/** The refusal, in the story's words. Exit 3 — a policy answer, not a usage mistake. */
export const prodRefusal = (label) => `PROD_WRITE_NOT_ACKNOWLEDGED — "${label}" is a production instance; the wizard caps production `
    + `at read-only (D-05). Save it read-only now and raise it later with: ./snowarch instance `
    + `set-preset ${label} full --ack-prod`;
/**
 * The probe annotation for one flag.
 *
 * `ok` is one word; everything else says what was found AND what it would mean to leave the flag
 * on — a recommendation the user is free to ignore, which is the whole shape of this screen.
 */
export function annotate(status, hint) {
    switch (status) {
        case 'ok': return 'probe: ok';
        case 'role missing':
            return `probe: role missing — ${hint ?? 'the account cannot read that table family'}; `
                + 'keep on? (recommend: off)';
        case 'not licensed':
            return 'probe: no Now Assist licence detected — tools will fail until licensed; keep on? '
                + '(recommend: off)';
        case 'not installed':
            return 'probe: @servicenow/sdk not on PATH — keep on? (recommend: off)';
        case 'skipped': return 'probe: skipped';
        case undefined: return 'probe: not run';
        default: return `probe: ${status}`;
    }
}
/** The `LastProbe` field that carries a flag's result. One mapping, used by the screen and S05. */
export const PROBE_FIELD = Object.freeze({
    WRITE_ENABLED: 'write',
    CMDB_WRITE_ENABLED: 'cmdb',
    SCRIPTING_ENABLED: 'scripting',
    ATF_ENABLED: 'atf',
    NOW_ASSIST_ENABLED: 'nowAssist',
    FLUENT_ENABLED: 'fluent',
});
/**
 * Wrap `text` to `width`, on word boundaries.
 *
 * Truncation is not an option: the part of a hint that gets cut is the part that says what to do
 * about it, and a reader cannot tell anything is missing. A word longer than the width is left
 * whole and allowed to overflow — breaking a URL or a table name in half helps nobody.
 */
export function wrapText(text, width) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (candidate.length > width && current !== '') {
            lines.push(current);
            current = word;
        }
        else {
            current = candidate;
        }
    }
    if (current !== '')
        lines.push(current);
    return lines.length > 0 ? lines : [''];
}
/**
 * One flag row: a FIXED prefix and a wrapped annotation under it.
 *
 * Wrapping the whole row as one string was the first attempt, and it collapsed the column
 * padding — `NOW_ASSIST` sat one space from its annotation while every other row lined up,
 * because the padding is consecutive spaces and a word-wrapper eats those. The prefix is
 * therefore never wrapped; only the text after it is.
 */
export function wrapRow(prefix, note, columns = COLUMNS) {
    const width = Math.max(20, columns - prefix.length);
    const [first, ...rest] = wrapText(note, width);
    return [prefix + first, ...rest.map((line) => ' '.repeat(prefix.length) + line)];
}
/** The screen, byte for byte. The snapshot files in `docs/snippets/` are this function's output. */
export function renderReviewScreen(input) {
    const { label, environment, preset, flags, probes, hints } = input;
    const prod = environment === 'prod';
    const lines = [];
    lines.push(prod
        ? `Proposed preset for "${label}" (${environment}): ${preset}  — production is capped at `
            + 'read-only (D-05)'
        : `Proposed preset for "${label}" (${environment}): ${preset}  — non-production: everything on`);
    for (const flag of FLAG_NAMES) {
        const box = !prod && flags[flag] === 'true' ? '[x]' : '[ ]';
        const name = labelOf(flag).padEnd(LABEL_WIDTH + 2);
        const note = prod
            ? 'locked on production'
            : annotate(probes?.[PROBE_FIELD[flag]], hints?.[flag]);
        lines.push(...wrapRow(`  ${box} ${name} `, note));
    }
    // The story's footer is 111 characters and the budget is 100, so it WRAPS — the same rule as a
    // long hint, and for the same reason: a terminal that folds it in the middle of a word is
    // harder to read than one continuation line.
    const footer = prod
        ? `Enter = accept · to raise this instance later: ./snowarch instance set-preset ${label} `
            + '<preset> --ack-prod'
        : 'Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset · '
            + '"?" explains the flags';
    lines.push(...wrapRow('', footer));
    return lines.join('\n');
}
/** `Applying: preset custom — WRITE=on CMDB_WRITE=on …` — printed before anything is saved. */
export function applyingLine(preset, flags) {
    const pairs = FLAG_NAMES.map((f) => `${labelOf(f)}=${flags[f] === 'true' ? 'on' : 'off'}`);
    return `Applying: preset ${preset} — ${pairs.join(' ')}`;
}
/**
 * `--flags WRITE=on,CMDB_WRITE=on,…` — all six, or it is not a description of an installation.
 *
 * Five entries is a usage error naming the missing flag rather than a default for it: the whole
 * point of the flag form is that a machine said exactly what it wanted, and filling in the sixth
 * would be the wizard choosing while claiming the caller did.
 */
export function parseFlagsArg(raw) {
    const given = new Map();
    for (const part of String(raw).split(',').map((s) => s.trim()).filter(Boolean)) {
        const [key, value] = part.split('=').map((s) => s.trim());
        const flag = FLAG_NAMES.find((f) => labelOf(f).toLowerCase() === String(key).toLowerCase()
            || f.toLowerCase() === String(key).toLowerCase());
        if (!flag)
            return { ok: false, message: `--flags: "${key}" is not a flag (expected ${FLAG_NAMES.map(labelOf).join(', ')})` };
        const on = ['on', 'true'].includes(String(value).toLowerCase());
        const off = ['off', 'false'].includes(String(value).toLowerCase());
        if (!on && !off)
            return { ok: false, message: `--flags: ${labelOf(flag)}=${value} — expected on or off` };
        given.set(flag, on ? 'true' : 'false');
    }
    const missing = FLAG_NAMES.filter((f) => !given.has(f));
    if (missing.length > 0) {
        return { ok: false,
            message: `--flags needs all six flags; missing: ${missing.map(labelOf).join(', ')}` };
    }
    const flags = Object.fromEntries(FLAG_NAMES.map((f) => [f, given.get(f)]));
    const violation = dependencyViolation(flags);
    return violation ? { ok: false, message: violation } : { ok: true, flags };
}
/** The dependency rule as a sentence, or null. The UI's copy of the server's own rule. */
export function dependencyViolation(flags) {
    // The graph is `permissions.ts`'s (ARC-07-S05 carry-over): this file used to re-encode "WRITE ←
    // CMDB_WRITE, SCRIPTING" as literals, which is a second definition of a rule the server already
    // owns — and the copy nobody would think to update when a third dependency appears.
    for (const flag of FLAG_NAMES) {
        if (flags[flag] !== 'true')
            continue;
        const unmet = requiresOf(flag).filter((needed) => flags[needed] !== 'true');
        if (unmet.length > 0) {
            return `${labelOf(flag)} requires ${unmet.map(labelOf).join(' and ')} — scripting and CMDB `
                + 'writes are writes, so declaring one without WRITE is a contradiction';
        }
    }
    return null;
}
/**
 * The screen, until Enter.
 *
 * Case-insensitive because the labels are shouted in the screen and typed in lower case by
 * everyone. `q` and end-of-input both cancel, and cancelling saves nothing — which is why the
 * result says so rather than returning a preset the caller might write.
 */
export async function runReviewScreen(input, io) {
    const prod = input.environment === 'prod';
    let flags = { ...input.flags };
    let preset = input.preset;
    for (;;) {
        io.write(`${renderReviewScreen({ ...input, preset, flags })}\n`);
        const answer = await io.ask('> ');
        if (answer === null)
            return { preset, flags, cancelled: true };
        const line = answer.trim();
        const lower = line.toLowerCase();
        if (line === '') {
            const effective = prod ? expandPreset('read-only') : flags;
            return { preset: prod ? 'read-only' : matchPreset(effective), flags: effective };
        }
        if (lower === 'q')
            return { preset, flags, cancelled: true };
        if (lower === '?' || lower === 'help') {
            for (const flag of FLAG_NAMES) {
                io.write(`${wrapRow(`  ${labelOf(flag)} — `, FLAG_MEANINGS[flag]).join('\n')}\n`);
            }
            continue;
        }
        if (lower.startsWith('preset ')) {
            const name = lower.slice('preset '.length).trim();
            if (!(name in PRESETS) && name !== 'custom') {
                io.write(`unknown preset "${name}" — one of: ${[...Object.keys(PRESETS), 'custom'].join(', ')}\n`);
                continue;
            }
            if (prod && name !== 'read-only') {
                // Whichever flag the user reached for; the first is as good a stand-in as any when they
                // asked for a preset rather than a flag.
                io.write(`${PROD_LOCKED(input.label, FLAG_NAMES[0])}\n`);
                continue;
            }
            preset = name;
            flags = expandPreset(preset);
            continue;
        }
        const flag = FLAG_NAMES.find((f) => labelOf(f).toLowerCase() === lower || f.toLowerCase() === lower);
        if (!flag) {
            io.write(`"${line}" is not a flag or a command — Enter to accept, a flag name to toggle, `
                + '"preset <name>" to switch, "?" for help\n');
            continue;
        }
        if (prod) {
            io.write(`${PROD_LOCKED(input.label, flag)}\n`);
            continue;
        }
        flags = await toggle(flags, flag, io);
        preset = matchPreset(flags);
    }
}
/**
 * One toggle, and the conversation the dependency rule needs.
 *
 * `n` keeps the state the story asks for in each direction: turning WRITE off with dependents on
 * leaves WRITE ON (the alternative is a contradiction the server would resolve by force), and
 * turning a dependent on with WRITE off leaves BOTH OFF.
 */
async function toggle(current, flag, io) {
    const next = { ...current, [flag]: current[flag] === 'true' ? 'false' : 'true' };
    // Turning something OFF that others need.
    if (next[flag] === 'false') {
        const stranded = dependentsOf(flag).filter((f) => next[f] === 'true');
        if (stranded.length > 0) {
            const answer = await io.ask(`${stranded.map(labelOf).join(' and ')} require ${labelOf(flag)} — turn them off as well? [Y/n] `);
            if (isNo(answer))
                return current; // the needed flag stays on
            for (const f of stranded)
                next[f] = 'false';
        }
    }
    // Turning something ON that needs others.
    if (next[flag] === 'true') {
        const unmet = requiresOf(flag).filter((needed) => next[needed] !== 'true');
        if (unmet.length > 0) {
            const answer = await io.ask(`${labelOf(flag)} requires ${unmet.map(labelOf).join(' and ')} — turn `
                + `${unmet.length === 1 ? 'it' : 'them'} on too? [Y/n] `);
            if (isNo(answer))
                return current; // both stay off
            for (const f of unmet)
                next[f] = 'true';
        }
    }
    // The server's rule, applied again here: the screen must never show a state the server would
    // refuse to honour.
    return applyDependencyRule(next).effective;
}
const isNo = (answer) => ['n', 'no'].includes(String(answer ?? '').trim().toLowerCase());
/**
 * The whole decision, with nothing written.
 *
 * S05 owns the save; this owns what would be saved, and returns BEFORE any store call on every
 * refusal path — which is what makes "writes nothing" testable here rather than only end to end.
 */
export async function resolveFlags(input) {
    const { label, environment, yes, io } = input;
    const prod = environment === 'prod';
    let flags;
    let preset;
    if (input.flags !== undefined) {
        const parsed = parseFlagsArg(input.flags);
        if (!parsed.ok)
            return { ok: false, exitCode: 2, message: parsed.message };
        flags = parsed.flags;
        preset = matchPreset(flags);
    }
    else if (input.preset !== undefined) {
        const name = String(input.preset).toLowerCase();
        if (!(name in PRESETS) && name !== 'custom') {
            return { ok: false, exitCode: 2,
                message: `--preset must be one of ${[...Object.keys(PRESETS), 'custom'].join(', ')}, not "${input.preset}"` };
        }
        preset = name;
        flags = expandPreset(preset);
    }
    else {
        preset = proposePreset(environment);
        flags = expandPreset(preset);
    }
    // The production cap, before anything else looks at the flags: a `prod` instance with any flag
    // on is a policy answer, not a preference to review.
    if (prod && FLAG_NAMES.some((f) => flags[f] === 'true')) {
        const message = prodRefusal(label);
        if (yes)
            return { ok: false, exitCode: 3, message };
        if (!io)
            return { ok: false, exitCode: 3, message };
        io.write(`${message}\n`);
        const answer = await io.ask(`Save "${label}" as read-only instead? [Y/n] `);
        if (isNo(answer))
            return { ok: false, exitCode: 3, message };
        const readOnly = expandPreset('read-only');
        return { ok: true, preset: 'read-only', flags: readOnly,
            applying: applyingLine('read-only', readOnly) };
    }
    if (prod) {
        preset = 'read-only';
        flags = expandPreset('read-only');
    }
    if (yes || !io) {
        return { ok: true, preset, flags, applying: applyingLine(preset, flags) };
    }
    const reviewed = await runReviewScreen({
        label, environment, preset, flags,
        ...(input.probes ? { probes: input.probes } : {}),
        ...(input.hints ? { hints: input.hints } : {}),
    }, io);
    if (reviewed.cancelled) {
        return { ok: false, exitCode: 130, message: 'Cancelled — nothing saved.' };
    }
    return { ok: true, preset: reviewed.preset, flags: reviewed.flags,
        applying: applyingLine(reviewed.preset, reviewed.flags) };
}
