import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { computeCallForReturnStatus } from '../utils/callForReturn';
import { CallForReturnStatusBadge } from './CfrStatusBadge';

interface CallForReturnFormModalProps {
  onClose: () => void;
}

export function CallForReturnFormModal({ onClose }: CallForReturnFormModalProps) {
  const { addCallForReturnPeriod, simulatedToday } = useApp();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const previewStatus =
    startDate && endDate ? computeCallForReturnStatus(startDate, endDate, simulatedToday) : null;

  const canSave = name.trim() !== '' && startDate !== '' && endDate !== '' && startDate <= endDate;

  const handleSave = () => {
    if (!canSave) return;
    addCallForReturnPeriod({ name: name.trim(), startDate, endDate });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-3">
          <h2 className="text-lg font-semibold text-white">New Call for Return Period</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Name (e.g. Submission Year-Month)
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026-01"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            />
            {startDate && endDate && startDate > endDate && (
              <p className="mt-1 text-xs text-red-500">Start Date must be on or before End Date.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Status</label>
            <div>
              {previewStatus ? (
                <CallForReturnStatusBadge status={previewStatus} />
              ) : (
                <span className="text-xs text-slate-400">Set both dates to preview</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              System-populated: open when today ({simulatedToday}) falls within the Start and End
              Date inclusive, closed otherwise. This updates live as the simulated date changes.
            </p>
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
