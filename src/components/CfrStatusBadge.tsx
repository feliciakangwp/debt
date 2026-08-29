import type { CallForReturnStatus, CfrSubmissionStatus } from '../types';

const SUBMISSION_STYLES: Record<CfrSubmissionStatus, string> = {
  DRAFT: 'bg-slate-200 text-slate-600',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  SUPPORTED: 'bg-sky-100 text-sky-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
};

const SUBMISSION_LABELS: Record<CfrSubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  SUPPORTED: 'Supported',
  APPROVED: 'Approved',
};

export function CfrStatusBadge({ status }: { status: CfrSubmissionStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${SUBMISSION_STYLES[status]}`}
    >
      {SUBMISSION_LABELS[status]}
    </span>
  );
}

const PERIOD_STYLES: Record<CallForReturnStatus, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-200 text-slate-600',
};

export function CallForReturnStatusBadge({ status }: { status: CallForReturnStatus }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PERIOD_STYLES[status]}`}>
      {status === 'OPEN' ? 'Open' : 'Closed'}
    </span>
  );
}
