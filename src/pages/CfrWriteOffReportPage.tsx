import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { CfrStatusBadge } from '../components/CfrStatusBadge';
import {
  CfrActionButtons,
  CfrRejectBox,
  CfrRejectionNotice,
  CfrSuperAdminPanel,
} from '../components/CfrSubmissionPanel';
import { ExportButton } from '../components/ExportButton';
import { useCfrSubmissionWorkflow } from '../hooks/useCfrSubmissionWorkflow';
import { formatCurrency } from '../utils/format';
import { isSuperAdmin, writeOffVisibleDebtors } from '../utils/visibility';
import { buildWriteOffRows } from '../utils/writeOffRows';
import type { WriteOffRow } from '../utils/writeOffRows';
import type { WriteOffStatus } from '../types';

interface CfrWriteOffReportPageProps {
  /** true = (Fin) Call For Return: consolidated across all branches. false =
   * Call For Return: the viewer's own branch (plus Super Admin, who sees
   * every branch), with the Submit / Approve / Reject workflow. */
  consolidated: boolean;
  /** 'SUPPORTED' for the Written Off tab, 'TO_BE_WRITTEN_OFF' for the To Be
   * Written Off tab. */
  targetStatus: Exclude<WriteOffStatus, 'PENDING'>;
  title: string;
  reportLabel: string;
  amountColumnLabel: string;
}

/**
 * Written Off / To Be Written Off Call For Return tabs — pulled from the
 * same underlying write-off records as the Debt Management Write Off / To
 * Be Written Off reports (see WriteOffReportPage / buildWriteOffRows), one
 * row per (debtor, write-off) pair since write-offs are repeatable. Gated on
 * an open Call for Return period, same Submit (Branch Rep) -> Approve
 * (Reviewer 1) -> Approve (CPM) workflow as every other CFR report tab.
 */
export function CfrWriteOffReportPage({
  consolidated,
  targetStatus,
  title,
  reportLabel,
  amountColumnLabel,
}: CfrWriteOffReportPageProps) {
  const { persona, debtors, natureList, descriptionList, simulatedToday } = useApp();
  const workflow = useCfrSubmissionWorkflow();
  const { activePeriod, statusByBranch } = workflow;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const rows: WriteOffRow[] = useMemo(() => {
    if (!activePeriod) return [];
    return buildWriteOffRows(writeOffVisibleDebtors(persona, debtors), targetStatus);
  }, [activePeriod, persona, debtors, targetStatus]);

  const columns: ColumnDef<WriteOffRow>[] = [
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => statusByBranch.get(r.debtor.branch)?.status ?? '',
      render: (r) => {
        const status = statusByBranch.get(r.debtor.branch)?.status;
        return status ? <CfrStatusBadge status={status} /> : null;
      },
      sortable: false,
    },
    { key: 'branch', header: 'SB/Dept', accessor: (r) => r.debtor.branch, sortType: 'alpha' },
    { key: 'name', header: 'Name of Debtor', accessor: (r) => r.debtor.name, sortType: 'alpha' },
    {
      key: 'nature',
      header: 'Nature of Arrears',
      accessor: (r) => natureName(r.debtor.natureId),
      sortType: 'alpha',
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (r) => descName(r.debtor.descriptionId),
      sortType: 'alpha',
    },
    {
      key: 'amount',
      header: amountColumnLabel,
      accessor: (r) => r.writeOff.writeOffAmount,
      render: (r) => formatCurrency(r.writeOff.writeOffAmount),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'days',
      header: 'Days in Arrears',
      accessor: (r) => r.writeOff.daysInArrears,
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'reason',
      header: 'Reasons for write off',
      accessor: (r) => r.writeOff.reasonForWriteOff,
      sortType: 'alpha',
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
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.writeOff.id} />
        </>
      )}
    </div>
  );
}
