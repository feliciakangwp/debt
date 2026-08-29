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
import { useCfrSubmissionWorkflow } from '../hooks/useCfrSubmissionWorkflow';
import { formatCurrency } from '../utils/format';
import { resolveDebtorBuckets } from '../utils/aging';
import { financeReportVisibleDebtors, isSuperAdmin, visibleDebtors } from '../utils/visibility';
import { aggregateDebtors, aggregatedTotalAR, aggregatedTotalInArrears } from '../utils/aggregate';
import type { AggregatedRow } from '../utils/aggregate';
import type { Branch, CfrSubmissionStatus } from '../types';

interface CfrArrearsPageProps {
  /** true = (Fin) Call For Return: consolidated across all branches,
   * read-only. false = Call For Return: grouped per branch, visible only to
   * each branch's own Branch Rep/Reviewer 1/CPM (plus Super Admin), with the
   * Submit / Approve / Reject workflow. */
  consolidated: boolean;
}

export function CfrArrearsPage({ consolidated }: CfrArrearsPageProps) {
  const { persona, debtors, natureList, descriptionList, simulatedToday } = useApp();
  const workflow = useCfrSubmissionWorkflow();
  const { activePeriod, statusByBranch } = workflow;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const rows: AggregatedRow[] = useMemo(() => {
    if (!activePeriod) return [];
    // Consolidated (Fin) view and Super Admin see every branch's lines;
    // otherwise Branch Rep / Reviewer 1 / CPM see only their own branch —
    // Finance Officer, Reviewer 1 FIN and CPM FIN do not get a full
    // cross-branch view here (unlike Arrears Report elsewhere in the app).
    const scoped = consolidated || isSuperAdmin(persona)
      ? financeReportVisibleDebtors(persona, debtors)
      : visibleDebtors(persona, debtors);
    const withBuckets = scoped.map((d) => ({ ...d, ...resolveDebtorBuckets(d, simulatedToday) }));
    return aggregateDebtors(withBuckets, !consolidated);
  }, [activePeriod, consolidated, persona, debtors, simulatedToday]);

  const columns: ColumnDef<AggregatedRow>[] = [
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (r.branch === 'SC' ? '' : (statusByBranch.get(r.branch as Branch)?.status ?? '')),
      render: (r) => {
        if (r.branch !== 'SC') {
          const status = statusByBranch.get(r.branch as Branch)?.status;
          return status ? <CfrStatusBadge status={status} /> : null;
        }
        const distinct = Array.from(
          new Set(r.branches.map((b) => statusByBranch.get(b)?.status).filter((s): s is CfrSubmissionStatus => !!s)),
        );
        return (
          <div className="flex flex-wrap gap-1">
            {distinct.map((s) => (
              <CfrStatusBadge key={s} status={s} />
            ))}
          </div>
        );
      },
      sortable: false,
    },
    { key: 'branch', header: 'SB/Dept', accessor: (r) => r.branch, sortType: 'alpha' },
    { key: 'nature', header: 'Nature of Arrears', accessor: (r) => natureName(r.natureId), sortType: 'alpha' },
    { key: 'description', header: 'Description', accessor: (r) => descName(r.descriptionId), sortType: 'alpha' },
    {
      key: 'totalAR',
      header: 'Total AR',
      accessor: (r) => aggregatedTotalAR(r),
      render: (r) => formatCurrency(aggregatedTotalAR(r)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'notInArrears',
      header: 'AR Not in Arrears',
      accessor: (r) => r.notInArrears,
      render: (r) => formatCurrency(r.notInArrears),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'totalInArrears',
      header: 'Total in Arrears',
      accessor: (r) => aggregatedTotalInArrears(r),
      render: (r) => formatCurrency(aggregatedTotalInArrears(r)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6m',
      header: 'AR in Arrears ≤ 6 months',
      accessor: (r) => r.arrears6m,
      render: (r) => formatCurrency(r.arrears6m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6to12m',
      header: 'AR in Arrears (6-12 months)',
      accessor: (r) => r.arrears6to12m,
      render: (r) => formatCurrency(r.arrears6to12m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears1to2y',
      header: 'AR in Arrears (1-2yrs)',
      accessor: (r) => r.arrears1to2y,
      render: (r) => formatCurrency(r.arrears1to2y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears2to3y',
      header: 'AR in Arrears (2-3yrs)',
      accessor: (r) => r.arrears2to3y,
      render: (r) => formatCurrency(r.arrears2to3y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears3to4y',
      header: 'AR in Arrears (3-4yrs)',
      accessor: (r) => r.arrears3to4y,
      render: (r) => formatCurrency(r.arrears3to4y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears4to5y',
      header: 'AR in Arrears (4-5yrs)',
      accessor: (r) => r.arrears4to5y,
      render: (r) => formatCurrency(r.arrears4to5y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears5yPlus',
      header: 'AR in Arrears ≥ 5 years',
      accessor: (r) => r.arrears5yPlus,
      render: (r) => formatCurrency(r.arrears5yPlus),
      sortType: 'numeric',
      align: 'right',
    },
    { key: 'reason', header: 'Reasons for non-recovery', accessor: (r) => r.reasonNonRecovery, sortType: 'alpha' },
    { key: 'steps', header: 'Recovery steps taken', accessor: (r) => r.recoverySteps, sortType: 'alpha' },
  ];

  const title = consolidated ? 'Arrears ((Fin) Call For Return)' : 'Arrears (Call For Return)';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <div className="flex items-center gap-2">{!consolidated && <CfrActionButtons workflow={workflow} />}</div>
      </div>
      <p className="mb-1 text-sm text-slate-500">Report generated on {simulatedToday}.</p>
      <p className="mb-5 text-sm text-slate-500">
        {consolidated
          ? 'Consolidated across all branches by Nature of AR/ Arrears and Description.'
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
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />
        </>
      )}
    </div>
  );
}
