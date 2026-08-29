import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { isSuperAdmin } from '../utils/visibility';
import { buildCfrReportRows } from '../utils/cfrReports';
import type { CfrReportRow } from '../utils/cfrReports';
import { downloadCfrReportsExcel } from '../utils/cfrReportExport';

interface CfrReportsPageProps {
  /** true = (Fin) Call For Return: every closed period, consolidated across
   * all branches, same as the (Fin) report tabs. false = Call For Return:
   * only periods the viewer's own branch took part in (every period for
   * Super Admin). */
  consolidated: boolean;
}

export function CfrReportsPage({ consolidated }: CfrReportsPageProps) {
  const { persona, callForReturnPeriods, cfrArrearsSubmissions, simulatedToday, debtors, natureList, descriptionList } =
    useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const scopeBranch = consolidated || isSuperAdmin(persona) ? null : persona.branch;

  const rows: CfrReportRow[] = useMemo(
    () => buildCfrReportRows(callForReturnPeriods, cfrArrearsSubmissions, simulatedToday, scopeBranch),
    [callForReturnPeriods, cfrArrearsSubmissions, simulatedToday, scopeBranch],
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const handleDownload = async () => {
    const chosen = rows.filter((r) => selected.has(r.id));
    if (chosen.length === 0) return;
    setDownloading(true);
    try {
      await downloadCfrReportsExcel(chosen, { persona, debtors, natureList, descriptionList, simulatedToday, consolidated });
    } finally {
      setDownloading(false);
    }
  };

  const columns: ColumnDef<CfrReportRow>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Select all reports"
          className="h-4 w-4"
        />
      ),
      accessor: () => '',
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleRow(r.id)}
          aria-label={`Select ${r.periodName} ${r.reportLabel}`}
          className="h-4 w-4"
        />
      ),
      sortable: false,
    },
    { key: 'period', header: 'Submission Year-Month', accessor: (r) => r.periodName, sortType: 'alpha' },
    { key: 'report', header: 'Name of Report', accessor: (r) => r.reportLabel, sortType: 'alpha' },
  ];

  const title = consolidated ? 'Reports ((Fin) Call For Return)' : 'Reports (Call For Return)';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <button
          onClick={handleDownload}
          disabled={selected.size === 0 || downloading}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? 'Preparing…' : `Download Excel${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        {consolidated
          ? 'Auto-generated once a Call for Return period closes, consolidated across all branches.'
          : 'Auto-generated once a Call for Return period closes, for the periods this branch took part in.'}
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyMessage="No closed Call for Return periods yet."
      />
    </div>
  );
}
