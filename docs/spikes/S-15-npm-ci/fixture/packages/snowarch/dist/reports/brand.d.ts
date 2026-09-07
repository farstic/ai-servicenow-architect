/**
 * ServiceNow MCP Toolkit brand constants for report generation.
 * Colors, logo, and utility functions for building branded reports.
 */
import type { Severity } from './types.js';
export declare const BRAND: {
    readonly teal: "#00D4AA";
    readonly tealDark: "#00B899";
    readonly navy: "#0F4C81";
    readonly navyLight: "#1A5A94";
    readonly white: "#FFFFFF";
    readonly offWhite: "#F8FAFB";
    readonly gray: "#8B949E";
    readonly grayLight: "#E1E4E8";
    readonly grayDark: "#30363D";
    readonly text: "#24292F";
    readonly textLight: "#57606A";
    readonly critical: "#E8466A";
    readonly high: "#FF6B35";
    readonly medium: "#FFB020";
    readonly low: "#0F4C81";
    readonly info: "#8B949E";
    readonly healthy: "#10B981";
    readonly degraded: "#FFB020";
    readonly criticalHealth: "#E8466A";
};
/** Map severity to brand color hex. */
export declare function severityColor(severity: Severity): string;
/** Map severity to human label with consistent casing. */
export declare function severityLabel(severity: Severity): string;
/** Build a clickable ServiceNow record link by sys_id. */
export declare function buildRecordLink(instanceUrl: string, table: string, sysId: string): string;
/** Build a link to a ServiceNow record by its number (uses sysparm_query lookup). */
export declare function buildRecordNumberLink(instanceUrl: string, recordNumber: string): string | null;
/** Build a link to a sys_properties record by name. */
export declare function buildPropertyLink(instanceUrl: string, name: string): string;
/** Build a link to a plugin record by ID. */
export declare function buildPluginLink(instanceUrl: string, pluginId: string): string;
/** Build a link to a table definition by name. */
export declare function buildTableLink(instanceUrl: string, tableName: string): string;
/** Entity match with resolved link URL. */
interface EntityMatch {
    start: number;
    end: number;
    text: string;
    link: string;
}
/**
 * Find all linkable ServiceNow entities in text. Runs patterns in priority order
 * and skips overlapping matches so no entity is double-linked.
 */
export declare function findAllEntityMatches(text: string, instanceUrl: string): EntityMatch[];
/**
 * Split a plain text string into pdfmake text segments where ServiceNow entities
 * (record numbers, sys_properties, plugins, tables) become clickable hyperlinks.
 * Returns a single string if no entities found, or an array of text objects.
 */
export declare function linkifyTextPdf(text: string, instanceUrl: string, baseStyle?: Record<string, any>): any;
/**
 * Split a plain text string into pptxgenjs text parts where ServiceNow entities
 * become clickable hyperlinks. Returns an array of text part objects.
 */
export declare function linkifyTextPptx(text: string, instanceUrl: string, baseOpts?: Record<string, any>): Array<{
    text: string;
    options: Record<string, any>;
}>;
/** ServiceNow MCP Toolkit logo as embedded base64 PNG (small 64x64 icon). */
export declare const LOGO_BASE64: string;
/** Font sizes used in reports */
export declare const FONT_SIZES: {
    readonly title: 28;
    readonly subtitle: 16;
    readonly sectionHeader: 18;
    readonly body: 11;
    readonly small: 9;
    readonly caption: 8;
};
export {};
//# sourceMappingURL=brand.d.ts.map