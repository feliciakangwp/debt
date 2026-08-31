export type Branch = 'PSB' | 'TIB' | 'SIB' | 'PCB' | 'FIN';

export const BRANCHES: Branch[] = ['PSB', 'TIB', 'SIB', 'PCB', 'FIN'];

export type Role = 'BRANCH_REP' | 'CPM' | 'FINANCE' | 'REVIEWER_1' | 'SUPER_ADMIN';

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
  ...BRANCHES.map((b) => ({
    id: `REVIEWER1_${b}`,
    label: `Reviewer 1 ${b}`,
    role: 'REVIEWER_1' as Role,
    branch: b,
  })),
  {
    id: 'FINANCE',
    label: 'Finance Officer',
    role: 'FINANCE' as Role,
    branch: null,
  },
  {
    id: 'SUPER_ADMIN',
    label: 'Super Admin',
    role: 'SUPER_ADMIN' as Role,
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

export type DebtorStatus = 'DRAFT' | 'PENDING_REVIEW' | 'SUPPORTED' | 'EDIT_REQUESTED';

/**
 * A proposed change to an already-Supported debtor, awaiting Reviewer 1's
 * decision. The debtor's live fields are left untouched until the proposal
 * is approved, so reports keep showing the current data while a request is
 * pending.
 */
export interface DebtorEditProposal {
  name: string;
  natureId: string;
  descriptionId: string;
  /** Case Reference can only ever change through this Request to Edit flow
   * — never edited directly, even once Supported. */
  caseReference: string;
  /** Omitted when the AR amount/date weren't touched (e.g. a legacy
   * fixed-bucket record edited without setting a Required Paid Date), so
   * the original bucket distribution is left untouched on approval. */
  arEntries?: AREntry[];
}

export interface AuditLogEntry {
  id: string;
  /** Simulated-today snapshot at the time of the action, for display. */
  date: string;
  actor: string;
  action: string;
}

export interface Debtor {
  id: string;
  status: DebtorStatus;
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
  /** Set while status is EDIT_REQUESTED: the changes Branch Rep asked for. */
  editProposal?: DebtorEditProposal;
  /** Write-offs are repeatable — a debtor can be partially written off more
   * than once over time. At most one entry is ever "in flight" (To be
   * Written Off or Pending) at a time; once that one reaches Supported,
   * Branch Rep can start another if there's still a balance left. Every
   * Supported entry's amount is knocked off the debtor's arrears
   * cumulatively (see resolveDebtorBuckets). */
  writeOffs: WriteOffRecord[];
  auditLog: AuditLogEntry[];
}

export type WriteOffStatus = 'TO_BE_WRITTEN_OFF' | 'PENDING' | 'SUPPORTED';

export interface WriteOffRecord {
  id: string;
  status: WriteOffStatus;
  dateOfWriteOff: string;
  writeOffAmount: number;
  /** Auto-computed from the debtor's earliest arrear date to
   * dateOfWriteOff — not user-editable. */
  daysInArrears: number;
  reasonForWriteOff: string;
}

export type TransactionType = 'ARREARS' | 'WRITE_OFF' | 'PAID';

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

/** A Call for Return submission window. Status is never stored — it's always
 * computed live from startDate/endDate against the simulated today's date. */
export interface CallForReturnPeriod {
  id: string;
  /** Free text, e.g. "2026-01" — displayed as "Submission Year-Month". */
  name: string;
  startDate: string;
  endDate: string;
}

export type CallForReturnStatus = 'OPEN' | 'CLOSED';

export type CfrSubmissionStatus = 'DRAFT' | 'PENDING_REVIEW' | 'SUPPORTED' | 'APPROVED';

/** One branch's Call for Return arrears submission for a given period.
 * Draft -> Pending Review (Branch Rep submits) -> Supported (Reviewer 1
 * approves) -> Approved (CPM, acting as Reviewer 2, approves). A reject by
 * either reviewer sends it back to Draft. The underlying arrears figures are
 * not snapshotted here — they're the branch's live arrears data, aggregated
 * the same way as Arrears Report; this record only tracks the review status. */
export interface CfrArrearsSubmission {
  id: string;
  periodId: string;
  branch: Branch;
  status: CfrSubmissionStatus;
  auditLog: AuditLogEntry[];
}
