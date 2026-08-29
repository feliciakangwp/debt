import type { Debtor, DebtorStatus, Persona, Role } from '../types';

/**
 * Which roles may see a debtor line at each stage of the approval flow:
 *  - Draft: only the owning Branch Rep (not even Finance).
 *  - Pending Review: Branch Rep, Reviewer 1, and Finance.
 *  - Supported: Branch Rep, Reviewer 1, CPM, and Finance.
 *  - Edit Requested: same audience as Supported, since the live data is
 *    unchanged and still visible while the proposed edit awaits review.
 * Branch scoping still applies on top of this for every role except Finance.
 */
const STATUS_ALLOWED_ROLES: Record<DebtorStatus, Role[]> = {
  DRAFT: ['BRANCH_REP'],
  PENDING_REVIEW: ['BRANCH_REP', 'REVIEWER_1', 'FINANCE'],
  SUPPORTED: ['BRANCH_REP', 'REVIEWER_1', 'CPM', 'FINANCE'],
  EDIT_REQUESTED: ['BRANCH_REP', 'REVIEWER_1', 'CPM', 'FINANCE'],
};

/** Super Admin sees and can act on everything, everywhere, with no
 * restriction — a standing rule that applies to every module, including
 * ones built after this. */
export function isSuperAdmin(persona: Persona): boolean {
  return persona.role === 'SUPER_ADMIN';
}

export function canSeeDebtor(persona: Persona, debtor: Debtor): boolean {
  if (isSuperAdmin(persona)) return true;
  const branchMatches = persona.role === 'FINANCE' || persona.branch === debtor.branch;
  if (!branchMatches) return false;
  return STATUS_ALLOWED_ROLES[debtor.status].includes(persona.role);
}

export function visibleDebtors(persona: Persona, debtors: Debtor[]): Debtor[] {
  return debtors.filter((d) => canSeeDebtor(persona, d));
}

/**
 * Used only by the "(Fin)" oversight reports: same status-based rule as
 * canSeeDebtor, but ignores branch scoping entirely so Finance Officer,
 * Reviewer 1 FIN and CPM FIN see every branch's data there, while their
 * other tabs (List of Debtors, Debtors Report, Arrears Report) stay
 * scoped to their own branch as usual.
 */
export function financeReportVisibleDebtors(persona: Persona, debtors: Debtor[]): Debtor[] {
  if (isSuperAdmin(persona)) return debtors;
  return debtors.filter((d) => STATUS_ALLOWED_ROLES[d.status].includes(persona.role));
}

/** Branch Rep / Reviewer 1 / CPM of any branch (including FIN), plus Super
 * Admin — the operational tabs: List of Debtors, Debtors Report, Arrears
 * Report. */
export function hasOperationalAccess(persona: Persona): boolean {
  return persona.role !== 'FINANCE';
}

/** Finance Officer, Reviewer 1 FIN, CPM FIN, and Super Admin — the
 * finance-wide oversight tabs: Debtors Report (cross-branch), (Fin) Arrears
 * Report, Nature of Arrears, Description, and the Debt Management (CFR-FIN)
 * section. */
export function isFinanceTeamPersona(persona: Persona): boolean {
  return (
    isSuperAdmin(persona) ||
    persona.role === 'FINANCE' ||
    (persona.branch === 'FIN' && (persona.role === 'REVIEWER_1' || persona.role === 'CPM'))
  );
}

/** Branch Rep, Reviewer 1, CPM (any branch, including FIN), and Super Admin —
 * the "Call For Return" section. Finance Officer does not get this section;
 * they have their own "(Fin) Call For Return" section instead. */
export function hasCfrAccess(persona: Persona): boolean {
  return (
    isSuperAdmin(persona) ||
    persona.role === 'BRANCH_REP' ||
    persona.role === 'REVIEWER_1' ||
    persona.role === 'CPM'
  );
}

/**
 * Scoping for the Write Off / To Be Written Off report tabs: independent of
 * the Debtor List's own status (a write-off can exist on a debtor at any
 * status), scoped purely by branch — Branch Rep/Reviewer 1/CPM see only
 * their own branch, Finance Officer/Reviewer 1 FIN/CPM FIN and Super Admin
 * see every branch, same as Debtors Report.
 */
export function writeOffVisibleDebtors(persona: Persona, debtors: Debtor[]): Debtor[] {
  if (isSuperAdmin(persona) || isFinanceTeamPersona(persona)) return debtors;
  return debtors.filter((d) => d.branch === persona.branch);
}
