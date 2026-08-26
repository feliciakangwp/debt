import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuditLogEntry, Debtor, DebtorEditProposal, DebtorStatus, Persona, ReferenceItem } from '../types';
import { PERSONAS } from '../types';
import {
  DEBTORS_SEED,
  DESCRIPTION_ID_MIGRATION,
  DESCRIPTION_SEED,
  NATURE_SEED,
} from '../data/seed';
import { todayIso } from '../utils/aging';

const STORAGE_KEY = 'debt-management-module-v1';

// Bump whenever a change requires overwriting persisted reference-list data
// (e.g. the Description dataset refresh below) rather than just adding to it.
const DATA_VERSION = 2;

interface PersistedState {
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  personaId: string;
  simulatedToday: string;
  dataVersion: number;
}

function migrateDebtorDescriptionIds(debtors: Debtor[]): Debtor[] {
  return debtors.map((d) =>
    DESCRIPTION_ID_MIGRATION[d.descriptionId]
      ? { ...d, descriptionId: DESCRIPTION_ID_MIGRATION[d.descriptionId] }
      : d,
  );
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
          debtors: normalizeDebtors(migrateDebtorDescriptionIds(parsed.debtors ?? DEBTORS_SEED)),
          personaId: parsed.personaId ?? 'FINANCE',
          simulatedToday: parsed.simulatedToday ?? todayIso(),
          dataVersion: DATA_VERSION,
        };
      }
      return {
        natureList: parsed.natureList ?? NATURE_SEED,
        descriptionList: parsed.descriptionList ?? DESCRIPTION_SEED,
        debtors: normalizeDebtors(parsed.debtors ?? DEBTORS_SEED),
        personaId: parsed.personaId ?? 'FINANCE',
        simulatedToday: parsed.simulatedToday ?? todayIso(),
        dataVersion: DATA_VERSION,
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

  useEffect(() => {
    const state: PersistedState = {
      natureList,
      descriptionList,
      debtors,
      personaId,
      simulatedToday,
      dataVersion: DATA_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [natureList, descriptionList, debtors, personaId, simulatedToday]);

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

  const appendAuditLog = (d: Debtor, action: string, actor: string): Debtor => {
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: simulatedToday,
      actor,
      action,
    };
    return { ...d, auditLog: [...d.auditLog, entry] };
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
