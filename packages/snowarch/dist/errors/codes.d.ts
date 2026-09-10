/**
 * Every error code the server throws: one meaning, one remedy, one command.
 *
 * The rule file, `docs/TROUBLESHOOTING.md`, `governance/mcp-protocols.md`, the wizard and the doctor
 * all render from this table. There is no second remedy text anywhere, which is the point: a remedy
 * repeated in five documents is five things to correct and four that will not be.
 *
 * `ServiceNowError` takes `ErrorCodeName`, so an unregistered literal is a compile error rather than
 * a string that reaches a user with no remedy attached. `tests/errors/codes.test.ts` scans `src/`
 * for thrown literals as the second, independent check — a type can be widened by accident, and the
 * scan notices when it has been.
 *
 * Four fields carry the load:
 *   meaning      what happened, in the reader's terms, not the thrower's
 *   remedy       what to do; prose, because most remedies are a judgement rather than a command
 *   command      set ONLY when there is something runnable; renderers set it as code, and they
 *                never parse `remedy` looking for one
 *   showInRule   the code appears in the always-loaded rule file. Nineteen do: the six flag gates
 *                as one wildcard line, plus the thirteen a session can act on mid-task — seven of
 *                them the network family (ARC-08-S10), because a session that meets DNS, TLS or a
 *                refused connection mid-task must stop and hand over exactly as it does for a
 *                wrong password
 *   httpStatus   the status the instance returned, where the code maps to one
 */
export interface ErrorCode {
    code: string;
    /** What happened, in the reader's terms. */
    meaning: string;
    /** What the caller does next. Prose; empty only where nothing they could do would help. */
    remedy: string;
    /** A runnable command, when one exists. Rendered as code; never parsed out of `remedy`. */
    command?: string;
    /** Shown in `.claude/rules/00-mode-and-mcp-gate.md`, which is always loaded and must stay short. */
    showInRule: boolean;
    /** The HTTP status the instance returned, where this code maps to one. */
    httpStatus?: number;
}
export declare const ERROR_CODES: readonly [{
    readonly code: "WRITE_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable WRITE_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "CMDB_WRITE_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable CMDB_WRITE_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "SCRIPTING_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable SCRIPTING_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "ATF_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable ATF_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> pdi-developer";
    readonly showInRule: true;
}, {
    readonly code: "NOW_ASSIST_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable NOW_ASSIST_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> full";
    readonly showInRule: true;
}, {
    readonly code: "FLUENT_NOT_ENABLED";
    readonly meaning: "The instance's preset does not enable FLUENT_ENABLED.";
    readonly remedy: "raise the preset; a `prod` instance additionally needs `--ack-prod`";
    readonly command: "./snowarch instance set-preset <label> full";
    readonly showInRule: true;
}, {
    readonly code: "NO_INSTANCE_CONFIGURED";
    readonly meaning: "The server is running and healthy; it has no instance to talk to. It stays up on purpose — an unconfigured checkout used to exit at start-up, so the moment you most needed the server to explain itself was the moment it was gone. Five tools still work: status, capabilities, reload, the instance listing and the current instance.";
    readonly remedy: "add an instance, then call the reload tool — Claude Code does not need restarting, the server re-advertises its catalogue in the same session";
    readonly command: "/snowarch setup-instance";
    readonly showInRule: true;
}, {
    readonly code: "INSTANCE_NOT_LOADED";
    readonly meaning: "The instance is in the store but was not loaded, and the store carries the reason.";
    readonly remedy: "read the reason in the instance listing; a `prod` instance without `prodWriteAck` needs the acknowledgement";
    readonly command: "./snowarch instance list";
    readonly showInRule: true;
}, {
    readonly code: "UNKNOWN_INSTANCE";
    readonly meaning: "No instance in the store carries that label.";
    readonly remedy: "the listing prints the labels that exist";
    readonly command: "./snowarch instance list";
    readonly showInRule: false;
}, {
    readonly code: "FLAGS_INCOMPLETE";
    readonly meaning: "A store entry does not state all six capability flags. An absent flag is off, so the entry works — but nobody can tell an intended `false` from a forgotten one, and the next preset change starts from a guess.";
    readonly remedy: "state every flag explicitly by re-applying a preset — the review screen shows what changes before anything is written";
    readonly command: "./snowarch instance set-preset <label> <preset>";
    readonly showInRule: false;
}, {
    readonly code: "FLAG_DEPENDENCY_VIOLATION";
    readonly meaning: "A flag that requires `WRITE_ENABLED` is on while `WRITE_ENABLED` is off. The tools gated on it are refused at run time and the refusal names WRITE first, so the entry promises a capability it cannot deliver.";
    readonly remedy: "decide which one was meant: turn WRITE on, or turn the dependent flag off. Neither is guessable from the store, so this is never repaired automatically";
    readonly command: "./snowarch instance set-preset <label> <preset>";
    readonly showInRule: false;
}, {
    readonly code: "PROD_WRITE_NOT_ACKNOWLEDGED";
    readonly meaning: "The instance is tagged `environment: prod` and holds a write preset without `prodWriteAck: true`.";
    readonly remedy: "A production instance is capped at read-only. Do not suggest editing the store; the user raises it with ./snowarch instance set-preset <label> <preset> --ack-prod in their terminal";
    readonly showInRule: true;
}, {
    readonly code: "STORE_NOT_FOUND";
    readonly meaning: "`SNOW_STORE` names a file that is not there — an explicit override is never a fallback.";
    readonly remedy: "correct the variable, unset it, or create the store";
    readonly command: "/snowarch setup-instance";
    readonly showInRule: false;
}, {
    readonly code: "STORE_UNREADABLE";
    readonly meaning: "The store exists but is not valid JSON.";
    readonly remedy: "repair or recreate it; the message names the parse error";
    readonly showInRule: false;
}, {
    readonly code: "STORE_SCHEMA_INVALID";
    readonly meaning: "The store parsed but a field is wrong; the message names its path, for example `instances.pdi.flags.WRITE_ENABLED`.";
    readonly remedy: "the message names the field path; correct it in the store";
    readonly showInRule: false;
}, {
    readonly code: "STORE_SCHEMA_UNSUPPORTED";
    readonly meaning: "The store was written by a newer server than this one.";
    readonly remedy: "upgrade this checkout, rather than editing the store down";
    readonly command: "./snowarch upgrade";
    readonly showInRule: false;
}, {
    readonly code: "STORE_PERMISSIONS_TOO_OPEN";
    readonly meaning: "The store holds a password and is group/world-readable, or sits in a group/world-writable directory (D-04).";
    readonly remedy: "tighten the mode; on Windows the check is skipped and the doctor notes it instead";
    readonly command: "chmod 600 .local/instances.json";
    readonly showInRule: false;
}, {
    readonly code: "AUTHENTICATION_FAILED";
    readonly meaning: "The instance rejected the credentials — wrong, expired, or the account is locked.";
    readonly remedy: "If a ServiceNow tool returns AUTHENTICATION_FAILED: stop immediately. Do not retry that call or make any other call to the same instance — repeated failed logins can lock the account. Tell the user to run ./snowarch instance test <label> and, if it fails, ./snowarch instance set-credentials <label>. Continue only after the user says the credentials were fixed";
    readonly showInRule: true;
    readonly httpStatus: 401;
}, {
    readonly code: "INSUFFICIENT_PRIVILEGES";
    readonly meaning: "The account is authenticated but lacks a ServiceNow role for that table or operation. This is not a flag.";
    readonly remedy: "The credentials are valid but the account lacks a role for this table. Report the tool, the table and the roles the preset needs (see docs/TROUBLESHOOTING.md); do not switch instances or retry with another tool to work around it";
    readonly showInRule: true;
    readonly httpStatus: 403;
}, {
    readonly code: "NOT_FOUND";
    readonly meaning: "The record or table does not exist on this instance.";
    readonly remedy: "check the sys_id and the table name";
    readonly showInRule: false;
    readonly httpStatus: 404;
}, {
    readonly code: "RATE_LIMITED";
    readonly meaning: "The instance is throttling this account.";
    readonly remedy: "retry later; reduce `maxRecords` or the call rate";
    readonly showInRule: false;
    readonly httpStatus: 429;
}, {
    readonly code: "DNS_FAILURE";
    readonly meaning: "The instance host name did not resolve (`ENOTFOUND`, `EAI_AGAIN`).";
    readonly remedy: "the name `<host>` does not resolve. Check the instance name first — a typo is the usual cause; on a corporate network the name may resolve only over VPN, or only through a proxy, so set `HTTPS_PROXY` if there is one (there is one — `<proxyVar>=<proxy>` — and a proxy does not resolve names for you unless the request goes through it, which makes a wrong name the likelier cause)";
    readonly showInRule: true;
}, {
    readonly code: "TLS_CA_UNTRUSTED";
    readonly meaning: "The certificate was not signed by a CA this machine trusts — normal on a network that intercepts TLS.";
    readonly remedy: "the certificate presented for `<host>` is not trusted by Node (issuer: `<issuer>`) — typically a TLS-intercepting gateway, or an expired certificate. Export the gateway root CA as PEM, point `NODE_EXTRA_CA_CERTS` at it for the shell that runs ./snowarch and in `.claude/settings.local.json` → `env` so the server gets it too, and restart — Node reads it once, at process start. Never `NODE_TLS_REJECT_UNAUTHORIZED=0`: it disables verification for the whole process, which on an intercepting network means trusting the interceptor and every other certificate with it";
    readonly command: "export NODE_EXTRA_CA_CERTS=<path to the PEM>";
    readonly showInRule: true;
}, {
    readonly code: "PROXY_UNREACHABLE";
    readonly meaning: "A proxy variable is set and nothing is listening there, or the connection to it timed out.";
    readonly remedy: "the proxy `<proxyVar>=<proxy>` did not connect to `<host>`. Check the proxy address and credentials, and that `<host>` is not excluded by `NO_PROXY` — or unset the variable if you are not behind a proxy. The proxy is printed with any credentials masked";
    readonly showInRule: true;
}, {
    readonly code: "CONNECTION_REFUSED";
    readonly meaning: "The instance refused the connection and no proxy is configured.";
    readonly remedy: "`<host>` refused the connection — the instance may be hibernated (PDIs sleep after inactivity: wake it at developer.servicenow.com) or blocked by a firewall. Check the URL and its port too";
    readonly showInRule: true;
}, {
    readonly code: "CONNECTION_TIMEOUT";
    readonly meaning: "The connection timed out with no proxy configured.";
    readonly remedy: "no answer from `<host>` in time. If this network needs a proxy, set `HTTPS_PROXY=http://proxy:port` (and `NO_PROXY` for internal hosts) and run again. An idle PDI may be hibernating — wake it at developer.servicenow.com";
    readonly showInRule: true;
}, {
    readonly code: "NETWORK_ERROR";
    readonly meaning: "The instance was unreachable and the cause did not match a more specific classification.";
    readonly remedy: "the message carries the underlying cause";
    readonly showInRule: false;
}, {
    readonly code: "UNSUPPORTED_ON_THIS_INSTANCE";
    readonly meaning: "The tool is registered, the preset let it through, and the server refused without contacting the instance: the operation has no REST endpoint on any instance. The two script-execution stubs stay registered because removing the names would turn a clear refusal into UNKNOWN_TOOL, which reads as \"you spelled it wrong\" and sends you hunting a typo that is not there. They fail before any HTTP request, so nothing reaches the instance and nothing is half-done.";
    readonly remedy: "take the other route: run the script in System Definition > Scripts - Background, or author a Fix Script and run it from the UI. Keep `sys_script_fix.name` to 40 characters — it truncates silently over REST (see `docs/PLATFORM-NOTES.md` PN-07)";
    readonly showInRule: false;
}, {
    readonly code: "UNKNOWN_TOOL";
    readonly meaning: "A retired or misspelled tool name.";
    readonly remedy: "use the `snow_*` name from `governance/mcp-protocols.md`; maintainers: `npm run lint:contract`";
    readonly showInRule: true;
}, {
    readonly code: "INVALID_REQUEST";
    readonly meaning: "An argument is missing or malformed.";
    readonly remedy: "the message names the argument";
    readonly showInRule: false;
}, {
    readonly code: "VALIDATION_ERROR";
    readonly meaning: "An argument is present but not the expected shape.";
    readonly remedy: "the message names the argument and the shape";
    readonly showInRule: false;
}, {
    readonly code: "NOT_IMPLEMENTED";
    readonly meaning: "The surface was removed.";
    readonly remedy: "the message names what replaced it";
    readonly showInRule: false;
}, {
    readonly code: "ENOTFOUND";
    readonly meaning: "A DNS failure surfaced with the Node identifier rather than the classified code.";
    readonly remedy: "as `DNS_FAILURE`: check the host in the store";
    readonly showInRule: false;
}, {
    readonly code: "ECONNREFUSED";
    readonly meaning: "A refused connection surfaced with the Node identifier.";
    readonly remedy: "as `CONNECTION_REFUSED`: check the URL, the port and any proxy";
    readonly showInRule: false;
}, {
    readonly code: "ETIMEDOUT";
    readonly meaning: "A timeout surfaced with the Node identifier.";
    readonly remedy: "as `CONNECTION_TIMEOUT`";
    readonly showInRule: false;
}, {
    readonly code: "REQUEST_FAILED";
    readonly meaning: "The request failed and the instance response is the only information there is.";
    readonly remedy: "the message carries that response";
    readonly showInRule: false;
}, {
    readonly code: "CREATE_FAILED";
    readonly meaning: "The instance refused the create.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "UPDATE_FAILED";
    readonly meaning: "The instance refused the update.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "QUERY_FAILED";
    readonly meaning: "The instance refused the query.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_FAILED";
    readonly meaning: "The instance refused the delete.";
    readonly remedy: "the message carries the instance response";
    readonly showInRule: false;
}, {
    readonly code: "BATCH_FAILED";
    readonly meaning: "One or more requests in the batch failed.";
    readonly remedy: "the message lists which";
    readonly showInRule: false;
}, {
    readonly code: "ATTACHMENT_UPLOAD_FAILED";
    readonly meaning: "The attachment was not stored.";
    readonly remedy: "check the file size and that the target record exists";
    readonly showInRule: false;
}, {
    readonly code: "SCRIPT_FAILED";
    readonly meaning: "The script ran and errored.";
    readonly remedy: "the message carries the instance output";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_ACL_DENIED";
    readonly meaning: "The account lacks delete access to that table. This is not a flag.";
    readonly remedy: "use an account with the role";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_CONSTRAINT";
    readonly meaning: "Another record references it.";
    readonly remedy: "remove the reference first";
    readonly showInRule: false;
}, {
    readonly code: "DELETE_NOT_FOUND";
    readonly meaning: "Nothing exists at that sys_id to delete.";
    readonly remedy: "check the sys_id";
    readonly showInRule: false;
}, {
    readonly code: "FLUENT_NOT_INSTALLED";
    readonly meaning: "The ServiceNow SDK is not on `PATH`.";
    readonly remedy: "install it globally — the doctor checks `PATH`, so a checkout-local install would pass here and fail there";
    readonly command: "npm i -g @servicenow/sdk";
    readonly showInRule: true;
}, {
    readonly code: "FLUENT_ERROR";
    readonly meaning: "The SDK ran and failed.";
    readonly remedy: "the message carries the SDK output";
    readonly showInRule: false;
}, {
    readonly code: "NOW_ASSIST_ERROR";
    readonly meaning: "A Now Assist call failed.";
    readonly remedy: "the message carries the instance response; check the Now Assist licence on the instance";
    readonly showInRule: false;
}, {
    readonly code: "SCHEMA_NOT_CACHED";
    readonly meaning: "A tool needed a table schema that has not been read this session.";
    readonly remedy: "call the schema read tool for that table first";
    readonly showInRule: false;
}, {
    readonly code: "INSTANCE_UNUSABLE";
    readonly meaning: "The store entry parsed but no client could be built from it.";
    readonly remedy: "the message says which field is impossible";
    readonly showInRule: false;
}, {
    readonly code: "UNKNOWN_GATE";
    readonly meaning: "Server defect: a tool declares a gate the evaluator does not know.";
    readonly remedy: "report it; no user action can help";
    readonly showInRule: false;
}, {
    readonly code: "PROXY_AUTH_REQUIRED";
    readonly meaning: "The proxy answered 407: it wants credentials before it will forward the request.";
    readonly remedy: "the proxy is asking for credentials: put them in the proxy URL (`HTTPS_PROXY=http://user:pass@proxy:port`). NTLM and Kerberos proxies are not supported — the request has to reach the instance through a proxy that accepts basic credentials";
    readonly showInRule: true;
    readonly httpStatus: 407;
}, {
    readonly code: "LEGACY_STORE_NOT_FOUND";
    readonly meaning: "There is no snow-mcp 1.x store at the path the import was pointed at.";
    readonly remedy: "check the path, or pass `--path <file>` if the legacy store was kept somewhere else; `./snowarch doctor` reports where it looked";
    readonly command: "./snowarch instance import --from-legacy --path <file> --dry-run";
    readonly showInRule: false;
}, {
    readonly code: "LEGACY_STORE_UNREADABLE";
    readonly meaning: "The legacy store is not JSON this reader can parse.";
    readonly remedy: "open it and check it is a complete JSON object; a half-written file from an interrupted 1.x session cannot be migrated and its instances are re-added with `instance add`";
    readonly showInRule: false;
}, {
    readonly code: "LABEL_NOT_FOUND";
    readonly meaning: "No instance with that label is in the store this checkout resolves.";
    readonly remedy: "run `instance list` to see the labels this checkout has, or `instance add <label>` to add one";
    readonly command: "./snowarch instance list";
    readonly showInRule: false;
}, {
    readonly code: "LABEL_EXISTS";
    readonly meaning: "An instance with that label is already in the store.";
    readonly remedy: "use `instance set-credentials` or `instance set-preset` to change it, `instance remove` to delete it, or `--replace` to overwrite it";
    readonly command: "./snowarch instance add <label> --url <url> --env <env> --replace";
    readonly showInRule: false;
}, {
    readonly code: "ENV_REQUIRED";
    readonly meaning: "The environment could not be proposed and none was given, in a run that cannot ask.";
    readonly remedy: "pass `--env pdi|dev|test|prod`. Only `devNNNNN.service-now.com` hosts are recognised as PDIs, and the environment decides the preset a write is checked against — guessing it is the one thing this wizard will not do";
    readonly command: "./snowarch instance add <label> --url <url> --env <pdi|dev|test|prod> --yes";
    readonly showInRule: false;
}, {
    readonly code: "URL_REQUIRED";
    readonly meaning: "The wizard needs an instance URL and none was given.";
    readonly remedy: "enter the full https URL of the instance; non-interactively pass `--url <origin>` (a URL cannot be proposed)";
    readonly showInRule: false;
}, {
    readonly code: "URL_INVALID";
    readonly meaning: "The value is not a URL the server can parse.";
    readonly remedy: "enter it as `https://<host>.service-now.com`";
    readonly showInRule: false;
}, {
    readonly code: "URL_NOT_HTTPS";
    readonly meaning: "The URL is not https. Credentials would cross the network in clear.";
    readonly remedy: "use the https form of the same host";
    readonly showInRule: false;
}, {
    readonly code: "URL_HAS_PATH";
    readonly meaning: "The URL carries a path; only the origin is stored.";
    readonly remedy: "drop everything after the host";
    readonly showInRule: false;
}, {
    readonly code: "URL_HAS_CREDENTIALS";
    readonly meaning: "The URL embeds a user name or password, which would put a secret in the store URL and in logs.";
    readonly remedy: "remove them; the wizard asks for credentials separately";
    readonly showInRule: false;
}, {
    readonly code: "OAUTH_ROPC_DISABLED";
    readonly meaning: "The instance has the OAuth password grant disabled.";
    readonly remedy: "use basic authentication, or have an administrator enable the grant type";
    readonly showInRule: false;
}, {
    readonly code: "OAUTH_CLIENT_INVALID";
    readonly meaning: "The OAuth client id or secret was rejected.";
    readonly remedy: "check them against the Application Registry entry on the instance";
    readonly showInRule: false;
}, {
    readonly code: "STORE_IN_CLOUD_SYNC_FOLDER";
    readonly meaning: "this checkout is under <provider> (<root>). File mode 0600 does not stop synchronisation — the credential store would be uploaded to that service.";
    readonly remedy: "move the checkout outside the synced folder, or keep credentials in the global store with `--global` (<global> is not synced by default)";
    readonly showInRule: false;
}, {
    readonly code: "TLS_CERT_INVALID";
    readonly meaning: "The certificate is invalid for reasons other than an untrusted root — expired, or the wrong host.";
    readonly remedy: "check the instance URL and the certificate; this is not a CA-trust problem";
    readonly showInRule: false;
}];
export declare const ERROR_CODE_NAMES: ReadonlySet<string>;
/**
 * The union of registered codes.
 *
 * `ServiceNowError` narrows its `code` to this, so an unregistered literal at a throw site is a
 * compile error. Derived from the array rather than declared beside it: two lists would
 * disagree. (Stated without writing out an example call — the completeness scan greps source
 * for thrown literals and cannot tell a comment from code, so an illustration here would
 * register as an unregistered code.)
 */
export type ErrorCodeName = (typeof ERROR_CODES)[number]['code'];
/**
 * The remedy for a code, for anything that shows one. There is no other source.
 *
 * Overloaded so a REGISTERED name resolves to an `ErrorCode` rather than `ErrorCode | undefined`:
 * a caller passing a literal key would otherwise need a `??` fallback for an arm that cannot run,
 * and an unreachable branch fails the 100% gate (ARC-07-S04 hit exactly that with `?? []`).
 * `ErrorCodeName` makes a removed key a compile error at the call site first, which is what makes
 * the narrower signature true rather than convenient.
 */
export declare function remedyFor(code: ErrorCodeName): ErrorCode;
export declare function remedyFor(code: string): ErrorCode | undefined;
