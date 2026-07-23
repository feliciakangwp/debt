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
  /** Set only for entries created via the aging calculator form. When present,
   * the bucket fields above are ignored in favor of a live calculation from
   * totalARAmount + requiredPaidDate against the current simulated date. */
  requiredPaidDate?: string;
  totalARAmount?: number;
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
