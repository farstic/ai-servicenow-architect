/**
 * Zero-dependency SVG chart generators for PDF reports.
 * pdfmake supports SVG natively — no canvas/browser needed.
 * pptxgenjs has its own chart API, so these are PDF-only.
 */
import type { Severity } from './types.js';
/** Generate an SVG pie chart for severity distribution. */
export declare function severityPieChart(counts: Record<Severity, number>, size?: number): string;
/** Generate an SVG horizontal bar chart for category breakdown. */
export declare function categoryBarChart(breakdown: Record<string, number>, width?: number, barHeight?: number): string;
//# sourceMappingURL=charts.d.ts.map