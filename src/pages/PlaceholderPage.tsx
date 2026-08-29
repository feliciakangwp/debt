import { ExportButton } from '../components/ExportButton';
import type { ColumnDef } from '../components/DataTable';

interface PlaceholderPageProps {
  title: string;
  /** File name for the Export button. Every report tab under Call For
   * Return / (Fin) Call For Return gets one, even placeholders — it just
   * exports a single note row until the report is built out. */
  exportFileName: string;
}

const NOTE_COLUMNS: ColumnDef<{ note: string }>[] = [
  { key: 'note', header: 'Note', accessor: (r) => r.note },
];
const NOTE_ROWS = [{ note: 'This report has not been built yet.' }];

export function PlaceholderPage({ title, exportFileName }: PlaceholderPageProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <ExportButton fileName={exportFileName} sheetName={title} columns={NOTE_COLUMNS} rows={NOTE_ROWS} />
      </div>
      <p className="mb-5 text-sm text-slate-500">This report has not been built yet.</p>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">
        Not yet built — let us know what columns and data this should show.
      </div>
    </div>
  );
}
