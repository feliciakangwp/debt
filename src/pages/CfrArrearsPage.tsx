import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { CfrStatusBadge } from '../components/CfrStatusBadge';
import { formatCurrency } from '../utils/format';
import { resolveDebtorBuckets } from '../utils/aging';
import { financeReportVisibleDebtors, isFinanceTeamPersona, isSuperAdmin, visibleDebtors } from '../utils/visibility';
import { getActiveOpenPeriod } from '../utils/callForReturn';
import { aggregateDebtors, aggregatedTotalAR, aggregatedTotalInArrears } from '../utils/aggregate';
import type { AggregatedRow } from '../utils/aggregate';
import type { Branch, CfrArrearsSubmission, CfrSubmissionStatus } from '../types';
import { BRANCHES } from '../types';

interface CfrArrearsPageProps {
  /** true = Debt Management (CFR-FIN): consolidated across all branches,
   * read-only. false = Debt Management (CFR): grouped per branch, with the
   * Submit / Approve / Reject workflow. */
  consolidated: boolean;
}

function nextActionFor(
  status: CfrSubmissionStatus,
  role: string,
): { kind: 'submit' | 'approve' } | null {
  if (status === 'DRAFT' && role === 'BRANCH_REP') return { kind: 'submit' };
  if (status === 'PENDING_REVIEW' && role === 'REVIEWER_1') return { kind: 'approve' };
  if (status === 'SUPPORTED' && role === 'CPM') return { kind: 'approve' };
  return null;
}

/** Super Admin can act on any branch's submission at any stage, so this
 * ignores role entirely and just returns the action for the status itself. */
function actionForAnyRole(status: CfrSubmissionStatus): { kind: 'submit' | 'approve' } | null {
  if (status === 'DRAFT') return { kind: 'submit' };
  if (status === 'PENDING_REVIEW' || status === 'SUPPORTED') return { kind: 'approve' };
  return null;
}

export function CfrArrearsPage({ consolidated }: CfrArrearsPageProps) {
  const {
    persona,
    debtors,
    natureList,
    descriptionList,
    simulatedToday,
    callForReturnPeriods,
    cfrArrearsSubmissions,
    ensureCfrSubmissionsForPeriod,
    submitCfrArrears,
    approveCfrArrears,
    rejectCfrArrears,
  } = useApp();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const activePeriod = useMemo(
    () => getActiveOpenPeriod(callForReturnPeriods, simulatedToday),
    [callForReturnPeriods, simulatedToday],
  );

  useEffect(() => {
    if (activePeriod) ensureCfrSubmissionsForPeriod(activePeriod.id, persona.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeriod?.id]);

  const natureName = (id: string) => natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => descriptionList.find((d) => d.id === id)?.name ?? id;

  const submissionsForPeriod: CfrArrearsSubmission[] = useMemo(
    () => (activePeriod ? cfrArrearsSubmissions.filter((s) => s.periodId === activePeriod.id) : []),
    [cfrArrearsSubmissions, activePeriod],
  );
  const statusByBranch = useMemo(
    () => new Map(submissionsForPeriod.map((s) => [s.branch, s])),
    [submissionsForPeriod],
  );

  const rows: AggregatedRow[] = useMemo(() => {
    if (!activePeriod) return [];
    // Branch Rep / Reviewer 1 / CPM see only their own branch's lines here;
    // Finance Officer, Reviewer 1 FIN, CPM FIN and Super Admin see every
    // branch's lines (still grouped per branch, not collapsed together).
    const scoped = consolidated || isFinanceTeamPersona(persona)
      ? financeReportVisibleDebtors(persona, debtors)
      : visibleDebtors(persona, debtors);
    const withBuckets = scoped.map((d) => ({ ...d, ...resolveDebtorBuckets(d, simulatedToday) }));
    return aggregateDebtors(withBuckets, !consolidated);
  }, [activePeriod, consolidated, persona, debtors, simulatedToday]);

  const ownSubmission = persona.branch ? statusByBranch.get(persona.branch) : undefined;
  const ownAction = ownSubmission ? nextActionFor(ownSubmission.status, persona.role) : null;

  const handleSubmit = (id: string) => submitCfrArrears(id, persona.label);
  const handleApprove = (id: string) => approveCfrArrears(id, persona.label);
  const handleConfirmReject = () => {
    if (!rejectingId || rejectComment.trim() === '') return;
    rejectCfrArrears(rejectingId, persona.label, rejectComment.trim());
    setRejectingId(null);
    setRejectComment('');
  };

  const columns: ColumnDef<AggregatedRow>[] = [
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (r.branch === 'SC' ? '' : (statusByBranch.get(r.branch as Branch)?.status ?? '')),
      render: (r) => {
        if (r.branch !== 'SC') {
          const status = statusByBranch.get(r.branch as Branch)?.status;
          return status ? <CfrStatusBadge status={status} /> : null;
        }
        const distinct = Array.from(
          new Set(r.branches.map((b) => statusByBranch.get(b)?.status).filter((s): s is CfrSubmissionStatus => !!s)),
        );
        return (
          <div className="flex flex-wrap gap-1">
            {distinct.map((s) => (
              <CfrStatusBadge key={s} status={s} />
            ))}
          </div>
        );
      },
      sortable: false,
    },
    { key: 'branch', header: 'SB/Dept', accessor: (r) => r.branch, sortType: 'alpha' },
    { key: 'nature', header: 'Nature of Arrears', accessor: (r) => natureName(r.natureId), sortType: 'alpha' },
    { key: 'description', header: 'Description', accessor: (r) => descName(r.descriptionId), sortType: 'alpha' },
    {
      key: 'totalAR',
      header: 'Total AR',
      accessor: (r) => aggregatedTotalAR(r),
      render: (r) => formatCurrency(aggregatedTotalAR(r)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'notInArrears',
      header: 'AR Not in Arrears',
      accessor: (r) => r.notInArrears,
      render: (r) => formatCurrency(r.notInArrears),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'totalInArrears',
      header: 'Total in Arrears',
      accessor: (r) => aggregatedTotalInArrears(r),
      render: (r) => formatCurrency(aggregatedTotalInArrears(r)),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6m',
      header: 'AR in Arrears ≤ 6 months',
      accessor: (r) => r.arrears6m,
      render: (r) => formatCurrency(r.arrears6m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears6to12m',
      header: 'AR in Arrears (6-12 months)',
      accessor: (r) => r.arrears6to12m,
      render: (r) => formatCurrency(r.arrears6to12m),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears1to2y',
      header: 'AR in Arrears (1-2yrs)',
      accessor: (r) => r.arrears1to2y,
      render: (r) => formatCurrency(r.arrears1to2y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears2to3y',
      header: 'AR in Arrears (2-3yrs)',
      accessor: (r) => r.arrears2to3y,
      render: (r) => formatCurrency(r.arrears2to3y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears3to4y',
      header: 'AR in Arrears (3-4yrs)',
      accessor: (r) => r.arrears3to4y,
      render: (r) => formatCurrency(r.arrears3to4y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears4to5y',
      header: 'AR in Arrears (4-5yrs)',
      accessor: (r) => r.arrears4to5y,
      render: (r) => formatCurrency(r.arrears4to5y),
      sortType: 'numeric',
      align: 'right',
    },
    {
      key: 'arrears5yPlus',
      header: 'AR in Arrears ≥ 5 years',
      accessor: (r) => r.arrears5yPlus,
      render: (r) => formatCurrency(r.arrears5yPlus),
      sortType: 'numeric',
      align: 'right',
    },
    { key: 'reason', header: 'Reasons for non-recovery', accessor: (r) => r.reasonNonRecovery, sortType: 'alpha' },
    { key: 'steps', header: 'Recovery steps taken', accessor: (r) => r.recoverySteps, sortType: 'alpha' },
  ];

  const title = consolidated ? 'Arrears (Debt Management CFR-FIN)' : 'Arrears (Debt Management CFR)';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <div className="flex items-center gap-2">
          {!consolidated && ownSubmission && (
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
          )}
        </div>
      </div>
      <p className="mb-1 text-sm text-slate-500">Report generated on {simulatedToday}.</p>
      <p className="mb-5 text-sm text-slate-500">
        {consolidated
          ? 'Consolidated across all branches by Nature of AR/ Arrears and Description.'
          : isFinanceTeamPersona(persona)
            ? 'Showing all branches.'
            : `Showing records for ${persona.branch} only.`}
      </p>

      {rejectingId && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3">
          <label className="mb-1 block text-xs font-semibold text-red-700">
            Reason for rejecting (required)
          </label>
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
      )}

      {!activePeriod ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">
          No Call for Return period is currently open.
        </div>
      ) : (
        <>
          {isSuperAdmin(persona) && (
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
          )}
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />
        </>
      )}
    </div>
  );
}
