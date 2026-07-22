import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BRANCHES } from '../types';
import type { Branch } from '../types';
import { CurrencyInput } from './CurrencyInput';

interface NewDebtorModalProps {
  lockedBranch: Branch | null;
  onClose: () => void;
}

export function NewDebtorModal({ lockedBranch, onClose }: NewDebtorModalProps) {
  const { natureList, descriptionList, addDebtor } = useApp();
  const activeNature = natureList.filter((n) => n.active);
  const activeDescription = descriptionList.filter((d) => d.active);

  const [branch, setBranch] = useState<Branch>(lockedBranch ?? BRANCHES[0]);
  const [name, setName] = useState('');
  const [natureId, setNatureId] = useState(activeNature[0]?.id ?? '');
  const [descriptionId, setDescriptionId] = useState(activeDescription[0]?.id ?? '');
  const [notInArrears, setNotInArrears] = useState(0);
  const [arrears6m, setArrears6m] = useState(0);
  const [arrears6to12m, setArrears6to12m] = useState(0);
  const [arrears1to2y, setArrears1to2y] = useState(0);
  const [arrears2to3y, setArrears2to3y] = useState(0);
  const [arrears3to4y, setArrears3to4y] = useState(0);
  const [arrears4to5y, setArrears4to5y] = useState(0);
  const [arrears5yPlus, setArrears5yPlus] = useState(0);
  const [reasonNonRecovery, setReasonNonRecovery] = useState('');
  const [recoverySteps, setRecoverySteps] = useState('');

  const canSave = name.trim() !== '' && natureId !== '' && descriptionId !== '';

  const handleSave = () => {
    if (!canSave) return;
    addDebtor({
      branch,
      name: name.trim(),
      natureId,
      descriptionId,
      notInArrears,
      arrears6m,
      arrears6to12m,
      arrears1to2y,
      arrears2to3y,
      arrears3to4y,
      arrears4to5y,
      arrears5yPlus,
      reasonNonRecovery,
      recoverySteps,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
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
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR Not in Arrears
            </label>
            <CurrencyInput value={notInArrears} onChange={setNotInArrears} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears ≤ 6 months
            </label>
            <CurrencyInput value={arrears6m} onChange={setArrears6m} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears (6-12 months)
            </label>
            <CurrencyInput value={arrears6to12m} onChange={setArrears6to12m} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears (1-2yrs)
            </label>
            <CurrencyInput value={arrears1to2y} onChange={setArrears1to2y} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears (2-3yrs)
            </label>
            <CurrencyInput value={arrears2to3y} onChange={setArrears2to3y} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears (3-4yrs)
            </label>
            <CurrencyInput value={arrears3to4y} onChange={setArrears3to4y} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears (4-5yrs)
            </label>
            <CurrencyInput value={arrears4to5y} onChange={setArrears4to5y} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              AR in Arrears ≥ 5 years
            </label>
            <CurrencyInput value={arrears5yPlus} onChange={setArrears5yPlus} />
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Reason for non-recovery (for arrears)
            </label>
            <input
              value={reasonNonRecovery}
              onChange={(e) => setReasonNonRecovery(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Recovery steps taken (for arrears)
            </label>
            <input
              value={recoverySteps}
              onChange={(e) => setRecoverySteps(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>
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
