import { supabase } from './supabaseClient';
import type {
  AuditLogEntry,
  Branch,
  CallForReturnPeriod,
  CfrArrearsSubmission,
  CfrSubmissionStatus,
  Debtor,
  DebtorEditProposal,
  DebtorStatus,
  PaymentRecord,
  ReferenceItem,
  WriteOffRecord,
  WriteOffStatus,
} from '../types';

// ============================================================
// Row shapes (snake_case, matching database/supabase_setup.sql)
// ============================================================

interface ReferenceItemRow {
  id: string;
  name: string;
  kind: 'nature' | 'description';
  active: boolean;
  nature_id: string | null;
}

interface DebtorRow {
  id: string;
  status: DebtorStatus;
  branch: Branch;
  name: string;
  nature_id: string;
  description_id: string;
  not_in_arrears: number;
  arrears_6m: number;
  arrears_6to12m: number;
  arrears_1to2y: number;
  arrears_2to3y: number;
  arrears_3to4y: number;
  arrears_4to5y: number;
  arrears_5yplus: number;
  reason_non_recovery: string;
  recovery_steps: string;
  case_reference: string;
  assigned_to_id: string;
  reviewer1_id: string;
  reviewer2_id: string | null;
  required_paid_date: string | null;
  total_ar_amount: number | null;
  edit_proposal: DebtorEditProposal | null;
}

interface AREntryRow {
  id: string;
  debtor_id: string;
  amount: number;
  required_paid_date: string;
}

interface WriteOffRow {
  id: string;
  debtor_id: string;
  status: WriteOffStatus;
  date_of_write_off: string;
  write_off_amount: number;
  days_in_arrears: number;
  reason_for_write_off: string;
}

interface PaymentRow {
  id: string;
  debtor_id: string;
  date: string;
  amount: number;
  voided: boolean;
}

interface AuditLogRow {
  id: string;
  entity_type: 'debtor' | 'cfr_submission';
  entity_id: string;
  date: string;
  actor: string;
  action: string;
}

interface PeriodRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface CfrSubmissionRow {
  id: string;
  period_id: string;
  branch: Branch;
  status: CfrSubmissionStatus;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Throws with a readable message instead of letting a Supabase error
 * object (or a thrown network error) bubble up as-is. */
function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// ============================================================
// Fetch — reconstructs the app's nested Debtor[] / CfrArrearsSubmission[]
// shapes from the relational tables.
// ============================================================

export interface LoadedData {
  natureList: ReferenceItem[];
  descriptionList: ReferenceItem[];
  debtors: Debtor[];
  callForReturnPeriods: CallForReturnPeriod[];
  cfrArrearsSubmissions: CfrArrearsSubmission[];
}

export async function fetchAllData(): Promise<LoadedData> {
  const [
    { data: refRows, error: refError },
    { data: debtorRows, error: debtorError },
    { data: entryRows, error: entryError },
    { data: writeOffRows, error: writeOffError },
    { data: paymentRows, error: paymentError },
    { data: auditRows, error: auditError },
    { data: periodRows, error: periodError },
    { data: submissionRows, error: submissionError },
  ] = await Promise.all([
    supabase.from('reference_items').select('*'),
    supabase.from('debtors').select('*').order('created_at'),
    supabase.from('debtor_ar_entries').select('*'),
    supabase.from('debtor_write_offs').select('*'),
    supabase.from('debtor_payments').select('*'),
    supabase.from('audit_log').select('*'),
    supabase.from('call_for_return_periods').select('*'),
    supabase.from('cfr_arrears_submissions').select('*'),
  ]);

  assertNoError(refError, 'Loading Nature/Description lists failed');
  assertNoError(debtorError, 'Loading debt records failed');
  assertNoError(entryError, 'Loading AR entries failed');
  assertNoError(writeOffError, 'Loading write-offs failed');
  assertNoError(paymentError, 'Loading payments failed');
  assertNoError(auditError, 'Loading audit log failed');
  assertNoError(periodError, 'Loading Call for Return periods failed');
  assertNoError(submissionError, 'Loading Call for Return submissions failed');

  const allRefRows = (refRows ?? []) as ReferenceItemRow[];
  const natureList: ReferenceItem[] = allRefRows
    .filter((r) => r.kind === 'nature')
    .map((r) => ({ id: r.id, name: r.name, active: r.active }));
  const descriptionList: ReferenceItem[] = allRefRows
    .filter((r) => r.kind === 'description')
    .map((r) => ({ id: r.id, name: r.name, active: r.active, natureId: r.nature_id ?? undefined }));

  const entriesByDebtor = new Map<string, AREntryRow[]>();
  for (const e of (entryRows ?? []) as AREntryRow[]) {
    const list = entriesByDebtor.get(e.debtor_id) ?? [];
    list.push(e);
    entriesByDebtor.set(e.debtor_id, list);
  }

  const writeOffsByDebtor = new Map<string, WriteOffRecord[]>();
  for (const w of (writeOffRows ?? []) as WriteOffRow[]) {
    const list = writeOffsByDebtor.get(w.debtor_id) ?? [];
    list.push({
      id: w.id,
      status: w.status,
      dateOfWriteOff: w.date_of_write_off,
      writeOffAmount: w.write_off_amount,
      daysInArrears: w.days_in_arrears,
      reasonForWriteOff: w.reason_for_write_off,
    });
    writeOffsByDebtor.set(w.debtor_id, list);
  }

  const paymentsByDebtor = new Map<string, PaymentRecord[]>();
  for (const p of (paymentRows ?? []) as PaymentRow[]) {
    const list = paymentsByDebtor.get(p.debtor_id) ?? [];
    list.push({ id: p.id, date: p.date, amount: p.amount, voided: p.voided });
    paymentsByDebtor.set(p.debtor_id, list);
  }

  const auditByEntity = new Map<string, AuditLogEntry[]>();
  for (const a of (auditRows ?? []) as AuditLogRow[]) {
    const key = `${a.entity_type}:${a.entity_id}`;
    const list = auditByEntity.get(key) ?? [];
    list.push({ id: a.id, date: a.date, actor: a.actor, action: a.action });
    auditByEntity.set(key, list);
  }

  const debtors: Debtor[] = ((debtorRows ?? []) as DebtorRow[]).map((d) => ({
    id: d.id,
    status: d.status,
    branch: d.branch,
    name: d.name,
    natureId: d.nature_id,
    descriptionId: d.description_id,
    notInArrears: d.not_in_arrears,
    arrears6m: d.arrears_6m,
    arrears6to12m: d.arrears_6to12m,
    arrears1to2y: d.arrears_1to2y,
    arrears2to3y: d.arrears_2to3y,
    arrears3to4y: d.arrears_3to4y,
    arrears4to5y: d.arrears_4to5y,
    arrears5yPlus: d.arrears_5yplus,
    reasonNonRecovery: d.reason_non_recovery,
    recoverySteps: d.recovery_steps,
    caseReference: d.case_reference,
    assignedToId: d.assigned_to_id,
    reviewer1Id: d.reviewer1_id,
    reviewer2Id: d.reviewer2_id ?? undefined,
    requiredPaidDate: d.required_paid_date ?? undefined,
    totalARAmount: d.total_ar_amount ?? undefined,
    arEntries: (entriesByDebtor.get(d.id) ?? []).map((e) => ({
      id: e.id,
      amount: e.amount,
      requiredPaidDate: e.required_paid_date,
    })),
    editProposal: d.edit_proposal ?? undefined,
    writeOffs: writeOffsByDebtor.get(d.id) ?? [],
    payments: paymentsByDebtor.get(d.id) ?? [],
    auditLog: auditByEntity.get(`debtor:${d.id}`) ?? [],
  }));

  const callForReturnPeriods: CallForReturnPeriod[] = ((periodRows ?? []) as PeriodRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.start_date,
    endDate: p.end_date,
  }));

  const cfrArrearsSubmissions: CfrArrearsSubmission[] = ((submissionRows ?? []) as CfrSubmissionRow[]).map((s) => ({
    id: s.id,
    periodId: s.period_id,
    branch: s.branch,
    status: s.status,
    auditLog: auditByEntity.get(`cfr_submission:${s.id}`) ?? [],
  }));

  return { natureList, descriptionList, debtors, callForReturnPeriods, cfrArrearsSubmissions };
}

// ============================================================
// Shared helpers
// ============================================================

async function insertAuditLog(
  entityType: 'debtor' | 'cfr_submission',
  entityId: string,
  date: string,
  actor: string,
  action: string,
): Promise<void> {
  const row: AuditLogRow = { id: newId('log'), entity_type: entityType, entity_id: entityId, date, actor, action };
  const { error } = await supabase.from('audit_log').insert(row);
  assertNoError(error, 'Saving the activity log entry failed');
}

async function replaceArEntries(debtorId: string, entries: { amount: number; requiredPaidDate: string }[]): Promise<void> {
  const { error: deleteError } = await supabase.from('debtor_ar_entries').delete().eq('debtor_id', debtorId);
  assertNoError(deleteError, 'Replacing the AR entries failed');
  if (entries.length === 0) return;
  const rows: AREntryRow[] = entries.map((e, i) => ({
    id: newId(`${debtorId}-entry-${i}`),
    debtor_id: debtorId,
    amount: e.amount,
    required_paid_date: e.requiredPaidDate,
  }));
  const { error: insertError } = await supabase.from('debtor_ar_entries').insert(rows);
  assertNoError(insertError, 'Saving the AR entries failed');
}

// ============================================================
// Reference items (Nature / Description)
// ============================================================

export async function dbAddReferenceItem(
  list: 'nature' | 'description',
  name: string,
  natureId: string | undefined,
): Promise<void> {
  const row: ReferenceItemRow = {
    id: newId(list),
    name,
    kind: list,
    active: true,
    nature_id: list === 'description' ? (natureId ?? null) : null,
  };
  const { error } = await supabase.from('reference_items').insert(row);
  assertNoError(error, `Adding the ${list} item failed`);
}

export async function dbSetReferenceItemActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('reference_items').update({ active }).eq('id', id);
  assertNoError(error, 'Updating the reference item failed');
}

// ============================================================
// Debtors
// ============================================================

export async function dbAddDebtor(debtor: Omit<Debtor, 'id'>): Promise<void> {
  const id = newId('debtor');
  const row: Omit<DebtorRow, 'reviewer2_id' | 'required_paid_date' | 'total_ar_amount' | 'edit_proposal'> & {
    reviewer2_id: string | null;
    required_paid_date: string | null;
    total_ar_amount: number | null;
    edit_proposal: DebtorEditProposal | null;
  } = {
    id,
    status: debtor.status,
    branch: debtor.branch,
    name: debtor.name,
    nature_id: debtor.natureId,
    description_id: debtor.descriptionId,
    not_in_arrears: debtor.notInArrears,
    arrears_6m: debtor.arrears6m,
    arrears_6to12m: debtor.arrears6to12m,
    arrears_1to2y: debtor.arrears1to2y,
    arrears_2to3y: debtor.arrears2to3y,
    arrears_3to4y: debtor.arrears3to4y,
    arrears_4to5y: debtor.arrears4to5y,
    arrears_5yplus: debtor.arrears5yPlus,
    reason_non_recovery: debtor.reasonNonRecovery,
    recovery_steps: debtor.recoverySteps,
    case_reference: debtor.caseReference,
    assigned_to_id: debtor.assignedToId,
    reviewer1_id: debtor.reviewer1Id,
    reviewer2_id: debtor.reviewer2Id ?? null,
    required_paid_date: debtor.requiredPaidDate ?? null,
    total_ar_amount: debtor.totalARAmount ?? null,
    edit_proposal: null,
  };
  const { error } = await supabase.from('debtors').insert(row);
  assertNoError(error, 'Creating the debt record failed');
  if (debtor.arEntries && debtor.arEntries.length > 0) {
    await replaceArEntries(id, debtor.arEntries);
  }
  if (debtor.auditLog.length > 0) {
    const rows: AuditLogRow[] = debtor.auditLog.map((log) => ({
      id: log.id,
      entity_type: 'debtor',
      entity_id: id,
      date: log.date,
      actor: log.actor,
      action: log.action,
    }));
    const { error } = await supabase.from('audit_log').insert(rows);
    assertNoError(error, 'Saving the activity log entry failed');
  }
}

export async function dbUpdateDebtor(id: string, patch: Partial<Debtor>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.natureId !== undefined) row.nature_id = patch.natureId;
  if (patch.descriptionId !== undefined) row.description_id = patch.descriptionId;
  if (patch.caseReference !== undefined) row.case_reference = patch.caseReference;
  if (patch.notInArrears !== undefined) row.not_in_arrears = patch.notInArrears;
  if (patch.arrears6m !== undefined) row.arrears_6m = patch.arrears6m;
  if (patch.arrears6to12m !== undefined) row.arrears_6to12m = patch.arrears6to12m;
  if (patch.arrears1to2y !== undefined) row.arrears_1to2y = patch.arrears1to2y;
  if (patch.arrears2to3y !== undefined) row.arrears_2to3y = patch.arrears2to3y;
  if (patch.arrears3to4y !== undefined) row.arrears_3to4y = patch.arrears3to4y;
  if (patch.arrears4to5y !== undefined) row.arrears_4to5y = patch.arrears4to5y;
  if (patch.arrears5yPlus !== undefined) row.arrears_5yplus = patch.arrears5yPlus;
  // Checked with hasOwnProperty, not `!== undefined` — the edit form
  // explicitly sets these to undefined (meaning "clear it") when a debtor
  // moves from the legacy single-entry fields to arEntries.
  if (Object.prototype.hasOwnProperty.call(patch, 'requiredPaidDate')) {
    row.required_paid_date = patch.requiredPaidDate ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'totalARAmount')) {
    row.total_ar_amount = patch.totalARAmount ?? null;
  }
  if (patch.status !== undefined) row.status = patch.status;

  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('debtors').update(row).eq('id', id);
    assertNoError(error, 'Updating the debt record failed');
  }
  if (patch.arEntries !== undefined) {
    await replaceArEntries(id, patch.arEntries);
  }
}

export async function dbUpdateDebtorsStatus(
  ids: string[],
  status: DebtorStatus,
  logAction: string,
  actorLabel: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.from('debtors').update({ status }).in('id', ids);
  assertNoError(error, 'Updating the status failed');
  await Promise.all(ids.map((id) => insertAuditLog('debtor', id, date, actorLabel, logAction)));
}

export async function dbDeleteDebtors(ids: string[]): Promise<void> {
  const { error: auditError } = await supabase.from('audit_log').delete().eq('entity_type', 'debtor').in('entity_id', ids);
  assertNoError(auditError, 'Deleting the debt record failed');
  const { error } = await supabase.from('debtors').delete().in('id', ids);
  assertNoError(error, 'Deleting the debt record failed');
}

export async function dbUpdateDebtorDetails(
  id: string,
  patch: Pick<Debtor, 'reasonNonRecovery' | 'recoverySteps'>,
  actorLabel: string,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('debtors')
    .update({ reason_non_recovery: patch.reasonNonRecovery, recovery_steps: patch.recoverySteps })
    .eq('id', id);
  assertNoError(error, 'Saving the details failed');
  await insertAuditLog('debtor', id, date, actorLabel, 'Updated details');
}

export async function dbRequestEdit(
  id: string,
  proposal: DebtorEditProposal,
  actorLabel: string,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('debtors')
    .update({ status: 'EDIT_REQUESTED', edit_proposal: proposal })
    .eq('id', id);
  assertNoError(error, 'Requesting the edit failed');
  await insertAuditLog('debtor', id, date, actorLabel, 'Requested edit');
}

export async function dbApproveEdit(debtor: Debtor, actorLabel: string, date: string): Promise<void> {
  const proposal = debtor.editProposal;
  if (!proposal) return;
  const row: Record<string, unknown> = {
    name: proposal.name,
    nature_id: proposal.natureId,
    description_id: proposal.descriptionId,
    case_reference: proposal.caseReference,
    edit_proposal: null,
    status: 'SUPPORTED',
  };
  if (proposal.arEntries) {
    row.not_in_arrears = 0;
    row.arrears_6m = 0;
    row.arrears_6to12m = 0;
    row.arrears_1to2y = 0;
    row.arrears_2to3y = 0;
    row.arrears_3to4y = 0;
    row.arrears_4to5y = 0;
    row.arrears_5yplus = 0;
    row.required_paid_date = null;
    row.total_ar_amount = null;
  }
  const { error } = await supabase.from('debtors').update(row).eq('id', debtor.id);
  assertNoError(error, 'Approving the edit failed');
  if (proposal.arEntries) {
    await replaceArEntries(debtor.id, proposal.arEntries);
  }
  await insertAuditLog('debtor', debtor.id, date, actorLabel, 'Edit approved');
}

export async function dbRejectEdit(id: string, actorLabel: string, comment: string, date: string): Promise<void> {
  const { error } = await supabase.from('debtors').update({ status: 'SUPPORTED', edit_proposal: null }).eq('id', id);
  assertNoError(error, 'Rejecting the edit failed');
  await insertAuditLog('debtor', id, date, actorLabel, `Edit rejected: ${comment}`);
}

// ============================================================
// Write-offs
// ============================================================

export async function dbSaveWriteOff(
  debtorId: string,
  existingWriteOffId: string | null,
  input: Pick<WriteOffRecord, 'dateOfWriteOff' | 'writeOffAmount' | 'daysInArrears' | 'reasonForWriteOff'>,
  submit: boolean,
  actorLabel: string,
  date: string,
): Promise<void> {
  const status: WriteOffStatus = submit ? 'PENDING' : 'TO_BE_WRITTEN_OFF';
  const fields = {
    status,
    date_of_write_off: input.dateOfWriteOff,
    write_off_amount: input.writeOffAmount,
    days_in_arrears: input.daysInArrears,
    reason_for_write_off: input.reasonForWriteOff,
  };
  if (existingWriteOffId) {
    const { error } = await supabase.from('debtor_write_offs').update(fields).eq('id', existingWriteOffId);
    assertNoError(error, 'Saving the write-off failed');
  } else {
    const row: WriteOffRow = { id: newId('writeoff'), debtor_id: debtorId, ...fields };
    const { error } = await supabase.from('debtor_write_offs').insert(row);
    assertNoError(error, 'Saving the write-off failed');
  }
  const action = submit
    ? 'Write off submitted for review'
    : existingWriteOffId
      ? 'Write off updated (to be written off)'
      : 'Write off saved (to be written off)';
  await insertAuditLog('debtor', debtorId, date, actorLabel, action);
}

export async function dbSupportWriteOff(debtorId: string, writeOffId: string, actorLabel: string, date: string): Promise<void> {
  const { error } = await supabase.from('debtor_write_offs').update({ status: 'SUPPORTED' }).eq('id', writeOffId);
  assertNoError(error, 'Supporting the write-off failed');
  await insertAuditLog('debtor', debtorId, date, actorLabel, 'Write off supported');
}

export async function dbRejectWriteOff(debtorId: string, writeOffId: string, actorLabel: string, date: string): Promise<void> {
  const { error } = await supabase.from('debtor_write_offs').update({ status: 'TO_BE_WRITTEN_OFF' }).eq('id', writeOffId);
  assertNoError(error, 'Rejecting the write-off failed');
  await insertAuditLog('debtor', debtorId, date, actorLabel, 'Write off rejected');
}

// ============================================================
// Payments
// ============================================================

export async function dbRecordPayment(
  debtorId: string,
  amount: number,
  date: string,
  nextStatus: DebtorStatus,
  actorLabel: string,
  actionLabel: string,
): Promise<void> {
  const row: PaymentRow = { id: newId('payment'), debtor_id: debtorId, date, amount, voided: false };
  const { error } = await supabase.from('debtor_payments').insert(row);
  assertNoError(error, 'Recording the payment failed');
  const { error: statusError } = await supabase.from('debtors').update({ status: nextStatus }).eq('id', debtorId);
  assertNoError(statusError, 'Updating the status failed');
  await insertAuditLog('debtor', debtorId, date, actorLabel, actionLabel);
}

export async function dbReopenPayment(
  debtorId: string,
  paymentId: string,
  nextStatus: DebtorStatus,
  actorLabel: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.from('debtor_payments').update({ voided: true }).eq('id', paymentId);
  assertNoError(error, 'Reopening the payment failed');
  const { error: statusError } = await supabase.from('debtors').update({ status: nextStatus }).eq('id', debtorId);
  assertNoError(statusError, 'Updating the status failed');
  await insertAuditLog('debtor', debtorId, date, actorLabel, 'Payment reopened (voided)');
}

// ============================================================
// Call For Return
// ============================================================

export async function dbAddCallForReturnPeriod(period: Omit<CallForReturnPeriod, 'id'>): Promise<void> {
  const row: PeriodRow = { id: newId('cfr-period'), name: period.name, start_date: period.startDate, end_date: period.endDate };
  const { error } = await supabase.from('call_for_return_periods').insert(row);
  assertNoError(error, 'Creating the Call for Return period failed');
}

export async function dbUpdateCallForReturnPeriod(
  id: string,
  patch: Pick<CallForReturnPeriod, 'startDate' | 'endDate'>,
): Promise<void> {
  const { error } = await supabase
    .from('call_for_return_periods')
    .update({ start_date: patch.startDate, end_date: patch.endDate })
    .eq('id', id);
  assertNoError(error, 'Updating the Call for Return period failed');
}

export async function dbCreateCfrSubmissions(
  periodId: string,
  branches: Branch[],
  actorLabel: string,
  date: string,
): Promise<void> {
  if (branches.length === 0) return;
  const rows: CfrSubmissionRow[] = branches.map((branch) => ({
    id: newId(`cfr-submission-${branch}`),
    period_id: periodId,
    branch,
    status: 'DRAFT',
  }));
  const { error } = await supabase.from('cfr_arrears_submissions').insert(rows);
  assertNoError(error, 'Opening the Call for Return period failed');
  await Promise.all(rows.map((r) => insertAuditLog('cfr_submission', r.id, date, actorLabel, 'Call for Return period opened')));
}

export async function dbSetCfrSubmissionStatus(
  id: string,
  status: CfrSubmissionStatus,
  logAction: string,
  actorLabel: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.from('cfr_arrears_submissions').update({ status }).eq('id', id);
  assertNoError(error, 'Updating the Call for Return submission failed');
  await insertAuditLog('cfr_submission', id, date, actorLabel, logAction);
}
