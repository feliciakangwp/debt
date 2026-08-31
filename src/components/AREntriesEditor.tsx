import { CurrencyInput } from './CurrencyInput';
import {
  bucketLabel,
  computeAgingBuckets,
  computeAgingBucketsForEntries,
  summarizeBuckets,
} from '../utils/aging';
import type { AREntry } from '../types';

interface AREntriesEditorProps {
  entries: AREntry[];
  onChange: (entries: AREntry[]) => void;
  simulatedToday: string;
  /** True while an untouched legacy fixed-bucket debtor's original
   * distribution should be shown instead of a live aging preview. */
  preserveLegacyBuckets?: boolean;
  legacyDistributionSummary?: string | null;
}

export function AREntriesEditor({
  entries,
  onChange,
  simulatedToday,
  preserveLegacyBuckets = false,
  legacyDistributionSummary = null,
}: AREntriesEditorProps) {
  const updateEntry = (id: string, patch: Partial<Omit<AREntry, 'id'>>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const overallSummary = preserveLegacyBuckets
    ? null
    : summarizeBuckets(computeAgingBucketsForEntries(entries, simulatedToday));

  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-500">
          Total AR (one amount and Required Paid Date per debtor)
        </label>
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
        {entries.map((entry) => {
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
                <button
                  type="button"
                  onClick={() => updateEntry(entry.id, { requiredPaidDate: simulatedToday })}
                  title="Set to today's date"
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-brand-navy hover:text-white"
                >
                  Today
                </button>
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

      <p className="mt-2 text-xs text-slate-400">
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
  );
}
