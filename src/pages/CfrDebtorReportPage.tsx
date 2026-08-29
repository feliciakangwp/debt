import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { CfrStatusBadge, SUBMISSION_LABELS } from '../components/CfrStatusBadge';
import {
  CfrActionButtons,
  CfrRejectBox,
  CfrRejectionNotice,
  CfrSuperAdminPanel,
} from '../components/CfrSubmissionPanel';
import { ExportButton } from '../components/ExportButton';
import { useCfrSubmissionWorkflow } from '../hooks/useCfrSubmissionWorkflow';
import { formatCurrency } from '../utils/format';
import { resolveDebtorBuckets } from '../utils/aging';
import { financeReportVisibleDebtors, isSuperAdmin, visibleDebtors } from '../utils/visibility';
import { totalInArrears } from '../types';
import type { Debtor } from '../types';

interface CfrDebtorReportPageProps {
  /** true = (Fin) Call For Return: consolidated across all branches,
   * read-only. false = Call For Return: only the viewer's own branch (plus
   * Super Admin, who sees every branch), with the Submit / Approve / Reject
   * workflow. */
  consolidated: boolean;
  title: string;
  /** Short name used to build the exported file name and sheet name, e.g.
   * "Top 10 Debtors" or "Arrears > 5 Years". */
  reportLabel: string;
  /** Filters/sorts the branch-scoped, aging-resolved debtor list into what
   * this report should show (e.g. top 10 by Total in Arrears, or every
   * debtor with an Arrears >= 5 years balance). */
  selectRows: (debtors: Debtor[]) => Debtor[];
}

export function CfrDebtorReportPage({ consolidated, title, reportLabel, selectRows }: CfrDebtorReportPageProps) {
  const { persona, debtors, natureList, descriptionList, simulatedToday } = useApp();
  const workflow = useCfrSubmissionWorkflow();
  const { activePeriod, statusByBranch } = workflow;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const rows: Debtor[] = useMemo(() => {
    if (!activePeriod) return [];
    const scoped = consolidated || isSuperAdmin(persona)
      ? financeReportVisibleDebtors(persona, debtors)
      : visibleDebtors(persona, debtors);
    const withBuckets = scoped.map((d) => ({ ...d, ...resolveDebtorBuckets(d, simulatedToday) }));
    return selectRows(withBuckets);
  }, [activePeriod, consolidated, persona, debtors, simulatedToday, selectRows]);

  const columns: ColumnDef<Debtor>[] = [
    {
      // This is the branch's Call for Return approval status (Draft/Pending
      // Review/Supported/Approved) — a separate workflow from the Debtor
      // List's own status, not the individual debtor's list-level status.
      key: 'status',
      header: 'Status',
      accessor: (d) => statusByBranch.get(d.branch)?.status ?? '',
      exportValue: (d) => {
        const status = statusByBranch.get(d.branch)?.status;
        return status ? SUBMISSION_LABELS[status] : '';
      },
      render: (d) => {
        const status = statusByBranch.get(d.branch)?.status;
        return status ? <CfrStatusBadge status={status} /> : null;
      },
      sortType: 'alpha',
    },
    { key: 'branch', header: 'SB/Dept', accessor: (d) => d.branch, sortType: 'alpha' },
    { key: 'name', header: 'Name of Debtor', accessor: (d) => d.name, sortType: 'alpha' },
    { key: 'nature', header: 'Nature of Arrears', accessor: (d) => natureName(d.natureId), sortType: 'alpha' },
    { key: 'description', header: 'Description', accessor: (d) => descName(d.descriptionId), sortType: 'alpha' },
    {
      key: 'totalInArrears',
      header: 'Total in Arrears',
      accessor: (d) => totalInArrears(d),
      render: (d) => formatCurrency(totalInArrears(d)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6m',
      header: 'AR in Arrears ≤ 6 months',
      accessor: (d) => d.arrears6m,
      render: (d) => formatCurrency(d.arrears6m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6to12m',
      header: 'AR in Arrears (6-12 months)',
      accessor: (d) => d.arrears6to12m,
      render: (d) => formatCurrency(d.arrears6to12m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears1to2y',
      header: 'AR in Arrears (1-2yrs)',
      accessor: (d) => d.arrears1to2y,
      render: (d) => formatCurrency(d.arrears1to2y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears2to3y',
      header: 'AR in Arrears (2-3yrs)',
      accessor: (d) => d.arrears2to3y,
      render: (d) => formatCurrency(d.arrears2to3y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears3to4y',
      header: 'AR in Arrears (3-4yrs)',
      accessor: (d) => d.arrears3to4y,
      render: (d) => formatCurrency(d.arrears3to4y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears4to5y',
      header: 'AR in Arrears (4-5yrs)',
      accessor: (d) => d.arrears4to5y,
      render: (d) => formatCurrency(d.arrears4to5y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears5yPlus',
      header: 'AR in Arrears ≥ 5 years',
      accessor: (d) => d.arrears5yPlus,
      render: (d) => formatCurrency(d.arrears5yPlus),
      sortType: 'numeric',
      align: 'right',
    },
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <div className="flex items-center gap-2">
          {!consolidated && <CfrActionButtons workflow={workflow} />}
          <ExportButton
            fileName={`${consolidated ? 'FinCallForReturn' : 'CallForReturn'}-${reportLabel.replace(/\s+/g, '')}-${simulatedToday}.xlsx`}
            sheetName={reportLabel}
            columns={columns}
            rows={rows}
          />
        </div>
      </div>
      <p className="mb-1 text-sm text-slate-500">Report generated on {simulatedToday}.</p>
      <p className="mb-5 text-sm text-slate-500">
        {consolidated
          ? 'Compiled across all branches.'
          : isSuperAdmin(persona)
            ? 'Showing all branches.'
            : persona.branch
              ? `Showing records for ${persona.branch} only.`
              : 'No branch is assigned to this persona, so no lines are shown here.'}
      </p>

      {!consolidated && <CfrRejectionNotice workflow={workflow} />}
      {!consolidated && <CfrRejectBox workflow={workflow} />}

      {!activePeriod ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">
          No Call for Return period is currently open.
        </div>
      ) : (
        <>
          {!consolidated && <CfrSuperAdminPanel workflow={workflow} />}
          <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} />
        </>
      )}
    </div>
  );
}
