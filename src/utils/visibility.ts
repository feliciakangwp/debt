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

export function canSeeDebtor(persona: Persona, debtor: Debtor): boolean {
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
  return debtors.filter((d) => STATUS_ALLOWED_ROLES[d.status].includes(persona.role));
}

/** Branch Rep / Reviewer 1 / CPM of any branch (including FIN) — the
 * operational tabs: List of Debtors, Debtors Report, Arrears Report. */
export function hasOperationalAccess(persona: Persona): boolean {
  return persona.role !== 'FINANCE';
}

/** Finance Officer, plus Reviewer 1 FIN and CPM FIN — the finance-wide
 * oversight tabs: (Fin) Debtors Report, (Fin) Arrears Report, Nature of
 * Arrears, Description. */
export function isFinanceTeamPersona(persona: Persona): boolean {
  return (
    persona.role === 'FINANCE' ||
    (persona.branch === 'FIN' && (persona.role === 'REVIEWER_1' || persona.role === 'CPM'))
  );
}
