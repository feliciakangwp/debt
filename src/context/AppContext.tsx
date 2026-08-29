import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AuditLogEntry,
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
import { DEBTORS_SEED, DESCRIPTION_SEED, NATURE_SEED } from '../data/seed';
import { todayIso } from '../utils/aging';

const STORAGE_KEY = 'debt-management-module-v1';

// Bump whenever a change requires overwriting persisted reference-list or
// seed debtor data (e.g. a refreshed sample dataset) rather than just
// adding to it. A version bump replaces every browser's saved debtor list
// with the current DEBTORS_SEED — only do this for sample/test data
// refreshes, since it discards anything a tester added through the UI.
const DATA_VERSION = 3;

interface PersistedState {
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  personaId: string;
  simulatedToday: string;
  dataVersion: number;
  callForReturnPeriods: CallForReturnPeriod[];
  cfrArrearsSubmissions: CfrArrearsSubmission[];
}

// Backfills fields added after a debtor may have already been persisted to
// localStorage, so older saved records never carry `undefined` into code
// that assumes a value is present (e.g. joining reasons/case references).
// Debtors saved before the approval flow existed default to SUPPORTED so
// they don't disappear from reports/reviewer/CPM views they were already
// visible on.
function normalizeDebtors(debtors: Debtor[]): Debtor[] {
  return debtors.map((d) => ({
    ...d,
    status: d.status ?? 'SUPPORTED',
    reasonNonRecovery: d.reasonNonRecovery ?? '',
    recoverySteps: d.recoverySteps ?? '',
    caseReference: d.caseReference ?? '',
    auditLog: d.auditLog ?? [],
  }));
}

function loadInitial(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if ((parsed.dataVersion ?? 1) < DATA_VERSION) {
        return {
          natureList: parsed.natureList ?? NATURE_SEED,
          descriptionList: DESCRIPTION_SEED,
          debtors: DEBTORS_SEED,
          personaId: parsed.personaId ?? 'FINANCE',
          simulatedToday: parsed.simulatedToday ?? todayIso(),
          dataVersion: DATA_VERSION,
          callForReturnPeriods: parsed.callForReturnPeriods ?? [],
          cfrArrearsSubmissions: parsed.cfrArrearsSubmissions ?? [],
        };
      }
      return {
        natureList: parsed.natureList ?? NATURE_SEED,
        descriptionList: parsed.descriptionList ?? DESCRIPTION_SEED,
        debtors: normalizeDebtors(parsed.debtors ?? DEBTORS_SEED),
        personaId: parsed.personaId ?? 'FINANCE',
        simulatedToday: parsed.simulatedToday ?? todayIso(),
        dataVersion: DATA_VERSION,
        callForReturnPeriods: parsed.callForReturnPeriods ?? [],
        cfrArrearsSubmissions: parsed.cfrArrearsSubmissions ?? [],
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return {
    natureList: NATURE_SEED,
    descriptionList: DESCRIPTION_SEED,
    debtors: DEBTORS_SEED,
    personaId: 'FINANCE',
    simulatedToday: todayIso(),
    dataVersion: DATA_VERSION,
    callForReturnPeriods: [],
    cfrArrearsSubmissions: [],
  };
}

interface AppContextValue {
  persona: Persona;
  setPersonaId: (id: string) => void;
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  simulatedToday: string;
  setSimulatedToday: (isoDate: string) => void;
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
    patch: Pick<Debtor, 'caseReference' | 'reasonNonRecovery' | 'recoverySteps'>,
    actorLabel: string,
  ) => void;
  requestEdit: (id: string, proposal: DebtorEditProposal, actorLabel: string) => void;
  approveEdit: (id: string, actorLabel: string) => void;
  rejectEdit: (id: string, actorLabel: string, comment: string) => void;
  createWriteOff: (
    id: string,
    input: Pick<WriteOffRecord, 'dateOfWriteOff' | 'writeOffAmount' | 'daysInArrears' | 'reasonForWriteOff'>,
    actorLabel: string,
  ) => void;
  supportWriteOff: (id: string, actorLabel: string) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(loadInitial, []);
  const [personaId, setPersonaId] = useState(initial.personaId);
  const [natureList, setNatureList] = useState<ReferenceItem[]>(initial.natureList);
  const [descriptionList, setDescriptionList] = useState<ReferenceItem[]>(
    initial.descriptionList,
  );
  const [debtors, setDebtors] = useState<Debtor[]>(initial.debtors);
  const [simulatedToday, setSimulatedToday] = useState<string>(initial.simulatedToday);
  const [callForReturnPeriods, setCallForReturnPeriods] = useState<CallForReturnPeriod[]>(
    initial.callForReturnPeriods,
  );
  const [cfrArrearsSubmissions, setCfrArrearsSubmissions] = useState<CfrArrearsSubmission[]>(
    initial.cfrArrearsSubmissions,
  );

  useEffect(() => {
    const state: PersistedState = {
      natureList,
      descriptionList,
      debtors,
      personaId,
      simulatedToday,
      dataVersion: DATA_VERSION,
      callForReturnPeriods,
      cfrArrearsSubmissions,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [
    natureList,
    descriptionList,
    debtors,
    personaId,
    simulatedToday,
    callForReturnPeriods,
    cfrArrearsSubmissions,
  ]);

  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[PERSONAS.length - 1],
    [personaId],
  );

  const addReferenceItem = (list: 'nature' | 'description', name: string, natureId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (list === 'description' && !natureId) return;
    const item: ReferenceItem = {
      id: `${list}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      active: true,
      ...(list === 'description' ? { natureId } : {}),
    };
    if (list === 'nature') setNatureList((prev) => sortAlpha([...prev, item]));
    else setDescriptionList((prev) => sortAlpha([...prev, item]));
  };

  const toggleReferenceItem = (list: 'nature' | 'description', id: string) => {
    const updater = (prev: ReferenceItem[]) =>
      prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
    if (list === 'nature') setNatureList(updater);
    else setDescriptionList(updater);
  };

  const addDebtor = (debtor: Omit<Debtor, 'id'>) => {
    const id = `debtor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDebtors((prev) => [...prev, { ...debtor, id }]);
  };

  const updateDebtor = (id: string, patch: Partial<Debtor>) => {
    setDebtors((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const appendAuditLog = <T extends { auditLog: AuditLogEntry[] }>(item: T, action: string, actor: string): T => {
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: simulatedToday,
      actor,
      action,
    };
    return { ...item, auditLog: [...item.auditLog, entry] };
  };

  const updateDebtorsStatus = (
    ids: string[],
    status: DebtorStatus,
    logAction: string,
    actorLabel: string,
  ) => {
    const idSet = new Set(ids);
    setDebtors((prev) =>
      prev.map((d) => (idSet.has(d.id) ? appendAuditLog({ ...d, status }, logAction, actorLabel) : d)),
    );
  };

  const deleteDebtors = (ids: string[]) => {
    const idSet = new Set(ids);
    setDebtors((prev) => prev.filter((d) => !idSet.has(d.id)));
  };

  const updateDebtorDetails = (
    id: string,
    patch: Pick<Debtor, 'caseReference' | 'reasonNonRecovery' | 'recoverySteps'>,
    actorLabel: string,
  ) => {
    setDebtors((prev) =>
      prev.map((d) => (d.id === id ? appendAuditLog({ ...d, ...patch }, 'Updated details', actorLabel) : d)),
    );
  };

  const requestEdit = (id: string, proposal: DebtorEditProposal, actorLabel: string) => {
    setDebtors((prev) =>
      prev.map((d) =>
        d.id === id
          ? appendAuditLog(
              { ...d, status: 'EDIT_REQUESTED', editProposal: proposal },
              'Requested edit',
              actorLabel,
            )
          : d,
      ),
    );
  };

  const approveEdit = (id: string, actorLabel: string) => {
    setDebtors((prev) =>
      prev.map((d) => {
        if (d.id !== id || !d.editProposal) return d;
        const proposal = d.editProposal;
        // arEntries is omitted on the proposal when the AR amounts/dates
        // weren't touched, so the original bucket distribution is kept as-is.
        const arFields = proposal.arEntries
          ? {
              arEntries: proposal.arEntries,
              notInArrears: 0,
              arrears6m: 0,
              arrears6to12m: 0,
              arrears1to2y: 0,
              arrears2to3y: 0,
              arrears3to4y: 0,
              arrears4to5y: 0,
              arrears5yPlus: 0,
              requiredPaidDate: undefined,
              totalARAmount: undefined,
            }
          : {};
        const applied: Debtor = {
          ...d,
          name: proposal.name,
          natureId: proposal.natureId,
          descriptionId: proposal.descriptionId,
          ...arFields,
          editProposal: undefined,
          status: 'SUPPORTED',
        };
        return appendAuditLog(applied, 'Edit approved', actorLabel);
      }),
    );
  };

  const rejectEdit = (id: string, actorLabel: string, comment: string) => {
    setDebtors((prev) =>
      prev.map((d) =>
        d.id === id
          ? appendAuditLog(
              { ...d, status: 'SUPPORTED', editProposal: undefined },
              `Edit rejected: ${comment}`,
              actorLabel,
            )
          : d,
      ),
    );
  };

  const createWriteOff = (
    id: string,
    input: Pick<WriteOffRecord, 'dateOfWriteOff' | 'writeOffAmount' | 'daysInArrears' | 'reasonForWriteOff'>,
    actorLabel: string,
  ) => {
    setDebtors((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const writeOff: WriteOffRecord = {
          id: `writeoff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          status: 'PENDING',
          ...input,
        };
        return appendAuditLog({ ...d, writeOff }, 'Write off submitted for review', actorLabel);
      }),
    );
  };

  const supportWriteOff = (id: string, actorLabel: string) => {
    setDebtors((prev) =>
      prev.map((d) => {
        if (d.id !== id || !d.writeOff) return d;
        return appendAuditLog(
          { ...d, writeOff: { ...d.writeOff, status: 'SUPPORTED' } },
          'Write off supported',
          actorLabel,
        );
      }),
    );
  };

  const addCallForReturnPeriod = (period: Omit<CallForReturnPeriod, 'id'>) => {
    const id = `cfr-period-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCallForReturnPeriods((prev) => [...prev, { ...period, id }]);
  };

  const updateCallForReturnPeriod = (
    id: string,
    patch: Pick<CallForReturnPeriod, 'startDate' | 'endDate'>,
  ) => {
    setCallForReturnPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  // Idempotently makes sure every branch has a Draft submission for the
  // given period, so the finance-wide views show a complete picture as soon
  // as a Call for Return period opens, rather than only once each Branch Rep
  // happens to visit.
  const ensureCfrSubmissionsForPeriod = (periodId: string, actorLabel: string) => {
    setCfrArrearsSubmissions((prev) => {
      const existingBranches = new Set(
        prev.filter((s) => s.periodId === periodId).map((s) => s.branch),
      );
      const missing = BRANCHES.filter((b) => !existingBranches.has(b));
      if (missing.length === 0) return prev;
      const created = missing.map((branch) =>
        appendAuditLog<CfrArrearsSubmission>(
          {
            id: `cfr-submission-${Date.now()}-${branch}-${Math.random().toString(36).slice(2, 7)}`,
            periodId,
            branch,
            status: 'DRAFT',
            auditLog: [],
          },
          'Call for Return period opened',
          actorLabel,
        ),
      );
      return [...prev, ...created];
    });
  };

  const setCfrSubmissionStatus = (
    id: string,
    status: CfrSubmissionStatus,
    logAction: string,
    actorLabel: string,
  ) => {
    setCfrArrearsSubmissions((prev) =>
      prev.map((s) => (s.id === id ? appendAuditLog({ ...s, status }, logAction, actorLabel) : s)),
    );
  };

  const submitCfrArrears = (id: string, actorLabel: string) => {
    setCfrSubmissionStatus(id, 'PENDING_REVIEW', 'Submitted for review', actorLabel);
  };

  const approveCfrArrears = (id: string, actorLabel: string) => {
    setCfrArrearsSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextStatus: CfrSubmissionStatus = s.status === 'PENDING_REVIEW' ? 'SUPPORTED' : 'APPROVED';
        const logAction = nextStatus === 'SUPPORTED' ? 'Approved by Reviewer 1' : 'Approved by Reviewer 2 (CPM)';
        return appendAuditLog({ ...s, status: nextStatus }, logAction, actorLabel);
      }),
    );
  };

  const rejectCfrArrears = (id: string, actorLabel: string, comment: string) => {
    setCfrSubmissionStatus(id, 'DRAFT', `Rejected: ${comment}`, actorLabel);
  };

  const value: AppContextValue = {
    persona,
    setPersonaId,
    natureList: sortAlpha(natureList),
    descriptionList: sortAlpha(descriptionList),
    debtors,
    simulatedToday,
    setSimulatedToday,
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
    createWriteOff,
    supportWriteOff,
    callForReturnPeriods,
    addCallForReturnPeriod,
    updateCallForReturnPeriod,
    cfrArrearsSubmissions,
    ensureCfrSubmissionsForPeriod,
    submitCfrArrears,
    approveCfrArrears,
    rejectCfrArrears,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
