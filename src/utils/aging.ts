import { ARREARS_BUCKET_KEYS } from '../types';
import type { Debtor } from '../types';

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
 * Places a single Total AR amount into the correct aging bucket by comparing
 * the required paid date against today. If today hasn't passed the required
 * paid date yet, the whole amount sits under "AR Not in Arrears".
 */
export function computeAgingBuckets(
  totalAR: number,
  requiredPaidDate: string,
  today: string,
): AgingBuckets {
  const buckets = emptyBuckets();
  const due = parseDate(requiredPaidDate);
  const now = parseDate(today);

  if (now <= due) {
    buckets.notInArrears = totalAR;
    return buckets;
  }

  const months = monthsElapsed(due, now);

  if (months < 6) buckets.arrears6m = totalAR;
  else if (months < 12) buckets.arrears6to12m = totalAR;
  else if (months < 24) buckets.arrears1to2y = totalAR;
  else if (months < 36) buckets.arrears2to3y = totalAR;
  else if (months < 48) buckets.arrears3to4y = totalAR;
  else if (months < 60) buckets.arrears4to5y = totalAR;
  else buckets.arrears5yPlus = totalAR;

  return buckets;
}

/**
 * Returns the aging buckets that should actually be displayed/summed for a
 * debtor. Entries created via the aging form carry requiredPaidDate +
 * totalARAmount and are recalculated live against `today`, so they shift
 * columns as the simulated date changes. Legacy entries with directly-entered
 * bucket amounts (no requiredPaidDate) are returned as-is.
 */
export function resolveDebtorBuckets(d: Debtor, today: string): AgingBuckets {
  if (d.requiredPaidDate) {
    return computeAgingBuckets(d.totalARAmount ?? 0, d.requiredPaidDate, today);
  }
  return {
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

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
