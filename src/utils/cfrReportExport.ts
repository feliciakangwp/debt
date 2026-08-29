import { resolveDebtorBuckets } from './aging';
import { financeReportVisibleDebtors, isSuperAdmin, visibleDebtors } from './visibility';
import { aggregateDebtors, aggregatedTotalAR, aggregatedTotalInArrears } from './aggregate';
import { selectArrearsOver5Years, selectTop10Debtors } from './cfrReportSelectors';
import { totalInArrears } from '../types';
import type { Debtor, Persona, ReferenceItem } from '../types';
import type { CfrReportRow } from './cfrReports';

interface CfrReportExportContext {
  persona: Persona;
  debtors: Debtor[];
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  simulatedToday: string;
  /** true = the (Fin) consolidated view: export every branch's data.
   * false = the Call For Return view: export only the viewer's own branch
   * (all branches for Super Admin). */
  consolidated: boolean;
}

type SheetRow = Record<string, string | number>;

const AGING_BUCKET_COLUMNS = [
  ['arrears6m', 'AR in Arrears <= 6 months'],
  ['arrears6to12m', 'AR in Arrears (6-12 months)'],
  ['arrears1to2y', 'AR in Arrears (1-2yrs)'],
  ['arrears2to3y', 'AR in Arrears (2-3yrs)'],
  ['arrears3to4y', 'AR in Arrears (3-4yrs)'],
  ['arrears4to5y', 'AR in Arrears (4-5yrs)'],
  ['arrears5yPlus', 'AR in Arrears >= 5 years'],
] as const;

function uniqueSheetName(base: string, used: Set<string>): string {
  const cleaned = base.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Report';
  let name = cleaned;
  let attempt = 2;
  while (used.has(name)) {
    const suffix = ` (${attempt++})`;
    name = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name);
  return name;
}

/**
 * Builds the sheet rows for one report type. Arrears/Top 10 Debtors/
 * Arrears > 5 years reuse the exact same aggregation/selection/aging logic
 * as their live report tabs, so a downloaded report always matches what
 * that tab would show for the current debtor data. The other four report
 * types don't have an underlying data model yet — they still appear in the
 * Reports list (per the sidebar's placeholder tabs) but export as a single
 * note row instead of fabricating data.
 */
function buildSheetRows(reportKey: string, scopedDebtors: Debtor[], ctx: CfrReportExportContext): SheetRow[] {
  const natureName = (id: string) => ctx.natureList.find((n) => n.id === id)?.name ?? id;
  const descName = (id: string) => ctx.descriptionList.find((d) => d.id === id)?.name ?? id;
  const withLiveBuckets = scopedDebtors.map((d) => ({ ...d, ...resolveDebtorBuckets(d, ctx.simulatedToday) }));

  if (reportKey === 'arrears') {
    const aggregated = aggregateDebtors(withLiveBuckets, !ctx.consolidated);
    return aggregated.map((r) => {
      const row: SheetRow = {
        'SB/Dept': r.branch,
        'Nature of Arrears': natureName(r.natureId),
        Description: descName(r.descriptionId),
        'Total AR': aggregatedTotalAR(r),
        'AR Not in Arrears': r.notInArrears,
        'Total in Arrears': aggregatedTotalInArrears(r),
      };
      for (const [key, label] of AGING_BUCKET_COLUMNS) row[label] = r[key];
      row['Reasons for non-recovery'] = r.reasonNonRecovery;
      row['Recovery steps taken'] = r.recoverySteps;
      return row;
    });
  }

  if (reportKey === 'top10-debtors' || reportKey === 'arrears-5y') {
    const selected = reportKey === 'top10-debtors' ? selectTop10Debtors(withLiveBuckets) : selectArrearsOver5Years(withLiveBuckets);
    return selected.map((d) => {
      const row: SheetRow = {
        'SB/Dept': d.branch,
        'Name of Debtor': d.name,
        'Nature of Arrears': natureName(d.natureId),
        Description: descName(d.descriptionId),
        'Total in Arrears': totalInArrears(d),
      };
      for (const [key, label] of AGING_BUCKET_COLUMNS) row[label] = d[key];
      return row;
    });
  }

  return [{ Note: 'This report has not been built yet.' }];
}

/** Loads the xlsx (SheetJS) library on demand, so its ~300KB doesn't add to
 * the app's initial bundle for personas who never download a report. */
export async function downloadCfrReportsExcel(rows: CfrReportRow[], ctx: CfrReportExportContext): Promise<void> {
  if (rows.length === 0) return;

  const XLSX = await import('xlsx');

  const scopedDebtors =
    ctx.consolidated || isSuperAdmin(ctx.persona)
      ? financeReportVisibleDebtors(ctx.persona, ctx.debtors)
      : visibleDebtors(ctx.persona, ctx.debtors);

  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const row of rows) {
    const sheetRows = buildSheetRows(row.reportKey, scopedDebtors, ctx);
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const name = uniqueSheetName(`${row.periodName} ${row.reportLabel}`, usedNames);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  const prefix = ctx.consolidated ? 'FinCallForReturn' : 'CallForReturn';
  XLSX.writeFile(workbook, `${prefix}-Reports-${ctx.simulatedToday}.xlsx`);
}
