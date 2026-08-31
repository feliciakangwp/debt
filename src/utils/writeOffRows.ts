import type { Debtor, WriteOffRecord, WriteOffStatus } from '../types';

/** One row per (debtor, write-off record) pair — a debtor can carry more
 * than one write-off over time (write-offs are repeatable), so the Write
 * Off / To Be Written Off reports (both in Debt Management and their Call
 * For Return counterparts) show one line per matching write-off, not one
 * line per debtor. */
export interface WriteOffRow {
  debtor: Debtor;
  writeOff: WriteOffRecord;
}

/** Flattens a list of debtors into WriteOffRow entries whose write-off
 * status matches `targetStatus` — 'SUPPORTED' for the Write Off tab,
 * 'TO_BE_WRITTEN_OFF' for the To Be Written Off tab. Pending write-offs
 * don't get a tab of their own; they're only visible via the debtor's own
 * popup while awaiting Reviewer 1. */
export function buildWriteOffRows(
  debtors: Debtor[],
  targetStatus: Exclude<WriteOffStatus, 'PENDING'>,
): WriteOffRow[] {
  return debtors.flatMap((d) =>
    d.writeOffs.filter((w) => w.status === targetStatus).map((w) => ({ debtor: d, writeOff: w })),
  );
}
