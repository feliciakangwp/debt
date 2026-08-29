import { totalInArrears } from '../types';
import type { Debtor } from '../types';

/** Shared with the Top 10 Debtors CFR tab and its Reports-tab Excel export,
 * so the two always agree on what "top 10" means. */
export function selectTop10Debtors(debtors: Debtor[]): Debtor[] {
  return [...debtors].sort((a, b) => totalInArrears(b) - totalInArrears(a)).slice(0, 10);
}

/** Shared with the Arrears > 5 years CFR tab and its Reports-tab Excel
 * export. */
export function selectArrearsOver5Years(debtors: Debtor[]): Debtor[] {
  return debtors.filter((d) => d.arrears5yPlus > 0);
}
