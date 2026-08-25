import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { DebtorFormModal } from '../components/DebtorFormModal';
import { formatCurrency } from '../utils/format';
import { debtorAmountRows } from '../utils/aging';
import type { Debtor } from '../types';

interface DebtorEntryRow {
  key: string;
  debtor: Debtor;
  name: string;
  branch: Debtor['branch'];
  natureId: string;
  descriptionId: string;
  amount: number;
  requiredPaidDate: string;
  reasonNonRecovery: string;
  recoverySteps: string;
}

export function DebtorListPage() {
  const { persona, debtors, natureList, descriptionList } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const scopedDebtors = useMemo(
    () => (persona.role === 'FINANCE' ? debtors : debtors.filter((d) => d.branch === persona.branch)),
    [debtors, persona],
  );

  const rows: DebtorEntryRow[] = useMemo(() => {
    const out: DebtorEntryRow[] = [];
    for (const d of scopedDebtors) {
      debtorAmountRows(d).forEach((entry, idx) => {
        out.push({
          key: `${d.id}-${idx}`,
          debtor: d,
          name: d.name,
          branch: d.branch,
          natureId: d.natureId,
          descriptionId: d.descriptionId,
          amount: entry.amount,
          requiredPaidDate: entry.requiredPaidDate,
          reasonNonRecovery: d.reasonNonRecovery,
          recoverySteps: d.recoverySteps,
        });
      });
    }
    return out;
  }, [scopedDebtors]);

  const canCreate = persona.role === 'BRANCH_REP';
  const canEdit = persona.role === 'BRANCH_REP';

  const columns: ColumnDef<DebtorEntryRow>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: (r) => r.name,
      sortType: 'alpha',
      render: (r) =>
        canEdit ? (
          <button
            onClick={() => setEditingDebtor(r.debtor)}
            className="font-medium text-brand-navy underline decoration-dotted underline-offset-2 hover:text-brand-gold"
          >
            {r.name}
          </button>
        ) : (
          r.name
        ),
    },
    { key: 'department', header: 'Department', accessor: (r) => r.branch, sortType: 'alpha' },
    {
      key: 'nature',
      header: 'Nature of Arrear',
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
      key: 'amount',
      header: 'Amount',
      accessor: (r) => r.amount,
      render: (r) => formatCurrency(r.amount),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'requiredPaidDate',
      header: 'Required Paid Date',
      accessor: (r) => r.requiredPaidDate,
      render: (r) => r.requiredPaidDate || '-',
      sortType: 'alpha',
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
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Debtor List</h1>
        {canCreate && (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95"
          >
            + New
          </button>
        )}
      </div>
      <p className="mb-5 text-sm text-slate-500">
        {persona.role === 'FINANCE'
          ? 'Showing all branches.'
          : `Showing records for ${persona.branch} only.`}{' '}
        Click a column header to sort.
        {canEdit && " Click a debtor's name to edit that entry."}
      </p>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />

      {showNew && (
        <DebtorFormModal
          lockedBranch={persona.role === 'BRANCH_REP' ? persona.branch : null}
          onClose={() => setShowNew(false)}
        />
      )}

      {editingDebtor && (
        <DebtorFormModal
          lockedBranch={persona.role === 'BRANCH_REP' ? persona.branch : null}
          editDebtor={editingDebtor}
          onClose={() => setEditingDebtor(null)}
        />
      )}
    </div>
  );
}
