import type { ReportFormat, ReportOptions, ReportResult } from './types.js';
/**
 * Generate a branded report from capability markdown output.
 *
 * @param markdown - Raw markdown from LLM capability analysis
 * @param format - Output format: 'pdf', 'pptx', or 'md'
 * @param options - Report metadata (title, instance info, output directory)
 * @returns File path and size of generated report
 */
export declare function generateReport(markdown: string, format: ReportFormat, options: ReportOptions): Promise<ReportResult>;
export type { ReportData, ReportFormat, ReportOptions, ReportResult, ReportFinding, ReportMetrics, Severity } from './types.js';
export { parseMarkdown } from './parser.js';
//# sourceMappingURL=index.d.ts.map