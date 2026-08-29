import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { formatCurrency } from '../utils/format';
import { writeOffVisibleDebtors } from '../utils/visibility';
import type { Debtor, WriteOffStatus } from '../types';

interface WriteOffReportPageProps {
  /** 'SUPPORTED' for the Write Off tab, 'TO_BE_WRITTEN_OFF' for the To Be
   * Written Off tab — Pending write-offs don't get a tab of their own,
   * they're only visible via the debtor's own popup while awaiting
   * Reviewer 1. */
  targetStatus: Exclude<WriteOffStatus, 'PENDING'>;
  title: string;
  amountColumnLabel: string;
}

export function WriteOffReportPage({ targetStatus, title, amountColumnLabel }: WriteOffReportPageProps) {
  const { persona, debtors, natureList, descriptionList } = useApp();

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const rows: Debtor[] = useMemo(() => {
    return writeOffVisibleDebtors(persona, debtors).filter((d) => d.writeOff?.status === targetStatus);
  }, [persona, debtors, targetStatus]);

  const columns: ColumnDef<Debtor>[] = [
    { key: 'branch', header: 'SB/Dept', accessor: (d) => d.branch, sortType: 'alpha' },
    { key: 'name', header: 'Name of Debtor', accessor: (d) => d.name, sortType: 'alpha' },
    { key: 'nature', header: 'Nature of Arrears', accessor: (d) => natureName(d.natureId), sortType: 'alpha' },
    { key: 'description', header: 'Description', accessor: (d) => descName(d.descriptionId), sortType: 'alpha' },
    {
      key: 'amount',
      header: amountColumnLabel,
      accessor: (d) => d.writeOff?.writeOffAmount ?? 0,
      render: (d) => formatCurrency(d.writeOff?.writeOffAmount ?? 0),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'days',
      header: 'Days in Arrears',
      accessor: (d) => d.writeOff?.daysInArrears ?? 0,
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'reason',
      header: 'Reason for Write off',
      accessor: (d) => d.writeOff?.reasonForWriteOff ?? '',
      sortType: 'alpha',
    },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">{title}</h1>
      <p className="mb-5 text-sm text-slate-500">Pulled from the Debtor List.</p>
      <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} emptyMessage="No records found." />
    </div>
  );
}
