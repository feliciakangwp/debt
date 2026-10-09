import type { Debtor, DebtorStatus, Persona, Role } from '../types';

/**
 * Which roles may see a debtor line in the *reporting* pages (Debtors
 * Report, Arrears Report, CFR tabs, Write Off reports) at each stage of the
 * approval flow:
 *  - Draft: only the owning Branch Rep (not even Finance).
 *  - Pending Review: Branch Rep, DY Head, Head, Finance.
 *  - Supported: Branch Rep, DY Head, Head, and Finance.
 *  - Edit Requested: same audience as Supported, since the live data is
 *    unchanged and still visible while the proposed edit awaits review.
 *  - Paid: same audience as Supported — fully paid off, but reports keep
 *    showing it indefinitely (unlike List of Debt Records' own 1-year
 *    retention window, see withinListRetentionWindow).
 * Branch scoping still applies on top of this for every role except
 * Finance. This is deliberately broader than List of Debt Records' own
 * per-record assignment scoping (see canSeeDebtRecord/visibleDebtRecords
 * below) — these reporting pages are branch-wide oversight views, not the
 * individual working list of cases a reviewer is personally tagged on.
 */
const STATUS_ALLOWED_ROLES: Record<DebtorStatus, Role[]> = {
  DRAFT: ['BRANCH_REP'],
  PENDING_REVIEW: ['BRANCH_REP', 'DY_HEAD', 'HEAD', 'FINANCE'],
  SUPPORTED: ['BRANCH_REP', 'DY_HEAD', 'HEAD', 'FINANCE'],
  EDIT_REQUESTED: ['BRANCH_REP', 'DY_HEAD', 'HEAD', 'FINANCE'],
  PAID: ['BRANCH_REP', 'DY_HEAD', 'HEAD', 'FINANCE'],
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
 * DY Head FIN and Head FIN see every branch's data there, while their
 * other tabs (List of Debt Records, Debtors Report, Arrears Report) stay
 * scoped as usual.
 */
export function financeReportVisibleDebtors(persona: Persona, debtors: Debtor[]): Debtor[] {
  if (isSuperAdmin(persona)) return debtors;
  return debtors.filter((d) => STATUS_ALLOWED_ROLES[d.status].includes(persona.role));
}

/**
 * List of Debt Records' own access rule — deliberately narrower than every
 * other page in the app: a record is visible only to the three personas
 * explicitly tagged on it (Assigned To, Reviewer 1, Reviewer 2), not to
 * everyone in its branch. A Draft is further restricted to just its
 * Assigned To (the Branch Rep who created it) until it's actually
 * submitted — a reviewer tagged on it shouldn't see unfinished work.
 */
export function canSeeDebtRecord(persona: Persona, debtor: Debtor): boolean {
  if (isSuperAdmin(persona)) return true;
  if (debtor.status === 'DRAFT') return debtor.assignedToId === persona.id;
  return (
    debtor.assignedToId === persona.id ||
    debtor.reviewer1Id === persona.id ||
    debtor.reviewer2Id === persona.id
  );
}

export function visibleDebtRecords(persona: Persona, debtors: Debtor[]): Debtor[] {
  return debtors.filter((d) => canSeeDebtRecord(persona, d));
}

/** Branch Rep / DY Head / Head of any branch (including FIN), plus Super
 * Admin — the operational tabs: List of Debt Records, Debtors Report,
 * Arrears Report. */
export function hasOperationalAccess(persona: Persona): boolean {
  return persona.role !== 'FINANCE';
}

/** Finance Officer, DY Head FIN, Head FIN, and Super Admin — the
 * finance-wide oversight tabs: (FIN) List of Debt Records, Debtors Report
 * (cross-branch), (Fin) Arrears Report, Nature of Arrears, Description, and
 * the Debt Management (CFR-FIN) section. DY Head FIN and Head FIN double-hat
 * as Finance Officer on top of their own Branch Rep-reviewer role. */
export function isFinanceTeamPersona(persona: Persona): boolean {
  return (
    isSuperAdmin(persona) ||
    persona.role === 'FINANCE' ||
    (persona.branch === 'FIN' && (persona.role === 'DY_HEAD' || persona.role === 'HEAD'))
  );
}

/** Branch Rep, DY Head, Head (any branch, including FIN), and Super Admin —
 * the "Call For Return" section. Finance Officer does not get this section;
 * they have their own "(Fin) Call For Return" section instead. */
export function hasCfrAccess(persona: Persona): boolean {
  return (
    isSuperAdmin(persona) ||
    persona.role === 'BRANCH_REP' ||
    persona.role === 'DY_HEAD' ||
    persona.role === 'HEAD'
  );
}

/**
 * Scoping for the Write Off / To Be Written Off report tabs: independent of
 * the Debtor List's own status (a write-off can exist on a debtor at any
 * status), scoped purely by branch — Branch Rep/DY Head/Head see only their
 * own branch, Finance Officer/DY Head FIN/Head FIN and Super Admin see every
 * branch, same as Debtors Report.
 */
export function writeOffVisibleDebtors(persona: Persona, debtors: Debtor[]): Debtor[] {
  if (isSuperAdmin(persona) || isFinanceTeamPersona(persona)) return debtors;
  return debtors.filter((d) => d.branch === persona.branch);
}
