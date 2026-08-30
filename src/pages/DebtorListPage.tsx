import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { DebtorFormModal } from '../components/DebtorFormModal';
import { DebtorDetailsModal } from '../components/DebtorDetailsModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '../utils/format';
import { debtorAmountRowsNetOfWriteOff } from '../utils/aging';
import { isSuperAdmin, visibleDebtors } from '../utils/visibility';
import type { Debtor, DebtorStatus } from '../types';

interface DebtorEntryRow {
  key: string;
  debtor: Debtor;
  /** Index of this AR entry within debtorAmountRows(debtor) — identifies
   * which specific line item this row is, so the popup's Transaction
   * Listing can be scoped to just this one instead of the whole debtor. */
  entryIndex: number;
  status: DebtorStatus;
  name: string;
  branch: Debtor['branch'];
  natureId: string;
  descriptionId: string;
  amount: number;
  requiredPaidDate: string;
  reasonNonRecovery: string;
  recoverySteps: string;
  caseReference: string;
}

export function DebtorListPage() {
  const { persona, debtors, natureList, descriptionList, simulatedToday, updateDebtorsStatus, deleteDebtors } =
    useApp();
  const [showNew, setShowNew] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [viewingDebtorId, setViewingDebtorId] = useState<string | null>(null);
  const [viewingEntryIndex, setViewingEntryIndex] = useState<number>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const viewingDebtor = viewingDebtorId ? (debtors.find((d) => d.id === viewingDebtorId) ?? null) : null;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const scopedDebtors = useMemo(() => visibleDebtors(persona, debtors), [debtors, persona]);

  const rows: DebtorEntryRow[] = useMemo(() => {
    const out: DebtorEntryRow[] = [];
    for (const d of scopedDebtors) {
      debtorAmountRowsNetOfWriteOff(d, simulatedToday).forEach((entry, idx) => {
        out.push({
          key: `${d.id}-${idx}`,
          debtor: d,
          entryIndex: idx,
          status: d.status,
          name: d.name,
          branch: d.branch,
          natureId: d.natureId,
          descriptionId: d.descriptionId,
          amount: entry.amount,
          requiredPaidDate: entry.requiredPaidDate,
          reasonNonRecovery: d.reasonNonRecovery,
          recoverySteps: d.recoverySteps,
          caseReference: d.caseReference,
        });
      });
    }
    return out;
  }, [scopedDebtors, simulatedToday]);

  const canActAsBranchRep = persona.role === 'BRANCH_REP' || isSuperAdmin(persona);
  const canActAsReviewer = persona.role === 'REVIEWER_1' || isSuperAdmin(persona);
  const canCreate = canActAsBranchRep;
  const canEdit = canActAsBranchRep;

  // Statuses the current persona can act on via the checkbox + bulk action
  // buttons: Branch Rep acts on their own Drafts, Reviewer 1 acts on Pending
  // Review items, Super Admin gets both. Everyone else is read-only.
  const actionableStatuses: DebtorStatus[] = [
    ...(canActAsBranchRep ? (['DRAFT'] as const) : []),
    ...(canActAsReviewer ? (['PENDING_REVIEW'] as const) : []),
  ];

  const eligibleIds = useMemo(() => {
    if (actionableStatuses.length === 0) return new Set<string>();
    return new Set(rows.filter((r) => actionableStatuses.includes(r.status)).map((r) => r.debtor.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canActAsBranchRep, canActAsReviewer]);

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

  // Bulk actions each narrow the selection to the specific status they act
  // on, since Super Admin can have both Draft and Pending Review rows
  // selected at once.
  const selectedWithStatus = (status: DebtorStatus) =>
    [...selected].filter((id) => rows.some((r) => r.debtor.id === id && r.status === status));

  const handleSubmit = () => {
    const ids = selectedWithStatus('DRAFT');
    if (ids.length === 0) return;
    updateDebtorsStatus(ids, 'PENDING_REVIEW', 'Submitted for review', persona.label);
    setSelected(new Set());
  };

  const handleDelete = () => {
    const ids = selectedWithStatus('DRAFT');
    if (ids.length === 0) return;
    const count = ids.length;
    if (!window.confirm(`Delete ${count} draft ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) {
      return;
    }
    deleteDebtors(ids);
    setSelected(new Set());
  };

  const handleApprove = () => {
    const ids = selectedWithStatus('PENDING_REVIEW');
    if (ids.length === 0) return;
    updateDebtorsStatus(ids, 'SUPPORTED', 'Approved', persona.label);
    setSelected(new Set());
  };

  const handleReject = () => {
    const ids = selectedWithStatus('PENDING_REVIEW');
    if (ids.length === 0) return;
    updateDebtorsStatus(ids, 'DRAFT', 'Rejected', persona.label);
    setSelected(new Set());
  };

  const columns: ColumnDef<DebtorEntryRow>[] = [];

  if (actionableStatuses.length > 0) {
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
        actionableStatuses.includes(r.status) ? (
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
      key: 'caseReference',
      header: 'Case Reference',
      accessor: (r) => r.caseReference,
      render: (r) => r.caseReference || '-',
      sortType: 'alpha',
    },
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
          onClick={() => {
            if (canEdit && (r.status === 'DRAFT' || r.status === 'PENDING_REVIEW')) {
              setEditingDebtor(r.debtor);
            } else {
              setViewingDebtorId(r.debtor.id);
              setViewingEntryIndex(r.entryIndex);
            }
          }}
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
        <h1 className="text-2xl font-bold text-brand-navy">List of Debtors</h1>
        <div className="flex items-center gap-2">
          {canActAsBranchRep && (
            <>
              <button
                onClick={handleDelete}
                disabled={selectedWithStatus('DRAFT').length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedWithStatus('DRAFT').length === 0}
                className="rounded-md border border-brand-navy/30 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            </>
          )}
          {canActAsReviewer && (
            <>
              <button
                onClick={handleReject}
                disabled={selectedWithStatus('PENDING_REVIEW').length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={selectedWithStatus('PENDING_REVIEW').length === 0}
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
        {persona.branch ? `Showing records for ${persona.branch} only.` : 'Showing all branches.'}{' '}
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
        <DebtorDetailsModal
          debtor={viewingDebtor}
          entryIndex={viewingEntryIndex}
          onClose={() => setViewingDebtorId(null)}
        />
      )}
    </div>
  );
}
