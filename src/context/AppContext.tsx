import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Debtor, Persona, ReferenceItem } from '../types';
import { PERSONAS } from '../types';
import { DEBTORS_SEED, DESCRIPTION_SEED, NATURE_SEED } from '../data/seed';

const STORAGE_KEY = 'debt-management-module-v1';

interface PersistedState {
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  personaId: string;
}

function loadInitial(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch {
    // ignore corrupt storage
  }
  return {
    natureList: NATURE_SEED,
    descriptionList: DESCRIPTION_SEED,
    debtors: DEBTORS_SEED,
    personaId: 'FINANCE',
  };
}

interface AppContextValue {
  persona: Persona;
  setPersonaId: (id: string) => void;
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  addReferenceItem: (list: 'nature' | 'description', name: string) => void;
  toggleReferenceItem: (list: 'nature' | 'description', id: string) => void;
  addDebtor: (debtor: Omit<Debtor, 'id'>) => void;
  updateDebtor: (id: string, patch: Partial<Debtor>) => void;
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

  useEffect(() => {
    const state: PersistedState = { natureList, descriptionList, debtors, personaId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [natureList, descriptionList, debtors, personaId]);

  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[PERSONAS.length - 1],
    [personaId],
  );

  const addReferenceItem = (list: 'nature' | 'description', name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const item: ReferenceItem = {
      id: `${list}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      active: true,
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

  const value: AppContextValue = {
    persona,
    setPersonaId,
    natureList: sortAlpha(natureList),
    descriptionList: sortAlpha(descriptionList),
    debtors,
    addReferenceItem,
    toggleReferenceItem,
    addDebtor,
    updateDebtor,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
