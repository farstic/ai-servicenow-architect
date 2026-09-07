/**
 * User-defined custom slash commands loaded from servicenow-mcp.commands.json
 * in the current working directory.
 *
 * File format:
 * [
 *   {
 *     "name": "my-p1-runbook",
 *     "description": "P1 runbook for my team",
 *     "template": "List all P1 incidents in the Network category..."
 *   }
 * ]
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
export function loadUserPrompts() {
    const commandsFile = join(process.cwd(), 'servicenow-mcp.commands.json');
    if (!existsSync(commandsFile))
        return [];
    try {
        const raw = JSON.parse(readFileSync(commandsFile, 'utf8'));
        if (!Array.isArray(raw))
            return [];
        return raw.filter((item) => {
            if (typeof item !== 'object' || item === null)
                return false;
            const obj = item;
            return typeof obj['name'] === 'string' && typeof obj['template'] === 'string';
        });
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=user-prompts.js.map