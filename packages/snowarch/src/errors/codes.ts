/**
 * Every error code the server throws, with its remedy — one registry, so ARC-05's
 * TROUBLESHOOTING generator has a single truthful source instead of a prose sweep.
 *
 * `tests/errors/codes.test.ts` greps `src/` for every string literal passed as a code and
 * fails on one that is not here. That is what keeps this file honest: a registry nobody
 * checks drifts from the code within one story.
 */
export interface ErrorCode {
  code: string;
  /** What the caller does next. Empty only where nothing they can do would help. */
  remedy: string;
}

export const ERROR_CODES: ErrorCode[] = [
  // Permission gates — the remedy names the preset command, and the label is filled at throw time.
  { code: 'WRITE_NOT_ENABLED', remedy: './snowarch instance set-preset <label> pdi-developer' },
  { code: 'CMDB_WRITE_NOT_ENABLED', remedy: './snowarch instance set-preset <label> pdi-developer' },
  { code: 'SCRIPTING_NOT_ENABLED', remedy: './snowarch instance set-preset <label> pdi-developer' },
  { code: 'ATF_NOT_ENABLED', remedy: './snowarch instance set-preset <label> pdi-developer' },
  { code: 'NOW_ASSIST_NOT_ENABLED', remedy: './snowarch instance set-preset <label> full' },
  { code: 'FLUENT_NOT_ENABLED', remedy: './snowarch instance set-preset <label> full' },

  // Configuration.
  { code: 'NO_INSTANCE_CONFIGURED', remedy: '/snowarch setup-instance' },
  { code: 'INSTANCE_NOT_LOADED', remedy: 'read the reason in snow_core_status_read; usually ./snowarch instance set-preset <label> <preset> --ack-prod' },
  { code: 'UNKNOWN_INSTANCE', remedy: 'snow_core_instances_index lists the configured labels' },
  { code: 'PROD_WRITE_NOT_ACKNOWLEDGED', remedy: './snowarch instance set-preset <label> <preset> --ack-prod' },

  // The store.
  { code: 'STORE_NOT_FOUND', remedy: 'SNOW_STORE names a file that is not there; correct it or unset it' },
  { code: 'STORE_UNREADABLE', remedy: 'the store is not valid JSON; repair or recreate it' },
  { code: 'STORE_SCHEMA_INVALID', remedy: 'the message names the field path; correct it in the store' },
  { code: 'STORE_SCHEMA_UNSUPPORTED', remedy: './snowarch upgrade' },
  { code: 'STORE_PERMISSIONS_TOO_OPEN', remedy: 'the message carries the exact chmod' },

  // The instance answered, and said no.
  { code: 'AUTHENTICATION_FAILED', remedy: 'stop; ./snowarch instance set-credentials <label>' },
  { code: 'INSUFFICIENT_PRIVILEGES', remedy: 'the account lacks a ServiceNow role for this table; this is not a flag' },
  { code: 'NOT_FOUND', remedy: 'the record or table does not exist on this instance' },
  { code: 'RATE_LIMITED', remedy: 'retry later; reduce maxRecords or the call rate' },

  // The tool exists and the gate let it through, but the CAPABILITY does not exist over REST.
  // Distinct from NOT_FOUND (a record) and from a gate (a flag the user can turn on): nothing
  // the caller configures makes these work, so the remedy names the other route instead.
  { code: 'UNSUPPORTED_ON_THIS_INSTANCE', remedy: 'no REST endpoint backs this operation; the message names the UI route that does (e.g. Scripts - Background, or a Fix Script)' },

  // The call itself.
  { code: 'UNKNOWN_TOOL', remedy: 'the name exists in no configuration; check the spelling' },
  { code: 'INVALID_REQUEST', remedy: 'the message names the missing or malformed argument' },
  { code: 'VALIDATION_ERROR', remedy: 'the message names the argument and the expected shape' },
  { code: 'NOT_IMPLEMENTED', remedy: 'the surface was removed; the message names what replaced it' },

  // Transport and the instance being unreachable.
  { code: 'ENOTFOUND', remedy: 'the instance host does not resolve; check the url in the store' },
  { code: 'ECONNREFUSED', remedy: 'the instance refused the connection; check the url and any proxy' },
  { code: 'ETIMEDOUT', remedy: 'the instance did not answer in time' },
  { code: 'REQUEST_FAILED', remedy: 'the message carries the instance response' },

  // Failures the instance reported while carrying out the call. Their remedy is rarely a
  // command — the message carries the instance's own words, which is what a reader needs.
  { code: 'CREATE_FAILED', remedy: 'the message carries the instance response' },
  { code: 'UPDATE_FAILED', remedy: 'the message carries the instance response' },
  { code: 'DELETE_FAILED', remedy: 'the message carries the instance response' },
  { code: 'QUERY_FAILED', remedy: 'the message carries the instance response' },
  { code: 'BATCH_FAILED', remedy: 'one or more requests in the batch failed; the message lists them' },
  { code: 'ATTACHMENT_UPLOAD_FAILED', remedy: 'check the file size and the target record' },
  { code: 'SCRIPT_FAILED', remedy: 'the script ran and errored; the message carries the instance output' },
  { code: 'DELETE_ACL_DENIED', remedy: 'the account lacks delete access to that table; this is not a flag' },
  { code: 'DELETE_CONSTRAINT', remedy: 'another record references it; remove the reference first' },
  { code: 'DELETE_NOT_FOUND', remedy: 'nothing to delete at that sys_id' },

  // Fluent and Now Assist, where the cause is the environment rather than the request.
  { code: 'FLUENT_NOT_INSTALLED', remedy: 'install @servicenow/sdk in the checkout' },
  { code: 'FLUENT_ERROR', remedy: 'the message carries the SDK output' },
  { code: 'NOW_ASSIST_ERROR', remedy: 'the message carries the instance response; check the Now Assist licence' },

  // Internal invariants. A caller cannot act on these; they mean the server has a defect,
  // and they are registered so the generator can say exactly that rather than omit them.
  { code: 'SCHEMA_NOT_CACHED', remedy: 'call the schema read tool for that table first' },
  { code: 'INSTANCE_UNUSABLE', remedy: 'the store entry parsed but a client could not be built; the message says why' },
  { code: 'UNKNOWN_GATE', remedy: 'server defect: a tool declares a gate the evaluator does not know' },
  { code: 'NETWORK_ERROR', remedy: 'the instance was unreachable; the message carries the cause' },
];

export const ERROR_CODE_NAMES: ReadonlySet<string> = new Set(ERROR_CODES.map((e) => e.code));
