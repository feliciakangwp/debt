import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { formatCurrency } from '../utils/format';
import { totalAR, totalInArrears } from '../types';
import type { Debtor } from '../types';
import { resolveDebtorBuckets } from '../utils/aging';

export function DebtorsPage() {
  const { persona, debtors, natureList, descriptionList, simulatedToday } = useApp();

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const visibleRows = useMemo(() => {
    const scoped =
      persona.role === 'FINANCE' ? debtors : debtors.filter((d) => d.branch === persona.branch);
    return scoped.map((d) => ({ ...d, ...resolveDebtorBuckets(d, simulatedToday) }));
  }, [debtors, persona, simulatedToday]);

  const columns: ColumnDef<Debtor>[] = [
    { key: 'branch', header: 'SB/Dept', accessor: (d) => d.branch, sortType: 'alpha' },
    { key: 'name', header: 'Name of Debtor', accessor: (d) => d.name, sortType: 'alpha' },
    {
      key: 'nature',
      header: 'Nature of AR/ Arrears',
      accessor: (d) => natureName(d.natureId),
      sortType: 'alpha',
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (d) => descName(d.descriptionId),
      sortType: 'alpha',
    },
    {
      key: 'totalAR',
      header: 'Total AR',
      accessor: (d) => totalAR(d),
      render: (d) => formatCurrency(totalAR(d)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'notInArrears',
      header: 'AR Not in Arrears',
      accessor: (d) => d.notInArrears,
      render: (d) => formatCurrency(d.notInArrears),
      sortType: 'numeric',
      align: 'right',
    },
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
    {
      key: 'reason',
      header: 'Reason for non-recovery',
      accessor: (d) => d.reasonNonRecovery,
      sortType: 'alpha',
    },
    {
      key: 'steps',
      header: 'Recovery steps taken',
      accessor: (d) => d.recoverySteps,
      sortType: 'alpha',
    },
    {
      key: 'caseReference',
      header: 'Case Reference',
      accessor: (d) => d.caseReference,
      sortType: 'alpha',
    },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">Debtor Report</h1>
      <p className="mb-5 text-sm text-slate-500">
        {persona.role === 'FINANCE'
          ? 'Showing all branches.'
          : `Showing records for ${persona.branch} only.`}{' '}
        Click a column header to sort.
      </p>

      <DataTable columns={columns} rows={visibleRows} rowKey={(d) => d.id} />
    </div>
  );
}
