import type { InstanceConfig } from '../config-store.js';
import type { DetectedClient } from '../detect-clients.js';
export interface WriteResult {
    success: boolean;
    message: string;
}
/** Write to the appropriate config based on client type. */
export declare function writeClientConfig(client: DetectedClient, instance: InstanceConfig): WriteResult;
//# sourceMappingURL=index.d.ts.map