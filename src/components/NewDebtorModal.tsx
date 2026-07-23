import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BRANCHES } from '../types';
import type { Branch } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { bucketLabel, computeAgingBuckets } from '../utils/aging';

interface NewDebtorModalProps {
  lockedBranch: Branch | null;
  onClose: () => void;
}

export function NewDebtorModal({ lockedBranch, onClose }: NewDebtorModalProps) {
  const { natureList, descriptionList, addDebtor, simulatedToday } = useApp();
  const activeNature = natureList.filter((n) => n.active);
  const activeDescription = descriptionList.filter((d) => d.active);

  const [branch, setBranch] = useState<Branch>(lockedBranch ?? BRANCHES[0]);
  const [name, setName] = useState('');
  const [natureId, setNatureId] = useState(activeNature[0]?.id ?? '');
  const [descriptionId, setDescriptionId] = useState(activeDescription[0]?.id ?? '');
  const [totalAR, setTotalAR] = useState(0);
  const [requiredPaidDate, setRequiredPaidDate] = useState('');
  const [reasonNonRecovery, setReasonNonRecovery] = useState('');
  const [recoverySteps, setRecoverySteps] = useState('');

  const canSave =
    name.trim() !== '' && natureId !== '' && descriptionId !== '' && requiredPaidDate !== '';

  const previewLabel =
    requiredPaidDate !== ''
      ? bucketLabel(computeAgingBuckets(totalAR, requiredPaidDate, simulatedToday))
      : null;

  const handleSave = () => {
    if (!canSave) return;
    addDebtor({
      branch,
      name: name.trim(),
      natureId,
      descriptionId,
      notInArrears: 0,
      arrears6m: 0,
      arrears6to12m: 0,
      arrears1to2y: 0,
      arrears2to3y: 0,
      arrears3to4y: 0,
      arrears4to5y: 0,
      arrears5yPlus: 0,
      reasonNonRecovery,
      recoverySteps,
      requiredPaidDate,
      totalARAmount: totalAR,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-3">
          <h2 className="text-lg font-semibold text-white">New Debtor Entry</h2>
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

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Total AR</label>
            <CurrencyInput value={totalAR} onChange={setTotalAR} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Required Paid Date
            </label>
            <input
              type="date"
              value={requiredPaidDate}
              onChange={(e) => setRequiredPaidDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
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
            The aging column is calculated automatically from the Required Paid Date compared to
            today's date ({simulatedToday}), and will keep shifting live if the simulated date
            changes.
            {previewLabel && (
              <>
                {' '}
                Currently falls under: <span className="font-semibold text-brand-navy">{previewLabel}</span>.
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
