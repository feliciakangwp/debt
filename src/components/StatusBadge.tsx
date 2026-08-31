import type { DebtorStatus, WriteOffStatus } from '../types';

const STATUS_STYLES: Record<DebtorStatus, string> = {
  DRAFT: 'bg-slate-200 text-slate-600',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  SUPPORTED: 'bg-emerald-100 text-emerald-700',
  EDIT_REQUESTED: 'bg-sky-100 text-sky-700',
};

const STATUS_LABELS: Record<DebtorStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  SUPPORTED: 'Supported',
  EDIT_REQUESTED: 'Edit Requested',
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

const WRITE_OFF_STYLES: Record<WriteOffStatus, string> = {
  TO_BE_WRITTEN_OFF: 'bg-slate-200 text-slate-600',
  PENDING: 'bg-amber-100 text-amber-700',
  SUPPORTED: 'bg-emerald-100 text-emerald-700',
};

const WRITE_OFF_LABELS: Record<WriteOffStatus, string> = {
  TO_BE_WRITTEN_OFF: 'To be Written Off',
  PENDING: 'Request for Write Off',
  SUPPORTED: 'Supported',
};

export function WriteOffStatusBadge({ status }: { status: WriteOffStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${WRITE_OFF_STYLES[status]}`}
    >
      {WRITE_OFF_LABELS[status]}
    </span>
  );
}
