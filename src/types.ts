export type Branch = 'PSB' | 'TIB' | 'SIB' | 'PCB';

export const BRANCHES: Branch[] = ['PSB', 'TIB', 'SIB', 'PCB'];

export type Role = 'BRANCH_REP' | 'CPM' | 'FINANCE';

export interface Persona {
  id: string;
  label: string;
  role: Role;
  branch: Branch | null;
}

export const PERSONAS: Persona[] = [
  ...BRANCHES.map((b) => ({
    id: `BRANCH_REP_${b}`,
    label: `Branch Rep ${b}`,
    role: 'BRANCH_REP' as Role,
    branch: b,
  })),
  ...BRANCHES.map((b) => ({
    id: `CPM_${b}`,
    label: `CPM ${b}`,
    role: 'CPM' as Role,
    branch: b,
  })),
  {
    id: 'FINANCE',
    label: 'Finance',
    role: 'FINANCE' as Role,
    branch: null,
  },
];

export interface ReferenceItem {
  id: string;
  name: string;
  active: boolean;
  /** Only set on Description items: the Nature of AR/Arrears item they belong
   * to. Used to filter the Description dropdown once a Nature is picked. */
  natureId?: string;
}

export interface Debtor {
  id: string;
  branch: Branch;
  name: string;
  natureId: string;
  descriptionId: string;
  notInArrears: number;
  arrears6m: number;
  arrears6to12m: number;
  arrears1to2y: number;
  arrears2to3y: number;
  arrears3to4y: number;
  arrears4to5y: number;
  arrears5yPlus: number;
  reasonNonRecovery: string;
  recoverySteps: string;
  caseReference: string;
  /** Legacy single-entry fields, kept for backward compatibility with entries
   * saved before multiple Total AR / Required Paid Date pairs were supported. */
  requiredPaidDate?: string;
  totalARAmount?: number;
  /** Multiple Total AR amounts, each with its own Required Paid Date (e.g.
   * separate invoices). When present, this is the source of truth for aging
   * bucket placement instead of the legacy fields above or the raw bucket
   * fields. */
  arEntries?: AREntry[];
}

export interface AREntry {
  id: string;
  amount: number;
  requiredPaidDate: string;
}

export const ARREARS_BUCKET_KEYS = [
  'arrears6m',
  'arrears6to12m',
  'arrears1to2y',
  'arrears2to3y',
  'arrears3to4y',
  'arrears4to5y',
  'arrears5yPlus',
] as const;

export function totalInArrears(d: Debtor): number {
  return ARREARS_BUCKET_KEYS.reduce((sum, key) => sum + (d[key] || 0), 0);
}

export function totalAR(d: Debtor): number {
  return (d.notInArrears || 0) + totalInArrears(d);
}
