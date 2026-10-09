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

const ARREARS_BUCKETS_OLDEST_FIRST: (keyof AgingBuckets)[] = [
  'arrears5yPlus',
  'arrears4to5y',
  'arrears3to4y',
  'arrears2to3y',
  'arrears1to2y',
  'arrears6to12m',
  'arrears6m',
];

/**
 * Reduces non-zero buckets first by `amount`, clamping each at zero, in
 * the given order. A write-off only ever clears actual arrears (oldest,
 * most overdue first) — `notInArrears` is deliberately left out of its
 * order, since you can't write off a debt that isn't even due yet. A
 * payment can settle any of it, so its order appends `notInArrears` at
 * the end: pay off the oldest arrears first, then whatever isn't yet due.
 */
function knockOffBuckets(buckets: AgingBuckets, amount: number, order: (keyof AgingBuckets)[]): AgingBuckets {
  const result = { ...buckets };
  let remaining = amount;
  for (const key of order) {
    if (remaining <= 0) break;
    const take = Math.min(result[key], remaining);
    result[key] -= take;
    remaining -= take;
  }
  return result;
}

/**
 * Sum of every write-off on this debtor that has reached Supported —
 * write-offs are repeatable, so a debtor can accumulate more than one over
 * time. Anything still To be Written Off or Pending isn't counted yet.
 */
export function totalSupportedWriteOff(d: Debtor): number {
  return d.writeOffs.filter((w) => w.status === 'SUPPORTED').reduce((sum, w) => sum + w.writeOffAmount, 0);
}

/**
 * Sum of every payment on this debtor that hasn't been reopened — payments
 * take effect immediately (no review step), unlike write-offs, so there's
 * no separate "in flight" status to exclude here.
 */
export function totalActivePayments(d: Debtor): number {
  return d.payments.filter((p) => !p.voided).reduce((sum, p) => sum + p.amount, 0);
}

/** Gross AR across every line item, ignoring write-offs and payments. */
export function debtorGrossAR(d: Debtor): number {
  return debtorAmountRows(d).reduce((sum, r) => sum + r.amount, 0);
}

/**
 * What's still actually owed on this debtor as a whole, after knocking off
 * every Supported write-off and every active (not reopened) payment.
 * Drives the Payments tab's validation and when a debtor becomes Paid.
 */
export function debtorRemainingBalance(d: Debtor): number {
  return Math.max(0, debtorGrossAR(d) - totalSupportedWriteOff(d) - totalActivePayments(d));
}

/**
 * The date this debtor's balance actually reached zero — the latest date
 * among its Supported write-offs and active payments — or null while a
 * balance remains outstanding. Used only for List of Debt Records' 1-year
 * retention window; every other report keeps showing closed debtors
 * indefinitely.
 */
export function debtorClosedDate(d: Debtor): string | null {
  if (debtorRemainingBalance(d) > 0) return null;
  const dates: string[] = [];
  for (const w of d.writeOffs) if (w.status === 'SUPPORTED') dates.push(w.dateOfWriteOff);
  for (const p of d.payments) if (!p.voided) dates.push(p.date);
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest), dates[0]);
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * List of Debt Records' own retention rule: once a debtor's balance is
 * fully resolved (Paid, or written off down to $0), it stays on that list
 * for a year after it closed, then drops off. Nowhere else in the app
 * applies this cutoff.
 */
export function withinListRetentionWindow(d: Debtor, today: string): boolean {
  const closedDate = debtorClosedDate(d);
  if (!closedDate) return true;
  return parseDate(today).getTime() - parseDate(closedDate).getTime() <= ONE_YEAR_MS;
}

/**
 * Returns the aging buckets that should actually be displayed/summed for a
 * debtor, resolved live against `today` so records shift columns as the
 * simulated date changes:
 *  - arEntries (multiple amount + due date pairs) take priority when present.
 *  - a single legacy requiredPaidDate/totalARAmount pair is used next.
 *  - otherwise the directly-entered legacy bucket fields are returned as-is.
 * Once any of the debtor's write-offs are Supported, their combined
 * amount is knocked off the oldest arrears first; any payment made (and
 * not reopened) is knocked off next, oldest arrears first too, but a
 * payment can go on to clear `notInArrears` as well — every report/total
 * that goes through this function reflects both automatically.
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
  const writtenOff = totalSupportedWriteOff(d);
  if (writtenOff > 0) {
    buckets = knockOffBuckets(buckets, writtenOff, ARREARS_BUCKETS_OLDEST_FIRST);
  }
  const paid = totalActivePayments(d);
  if (paid > 0) {
    buckets = knockOffBuckets(buckets, paid, [...ARREARS_BUCKETS_OLDEST_FIRST, 'notInArrears']);
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
 * Reduces `rows` by `amount`, earliest due date first, clamping each row's
 * amount at zero — the row-based equivalent of knockOffBuckets. When
 * `overdueOnly` is true (write-offs), only rows already due on or before
 * `today` are touched, same as resolveDebtorBuckets leaving notInArrears
 * alone; when false (payments), every row is eligible, due or not.
 */
function knockOffRows(
  rows: { amount: number; requiredPaidDate: string }[],
  amount: number,
  today: string,
  overdueOnly: boolean,
): { amount: number; requiredPaidDate: string }[] {
  const eligibleOldestFirst = rows
    .map((r, index) => ({ ...r, index }))
    .filter((r) => (overdueOnly ? r.requiredPaidDate && r.requiredPaidDate <= today : true))
    .sort((a, b) => a.requiredPaidDate.localeCompare(b.requiredPaidDate));

  const netAmountByIndex = new Map<number, number>();
  let remaining = amount;
  for (const r of eligibleOldestFirst) {
    if (remaining <= 0) break;
    const take = Math.min(r.amount, remaining);
    netAmountByIndex.set(r.index, r.amount - take);
    remaining -= take;
  }

  return rows.map((r, index) => (netAmountByIndex.has(index) ? { ...r, amount: netAmountByIndex.get(index)! } : r));
}

/**
 * Same rows as debtorAmountRows, but with all Supported write-offs' and all
 * active payments' combined amount knocked off — for the List of Debtors'
 * Amount column, which otherwise kept showing the pre-knock-off figure even
 * though every aggregate report already reflects the reduction via
 * resolveDebtorBuckets. A write-off only reduces rows actually in arrears
 * (due on or before `today`), earliest due date first, mirroring
 * resolveDebtorBuckets' oldest-bucket-first order; a payment can go on to
 * reduce a row that isn't even due yet, same as it can clear notInArrears.
 */
export function debtorAmountRowsNetOfWriteOff(
  d: Debtor,
  today: string,
): { amount: number; requiredPaidDate: string }[] {
  let rows = debtorAmountRows(d);

  const writtenOff = totalSupportedWriteOff(d);
  if (writtenOff > 0) {
    rows = knockOffRows(rows, writtenOff, today, true);
  }

  const paid = totalActivePayments(d);
  if (paid > 0) {
    rows = knockOffRows(rows, paid, today, false);
  }

  return rows;
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
 * (its gross original amount). Every debtor's arEntries is capped at a
 * single entry, so any Supported write-off or active payment necessarily
 * applies entirely to that one entry — adds one "Write Off" row per
 * Supported write-off record and one "Paid" row per active (not reopened)
 * payment. Sorted oldest first with a running balance scoped to this entry
 * alone.
 */
export function buildTransactionLedgerForEntry(d: Debtor, entryIndex: number): TransactionRow[] {
  const grossRows = debtorAmountRows(d);
  const entry = grossRows[entryIndex];
  if (!entry || !entry.requiredPaidDate) return [];

  const rows: { date: string; type: TransactionType; amount: number }[] = [
    { date: entry.requiredPaidDate, type: 'ARREARS', amount: entry.amount },
  ];

  for (const w of d.writeOffs) {
    if (w.status === 'SUPPORTED') {
      rows.push({ date: w.dateOfWriteOff, type: 'WRITE_OFF', amount: -w.writeOffAmount });
    }
  }

  for (const p of d.payments) {
    if (!p.voided) {
      rows.push({ date: p.date, type: 'PAID', amount: -p.amount });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  return rows.map((r) => {
    balance += r.amount;
    return { ...r, balance };
  });
}
