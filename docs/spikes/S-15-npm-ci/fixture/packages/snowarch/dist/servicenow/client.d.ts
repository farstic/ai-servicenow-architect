import type { ServiceNowConfig, QueryRecordsParams, QueryRecordsResponse, ServiceNowRecord } from './types.js';
export declare class ServiceNowClient {
    private baseUrl;
    private authMethod;
    private authMode;
    private oauthConfig?;
    private basicConfig?;
    private maxRetries;
    private retryDelayMs;
    private requestTimeoutMs;
    /** For impersonation mode: user sys_id to pass in X-Sn-Impersonate */
    private impersonateUserSysId?;
    /** For per-user mode: pre-loaded token overrides service-account auth */
    private perUserBearerToken?;
    private accessToken?;
    private tokenExpiry?;
    constructor(config: ServiceNowConfig);
    /**
     * Return a copy of this client configured to run as a specific user.
     * Used for per-request user context switching without mutating the shared client.
     */
    withUser(options: {
        sysId?: string;
        bearerToken?: string;
    }): ServiceNowClient;
    /**
     * Authenticate with ServiceNow using OAuth or Basic Auth
     */
    private authenticate;
    /**
     * Get authorization header for requests.
     * Per-user mode returns the user's own Bearer token directly.
     * Impersonation and service-account modes use the configured service account.
     */
    private getAuthHeader;
    /**
     * Returns the X-Sn-Impersonate header value if impersonation mode is active.
     * ServiceNow executes the request in the context of the named user's roles/ACLs.
     */
    private getImpersonateHeader;
    /**
     * Make HTTP request with retry logic
     */
    private request;
    /**
     * Query records from a ServiceNow table
     */
    queryRecords(params: QueryRecordsParams): Promise<QueryRecordsResponse>;
    /**
     * Get table schema/structure
     */
    getTableSchema(tableName: string): Promise<any>;
    /**
     * Get a single record by sys_id
     */
    getRecord(table: string, sysId: string, fields?: string): Promise<ServiceNowRecord>;
    /**
     * Get user details by email or username
     */
    getUser(userIdentifier: string): Promise<ServiceNowRecord>;
    /**
     * Get group details by name or sys_id
     */
    getGroup(groupIdentifier: string): Promise<ServiceNowRecord>;
    /**
     * Search CMDB configuration items
     */
    searchCmdbCi(query?: string, limit?: number): Promise<QueryRecordsResponse>;
    /**
     * Get a specific CMDB configuration item
     */
    getCmdbCi(ciSysId: string, fields?: string): Promise<ServiceNowRecord>;
    /**
     * List relationships for a CI
     */
    listRelationships(ciSysId: string): Promise<any>;
    /**
     * List discovery schedules
     */
    listDiscoverySchedules(activeOnly?: boolean): Promise<any>;
    /**
     * List MID servers
     */
    listMidServers(activeOnly?: boolean): Promise<any>;
    /**
     * List active events
     */
    listActiveEvents(query?: string, limit?: number): Promise<QueryRecordsResponse>;
    /**
     * Get CMDB health dashboard metrics
     */
    cmdbHealthDashboard(): Promise<any>;
    /**
     * Get service mapping summary
     */
    serviceMappingSummary(serviceSysId: string): Promise<any>;
    /**
     * Create a change request
     */
    createChangeRequest(params: any): Promise<ServiceNowRecord>;
    /**
     * Create a record in any ServiceNow table
     */
    createRecord(table: string, data: Record<string, any>): Promise<ServiceNowRecord>;
    /**
     * Update a record in any ServiceNow table
     */
    updateRecord(table: string, sysId: string, data: Record<string, any>): Promise<ServiceNowRecord>;
    /**
     * Delete a record from any ServiceNow table.
     *
     * Attempts the API DELETE, then — on failure — classifies the cause and throws a
     * ServiceNowError whose message clearly explains *why* the delete failed. ServiceNow
     * returns HTTP 403 for both access-control (ACL) refusals and reference/cascade blocks,
     * so the status alone is insufficient; the cause is matched against the error message and
     * the nested `error.detail` field (which usually names the referencing table/field).
     */
    deleteRecord(table: string, sysId: string): Promise<void>;
    /**
     * Classify a delete failure into a clear category + explanation.
     * Categories: DELETE_NOT_FOUND, DELETE_CONSTRAINT, DELETE_ACL_DENIED, DELETE_FAILED.
     */
    private classifyDeleteFailure;
    /**
     * Call Now Assist / Generative AI endpoints (latest release)
     */
    callNowAssist(endpoint: string, payload: Record<string, any>): Promise<any>;
    /**
     * Run aggregate/stats query on a table (ServiceNow Reporting API)
     */
    runAggregateQuery(table: string, groupBy: string, _aggregate?: string, query?: string): Promise<any>;
    /**
     * Natural language search (simplified implementation)
     */
    naturalLanguageSearch(query: string, limit?: number): Promise<any>;
    /**
     * Upload a file attachment to a ServiceNow record via the Attachment API.
     * Accepts base64-encoded content and uploads it as a multipart form.
     */
    uploadAttachment(table: string, recordSysId: string, fileName: string, contentType: string, contentBase64: string): Promise<any>;
    /**
     * Execute multiple REST API operations in a single HTTP call (Batch API).
     * Uses /api/now/v1/batch endpoint. Up to 50 operations per batch.
     */
    batchRequest(operations: Array<{
        id: string;
        method: string;
        url: string;
        body?: any;
    }>): Promise<any>;
    /**
     * Execute a server-side script via the Background Script API.
     * Useful for GlideQuery, GlideAggregate, and complex operations.
     */
    executeScript(script: string, scope?: string): Promise<any>;
    /**
     * Natural language update (simplified implementation)
     */
    naturalLanguageUpdate(_instruction: string, _table: string): Promise<any>;
}
//# sourceMappingURL=client.d.ts.map