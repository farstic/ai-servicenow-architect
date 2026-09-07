/**
 * Markdown → ReportData parser.
 * Extracts sections, findings, tables, and metrics from capability output.
 */
import type { ReportData } from './types.js';
/** Parse capability markdown output into structured ReportData. */
export declare function parseMarkdown(markdown: string, options: {
    title: string;
    capability: string;
    instanceName: string;
    instanceUrl: string;
}): ReportData;
//# sourceMappingURL=parser.d.ts.map