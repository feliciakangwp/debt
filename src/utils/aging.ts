import { ARREARS_BUCKET_KEYS, totalAR } from '../types';
import type { AREntry, Debtor, TransactionType } from '../types';
import { formatCurrency } from './format';

export type AgingBuckets = Pick<
  Debtor,
  'notInArrears' | (typeof ARREARS_BUCKET_KEYS)[number]
>;

function emptyBuckets(): AgingBuckets {
  return {
    notInArrears: 0,
    arrears6m: 0,
    arrears6to12m: 0,
    arrears1to2y: 0,
    arrears2to3y: 0,
    arrears3to4y: 0,
    arrears4to5y: 0,
    arrears5yPlus: 0,
  };
}

function parseDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function monthsElapsed(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

/**
 * Places a single amount into the correct aging bucket by comparing the
 * required paid date against today. If today hasn't passed the required paid
 * date yet (or no due date has been set at all), the whole amount sits under
 * "AR Not in Arrears".
 */
export function computeAgingBuckets(
  amount: number,
  requiredPaidDate: string,
  today: string,
): AgingBuckets {
  const buckets = emptyBuckets();
  if (!requiredPaidDate) {
    buckets.notInArrears = amount;
    return buckets;
  }
  const due = parseDate(requiredPaidDate);
  const now = parseDate(today);

  if (now <= due) {
    buckets.notInArrears = amount;
    return buckets;
  }

  const months = monthsElapsed(due, now);

  if (months < 6) buckets.arrears6m = amount;
  else if (months < 12) buckets.arrears6to12m = amount;
  else if (months < 24) buckets.arrears1to2y = amount;
  else if (months < 36) buckets.arrears2to3y = amount;
  else if (months < 48) buckets.arrears3to4y = amount;
  else if (months < 60) buckets.arrears4to5y = amount;
  else buckets.arrears5yPlus = amount;

  return buckets;
}

export function sumAgingBuckets(list: AgingBuckets[]): AgingBuckets {
  const total = emptyBuckets();
  for (const b of list) {
    total.notInArrears += b.notInArrears;
    for (const key of ARREARS_BUCKET_KEYS) total[key] += b[key];
  }
  return total;
}

export function computeAgingBucketsForEntries(entries: AREntry[], today: string): AgingBuckets {
  return sumAgingBuckets(entries.map((e) => computeAgingBuckets(e.amount, e.requiredPaidDate, today)));
}

/**
 * Reduces the oldest (most overdue) non-zero buckets first by `amount`,
 * clamping each at zero — how a Supported write-off knocks the amount off
 * the debtor's arrears: the longest-outstanding debt is cleared first.
 */
function knockOffOldestFirst(buckets: AgingBuckets, amount: number): AgingBuckets {
  const result = { ...buckets };
  let remaining = amount;
  const oldestFirst: (keyof AgingBuckets)[] = [
    'arrears5yPlus',
    'arrears4to5y',
    'arrears3to4y',
    'arrears2to3y',
    'arrears1to2y',
    'arrears6to12m',
    'arrears6m',
  ];
  for (const key of oldestFirst) {
    if (remaining <= 0) break;
    const take = Math.min(result[key], remaining);
    result[key] -= take;
    remaining -= take;
  }
  return result;
}

/**
 * Returns the aging buckets that should actually be displayed/summed for a
 * debtor, resolved live against `today` so records shift columns as the
 * simulated date changes:
 *  - arEntries (multiple amount + due date pairs) take priority when present.
 *  - a single legacy requiredPaidDate/totalARAmount pair is used next.
 *  - otherwise the directly-entered legacy bucket fields are returned as-is.
 * Once the debtor's Write Off is Supported, its amount is then knocked off
 * the result (oldest arrears first) — every report/total that goes through
 * this function reflects the write-off automatically.
 */
export function resolveDebtorBuckets(d: Debtor, today: string): AgingBuckets {
  let buckets: AgingBuckets;
  if (d.arEntries && d.arEntries.length > 0) {
    buckets = computeAgingBucketsForEntries(d.arEntries, today);
  } else if (d.requiredPaidDate) {
    buckets = computeAgingBuckets(d.totalARAmount ?? 0, d.requiredPaidDate, today);
  } else {
    buckets = {
      notInArrears: d.notInArrears,
      arrears6m: d.arrears6m,
      arrears6to12m: d.arrears6to12m,
      arrears1to2y: d.arrears1to2y,
      arrears2to3y: d.arrears2to3y,
      arrears3to4y: d.arrears3to4y,
      arrears4to5y: d.arrears4to5y,
      arrears5yPlus: d.arrears5yPlus,
    };
  }
  if (d.writeOff?.status === 'SUPPORTED') {
    buckets = knockOffOldestFirst(buckets, d.writeOff.writeOffAmount);
  }
  return buckets;
}

/**
 * Flattens a debtor into its amount/due-date rows:
 *  - arEntries (multiple amount + due date pairs) take priority when present.
 *  - a single legacy requiredPaidDate/totalARAmount pair is used next.
 *  - otherwise falls back to one row for the whole debtor's Total AR with no
 *    due date, since legacy fixed-bucket records never recorded one.
 */
export function debtorAmountRows(d: Debtor): { amount: number; requiredPaidDate: string }[] {
  if (d.arEntries && d.arEntries.length > 0) {
    return d.arEntries.map((e) => ({ amount: e.amount, requiredPaidDate: e.requiredPaidDate }));
  }
  if (d.requiredPaidDate) {
    return [{ amount: d.totalARAmount ?? 0, requiredPaidDate: d.requiredPaidDate }];
  }
  return [{ amount: totalAR(d), requiredPaidDate: '' }];
}

/**
 * Same rows as debtorAmountRows, but with a Supported write-off's amount
 * knocked off — for the List of Debtors' Amount column, which otherwise
 * kept showing the pre-write-off figure even though every aggregate report
 * already reflects the reduction via resolveDebtorBuckets. Reduces the rows
 * actually in arrears (due on or before `today`) first, earliest due date
 * first, mirroring resolveDebtorBuckets' oldest-bucket-first order since
 * each row falls into exactly one bucket. Rows not yet due are never
 * touched, same as resolveDebtorBuckets leaves notInArrears alone.
 */
export function debtorAmountRowsNetOfWriteOff(
  d: Debtor,
  today: string,
): { amount: number; requiredPaidDate: string }[] {
  const rows = debtorAmountRows(d);
  if (!d.writeOff || d.writeOff.status !== 'SUPPORTED') return rows;

  const overdueOldestFirst = rows
    .map((r, index) => ({ ...r, index }))
    .filter((r) => r.requiredPaidDate && r.requiredPaidDate <= today)
    .sort((a, b) => a.requiredPaidDate.localeCompare(b.requiredPaidDate));

  const netAmountByIndex = new Map<number, number>();
  let remaining = d.writeOff.writeOffAmount;
  for (const r of overdueOldestFirst) {
    if (remaining <= 0) break;
    const take = Math.min(r.amount, remaining);
    netAmountByIndex.set(r.index, r.amount - take);
    remaining -= take;
  }

  return rows.map((r, index) => (netAmountByIndex.has(index) ? { ...r, amount: netAmountByIndex.get(index)! } : r));
}

const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  notInArrears: 'AR Not in Arrears',
  arrears6m: 'AR in Arrears ≤ 6 months',
  arrears6to12m: 'AR in Arrears (6-12 months)',
  arrears1to2y: 'AR in Arrears (1-2yrs)',
  arrears2to3y: 'AR in Arrears (2-3yrs)',
  arrears3to4y: 'AR in Arrears (3-4yrs)',
  arrears4to5y: 'AR in Arrears (4-5yrs)',
  arrears5yPlus: 'AR in Arrears ≥ 5 years',
};

export function bucketLabel(buckets: AgingBuckets): string {
  const key = (Object.keys(buckets) as (keyof AgingBuckets)[]).find((k) => buckets[k] > 0);
  return key ? BUCKET_LABELS[key] : BUCKET_LABELS.notInArrears;
}

/** Compact multi-bucket summary, e.g. "AR Not in Arrears: $1,000 · AR in Arrears ≤ 6 months: $2,000" */
export function summarizeBuckets(buckets: AgingBuckets): string {
  const parts = (Object.keys(BUCKET_LABELS) as (keyof AgingBuckets)[])
    .filter((k) => buckets[k] > 0)
    .map((k) => `${BUCKET_LABELS[k]}: ${formatCurrency(buckets[k])}`);
  return parts.length > 0 ? parts.join(' · ') : 'No amounts entered yet.';
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * The earliest date this debtor's arrears began accruing, used for Write
 * Off's "Days in Arrears" calculation. Prefers an exact due date (from
 * arEntries, or the legacy single requiredPaidDate) when the debtor has
 * one — the earliest across all of them. Falls back to estimating from the
 * oldest non-zero aging bucket relative to `today` for legacy records that
 * only ever had bucket amounts entered directly, with no due date on file.
 * Returns null when the debtor has no arrears at all — nothing to write off.
 */
export function firstArrearDate(d: Debtor, today: string): string | null {
  const datedRows = debtorAmountRows(d).filter((r) => r.requiredPaidDate);
  if (datedRows.length > 0) {
    return datedRows.reduce(
      (earliest, r) => (r.requiredPaidDate < earliest ? r.requiredPaidDate : earliest),
      datedRows[0].requiredPaidDate,
    );
  }

  const buckets = resolveDebtorBuckets(d, today);
  const oldestBucketFirst: [keyof AgingBuckets, number][] = [
    ['arrears5yPlus', 60],
    ['arrears4to5y', 48],
    ['arrears3to4y', 36],
    ['arrears2to3y', 24],
    ['arrears1to2y', 12],
    ['arrears6to12m', 6],
    ['arrears6m', 0],
  ];
  const now = parseDate(today);
  for (const [key, monthsBack] of oldestBucketFirst) {
    if (buckets[key] > 0) {
      const estimated = new Date(now);
      estimated.setMonth(estimated.getMonth() - monthsBack);
      return toIsoDate(estimated);
    }
  }
  return null;
}

/** Whole days from `from` to `to` (may be negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / msPerDay);
}

export interface TransactionRow {
  date: string;
  type: TransactionType;
  /** Signed: positive for Arrears, negative for Write Off/Paid. */
  amount: number;
  /** Running cumulative total up to and including this row, in date order. */
  balance: number;
}

/**
 * The transaction history for one specific AR entry (line item) of a
 * debtor, identified by its index within debtorAmountRows — not the whole
 * debtor's combined history, since a debtor can carry several unrelated
 * line items (e.g. one not yet due, one overdue) and each List of Debtors
 * row/popup should only ever show its own line's figures.
 * Starts with a single "Arrears" row dated by that entry's payment due date
 * (its gross original amount). If the debtor's write-off is Supported and
 * actually reduced this particular entry — per the same oldest-first order
 * debtorAmountRowsNetOfWriteOff applies — adds a "Write Off" row for just
 * the portion knocked off this entry, not the debtor's full write-off
 * amount. "Paid" is included in TransactionType for when a payments feature
 * exists, but nothing produces one yet. Sorted oldest first with a running
 * balance scoped to this entry alone.
 */
export function buildTransactionLedgerForEntry(d: Debtor, entryIndex: number, today: string): TransactionRow[] {
  const grossRows = debtorAmountRows(d);
  const entry = grossRows[entryIndex];
  if (!entry || !entry.requiredPaidDate) return [];

  const rows: { date: string; type: TransactionType; amount: number }[] = [
    { date: entry.requiredPaidDate, type: 'ARREARS', amount: entry.amount },
  ];

  if (d.writeOff && d.writeOff.status === 'SUPPORTED') {
    const netAmount = debtorAmountRowsNetOfWriteOff(d, today)[entryIndex]?.amount ?? entry.amount;
    const knockedOff = entry.amount - netAmount;
    if (knockedOff > 0) {
      rows.push({ date: d.writeOff.dateOfWriteOff, type: 'WRITE_OFF', amount: -knockedOff });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  return rows.map((r) => {
    balance += r.amount;
    return { ...r, balance };
  });
}
