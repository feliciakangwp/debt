import { useState } from 'react';
import { exportTableToExcel } from '../utils/exportTable';
import type { ColumnDef } from './DataTable';

interface ExportButtonProps<T> {
  fileName: string;
  sheetName: string;
  columns: ColumnDef<T>[];
  rows: T[];
}

/** Exports exactly what the accompanying DataTable is showing on screen —
 * used on every Call For Return / (Fin) Call For Return report tab. */
export function ExportButton<T>({ fileName, sheetName, columns, rows }: ExportButtonProps<T>) {
  const [exporting, setExporting] = useState(false);

  const handleClick = async () => {
    setExporting(true);
    try {
      await exportTableToExcel(fileName, sheetName, columns, rows);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={exporting || rows.length === 0}
      className="rounded-md border border-brand-navy px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {exporting ? 'Exporting…' : 'Export'}
    </button>
  );
}
