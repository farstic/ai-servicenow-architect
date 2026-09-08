export const ERROR_CODES = [
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
    // The network, before the instance answers at all (R-3, ARC-04-S11). `classifyNetworkError`
    // produces these; the per-call remedy it returns is longer and names the proxy actually set.
    { code: 'DNS_FAILURE', remedy: 'the host name did not resolve; check the spelling, and set HTTPS_PROXY on a corporate network' },
    { code: 'TLS_CA_UNTRUSTED', remedy: 'export your organisation root CA as PEM and set NODE_EXTRA_CA_CERTS to it; never disable certificate verification' },
    { code: 'PROXY_UNREACHABLE', remedy: 'nothing is listening at the proxy named by HTTPS_PROXY/HTTP_PROXY; correct it or unset it' },
    { code: 'CONNECTION_REFUSED', remedy: 'the instance refused the connection; check the URL, its port, and whether the instance is awake' },
    { code: 'CONNECTION_TIMEOUT', remedy: 'the connection timed out; set HTTPS_PROXY on a corporate network, else check connectivity' },
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
export const ERROR_CODE_NAMES = new Set(ERROR_CODES.map((e) => e.code));
