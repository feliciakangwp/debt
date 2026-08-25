import type { DebtorStatus } from '../types';

const STATUS_STYLES: Record<DebtorStatus, string> = {
  DRAFT: 'bg-slate-200 text-slate-600',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  SUPPORTED: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<DebtorStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  SUPPORTED: 'Supported',
};

export function StatusBadge({ status }: { status: DebtorStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
