import type { ColumnDef } from '../components/DataTable';

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || 'Sheet1';
}

/**
 * Exports exactly what a DataTable is currently showing — same columns
 * (skipping any whose header isn't plain text, e.g. a checkbox column),
 * same rows, in the same order — to a real .xlsx file. Loads the xlsx
 * (SheetJS) library on demand so it doesn't add to the app's initial
 * bundle for personas who never export.
 */
export async function exportTableToExcel<T>(
  fileName: string,
  sheetName: string,
  columns: ColumnDef<T>[],
  rows: T[],
): Promise<void> {
  const XLSX = await import('xlsx');

  const exportableColumns = columns.filter((c): c is ColumnDef<T> & { header: string } => typeof c.header === 'string');
  const data = rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const col of exportableColumns) {
      record[col.header] = (col.exportValue ?? col.accessor)(row);
    }
    return record;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));
  XLSX.writeFile(workbook, fileName);
}
