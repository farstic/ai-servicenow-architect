/**
 * Permission tier utilities for ServiceNow MCP Toolkit tools.
 *
 * Tier 0 – Always available (all read tools)
 * Tier 1 – WRITE_ENABLED=true (standard ITSM writes)
 * Tier 2 – WRITE_ENABLED=true + CMDB_WRITE_ENABLED=true (CI create/update)
 * Tier 3 – WRITE_ENABLED=true + SCRIPTING_ENABLED=true (scripts/changesets)
 * Tier AI – NOW_ASSIST_ENABLED=true (generative AI tools)
 * Tier ATF – ATF_ENABLED=true (test execution)
 */
export declare function requireWrite(): void;
export declare function requireCmdbWrite(): void;
export declare function requireScripting(): void;
export declare function requireNowAssist(): void;
export declare function requireAtf(): void;
export declare function requireFluent(): void;
export declare function isFluentEnabled(): boolean;
export declare function isWriteEnabled(): boolean;
export declare function isCmdbWriteEnabled(): boolean;
export declare function isScriptingEnabled(): boolean;
export declare function isNowAssistEnabled(): boolean;
export declare function isAtfEnabled(): boolean;
//# sourceMappingURL=permissions.d.ts.map