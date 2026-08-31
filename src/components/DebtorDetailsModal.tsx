import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AREntriesEditor } from './AREntriesEditor';
import { StatusBadge, WriteOffStatusBadge } from './StatusBadge';
import { formatCurrency } from '../utils/format';
import {
  buildTransactionLedgerForEntry,
  daysBetween,
  debtorAmountRows,
  firstArrearDate,
  summarizeBuckets,
  totalSupportedWriteOff,
} from '../utils/aging';
import { isSuperAdmin } from '../utils/visibility';
import type { AREntry, Debtor, TransactionType } from '../types';

const TRANSACTION_LABELS: Record<TransactionType, string> = {
  ARREARS: 'Arrears',
  WRITE_OFF: 'Write Off',
  PAID: 'Paid',
};

interface DebtorDetailsModalProps {
  debtor: Debtor;
  /** Index of the specific AR entry (line item) whose row was clicked in
   * List of Debtors — scopes the Transaction Listing to just that line,
   * not the debtor's other, unrelated entries. */
  entryIndex: number;
  onClose: () => void;
}

function makeEntryId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function entriesSignature(entries: { amount: number; requiredPaidDate: string }[]): string {
  return JSON.stringify(entries.map((e) => ({ amount: e.amount, requiredPaidDate: e.requiredPaidDate })));
}

function DiffField({
  label,
  current,
  proposed,
  changed,
}: {
  label: string;
  current: string;
  proposed?: string;
  changed: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      {changed && proposed !== undefined ? (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-sm">
          <span className="text-slate-400 line-through">{current}</span>{' '}
          <span className="font-semibold text-sky-800">→ {proposed}</span>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700">{current}</div>
      )}
    </div>
  );
}

export function DebtorDetailsModal({ debtor, entryIndex, onClose }: DebtorDetailsModalProps) {
  const {
    persona,
    natureList,
    descriptionList,
    simulatedToday,
    updateDebtorDetails,
    requestEdit,
    approveEdit,
    rejectEdit,
    saveWriteOff,
    supportWriteOff,
  } = useApp();

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;
  const activeNature = natureList.filter((n) => n.active);
  const descriptionsForNature = (nId: string) =>
    descriptionList.filter((d) => d.active && d.natureId === nId);

  const isBranchRep = persona.role === 'BRANCH_REP' || isSuperAdmin(persona);
  const isReviewer = persona.role === 'REVIEWER_1' || isSuperAdmin(persona);
  // Direct-edit fields and "Request to Edit" are only available once a
  // record is Supported — Draft uses the full form instead, and a record
  // that's still Pending Review or already has an edit pending shouldn't be
  // changeable outside that review flow.
  const canEditDetails = isBranchRep && debtor.status === 'SUPPORTED';

  // --- Reason / Recovery Steps: editable once Supported. Case Reference is
  // locked outside the Request to Edit flow (see below) — once a debtor is
  // Supported it can never be changed by a direct Save. ---
  const [reasonNonRecovery, setReasonNonRecovery] = useState(debtor.reasonNonRecovery);
  const [recoverySteps, setRecoverySteps] = useState(debtor.recoverySteps);
  const detailsChanged =
    reasonNonRecovery !== debtor.reasonNonRecovery || recoverySteps !== debtor.recoverySteps;

  const handleSaveDetails = () => {
    updateDebtorDetails(debtor.id, { reasonNonRecovery, recoverySteps }, persona.label);
  };

  // --- Request to Edit (Supported only): unlocks the other fields ---
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [proposalName, setProposalName] = useState(debtor.name);
  const [proposalNatureId, setProposalNatureId] = useState(debtor.natureId);
  const [proposalDescriptionId, setProposalDescriptionId] = useState(debtor.descriptionId);
  const [proposalCaseReference, setProposalCaseReference] = useState(debtor.caseReference);
  const [initialProposalEntries] = useState<AREntry[]>(() =>
    debtorAmountRows(debtor).map((row) => ({ id: makeEntryId(), ...row })),
  );
  const [proposalEntries, setProposalEntries] = useState<AREntry[]>(initialProposalEntries);

  const proposalActiveDescription = descriptionsForNature(proposalNatureId);
  const handleProposalNatureChange = (newNatureId: string) => {
    setProposalNatureId(newNatureId);
    const stillValid = descriptionsForNature(newNatureId).some((d) => d.id === proposalDescriptionId);
    if (!stillValid) setProposalDescriptionId(descriptionsForNature(newNatureId)[0]?.id ?? '');
  };

  // A legacy record (manually distributed bucket amounts, no due date at
  // all) that the user hasn't touched the amounts/dates on yet: requesting
  // to edit just the name/nature/description shouldn't be blocked by a
  // missing Required Paid Date, and shouldn't collapse its original
  // per-bucket distribution into a single lump sum.
  const isPureLegacyEdit = !(debtor.arEntries && debtor.arEntries.length > 0) && !debtor.requiredPaidDate;
  const proposalEntriesChanged =
    JSON.stringify(proposalEntries) !== JSON.stringify(initialProposalEntries);
  const preserveLegacyBuckets = isPureLegacyEdit && !proposalEntriesChanged;

  const legacyDistributionSummary = isPureLegacyEdit
    ? summarizeBuckets({
        notInArrears: debtor.notInArrears,
        arrears6m: debtor.arrears6m,
        arrears6to12m: debtor.arrears6to12m,
        arrears1to2y: debtor.arrears1to2y,
        arrears2to3y: debtor.arrears2to3y,
        arrears3to4y: debtor.arrears3to4y,
        arrears4to5y: debtor.arrears4to5y,
        arrears5yPlus: debtor.arrears5yPlus,
      })
    : null;

  const canSubmitEdit =
    proposalName.trim() !== '' &&
    proposalNatureId !== '' &&
    proposalDescriptionId !== '' &&
    proposalCaseReference.trim() !== '' &&
    proposalEntries.length > 0 &&
    (preserveLegacyBuckets || proposalEntries.every((e) => e.requiredPaidDate !== ''));

  const handleSubmitEditRequest = () => {
    if (!canSubmitEdit) return;
    requestEdit(
      debtor.id,
      {
        name: proposalName.trim(),
        natureId: proposalNatureId,
        descriptionId: proposalDescriptionId,
        caseReference: proposalCaseReference.trim(),
        arEntries: preserveLegacyBuckets ? undefined : proposalEntries,
      },
      persona.label,
    );
    onClose();
  };

  // --- Reviewer 1 decision on a pending edit request ---
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const handleApproveEdit = () => {
    approveEdit(debtor.id, persona.label);
    onClose();
  };

  const handleConfirmReject = () => {
    if (rejectComment.trim() === '') return;
    rejectEdit(debtor.id, persona.label, rejectComment.trim());
    onClose();
  };

  // --- diff computation for Edit Requested ---
  const proposal = debtor.status === 'EDIT_REQUESTED' ? debtor.editProposal : undefined;
  const currentEntries = debtorAmountRows(debtor);
  // Scoped to just the AR entry (line item) that was clicked in List of
  // Debtors — a debtor's Total AR here should never be compiled with other
  // lines.
  const scopedCurrentEntries = currentEntries[entryIndex] !== undefined ? [currentEntries[entryIndex]] : [];
  const scopedProposalEntries = proposal?.arEntries
    ? proposal.arEntries[entryIndex] !== undefined
      ? [proposal.arEntries[entryIndex]]
      : proposal.arEntries
    : undefined;
  const nameChanged = proposal ? proposal.name !== debtor.name : false;
  const natureChanged = proposal ? proposal.natureId !== debtor.natureId : false;
  const descChanged = proposal ? proposal.descriptionId !== debtor.descriptionId : false;
  const caseReferenceChanged = proposal ? proposal.caseReference !== debtor.caseReference : false;
  const entriesChanged = proposal?.arEntries
    ? entriesSignature(proposal.arEntries) !== entriesSignature(currentEntries)
    : false;

  // --- Write Off: Branch Rep saves (To be Written Off, still editable) or
  // submits (Pending, locked, routed to Reviewer 1). Reviewer 1 then
  // supports it (Supported), which knocks the amount off the debtor's
  // arrears via resolveDebtorBuckets. Write-offs are repeatable: at most one
  // record is ever "in flight" (not yet Supported) at a time; once that one
  // is Supported, Branch Rep can start another if there's still a balance
  // left on this line item. ---
  const [writingOff, setWritingOff] = useState(false);
  const [writeOffDate, setWriteOffDate] = useState(simulatedToday);
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');

  const activeWriteOff = debtor.writeOffs.find((w) => w.status !== 'SUPPORTED');
  const supportedWriteOffTotal = totalSupportedWriteOff(debtor);
  const entryGrossAmount = currentEntries[entryIndex]?.amount ?? 0;
  const remainingBalance = entryGrossAmount - supportedWriteOffTotal;

  const arrearStart = firstArrearDate(debtor, simulatedToday);
  const daysInArrears = arrearStart ? daysBetween(arrearStart, writeOffDate) : null;
  const canSaveWriteOff =
    writeOffDate !== '' &&
    writeOffAmount.trim() !== '' &&
    Number(writeOffAmount) > 0 &&
    Number(writeOffAmount) <= remainingBalance &&
    writeOffReason.trim() !== '' &&
    daysInArrears !== null &&
    daysInArrears >= 0;

  const handleStartWriteOff = () => {
    setWriteOffDate(activeWriteOff?.dateOfWriteOff ?? simulatedToday);
    setWriteOffAmount(activeWriteOff ? String(activeWriteOff.writeOffAmount) : '');
    setWriteOffReason(activeWriteOff?.reasonForWriteOff ?? '');
    setWritingOff(true);
  };

  const handleSaveOrSubmitWriteOff = (submit: boolean) => {
    if (!canSaveWriteOff || daysInArrears === null) return;
    saveWriteOff(
      debtor.id,
      {
        dateOfWriteOff: writeOffDate,
        writeOffAmount: Number(writeOffAmount),
        daysInArrears,
        reasonForWriteOff: writeOffReason.trim(),
      },
      persona.label,
      submit,
    );
    setWritingOff(false);
  };

  // Submits an already-saved (To be Written Off) record as-is, from the
  // read-only summary view — doesn't depend on the form's local state,
  // which is only populated while the form is actually open.
  const handleSubmitExistingWriteOff = () => {
    if (!activeWriteOff) return;
    saveWriteOff(
      debtor.id,
      {
        dateOfWriteOff: activeWriteOff.dateOfWriteOff,
        writeOffAmount: activeWriteOff.writeOffAmount,
        daysInArrears: activeWriteOff.daysInArrears,
        reasonForWriteOff: activeWriteOff.reasonForWriteOff,
      },
      persona.label,
      true,
    );
  };

  const handleSupportWriteOff = () => {
    if (!activeWriteOff) return;
    supportWriteOff(debtor.id, activeWriteOff.id, persona.label);
  };

  const writeOffHistory = debtor.writeOffs.filter((w) => w.status === 'SUPPORTED');

  const ledger = buildTransactionLedgerForEntry(debtor, entryIndex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Debtor Details</h2>
            <StatusBadge status={debtor.status} />
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">SB/Dept</label>
            <div className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700">
              {debtor.branch}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Name of Debtor</label>
            {requestingEdit ? (
              <input
                value={proposalName}
                onChange={(e) => setProposalName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
              />
            ) : (
              <DiffField
                label=""
                current={debtor.name}
                proposed={proposal?.name}
                changed={nameChanged}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Nature of AR/ Arrears
            </label>
            {requestingEdit ? (
              <select
                value={proposalNatureId}
                onChange={(e) => handleProposalNatureChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {activeNature.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            ) : (
              <DiffField
                label=""
                current={natureName(debtor.natureId)}
                proposed={proposal ? natureName(proposal.natureId) : undefined}
                changed={natureChanged}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
            {requestingEdit ? (
              <select
                value={proposalDescriptionId}
                onChange={(e) => setProposalDescriptionId(e.target.value)}
                disabled={proposalActiveDescription.length === 0}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
              >
                {proposalActiveDescription.length === 0 && (
                  <option value="">No descriptions linked</option>
                )}
                {proposalActiveDescription.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <DiffField
                label=""
                current={descName(debtor.descriptionId)}
                proposed={proposal ? descName(proposal.descriptionId) : undefined}
                changed={descChanged}
              />
            )}
          </div>

          {requestingEdit ? (
            <AREntriesEditor
              entries={proposalEntries}
              onChange={setProposalEntries}
              simulatedToday={simulatedToday}
              preserveLegacyBuckets={preserveLegacyBuckets}
              legacyDistributionSummary={legacyDistributionSummary}
            />
          ) : (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Total AR</label>
              {entriesChanged && scopedProposalEntries ? (
                <>
                  <div className="mb-1 text-xs font-semibold text-slate-400">Current</div>
                  <div className="mb-2 space-y-1">
                    {scopedCurrentEntries.map((e, i) => (
                      <div
                        key={i}
                        className="flex justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-400 line-through"
                      >
                        <span>{formatCurrency(e.amount)}</span>
                        <span>{e.requiredPaidDate || 'No due date'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mb-1 text-xs font-semibold text-sky-600">Proposed</div>
                  <div className="space-y-1">
                    {scopedProposalEntries.map((e, i) => (
                      <div
                        key={e.id ?? i}
                        className="flex justify-between rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-800"
                      >
                        <span>{formatCurrency(e.amount)}</span>
                        <span>{e.requiredPaidDate || 'No due date'}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {scopedCurrentEntries.map((e, i) => (
                    <div
                      key={i}
                      className="flex justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                    >
                      <span>{formatCurrency(e.amount)}</span>
                      <span className="text-slate-500">{e.requiredPaidDate || 'No due date'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Case Reference</label>
            {requestingEdit ? (
              <input
                value={proposalCaseReference}
                onChange={(e) => setProposalCaseReference(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
                placeholder="Free text"
              />
            ) : (
              <DiffField
                label=""
                current={debtor.caseReference}
                proposed={proposal?.caseReference}
                changed={caseReferenceChanged}
              />
            )}
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Reason for non-recovery
            </label>
            <input
              value={reasonNonRecovery}
              onChange={(e) => setReasonNonRecovery(e.target.value)}
              disabled={!canEditDetails}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none disabled:bg-slate-100"
            />
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Recovery steps taken
            </label>
            <input
              value={recoverySteps}
              onChange={(e) => setRecoverySteps(e.target.value)}
              disabled={!canEditDetails}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none disabled:bg-slate-100"
            />
          </div>

          {showRejectBox && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                Reason for rejecting this edit (required)
              </label>
              <input
                autoFocus
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                className="w-full rounded-md border border-red-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Explain why this edit is being rejected"
              />
            </div>
          )}

          <div className="col-span-2 border-t border-slate-200 pt-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Activity Log</label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
              {debtor.auditLog.length === 0 && (
                <p className="text-xs text-slate-400">No activity yet.</p>
              )}
              {[...debtor.auditLog]
                .reverse()
                .map((entry) => (
                  <div key={entry.id} className="text-xs text-slate-600">
                    <span className="font-semibold text-brand-navy">{entry.date}</span> —{' '}
                    {entry.actor}: {entry.action}
                  </div>
                ))}
            </div>
          </div>

          <div className="col-span-2 border-t border-slate-200 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">Write Off</label>
              {activeWriteOff && <WriteOffStatusBadge status={activeWriteOff.status} />}
            </div>

            {writingOff ? (
              <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Date of Write Off</label>
                    <input
                      type="date"
                      value={writeOffDate}
                      onChange={(e) => setWriteOffDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Write Off Amount</label>
                    <input
                      type="number"
                      min="0"
                      value={writeOffAmount}
                      onChange={(e) => setWriteOffAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Days in Arrears</label>
                    <div className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm text-slate-500">
                      {daysInArrears !== null ? daysInArrears : 'No arrears on record'}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Reasons for Write-Offs</label>
                    <input
                      value={writeOffReason}
                      onChange={(e) => setWriteOffReason(e.target.value)}
                      placeholder="Free text"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setWritingOff(false)}
                    className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveOrSubmitWriteOff(false)}
                    disabled={!canSaveWriteOff}
                    className="rounded-md border border-brand-navy/30 px-4 py-1.5 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => handleSaveOrSubmitWriteOff(true)}
                    disabled={!canSaveWriteOff}
                    className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Submit
                  </button>
                </div>
              </div>
            ) : activeWriteOff ? (
              <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold text-slate-400">Date of Write Off</div>
                    <div className="text-slate-700">{activeWriteOff.dateOfWriteOff}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-400">Write Off Amount</div>
                    <div className="text-slate-700">{formatCurrency(activeWriteOff.writeOffAmount)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-400">Days in Arrears</div>
                    <div className="text-slate-700">{activeWriteOff.daysInArrears}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs font-semibold text-slate-400">Reasons for Write-Offs</div>
                    <div className="text-slate-700">{activeWriteOff.reasonForWriteOff}</div>
                  </div>
                </div>
                {isBranchRep && activeWriteOff.status === 'TO_BE_WRITTEN_OFF' && (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleStartWriteOff}
                      className="rounded-md border border-brand-navy/30 px-4 py-1.5 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleSubmitExistingWriteOff}
                      className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95"
                    >
                      Submit
                    </button>
                  </div>
                )}
                {isReviewer && activeWriteOff.status === 'PENDING' && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleSupportWriteOff}
                      className="rounded-md border border-emerald-300 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Support
                    </button>
                  </div>
                )}
              </div>
            ) : isBranchRep ? (
              remainingBalance <= 0 && supportedWriteOffTotal > 0 ? (
                <p className="text-xs text-slate-400">This line has been fully written off.</p>
              ) : arrearStart ? (
                <button
                  onClick={handleStartWriteOff}
                  className="rounded-md border border-brand-navy/30 px-4 py-1.5 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
                >
                  Write Off
                </button>
              ) : (
                <p className="text-xs text-slate-400">No arrears on record for this debtor — nothing to write off.</p>
              )
            ) : (
              <p className="text-xs text-slate-400">No write-off has been submitted for this debtor.</p>
            )}

            {writeOffHistory.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-400">Write-off history</div>
                <div className="space-y-1">
                  {writeOffHistory.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
                    >
                      <span className="shrink-0">{w.dateOfWriteOff}</span>
                      <span className="shrink-0 font-semibold text-emerald-700">
                        {formatCurrency(w.writeOffAmount)}
                      </span>
                      <span className="truncate text-slate-500" title={w.reasonForWriteOff}>
                        {w.reasonForWriteOff}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="col-span-2 border-t border-slate-200 pt-3">
            <label className="mb-2 block text-xs font-semibold text-slate-500">Transaction Listing</label>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">Transaction Date</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Transaction</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-slate-400">
                        No transactions on record.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-3 py-1.5">{row.date}</td>
                        <td className="px-3 py-1.5">{TRANSACTION_LABELS[row.type]}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(row.amount)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {requestingEdit ? (
            <>
              <button
                onClick={() => setRequestingEdit(false)}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEditRequest}
                disabled={!canSubmitEdit}
                className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit
              </button>
            </>
          ) : isReviewer && debtor.status === 'EDIT_REQUESTED' ? (
            showRejectBox ? (
              <>
                <button
                  onClick={() => setShowRejectBox(false)}
                  className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  disabled={rejectComment.trim() === ''}
                  className="rounded-md border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Reject
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowRejectBox(true)}
                  className="rounded-md border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={handleApproveEdit}
                  className="rounded-md border border-emerald-300 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Approve
                </button>
              </>
            )
          ) : (
            <>
              {canEditDetails && (
                <button
                  onClick={handleSaveDetails}
                  disabled={!detailsChanged}
                  className="rounded-md border border-brand-navy/30 px-4 py-1.5 text-sm font-semibold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save
                </button>
              )}
              {canEditDetails && (
                <button
                  onClick={() => setRequestingEdit(true)}
                  className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95"
                >
                  Request to Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
