/**
 * Update Set management tools — full lifecycle for ServiceNow Update Sets.
 *
 * Goes beyond the basic changeset tools in script.ts to provide:
 * - Create / switch / preview / complete / export
 * - Auto-creation guard (ensure active update set exists)
 * - Batch artifact registration
 *
 * Tier 0 (Read):  get_current_update_set, list_update_sets, preview_update_set
 * Tier 3 (Script): create_update_set, switch_update_set, complete_update_set,
 *                   export_update_set, retrieve_remote_update_set
 *
 * ServiceNow tables: sys_update_set, sys_update_xml, sys_remote_update_set
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting, requireWrite } from '../utils/permissions.js';
import type { ToolDefinition } from './types.js';

export function updateSetToolManifest(): ToolDefinition[] {
  return [
    {
      name: 'snow_us_current_update_set_read',
      description: 'Get the currently active Update Set for the session',
      inputSchema: { type: 'object', properties: {}, required: [] },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_us_update_sets_index',
      description: 'List Update Sets by state (in progress, complete, ignore)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'State filter: "in progress", "complete", "ignore"' },
          query: { type: 'string', description: 'Additional encoded query filter' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_us_update_set_add',
      description: 'Create a new Update Set and optionally switch to it. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Update Set name' },
          description: { type: 'string', description: 'Purpose or description' },
          release: { type: 'string', description: 'Target release label' },
          switch_to: { type: 'boolean', description: 'Switch to this Update Set after creation (default true)' },
        },
        required: ['name'],
      },
      gate: 'scripting',
      mutates: true,
      table: 'sys_update_set',
    },
    {
      name: 'snow_us_update_set_switch',
      description: '[Scripting] Mark an update set as the default for the UI (is_default). Does NOT change what REST writes are captured into — use snow_us_capture_target_set for that (platform field notes, section 1).',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the target Update Set' },
        },
        required: ['sys_id'],
      },
      gate: 'scripting',
      mutates: true,
      table: 'sys_update_set',
    },
    {
      name: 'snow_us_update_set_complete',
      description: 'Mark an Update Set as complete (ready for migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
      gate: 'scripting',
      mutates: true,
      table: 'sys_update_set',
    },
    {
      name: 'snow_us_update_set_preview',
      description: 'Preview all changes contained in an Update Set',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
          limit: { type: 'number', description: 'Max records to list (default 100)' },
        },
        required: ['sys_id'],
      },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_us_update_set_export',
      description: 'Get the XML export payload for an Update Set (as used in migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
      gate: 'none',
      mutates: false,
    },
    {
      name: 'snow_us_capture_target_set',
      description: '[Write] Point THIS session\'s REST writes at a named update set, by setting the '
        + 'authenticated user\'s sys_user_preference name=sys_update_set. This is what actually captures '
        + 'REST-created objects — snow_us_update_set_switch only sets is_default for the UI '
        + '(platform field notes, section 1). Verify with snow_us_update_set_preview.',
      inputSchema: {
        type: 'object',
        properties: {
          update_set_sys_id: { type: 'string', description: 'sys_id of an in-progress update set' },
        },
        required: ['update_set_sys_id'],
      },
      gate: 'write',
      mutates: true,
      table: 'sys_user_preference',
    },
    {
      name: 'snow_us_active_update_set_ensure',
      description: 'Ensure an active Update Set exists; create one automatically if none is in progress. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          default_name: { type: 'string', description: 'Name to use when auto-creating (default: "AI Session Update Set")' },
        },
        required: [],
      },
      gate: 'scripting',
      mutates: true,
      table: 'sys_update_set',
    },
  ];
}

export async function dispatchUpdateSetAction(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'snow_us_current_update_set_read': {
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: 'state=in progress',
        limit: 5,
        fields: 'sys_id,name,description,state,is_default,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, active_update_sets: resp.records };
    }

    case 'snow_us_update_sets_index': {
      let query = '';
      if (args.state) query = `state=${args.state}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,state,description,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, update_sets: resp.records };
    }

    case 'snow_us_update_set_add': {
      requireScripting();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const payload: Record<string, any> = { name: args.name, state: 'in progress' };
      if (args.description) payload.description = args.description;
      if (args.release) payload.release = args.release;
      const result = await client.createRecord('sys_update_set', payload);
      const newId = String((result as any).sys_id || (result as any).result?.sys_id || '');
      if (newId && args.switch_to !== false) {
        await client.updateRecord('sys_update_set', newId, { is_default: true });
        return { action: 'created_and_switched', name: args.name, sys_id: newId, ...result };
      }
      return { action: 'created', name: args.name, sys_id: newId, ...result };
    }

    case 'snow_us_update_set_switch': {
      requireScripting();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_update_set', args.sys_id, { is_default: true });
      return { action: 'switched', sys_id: args.sys_id, ...result };
    }

    case 'snow_us_update_set_complete': {
      requireScripting();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
      return { action: 'completed', sys_id: args.sys_id, ...result };
    }

    case 'snow_us_update_set_preview': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // List all update XML records for this update set
      const resp = await client.queryRecords({
        table: 'sys_update_xml',
        query: `update_set=${args.sys_id}`,
        limit: args.limit || 100,
        fields: 'sys_id,name,type,action,payload,sys_updated_on',
      });
      const updateSet = await client.getRecord('sys_update_set', args.sys_id);
      return {
        update_set: updateSet,
        change_count: resp.count,
        changes: resp.records.map((r: any) => ({
          sys_id: r.sys_id,
          name: r.name,
          type: r.type,
          action: r.action,
          updated: r.sys_updated_on,
        })),
      };
    }

    case 'snow_us_update_set_export': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // No gate: this only READS sys_update_set and sys_update_xml and returns a summary.
      // It called requireScripting() before, which meant exporting an update set for review
      // required a write flag — the same conflation the pre-switch gate in script.ts had.
      const updateSet = await client.getRecord('sys_update_set', args.sys_id);
      const xmlRecords = await client.queryRecords({
        table: 'sys_update_xml',
        query: `update_set=${args.sys_id}`,
        limit: 500,
        fields: 'sys_id,name,type,action,payload',
      });
      return {
        update_set_name: (updateSet as any).name,
        sys_id: args.sys_id,
        change_count: xmlRecords.count,
        note: 'Use the ServiceNow Update Set XML Export UI (/sys_update_set.do) to download the actual XML file for import into another instance.',
        changes_summary: xmlRecords.records.map((r: any) => ({ name: r.name, type: r.type, action: r.action })),
      };
    }

    case 'snow_us_capture_target_set': {
      requireWrite();
      if (!args.update_set_sys_id) {
        throw new ServiceNowError('update_set_sys_id is required', 'INVALID_REQUEST');
      }

      // 1. The update set must exist and be open. Pointing capture at a completed set
      //    silently captures nothing, which is the failure this tool exists to prevent.
      const target = await client.getRecord(
        'sys_update_set', String(args.update_set_sys_id), 'sys_id,name,state,application') as Record<string, any>;
      if (!target || !target.sys_id) {
        throw new ServiceNowError(`update set ${args.update_set_sys_id} not found`, 'NOT_FOUND');
      }
      const setState = String(target.state ?? '');
      const setName = String(target.name ?? '');
      if (setState !== 'in progress') {
        throw new ServiceNowError(
          `update set "${setName}" is not in progress (state=${setState})`, 'INVALID_REQUEST');
      }

      // 2. Resolve the authenticated user. The preference is per user, so a wrong sys_id here
      //    would point somebody else's session at this update set.
      const captureUser = client.getAuthUsername();
      if (!captureUser) {
        throw new ServiceNowError(
          'the instance is configured without a user name, so the capture preference cannot be resolved. '
          + 'Run: ./snowarch instance set-credentials <label>', 'AUTHENTICATION_FAILED');
      }
      const users = await client.queryRecords({
        table: 'sys_user', query: `user_name=${captureUser}`, limit: 1, fields: 'sys_id,user_name',
      });
      if (users.count === 0) {
        throw new ServiceNowError(
          'the authenticated account could not be resolved in sys_user — the account may lack read access '
          + 'to that table. That is a ServiceNow role, not a flag.', 'INSUFFICIENT_PRIVILEGES');
      }
      const userSysId = String((users.records[0] as Record<string, any>).sys_id);

      // 3–4. PATCH the existing preference or POST a new one. REST capture honours
      //      sys_user_preference name=sys_update_set (platform field notes, section 1);
      //      snow_us_update_set_switch sets only is_default and does nothing here.
      const prefs = await client.queryRecords({
        table: 'sys_user_preference',
        query: `user=${userSysId}^name=sys_update_set`,
        limit: 1,
        fields: 'sys_id,value',
      });

      let captureAction: 'updated' | 'created';
      let preferenceSysId: string;
      if (prefs.count > 0) {
        preferenceSysId = String((prefs.records[0] as Record<string, any>).sys_id);
        await client.updateRecord('sys_user_preference', preferenceSysId,
          { value: String(args.update_set_sys_id) });
        captureAction = 'updated';
      } else {
        const createdPref = await client.createRecord('sys_user_preference', {
          user: userSysId,
          name: 'sys_update_set',
          value: String(args.update_set_sys_id),
          type: 'string',
        }) as Record<string, any>;
        preferenceSysId = String(createdPref.sys_id ?? '');
        captureAction = 'created';
      }

      // The user NAME is deliberately absent from the response: a response is also a log line.
      return {
        action: captureAction,
        preference_sys_id: preferenceSysId,
        user_sys_id: userSysId,
        update_set: { sys_id: String(target.sys_id), name: setName, application: target.application ?? null },
        verify_with: 'snow_us_update_set_preview',
      };
    }

    case 'snow_us_active_update_set_ensure': {
      requireScripting();
      // `name` is mandatory now. It used to take ANY set with state=in progress, which on a
      // shared instance is whoever happened to open one last — the engagement's objects then
      // landed in a stranger's update set (P-33).
      if (!args.name) {
        throw new ServiceNowError(
          'name is required; pass the update set name the engagement uses, e.g. "ENG-123 story 4"',
          'INVALID_REQUEST');
      }
      const ensureUser = client.getAuthUsername();
      if (!ensureUser) {
        throw new ServiceNowError(
          'the instance is configured without a user name, so an update set cannot be scoped to the '
          + 'caller. Run: ./snowarch instance set-credentials <label>', 'AUTHENTICATION_FAILED');
      }

      // sys_created_by holds the user_name string, so this is scoped to the caller's own
      // in-progress sets — not to anyone else's with the same name.
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: `name=${args.name}^state=in progress^sys_created_by=${ensureUser}`,
        limit: 1,
        fields: 'sys_id,name',
      });
      if (resp.count > 0) {
        return {
          action: 'existing_found',
          update_set: resp.records[0],
          next: 'snow_us_capture_target_set { update_set_sys_id }',
        };
      }

      // No is_default: it is a UI flag and does not affect what REST captures.
      const created = await client.createRecord('sys_update_set', {
        name: String(args.name),
        ...(args.description ? { description: String(args.description) } : {}),
        state: 'in progress',
      });
      return {
        action: 'created',
        update_set: created,
        next: 'snow_us_capture_target_set { update_set_sys_id }',
      };
    }

    default:
      return null;
  }
}
