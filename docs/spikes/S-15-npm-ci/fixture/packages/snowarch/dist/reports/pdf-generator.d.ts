/**
 * PDF report generator using pdfmake.
 * Produces branded, multi-page PDF with charts, tables, and ServiceNow links.
 */
import type { ReportData, ReportResult } from './types.js';
/** Generate a branded PDF from ReportData. Returns file path and size. */
export declare function generatePdf(data: ReportData, outputPath: string): Promise<ReportResult>;
//# sourceMappingURL=pdf-generator.d.ts.map