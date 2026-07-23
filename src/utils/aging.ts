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

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
