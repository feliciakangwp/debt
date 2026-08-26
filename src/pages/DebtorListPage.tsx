import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { DebtorFormModal } from '../components/DebtorFormModal';
import { DebtorDetailsModal } from '../components/DebtorDetailsModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '../utils/format';
import { debtorAmountRows } from '../utils/aging';
import { visibleDebtors } from '../utils/visibility';
import type { Debtor, DebtorStatus } from '../types';

interface DebtorEntryRow {
  key: string;
  debtor: Debtor;
  status: DebtorStatus;
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
  const { persona, debtors, natureList, descriptionList, updateDebtorsStatus, deleteDebtors } =
    useApp();
  const [showNew, setShowNew] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [viewingDebtorId, setViewingDebtorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const viewingDebtor = viewingDebtorId ? (debtors.find((d) => d.id === viewingDebtorId) ?? null) : null;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const scopedDebtors = useMemo(() => visibleDebtors(persona, debtors), [debtors, persona]);

  const rows: DebtorEntryRow[] = useMemo(() => {
    const out: DebtorEntryRow[] = [];
    for (const d of scopedDebtors) {
      debtorAmountRows(d).forEach((entry, idx) => {
        out.push({
          key: `${d.id}-${idx}`,
          debtor: d,
          status: d.status,
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

  // The status a row must be in for the current persona to act on it via the
  // checkbox + bulk action buttons: Branch Rep acts on their own Drafts,
  // Reviewer 1 acts on Pending Review items. Everyone else is read-only.
  const actionableStatus: DebtorStatus | null =
    persona.role === 'BRANCH_REP' ? 'DRAFT' : persona.role === 'REVIEWER_1' ? 'PENDING_REVIEW' : null;

  const eligibleIds = useMemo(() => {
    if (!actionableStatus) return new Set<string>();
    return new Set(rows.filter((r) => r.status === actionableStatus).map((r) => r.debtor.id));
  }, [rows, actionableStatus]);

  const toggleRow = (debtorId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(debtorId)) next.delete(debtorId);
      else next.add(debtorId);
      return next;
    });
  };

  const allEligibleSelected =
    eligibleIds.size > 0 && [...eligibleIds].every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  };

  const selectedEligible = [...selected].filter((id) => eligibleIds.has(id));

  const handleSubmit = () => {
    if (selectedEligible.length === 0) return;
    updateDebtorsStatus(selectedEligible, 'PENDING_REVIEW', 'Submitted for review', persona.label);
    setSelected(new Set());
  };

  const handleDelete = () => {
    if (selectedEligible.length === 0) return;
    const count = selectedEligible.length;
    if (!window.confirm(`Delete ${count} draft ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) {
      return;
    }
    deleteDebtors(selectedEligible);
    setSelected(new Set());
  };

  const handleApprove = () => {
    if (selectedEligible.length === 0) return;
    updateDebtorsStatus(selectedEligible, 'SUPPORTED', 'Approved', persona.label);
    setSelected(new Set());
  };

  const handleReject = () => {
    if (selectedEligible.length === 0) return;
    updateDebtorsStatus(selectedEligible, 'DRAFT', 'Rejected', persona.label);
    setSelected(new Set());
  };

  const columns: ColumnDef<DebtorEntryRow>[] = [];

  if (actionableStatus) {
    columns.push({
      key: 'select',
      sortable: false,
      align: 'center',
      header: (
        <input
          type="checkbox"
          checked={allEligibleSelected}
          onChange={toggleAll}
          aria-label="Select all"
        />
      ),
      accessor: () => '',
      render: (r) =>
        r.status === actionableStatus ? (
          <input
            type="checkbox"
            checked={selected.has(r.debtor.id)}
            onChange={() => toggleRow(r.debtor.id)}
            aria-label={`Select ${r.name}`}
          />
        ) : null,
    });
  }

  columns.push(
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
      sortType: 'alpha',
    },
    {
      key: 'name',
      header: 'Name',
      accessor: (r) => r.name,
      sortType: 'alpha',
      render: (r) => (
        <button
          onClick={() =>
            canEdit && (r.status === 'DRAFT' || r.status === 'PENDING_REVIEW')
              ? setEditingDebtor(r.debtor)
              : setViewingDebtorId(r.debtor.id)
          }
          className="font-medium text-brand-navy underline decoration-dotted underline-offset-2 hover:text-brand-gold"
        >
          {r.name}
        </button>
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
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Debtor List</h1>
        <div className="flex items-center gap-2">
          {persona.role === 'BRANCH_REP' && (
            <>
              <button
                onClick={handleDelete}
                disabled={selectedEligible.length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedEligible.length === 0}
                className="rounded-md border border-brand-navy/30 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            </>
          )}
          {persona.role === 'REVIEWER_1' && (
            <>
              <button
                onClick={handleReject}
                disabled={selectedEligible.length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={selectedEligible.length === 0}
                className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Approve
              </button>
            </>
          )}
          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95"
            >
              + New
            </button>
          )}
        </div>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        {persona.role === 'FINANCE'
          ? 'Showing all branches.'
          : `Showing records for ${persona.branch} only.`}{' '}
        Click a column header to sort. Click a debtor's name to view its details.
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

      {viewingDebtor && (
        <DebtorDetailsModal debtor={viewingDebtor} onClose={() => setViewingDebtorId(null)} />
      )}
    </div>
  );
}
