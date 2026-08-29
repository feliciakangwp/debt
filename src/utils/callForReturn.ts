import type { CallForReturnPeriod, CallForReturnStatus } from '../types';

/** Open when today falls within [startDate, endDate] inclusive, comparing
 * plain ISO (YYYY-MM-DD) strings so it lines up with the simulated today
 * control used across the rest of the app. */
export function computeCallForReturnStatus(
  startDate: string,
  endDate: string,
  today: string,
): CallForReturnStatus {
  return today >= startDate && today <= endDate ? 'OPEN' : 'CLOSED';
}

/** The period currently accepting submissions, if any. When more than one
 * window is open at once (not expected, but not prevented either), the one
 * with the latest start date wins. */
export function getActiveOpenPeriod(
  periods: CallForReturnPeriod[],
  today: string,
): CallForReturnPeriod | undefined {
  const open = periods.filter((p) => computeCallForReturnStatus(p.startDate, p.endDate, today) === 'OPEN');
  if (open.length === 0) return undefined;
  return open.reduce((latest, p) => (p.startDate > latest.startDate ? p : latest));
}
