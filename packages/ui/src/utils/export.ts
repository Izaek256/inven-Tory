/**
 * Export utilities for CSV, PDF (via print), and print-ready formatting.
 * P3: Export/print: CSV/PDF export of the current view, print-ready format for physical counts.
 */

export type ExportColumn<T> = {
  key: string;
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
};

export interface ExportOptions<T> {
  filename: string;
  columns: ExportColumn<T>[];
  data: T[];
  title?: string;
  subtitle?: string;
}

/**
 * Convert data to CSV string
 */
export function toCSV<T>(options: ExportOptions<T>): string {
  const { columns, data, title, subtitle } = options;
  const rows: string[] = [];

  if (title) {
    rows.push(`"${title}"`);
    if (subtitle) rows.push(`"${subtitle}"`);
    rows.push('');
  }

  // Header row
  rows.push(columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(','));

  // Data rows
  for (const row of data) {
    rows.push(
      columns
        .map((col) => {
          const value = col.accessor(row);
          if (value === null || value === undefined) return '';
          const str = String(value).replace(/"/g, '""');
          // Wrap in quotes if contains comma, newline, or quote
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str}"`;
          }
          return str;
        })
        .join(','),
    );
  }

  return rows.join('\n');
}

/**
 * Download a string as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data as CSV file
 */
export function exportCSV<T>(options: ExportOptions<T>): void {
  const csv = toCSV(options);
  downloadFile(csv, `${options.filename}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Generate print-ready HTML for a table
 * P3: print-ready format for physical counts
 */
export function generatePrintHTML<T>(
  columns: ExportColumn<T>[],
  data: T[],
  options: { title?: string; subtitle?: string; logo?: string } = {},
): string {
  const { title = 'Report', subtitle, logo } = options;

  const headerRow = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('');

  const dataRows = data
    .map((row) => {
      const cells = columns
        .map((col) => {
          const value = col.accessor(row);
          return `<td>${escapeHtml(String(value ?? ''))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; size: auto; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; color: #111; margin: 0; padding: 0; }
    .header { text-align: center; margin-bottom: 16px; }
    .logo { max-width: 120px; margin-bottom: 8px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
    .subtitle { font-size: 11px; color: #666; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    .page-break { page-break-before: always; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="header">
    ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="Logo" />` : ''}
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
  </div>
  <table>
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${dataRows}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

/**
 * Open a print dialog with formatted table data
 */
export function printTable<T>(
  columns: ExportColumn<T>[],
  data: T[],
  options: { title?: string; subtitle?: string; logo?: string } = {},
): void {
  const html = generatePrintHTML(columns, data, options);
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // printWindow.onload triggers print()
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}
