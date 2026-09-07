/**
 * Persistent config store for servicenow-mcp CLI.
 * Stores named instance configs at ~/.config/servicenow-mcp/instances.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
/**
 * Migrate a loaded InstanceConfig that may have only `integrationMode` set to
 * also include the new granular boolean fields.  Runs in place.
 */
export function migrateInstanceConfig(instance) {
    // If the new fields are already present, nothing to do
    if (instance.mcpEnabled !== undefined || instance.sdkEnabled !== undefined) {
        // Still compute integrationMode from booleans for backward compat
        if (instance.mcpEnabled !== undefined || instance.sdkEnabled !== undefined) {
            const mcp = instance.mcpEnabled ?? true;
            const sdk = instance.sdkEnabled ?? false;
            if (mcp && sdk)
                instance.integrationMode = 'both';
            else if (sdk)
                instance.integrationMode = 'sdk';
            else
                instance.integrationMode = 'mcp';
        }
        return instance;
    }
    // Migrate from legacy integrationMode
    switch (instance.integrationMode) {
        case 'sdk':
            instance.mcpEnabled = false;
            instance.sdkEnabled = true;
            break;
        case 'both':
            instance.mcpEnabled = true;
            instance.sdkEnabled = true;
            break;
        case 'mcp':
        default:
            instance.mcpEnabled = true;
            instance.sdkEnabled = false;
            break;
    }
    return instance;
}
function configDir() {
    return join(homedir(), '.config', 'servicenow-mcp');
}
function configPath() {
    return join(configDir(), 'instances.json');
}
function ensureDir() {
    const dir = configDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}
export function loadConfig() {
    const path = configPath();
    if (!existsSync(path)) {
        return { version: 1, defaultInstance: '', instances: {} };
    }
    try {
        const cfg = JSON.parse(readFileSync(path, 'utf8'));
        // Run migration on every loaded instance so callers always see the new fields
        for (const key of Object.keys(cfg.instances)) {
            cfg.instances[key] = migrateInstanceConfig(cfg.instances[key]);
        }
        return cfg;
    }
    catch {
        return { version: 1, defaultInstance: '', instances: {} };
    }
}
export function saveConfig(config) {
    ensureDir();
    writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}
export function addInstance(instance) {
    const config = loadConfig();
    config.instances[instance.name] = instance;
    if (!config.defaultInstance) {
        config.defaultInstance = instance.name;
    }
    saveConfig(config);
}
export function listInstances() {
    const config = loadConfig();
    return Object.values(config.instances);
}
export function getDefaultInstance() {
    const config = loadConfig();
    return config.instances[config.defaultInstance];
}
export function removeInstance(name) {
    const config = loadConfig();
    if (!config.instances[name])
        return false;
    delete config.instances[name];
    if (config.defaultInstance === name) {
        const remaining = Object.keys(config.instances);
        config.defaultInstance = remaining[0] || '';
    }
    saveConfig(config);
    return true;
}
//# sourceMappingURL=config-store.js.map