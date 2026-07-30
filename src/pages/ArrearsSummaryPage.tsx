import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { aggregateDebtors, aggregatedTotalAR, aggregatedTotalInArrears } from '../utils/aggregate';
import type { AggregatedRow } from '../utils/aggregate';
import { formatCurrency } from '../utils/format';
import { resolveDebtorBuckets } from '../utils/aging';

interface ArrearsSummaryPageProps {
  financeView?: boolean;
}

export function ArrearsSummaryPage({ financeView = false }: ArrearsSummaryPageProps) {
  const { persona, debtors, natureList, descriptionList, simulatedToday } = useApp();

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const scopedDebtors = useMemo(() => {
    const base =
      financeView || persona.role === 'FINANCE'
        ? debtors
        : debtors.filter((d) => d.branch === persona.branch);
    return base.map((d) => ({ ...d, ...resolveDebtorBuckets(d, simulatedToday) }));
  }, [debtors, persona, financeView, simulatedToday]);

  const rows = useMemo(
    () => aggregateDebtors(scopedDebtors, !financeView),
    [scopedDebtors, financeView],
  );

  const columns: ColumnDef<AggregatedRow>[] = [
    { key: 'branch', header: 'SB/Dept', accessor: (r) => r.branch, sortType: 'alpha' },
    {
      key: 'nature',
      header: 'Nature of AR/ Arrears',
      accessor: (r) => natureName(r.natureId),
      sortType: 'alpha',
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (r) => descName(r.descriptionId),
      sortType: 'alpha',
    },
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
    {
      key: 'reason',
      header: 'Reason for non-recovery',
      accessor: (r) => r.reasonNonRecovery,
      sortType: 'alpha',
    },
    {
      key: 'steps',
      header: 'Recovery steps taken',
      accessor: (r) => r.recoverySteps,
      sortType: 'alpha',
    },
    {
      key: 'caseReference',
      header: 'Case Reference',
      accessor: (r) => r.caseReference,
      sortType: 'alpha',
    },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">
        {financeView ? 'List of AR / Arrears (FIN)' : 'List of AR / Arrears'}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {financeView
          ? 'Aggregated across all branches by Nature of AR/ Arrears and Description. SB/Dept shown as SC.'
          : persona.role === 'FINANCE'
            ? 'Showing all branches, aggregated by SB/Dept, Nature and Description.'
            : `Showing records for ${persona.branch} only, aggregated by Nature and Description.`}{' '}
        Click a column header to sort.
      </p>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />
    </div>
  );
}
