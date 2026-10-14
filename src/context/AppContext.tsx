import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Branch,
  CallForReturnPeriod,
  CfrArrearsSubmission,
  CfrSubmissionStatus,
  Debtor,
  DebtorEditProposal,
  DebtorStatus,
  Persona,
  ReferenceItem,
  WriteOffRecord,
} from '../types';
import { BRANCHES, PERSONAS } from '../types';
import { debtorRemainingBalance, todayIso } from '../utils/aging';
import { formatCurrency } from '../utils/format';
import { supabase } from '../lib/supabaseClient';
import {
  dbAddCallForReturnPeriod,
  dbAddDebtor,
  dbAddReferenceItem,
  dbApproveEdit,
  dbCreateCfrSubmissions,
  dbDeleteDebtors,
  dbRecordPayment,
  dbRejectEdit,
  dbRejectWriteOff,
  dbReopenPayment,
  dbRequestEdit,
  dbSaveWriteOff,
  dbSetCfrSubmissionStatus,
  dbSetReferenceItemActive,
  dbSupportWriteOff,
  dbUpdateCallForReturnPeriod,
  dbUpdateDebtor,
  dbUpdateDebtorDetails,
  dbUpdateDebtorsStatus,
  fetchAllData,
} from '../lib/db';

const REALTIME_TABLES = [
  'reference_items',
  'debtors',
  'debtor_ar_entries',
  'debtor_write_offs',
  'debtor_payments',
  'audit_log',
  'call_for_return_periods',
  'cfr_arrears_submissions',
];

interface AppContextValue {
  persona: Persona;
  setPersonaId: (id: string) => void;
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  simulatedToday: string;
  setSimulatedToday: (isoDate: string) => void;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  addReferenceItem: (list: 'nature' | 'description', name: string, natureId?: string) => void;
  toggleReferenceItem: (list: 'nature' | 'description', id: string) => void;
  addDebtor: (debtor: Omit<Debtor, 'id'>) => void;
  updateDebtor: (id: string, patch: Partial<Debtor>) => void;
  updateDebtorsStatus: (
    ids: string[],
    status: DebtorStatus,
    logAction: string,
    actorLabel: string,
  ) => void;
  deleteDebtors: (ids: string[]) => void;
  updateDebtorDetails: (
    id: string,
    patch: Pick<Debtor, 'reasonNonRecovery' | 'recoverySteps'>,
    actorLabel: string,
  ) => void;
  requestEdit: (id: string, proposal: DebtorEditProposal, actorLabel: string) => void;
  approveEdit: (id: string, actorLabel: string) => void;
  rejectEdit: (id: string, actorLabel: string, comment: string) => void;
  saveWriteOff: (
    id: string,
    input: Pick<WriteOffRecord, 'dateOfWriteOff' | 'writeOffAmount' | 'daysInArrears' | 'reasonForWriteOff'>,
    actorLabel: string,
    submit: boolean,
  ) => void;
  supportWriteOff: (id: string, writeOffId: string, actorLabel: string) => void;
  rejectWriteOff: (id: string, writeOffId: string, actorLabel: string) => void;
  recordPayment: (id: string, amount: number, date: string, actorLabel: string) => void;
  markDebtorsPaid: (ids: string[], date: string, actorLabel: string) => void;
  reopenPayment: (id: string, paymentId: string, actorLabel: string) => void;
  callForReturnPeriods: CallForReturnPeriod[];
  addCallForReturnPeriod: (period: Omit<CallForReturnPeriod, 'id'>) => void;
  updateCallForReturnPeriod: (id: string, patch: Pick<CallForReturnPeriod, 'startDate' | 'endDate'>) => void;
  cfrArrearsSubmissions: CfrArrearsSubmission[];
  ensureCfrSubmissionsForPeriod: (periodId: string, actorLabel: string) => void;
  submitCfrArrears: (id: string, actorLabel: string) => void;
  approveCfrArrears: (id: string, actorLabel: string) => void;
  rejectCfrArrears: (id: string, actorLabel: string, comment: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function sortAlpha(list: ReferenceItem[]): ReferenceItem[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState('FINANCE');
  const [simulatedToday, setSimulatedToday] = useState<string>(todayIso());
  const [natureList, setNatureList] = useState<ReferenceItem[]>([]);
  const [descriptionList, setDescriptionList] = useState<ReferenceItem[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [callForReturnPeriods, setCallForReturnPeriods] = useState<CallForReturnPeriod[]>([]);
  const [cfrArrearsSubmissions, setCfrArrearsSubmissions] = useState<CfrArrearsSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always reads the latest state inside closures created once (the
  // realtime subscription, the debounce timer) without re-subscribing.
  const debtorsRef = useRef(debtors);
  debtorsRef.current = debtors;
  const cfrArrearsSubmissionsRef = useRef(cfrArrearsSubmissions);
  cfrArrearsSubmissionsRef.current = cfrArrearsSubmissions;

  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[PERSONAS.length - 1],
    [personaId],
  );

  const refetchAll = useCallback(async () => {
    const data = await fetchAllData();
    setNatureList(data.natureList);
    setDescriptionList(data.descriptionList);
    setDebtors(data.debtors);
    setCallForReturnPeriods(data.callForReturnPeriods);
    setCfrArrearsSubmissions(data.cfrArrearsSubmissions);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refetchAll();
        if (active) setError(null);
      } catch (e) {
        if (active) setError(errorMessage(e, 'Failed to load data from the database.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refetchAll]);

  // Realtime: any change from another browser (or another tab) triggers a
  // debounced refetch, so everyone stays in sync without a manual reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refetchAll().catch((e) => setError(errorMessage(e, 'Failed to refresh data from the database.')));
      }, 400);
    };

    const channel = supabase.channel('debt-module-changes');
    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefetch);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refetchAll]);

  const clearError = () => setError(null);

  // Every mutating action runs its Supabase write(s) then refetches, so
  // local state always ends up matching the database exactly; any failure
  // (load or save) surfaces as a readable error instead of silently
  // leaving the UI out of sync.
  const runAction = (fn: () => Promise<void>, fallback: string) => {
    fn()
      .then(() => refetchAll())
      .then(() => setError(null))
      .catch((e) => setError(errorMessage(e, fallback)));
  };

  const addReferenceItem = (list: 'nature' | 'description', name: string, natureId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (list === 'description' && !natureId) return;
    runAction(() => dbAddReferenceItem(list, trimmed, natureId), `Adding the ${list} item failed.`);
  };

  const toggleReferenceItem = (list: 'nature' | 'description', id: string) => {
    const current = (list === 'nature' ? natureList : descriptionList).find((item) => item.id === id);
    if (!current) return;
    runAction(() => dbSetReferenceItemActive(id, !current.active), 'Updating the reference item failed.');
  };

  const addDebtor = (debtor: Omit<Debtor, 'id'>) => {
    runAction(() => dbAddDebtor(debtor), 'Creating the debt record failed.');
  };

  const updateDebtor = (id: string, patch: Partial<Debtor>) => {
    runAction(() => dbUpdateDebtor(id, patch), 'Updating the debt record failed.');
  };

  const updateDebtorsStatus = (ids: string[], status: DebtorStatus, logAction: string, actorLabel: string) => {
    runAction(
      () => dbUpdateDebtorsStatus(ids, status, logAction, actorLabel, simulatedToday),
      'Updating the status failed.',
    );
  };

  const deleteDebtors = (ids: string[]) => {
    runAction(() => dbDeleteDebtors(ids), 'Deleting the debt record failed.');
  };

  const updateDebtorDetails = (
    id: string,
    patch: Pick<Debtor, 'reasonNonRecovery' | 'recoverySteps'>,
    actorLabel: string,
  ) => {
    runAction(
      () => dbUpdateDebtorDetails(id, patch, actorLabel, simulatedToday),
      'Saving the details failed.',
    );
  };

  const requestEdit = (id: string, proposal: DebtorEditProposal, actorLabel: string) => {
    runAction(() => dbRequestEdit(id, proposal, actorLabel, simulatedToday), 'Requesting the edit failed.');
  };

  const approveEdit = (id: string, actorLabel: string) => {
    const debtor = debtorsRef.current.find((d) => d.id === id);
    if (!debtor || !debtor.editProposal) return;
    runAction(() => dbApproveEdit(debtor, actorLabel, simulatedToday), 'Approving the edit failed.');
  };

  const rejectEdit = (id: string, actorLabel: string, comment: string) => {
    runAction(() => dbRejectEdit(id, actorLabel, comment, simulatedToday), 'Rejecting the edit failed.');
  };

  const saveWriteOff = (
    id: string,
    input: Pick<WriteOffRecord, 'dateOfWriteOff' | 'writeOffAmount' | 'daysInArrears' | 'reasonForWriteOff'>,
    actorLabel: string,
    submit: boolean,
  ) => {
    const debtor = debtorsRef.current.find((d) => d.id === id);
    const existing = debtor?.writeOffs.find((w) => w.status !== 'SUPPORTED') ?? null;
    runAction(
      () => dbSaveWriteOff(id, existing?.id ?? null, input, submit, actorLabel, simulatedToday),
      'Saving the write-off failed.',
    );
  };

  const supportWriteOff = (id: string, writeOffId: string, actorLabel: string) => {
    runAction(
      () => dbSupportWriteOff(id, writeOffId, actorLabel, simulatedToday),
      'Supporting the write-off failed.',
    );
  };

  const rejectWriteOff = (id: string, writeOffId: string, actorLabel: string) => {
    runAction(
      () => dbRejectWriteOff(id, writeOffId, actorLabel, simulatedToday),
      'Rejecting the write-off failed.',
    );
  };

  const recordPayment = (id: string, amount: number, date: string, actorLabel: string) => {
    const debtor = debtorsRef.current.find((d) => d.id === id);
    if (!debtor) return;
    const nextStatus: DebtorStatus =
      debtorRemainingBalance({ ...debtor, payments: [...debtor.payments, { id: 'pending', date, amount, voided: false }] }) <= 0
        ? 'PAID'
        : debtor.status;
    runAction(
      () => dbRecordPayment(id, amount, date, nextStatus, actorLabel, `Payment recorded: ${formatCurrency(amount)}`),
      'Recording the payment failed.',
    );
  };

  const markDebtorsPaid = (ids: string[], date: string, actorLabel: string) => {
    const idSet = new Set(ids);
    const targets = debtorsRef.current.filter((d) => idSet.has(d.id));
    runAction(
      () =>
        Promise.all(
          targets.map((d) => {
            const amount = debtorRemainingBalance(d);
            if (amount <= 0) return Promise.resolve();
            return dbRecordPayment(d.id, amount, date, 'PAID', actorLabel, `Marked as Paid: ${formatCurrency(amount)}`);
          }),
        ).then(() => undefined),
      'Marking the selected records as Paid failed.',
    );
  };

  const reopenPayment = (id: string, paymentId: string, actorLabel: string) => {
    const debtor = debtorsRef.current.find((d) => d.id === id);
    if (!debtor) return;
    const payments = debtor.payments.map((p) => (p.id === paymentId ? { ...p, voided: true } : p));
    const nextStatus: DebtorStatus =
      debtor.status === 'PAID' && debtorRemainingBalance({ ...debtor, payments }) > 0 ? 'SUPPORTED' : debtor.status;
    runAction(
      () => dbReopenPayment(id, paymentId, nextStatus, actorLabel, simulatedToday),
      'Reopening the payment failed.',
    );
  };

  const addCallForReturnPeriod = (period: Omit<CallForReturnPeriod, 'id'>) => {
    runAction(() => dbAddCallForReturnPeriod(period), 'Creating the Call for Return period failed.');
  };

  const updateCallForReturnPeriod = (id: string, patch: Pick<CallForReturnPeriod, 'startDate' | 'endDate'>) => {
    runAction(
      () => dbUpdateCallForReturnPeriod(id, patch),
      'Updating the Call for Return period failed.',
    );
  };

  const ensureCfrSubmissionsForPeriod = (periodId: string, actorLabel: string) => {
    const existingBranches = new Set(
      cfrArrearsSubmissionsRef.current.filter((s) => s.periodId === periodId).map((s) => s.branch),
    );
    const missing = BRANCHES.filter((b) => !existingBranches.has(b)) as Branch[];
    if (missing.length === 0) return;
    runAction(
      () => dbCreateCfrSubmissions(periodId, missing, actorLabel, simulatedToday),
      'Opening the Call for Return period failed.',
    );
  };

  const submitCfrArrears = (id: string, actorLabel: string) => {
    runAction(
      () => dbSetCfrSubmissionStatus(id, 'PENDING_REVIEW', 'Submitted for review', actorLabel, simulatedToday),
      'Submitting for review failed.',
    );
  };

  const approveCfrArrears = (id: string, actorLabel: string) => {
    const submission = cfrArrearsSubmissionsRef.current.find((s) => s.id === id);
    if (!submission) return;
    const nextStatus: CfrSubmissionStatus = submission.status === 'PENDING_REVIEW' ? 'SUPPORTED' : 'APPROVED';
    const logAction = nextStatus === 'SUPPORTED' ? 'Approved by Reviewer 1' : 'Approved by Reviewer 2 (Head)';
    runAction(
      () => dbSetCfrSubmissionStatus(id, nextStatus, logAction, actorLabel, simulatedToday),
      'Approving failed.',
    );
  };

  const rejectCfrArrears = (id: string, actorLabel: string, comment: string) => {
    runAction(
      () => dbSetCfrSubmissionStatus(id, 'DRAFT', `Rejected: ${comment}`, actorLabel, simulatedToday),
      'Rejecting failed.',
    );
  };

  const value: AppContextValue = {
    persona,
    setPersonaId,
    natureList: sortAlpha(natureList),
    descriptionList: sortAlpha(descriptionList),
    debtors,
    simulatedToday,
    setSimulatedToday,
    loading,
    error,
    clearError,
    addReferenceItem,
    toggleReferenceItem,
    addDebtor,
    updateDebtor,
    updateDebtorsStatus,
    deleteDebtors,
    updateDebtorDetails,
    requestEdit,
    approveEdit,
    rejectEdit,
    saveWriteOff,
    supportWriteOff,
    rejectWriteOff,
    recordPayment,
    markDebtorsPaid,
    reopenPayment,
    callForReturnPeriods,
    addCallForReturnPeriod,
    updateCallForReturnPeriod,
    cfrArrearsSubmissions,
    ensureCfrSubmissionsForPeriod,
    submitCfrArrears,
    approveCfrArrears,
    rejectCfrArrears,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy">
        <div className="text-sm text-white/70">Loading data…</div>
      </div>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
