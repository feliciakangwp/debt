import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BRANCHES, totalAR as sumTotalAR } from '../types';
import type { AREntry, Branch, Debtor } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { bucketLabel, computeAgingBuckets, computeAgingBucketsForEntries, summarizeBuckets } from '../utils/aging';

interface DebtorFormModalProps {
  lockedBranch: Branch | null;
  onClose: () => void;
  /** When set, the form edits this debtor instead of creating a new one. */
  editDebtor?: Debtor;
}

function makeEntryId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function initialEntries(editDebtor?: Debtor): AREntry[] {
  if (editDebtor?.arEntries && editDebtor.arEntries.length > 0) {
    return editDebtor.arEntries.map((e) => ({ ...e }));
  }
  if (editDebtor?.requiredPaidDate) {
    return [
      {
        id: makeEntryId(),
        amount: editDebtor.totalARAmount ?? 0,
        requiredPaidDate: editDebtor.requiredPaidDate,
      },
    ];
  }
  if (editDebtor) {
    return [{ id: makeEntryId(), amount: sumTotalAR(editDebtor), requiredPaidDate: '' }];
  }
  return [{ id: makeEntryId(), amount: 0, requiredPaidDate: '' }];
}

export function DebtorFormModal({ lockedBranch, onClose, editDebtor }: DebtorFormModalProps) {
  const { natureList, descriptionList, addDebtor, updateDebtor, simulatedToday } = useApp();
  const activeNature = natureList.filter((n) => n.active);
  const activeDescription = descriptionList.filter((d) => d.active);
  const isEditing = editDebtor !== undefined;

  const [branch, setBranch] = useState<Branch>(editDebtor?.branch ?? lockedBranch ?? BRANCHES[0]);
  const [name, setName] = useState(editDebtor?.name ?? '');
  const [natureId, setNatureId] = useState(editDebtor?.natureId ?? activeNature[0]?.id ?? '');
  const [descriptionId, setDescriptionId] = useState(
    editDebtor?.descriptionId ?? activeDescription[0]?.id ?? '',
  );
  const [initialEntriesSnapshot] = useState<AREntry[]>(() => initialEntries(editDebtor));
  const [arEntries, setArEntries] = useState<AREntry[]>(initialEntriesSnapshot);
  const [reasonNonRecovery, setReasonNonRecovery] = useState(editDebtor?.reasonNonRecovery ?? '');
  const [recoverySteps, setRecoverySteps] = useState(editDebtor?.recoverySteps ?? '');

  // A legacy record (manually distributed bucket amounts, no due date at all)
  // that the user hasn't touched the amounts/dates on yet: editing an
  // unrelated field like the reason text should still be saveable without
  // forcing a Required Paid Date, and without collapsing its original
  // per-bucket distribution into a single lump sum.
  const isPureLegacyEdit =
    isEditing && !(editDebtor.arEntries && editDebtor.arEntries.length > 0) && !editDebtor.requiredPaidDate;
  const entriesChanged = JSON.stringify(arEntries) !== JSON.stringify(initialEntriesSnapshot);
  const preserveLegacyBuckets = isPureLegacyEdit && !entriesChanged;

  const canSave =
    name.trim() !== '' &&
    natureId !== '' &&
    descriptionId !== '' &&
    (isEditing ||
      (arEntries.length > 0 && arEntries.every((e) => e.requiredPaidDate !== '')));

  const addEntry = () => {
    setArEntries((prev) => [...prev, { id: makeEntryId(), amount: 0, requiredPaidDate: '' }]);
  };

  const removeEntry = (id: string) => {
    setArEntries((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev));
  };

  const updateEntry = (id: string, patch: Partial<Omit<AREntry, 'id'>>) => {
    setArEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const overallSummary = preserveLegacyBuckets
    ? null
    : summarizeBuckets(computeAgingBucketsForEntries(arEntries, simulatedToday));

  const legacyDistributionSummary = isPureLegacyEdit
    ? summarizeBuckets({
        notInArrears: editDebtor.notInArrears,
        arrears6m: editDebtor.arrears6m,
        arrears6to12m: editDebtor.arrears6to12m,
        arrears1to2y: editDebtor.arrears1to2y,
        arrears2to3y: editDebtor.arrears2to3y,
        arrears3to4y: editDebtor.arrears3to4y,
        arrears4to5y: editDebtor.arrears4to5y,
        arrears5yPlus: editDebtor.arrears5yPlus,
      })
    : null;

  const handleSave = () => {
    if (!canSave) return;
    const baseFields = {
      branch,
      name: name.trim(),
      natureId,
      descriptionId,
      reasonNonRecovery,
      recoverySteps,
    };

    if (preserveLegacyBuckets) {
      // Nothing about the aging amounts changed; only update the editable
      // metadata and leave the original bucket distribution untouched.
      updateDebtor(editDebtor.id, baseFields);
    } else {
      const dynamicFields = {
        notInArrears: 0,
        arrears6m: 0,
        arrears6to12m: 0,
        arrears1to2y: 0,
        arrears2to3y: 0,
        arrears3to4y: 0,
        arrears4to5y: 0,
        arrears5yPlus: 0,
        arEntries,
        requiredPaidDate: undefined,
        totalARAmount: undefined,
      };
      if (isEditing) updateDebtor(editDebtor.id, { ...baseFields, ...dynamicFields });
      else addDebtor({ ...baseFields, ...dynamicFields });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-3">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Debtor Entry' : 'New Debtor Entry'}
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">SB/Dept</label>
            <select
              value={branch}
              disabled={lockedBranch !== null}
              onChange={(e) => setBranch(e.target.value as Branch)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Name of Debtor
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
              placeholder="Free text"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Nature of AR/ Arrears
            </label>
            <select
              value={natureId}
              onChange={(e) => setNatureId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {activeNature.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Description
            </label>
            <select
              value={descriptionId}
              onChange={(e) => setDescriptionId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {activeDescription.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">
                Total AR (each amount can have its own Required Paid Date)
              </label>
              <button
                type="button"
                onClick={addEntry}
                className="rounded-md border border-brand-navy/30 px-2 py-0.5 text-xs font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
              >
                + Add amount
              </button>
            </div>

            {preserveLegacyBuckets && (
              <p className="mb-2 text-xs text-slate-500">
                Current distribution:{' '}
                <span className="font-semibold text-brand-navy">{legacyDistributionSummary}</span>
                . Editing the amount or setting a Required Paid Date below will replace this with
                automatic aging.
              </p>
            )}

            <div className="space-y-2">
              {arEntries.map((entry) => {
                const rowLabel = preserveLegacyBuckets
                  ? null
                  : bucketLabel(computeAgingBuckets(entry.amount, entry.requiredPaidDate, simulatedToday));
                return (
                  <div key={entry.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-32 shrink-0">
                        <CurrencyInput
                          value={entry.amount}
                          onChange={(v) => updateEntry(entry.id, { amount: v })}
                        />
                      </div>
                      <input
                        type="date"
                        value={entry.requiredPaidDate}
                        onChange={(e) => updateEntry(entry.id, { requiredPaidDate: e.target.value })}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
                      />
                      {arEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          title="Remove this amount"
                          className="shrink-0 rounded-md px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {rowLabel && (
                      <p className="mt-1 text-xs text-slate-500">
                        → <span className="font-semibold text-brand-navy">{rowLabel}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Reason for non-recovery
            </label>
            <input
              value={reasonNonRecovery}
              onChange={(e) => setReasonNonRecovery(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Recovery steps taken
            </label>
            <input
              value={recoverySteps}
              onChange={(e) => setRecoverySteps(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <p className="col-span-2 text-xs text-slate-400">
            Each amount is placed into its own aging column by comparing its Required Paid Date to
            today's date ({simulatedToday}), and will keep shifting live if the simulated date
            changes. An amount with no Required Paid Date is treated as AR Not in Arrears.
            {overallSummary && (
              <>
                {' '}
                Combined: <span className="font-semibold text-brand-navy">{overallSummary}</span>.
              </>
            )}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-navy hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEditing ? 'Save Changes' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
