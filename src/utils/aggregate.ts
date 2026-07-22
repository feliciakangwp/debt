import type { Branch, Debtor } from '../types';
import { ARREARS_BUCKET_KEYS } from '../types';

export interface AggregatedRow {
  key: string;
  branch: Branch | 'SC';
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
}

function joinUnique(values: string[]): string {
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  return unique.join('; ');
}

/**
 * Groups debtor rows. When includeBranch is true, groups by branch+nature+description
 * (List of AR/Arrears). When false, groups by nature+description only across all
 * branches, with branch reported as 'SC' (List of AR/Arrears (FIN)).
 */
export function aggregateDebtors(debtors: Debtor[], includeBranch: boolean): AggregatedRow[] {
  const groups = new Map<string, Debtor[]>();

  for (const d of debtors) {
    const key = includeBranch
      ? `${d.branch}|${d.natureId}|${d.descriptionId}`
      : `${d.natureId}|${d.descriptionId}`;
    const existing = groups.get(key);
    if (existing) existing.push(d);
    else groups.set(key, [d]);
  }

  const rows: AggregatedRow[] = [];
  for (const [key, group] of groups) {
    const sum = (fn: (d: Debtor) => number) => group.reduce((acc, d) => acc + fn(d), 0);
    rows.push({
      key,
      branch: includeBranch ? group[0].branch : 'SC',
      natureId: group[0].natureId,
      descriptionId: group[0].descriptionId,
      notInArrears: sum((d) => d.notInArrears),
      arrears6m: sum((d) => d.arrears6m),
      arrears6to12m: sum((d) => d.arrears6to12m),
      arrears1to2y: sum((d) => d.arrears1to2y),
      arrears2to3y: sum((d) => d.arrears2to3y),
      arrears3to4y: sum((d) => d.arrears3to4y),
      arrears4to5y: sum((d) => d.arrears4to5y),
      arrears5yPlus: sum((d) => d.arrears5yPlus),
      reasonNonRecovery: joinUnique(group.map((d) => d.reasonNonRecovery)),
      recoverySteps: joinUnique(group.map((d) => d.recoverySteps)),
    });
  }
  return rows;
}

export function aggregatedTotalInArrears(row: AggregatedRow): number {
  return ARREARS_BUCKET_KEYS.reduce((sum, k) => sum + (row[k] || 0), 0);
}

export function aggregatedTotalAR(row: AggregatedRow): number {
  return row.notInArrears + aggregatedTotalInArrears(row);
}
