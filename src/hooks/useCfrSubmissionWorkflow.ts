import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getActiveOpenPeriod } from '../utils/callForReturn';
import type { Branch, CfrArrearsSubmission, CfrSubmissionStatus } from '../types';

export function nextActionFor(
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
export function actionForAnyRole(status: CfrSubmissionStatus): { kind: 'submit' | 'approve' } | null {
  if (status === 'DRAFT') return { kind: 'submit' };
  if (status === 'PENDING_REVIEW' || status === 'SUPPORTED') return { kind: 'approve' };
  return null;
}

/**
 * Shared per-branch Call for Return submission state + actions, reused by
 * every CFR/CFR-FIN report tab (Arrears, Top 10 Debtors, Arrears > 5 years,
 * ...): they're all different views into the same one submission per branch
 * per period, so Submit / Approve / Reject on any of them acts on the same
 * record and is reflected on all of them.
 */
export function useCfrSubmissionWorkflow() {
  const {
    persona,
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

  const submissionsForPeriod: CfrArrearsSubmission[] = useMemo(
    () => (activePeriod ? cfrArrearsSubmissions.filter((s) => s.periodId === activePeriod.id) : []),
    [cfrArrearsSubmissions, activePeriod],
  );
  const statusByBranch = useMemo(
    () => new Map<Branch, CfrArrearsSubmission>(submissionsForPeriod.map((s) => [s.branch, s])),
    [submissionsForPeriod],
  );

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

  return {
    activePeriod,
    statusByBranch,
    ownSubmission,
    ownAction,
    rejectingId,
    setRejectingId,
    rejectComment,
    setRejectComment,
    handleSubmit,
    handleApprove,
    handleConfirmReject,
  };
}

export type CfrSubmissionWorkflow = ReturnType<typeof useCfrSubmissionWorkflow>;
