import { computeCallForReturnStatus } from './callForReturn';
import type { Branch, CallForReturnPeriod, CfrArrearsSubmission } from '../types';

export interface CfrReportDef {
  key: string;
  label: string;
}

/** The seven report types listed under a Call for Return period's Reports
 * tab, in display order. */
export const CFR_REPORT_CATALOG: CfrReportDef[] = [
  { key: 'arrears', label: 'Arrears' },
  { key: 'top10-debtors', label: 'Top 10 Debtors' },
  { key: 'arrears-5y', label: 'Arrears > 5 Years' },
  { key: 'loans-advances', label: 'Loans & Advances' },
  { key: 'written-off', label: 'Written Off' },
  { key: 'top10-written-off', label: 'Top 10 Written Off' },
  { key: 'to-be-written-off', label: 'To be Written Off' },
];

export interface CfrReportRow {
  id: string;
  periodId: string;
  periodName: string;
  reportKey: string;
  reportLabel: string;
}

/**
 * One row per (closed period) x (report type), latest period first.
 * Reports are auto-generated once a period's live status flips to Closed —
 * an open period shows nothing here yet. A period only appears once it has
 * actually been part of a Call for Return cycle (has at least one branch
 * submission); a period created with dates that never opened while the app
 * was running has no data to report. `scopeBranch` narrows this to periods
 * that specific branch took part in — pass null for the consolidated (Fin)
 * view or for Super Admin, who see every branch's periods.
 */
export function buildCfrReportRows(
  periods: CallForReturnPeriod[],
  submissions: CfrArrearsSubmission[],
  simulatedToday: string,
  scopeBranch: Branch | null,
): CfrReportRow[] {
  const eligiblePeriods = periods
    .filter((p) => computeCallForReturnStatus(p.startDate, p.endDate, simulatedToday) === 'CLOSED')
    .filter((p) => {
      const periodSubs = submissions.filter((s) => s.periodId === p.id);
      if (periodSubs.length === 0) return false;
      return scopeBranch === null || periodSubs.some((s) => s.branch === scopeBranch);
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const rows: CfrReportRow[] = [];
  for (const period of eligiblePeriods) {
    for (const report of CFR_REPORT_CATALOG) {
      rows.push({
        id: `${period.id}__${report.key}`,
        periodId: period.id,
        periodName: period.name,
        reportKey: report.key,
        reportLabel: report.label,
      });
    }
  }
  return rows;
}
