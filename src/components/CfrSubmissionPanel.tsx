import { useApp } from '../context/AppContext';
import { CfrStatusBadge } from './CfrStatusBadge';
import { actionForAnyRole } from '../hooks/useCfrSubmissionWorkflow';
import type { CfrSubmissionWorkflow } from '../hooks/useCfrSubmissionWorkflow';
import { isSuperAdmin } from '../utils/visibility';
import { BRANCHES } from '../types';
import type { Branch } from '../types';

/** Status badge + Submit/Approve/Reject buttons for the viewing persona's
 * own branch submission. Renders nothing if they don't have one to act on
 * (e.g. Finance Officer, or a branch role with nothing pending). */
export function CfrActionButtons({ workflow }: { workflow: CfrSubmissionWorkflow }) {
  const { ownSubmission, ownAction, handleSubmit, handleApprove, setRejectingId } = workflow;
  if (!ownSubmission) return null;
  return (
    <>
      <CfrStatusBadge status={ownSubmission.status} />
      {ownAction?.kind === 'submit' && (
        <button
          onClick={() => handleSubmit(ownSubmission.id)}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95"
        >
          Submit
        </button>
      )}
      {ownAction?.kind === 'approve' && (
        <>
          <button
            onClick={() => setRejectingId(ownSubmission.id)}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Reject
          </button>
          <button
            onClick={() => handleApprove(ownSubmission.id)}
            className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Approve
          </button>
        </>
      )}
    </>
  );
}

export function CfrRejectBox({ workflow }: { workflow: CfrSubmissionWorkflow }) {
  const { rejectingId, rejectComment, setRejectingId, setRejectComment, handleConfirmReject } = workflow;
  if (!rejectingId) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3">
      <label className="mb-1 block text-xs font-semibold text-red-700">Reason for rejecting (required)</label>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          placeholder="Explain why this submission is being rejected"
          className="flex-1 rounded-md border border-red-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none"
        />
        <button
          onClick={() => {
            setRejectingId(null);
            setRejectComment('');
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirmReject}
          disabled={rejectComment.trim() === ''}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm Reject
        </button>
      </div>
    </div>
  );
}

/** Super Admin has no branch of their own, so a single top-of-page action
 * button can't represent "any branch" — this lets them act on any branch's
 * submission instead. */
export function CfrSuperAdminPanel({ workflow }: { workflow: CfrSubmissionWorkflow }) {
  const { persona } = useApp();
  const { statusByBranch, handleSubmit, handleApprove, setRejectingId } = workflow;
  if (!isSuperAdmin(persona)) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-brand-navy text-white">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Branch</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {BRANCHES.map((b: Branch, idx) => {
            const sub = statusByBranch.get(b);
            if (!sub) return null;
            const action = actionForAnyRole(sub.status);
            return (
              <tr key={b} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-2">{b}</td>
                <td className="px-3 py-2">
                  <CfrStatusBadge status={sub.status} />
                </td>
                <td className="px-3 py-2">
                  {action?.kind === 'submit' && (
                    <button
                      onClick={() => handleSubmit(sub.id)}
                      className="rounded-md bg-brand-gold px-3 py-1 text-xs font-semibold text-brand-navy hover:brightness-95"
                    >
                      Submit
                    </button>
                  )}
                  {action?.kind === 'approve' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejectingId(sub.id)}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(sub.id)}
                        className="rounded-md border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                  {!action && <span className="text-xs text-slate-400">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
