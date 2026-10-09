import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { formatCurrency } from '../utils/format';
import { visibleDebtRecords } from '../utils/visibility';
import { buildWriteOffRows } from '../utils/writeOffRows';
import type { WriteOffRow } from '../utils/writeOffRows';
import { WriteOffStatusBadge } from '../components/StatusBadge';
import type { WriteOffStatus } from '../types';

interface WriteOffReportPageProps {
  /** ['SUPPORTED'] for the Written Off tab, ['TO_BE_WRITTEN_OFF', 'PENDING']
   * for the To Be Written Off tab (which merges To Be Written Off and
   * Request Write Off records together). */
  targetStatuses: WriteOffStatus[];
  title: string;
  amountColumnLabel: string;
  /** true for the (FIN) copies: shows every matching write-off across every
   * branch, with no per-record assignment tagging required. false (default)
   * for the Debt Management copies: scoped to records the viewer is tagged
   * on (Assigned To / Reviewer 1 / Reviewer 2), same as List of Debt
   * Records. */
  consolidated?: boolean;
}

export function WriteOffReportPage({
  targetStatuses,
  title,
  amountColumnLabel,
  consolidated = false,
}: WriteOffReportPageProps) {
  const { persona, debtors, natureList, descriptionList } = useApp();

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const rows: WriteOffRow[] = useMemo(() => {
    const scoped = consolidated ? debtors : visibleDebtRecords(persona, debtors);
    return buildWriteOffRows(scoped, targetStatuses);
  }, [persona, debtors, targetStatuses, consolidated]);

  const columns: ColumnDef<WriteOffRow>[] = [
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.writeOff.status,
      render: (r) => <WriteOffStatusBadge status={r.writeOff.status} />,
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
      header: 'Reason for Write off',
      accessor: (r) => r.writeOff.reasonForWriteOff,
      sortType: 'alpha',
    },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">{title}</h1>
      <p className="mb-5 text-sm text-slate-500">Pulled from the Debtor List.</p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.writeOff.id} emptyMessage="No records found." />
    </div>
  );
}
