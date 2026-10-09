import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { DebtorFormModal } from '../components/DebtorFormModal';
import { DebtorDetailsModal } from '../components/DebtorDetailsModal';
import { EffectiveStatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '../utils/format';
import { debtorAmountRowsNetOfWriteOff, debtorRemainingBalance, withinListRetentionWindow } from '../utils/aging';
import { isSuperAdmin, visibleDebtRecords } from '../utils/visibility';
import { PERSONAS } from '../types';
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

function personaLabel(id: string | undefined): string {
  if (!id) return '-';
  return PERSONAS.find((p) => p.id === id)?.label ?? id;
}

interface DebtorListPageProps {
  /** true = "(FIN) List of Debt Records": every record across every branch,
   * read-only — Finance Officer's (and Head FIN / DY Head FIN's double-hat)
   * oversight copy, same convention as every other "(Fin) X" tab in the app.
   * false = "List of Debt Records": scoped to just the records the viewer
   * is personally tagged on (Assigned To, Reviewer 1, or Reviewer 2), with
   * the full create/submit/review workflow. */
  consolidated?: boolean;
}

export function DebtorListPage({ consolidated = false }: DebtorListPageProps) {
  const {
    persona,
    debtors,
    natureList,
    descriptionList,
    simulatedToday,
    updateDebtorsStatus,
    deleteDebtors,
    markDebtorsPaid,
  } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [viewingDebtorId, setViewingDebtorId] = useState<string | null>(null);
  const [viewingEntryIndex, setViewingEntryIndex] = useState<number>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);
  const viewingDebtor = viewingDebtorId ? (debtors.find((d) => d.id === viewingDebtorId) ?? null) : null;

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  // List of Debt Records (and its (FIN) copy) are the only views where a
  // fully closed record (Paid, or written off down to $0) drops off after a
  // year — every other report keeps showing full history indefinitely.
  const scopedDebtors = useMemo(() => {
    const base = consolidated ? debtors : visibleDebtRecords(persona, debtors);
    return base.filter((d) => withinListRetentionWindow(d, simulatedToday));
  }, [debtors, persona, consolidated, simulatedToday]);

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

  // The consolidated (FIN) copy is read-only oversight — same convention as
  // every other "(Fin) X" tab in the app — even for a Head FIN/DY Head FIN
  // double-hat, who act on their own tagged records via the regular tab.
  const canActAsBranchRep = !consolidated && (persona.role === 'BRANCH_REP' || isSuperAdmin(persona));
  const canActAsReviewer =
    !consolidated && (persona.role === 'HEAD' || persona.role === 'DY_HEAD' || isSuperAdmin(persona));
  const canCreate = canActAsBranchRep;
  const canEdit = canActAsBranchRep;

  // Which rows the current persona can tick a checkbox for, bucketed by
  // review stage: a Draft is only actionable by its Assigned To (the
  // creating Branch Rep); Pending Review only by the named Reviewer 1 — not
  // just anyone holding the right role, since access is per-record, not
  // branch-wide. Reviewer 2 is informational only and never acts here.
  const draftEligibleIds = useMemo(() => {
    if (!canActAsBranchRep) return new Set<string>();
    return new Set(
      rows
        .filter((r) => r.status === 'DRAFT' && (isSuperAdmin(persona) || r.debtor.assignedToId === persona.id))
        .map((r) => r.debtor.id),
    );
  }, [rows, canActAsBranchRep, persona]);

  const reviewEligibleIds = useMemo(() => {
    if (!canActAsReviewer) return new Set<string>();
    return new Set(
      rows
        .filter(
          (r) => r.status === 'PENDING_REVIEW' && (isSuperAdmin(persona) || r.debtor.reviewer1Id === persona.id),
        )
        .map((r) => r.debtor.id),
    );
  }, [rows, canActAsReviewer, persona]);

  // Supported lines its own Assigned To Branch Rep can mark fully Paid in
  // one go via the Paid button.
  const paidEligibleIds = useMemo(() => {
    if (!canActAsBranchRep) return new Set<string>();
    return new Set(
      rows
        .filter((r) => r.status === 'SUPPORTED' && (isSuperAdmin(persona) || r.debtor.assignedToId === persona.id))
        .map((r) => r.debtor.id),
    );
  }, [rows, canActAsBranchRep, persona]);

  const eligibleIds = useMemo(
    () => new Set([...draftEligibleIds, ...reviewEligibleIds, ...paidEligibleIds]),
    [draftEligibleIds, reviewEligibleIds, paidEligibleIds],
  );

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

  const selectedDraftIds = [...selected].filter((id) => draftEligibleIds.has(id));
  const selectedReviewIds = [...selected].filter((id) => reviewEligibleIds.has(id));
  const selectedPaidIds = [...selected].filter((id) => paidEligibleIds.has(id));

  const totalPaidAmount = useMemo(
    () =>
      selectedPaidIds.reduce((sum, id) => {
        const debtor = scopedDebtors.find((d) => d.id === id);
        return debtor ? sum + debtorRemainingBalance(debtor) : sum;
      }, 0),
    [selectedPaidIds, scopedDebtors],
  );

  const handleSubmit = () => {
    if (selectedDraftIds.length === 0) return;
    updateDebtorsStatus(selectedDraftIds, 'PENDING_REVIEW', 'Submitted for review', persona.label);
    setSelected(new Set());
  };

  const handleDelete = () => {
    if (selectedDraftIds.length === 0) return;
    const count = selectedDraftIds.length;
    if (!window.confirm(`Delete ${count} draft ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) {
      return;
    }
    deleteDebtors(selectedDraftIds);
    setSelected(new Set());
  };

  const handleApprove = () => {
    if (selectedReviewIds.length === 0) return;
    updateDebtorsStatus(selectedReviewIds, 'SUPPORTED', 'Approved by Reviewer 1', persona.label);
    setSelected(new Set());
  };

  const handleReject = () => {
    if (selectedReviewIds.length === 0) return;
    updateDebtorsStatus(selectedReviewIds, 'DRAFT', 'Rejected', persona.label);
    setSelected(new Set());
  };

  const handleConfirmPaid = () => {
    if (selectedPaidIds.length === 0) return;
    markDebtorsPaid(selectedPaidIds, simulatedToday, persona.label);
    setSelected(new Set());
    setShowPaidConfirm(false);
  };

  const columns: ColumnDef<DebtorEntryRow>[] = [];

  if (!consolidated && (canActAsBranchRep || canActAsReviewer)) {
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
        eligibleIds.has(r.debtor.id) ? (
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
      // A debtor only ever shows one status at a time: a write-off in
      // flight (To Be Written Off / Request Write Off) takes over from
      // the debtor's own status until it's resolved, so it's visible when
      // scanning the whole list — not just inside the popup.
      accessor: (r) => (r.debtor.writeOffs.find((w) => w.status !== 'SUPPORTED')?.status ?? r.status),
      render: (r) => <EffectiveStatusBadge debtor={r.debtor} />,
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
            if (!consolidated && canEdit && (r.status === 'DRAFT' || r.status === 'PENDING_REVIEW')) {
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
      key: 'caseReference',
      header: 'Case Reference',
      accessor: (r) => r.caseReference,
      render: (r) => r.caseReference || '-',
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
    {
      key: 'assignedTo',
      header: 'Assigned To',
      accessor: (r) => personaLabel(r.debtor.assignedToId),
      sortType: 'alpha',
    },
    {
      key: 'reviewer1',
      header: 'Reviewer 1',
      accessor: (r) => personaLabel(r.debtor.reviewer1Id),
      sortType: 'alpha',
    },
    {
      key: 'reviewer2',
      header: 'Reviewer 2',
      accessor: (r) => personaLabel(r.debtor.reviewer2Id),
      sortType: 'alpha',
    },
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">
          {consolidated ? '(FIN) List of Debt Records' : 'List of Debt Records'}
        </h1>
        <div className="flex items-center gap-2">
          {canActAsBranchRep && (
            <>
              <button
                onClick={handleDelete}
                disabled={selectedDraftIds.length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setShowPaidConfirm(true)}
                disabled={selectedPaidIds.length === 0}
                className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Paid
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedDraftIds.length === 0}
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
                disabled={selectedReviewIds.length === 0}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={selectedReviewIds.length === 0}
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
        {consolidated
          ? 'Compiled across all branches.'
          : 'Showing records you are tagged on — as Assigned To, Reviewer 1, or Reviewer 2.'}{' '}
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

      {showPaidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold text-brand-navy">Confirm Payment</h2>
            <p className="mb-5 text-sm text-slate-600">Total Paid - {formatCurrency(totalPaidAmount)}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPaidConfirm(false)}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPaid}
                className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
