// Original rows for the handful of seed debtors that smoke tests mutate
// directly (write-offs, approvals, payments, case-reference edits), copied
// verbatim from database/supabase_setup.sql — the source of truth for the
// seed data. Shared between scripts/reset-named-seed-debtors.mjs (a CI
// step, run once after the whole suite) and tests/smoke.spec.ts (a
// beforeEach, run before every individual test — several tests reuse the
// same named debtor, so resetting only at the end of the run isn't enough
// to keep one test's mutation from breaking a later test in the same run).
export const SUPABASE_URL = 'https://kjbhexhazwrzdydayubg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lNnosGNwmhuzFIV4B36fAw_-ZOfzcwW';

export const SEED_DEBTORS = [
  {
    id: 'debtor-gen-PSB-1', status: 'SUPPORTED', branch: 'PSB', name: 'Lim Wee Keng',
    nature_id: 'nat-tax', description_id: 'desc-p-offence-motor-vehicle',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Unable to contact', recovery_steps: 'Engagement', case_reference: '147704',
    assigned_to_id: 'BRANCH_REP_PSB', reviewer1_id: 'HEAD_PSB', reviewer2_id: null,
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PSB-1-entry-0', amount: 4000, required_paid_date: '2026-10-15' },
  },
  {
    id: 'debtor-gen-PSB-7', status: 'DRAFT', branch: 'PSB', name: 'Koh Teck Whye',
    nature_id: 'nat-tax', description_id: 'desc-tobacco-cigarette-recovery',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Awaiting response', recovery_steps: 'Reminder letter sent', case_reference: '378231',
    assigned_to_id: 'BRANCH_REP_PSB', reviewer1_id: 'DY_HEAD_PSB', reviewer2_id: 'HEAD_PSB',
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PSB-7-entry-0', amount: 6000, required_paid_date: '2025-02-15' },
  },
  {
    id: 'debtor-gen-PSB-10', status: 'PENDING_REVIEW', branch: 'PSB', name: 'Ravi Chandran',
    nature_id: 'nat-fees', description_id: 'desc-cert-doc-fee',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: '', recovery_steps: '', case_reference: '128461',
    assigned_to_id: 'BRANCH_REP_PSB', reviewer1_id: 'HEAD_PSB', reviewer2_id: null,
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PSB-10-entry-0', amount: 5500, required_paid_date: '2025-11-15' },
  },
  {
    id: 'debtor-gen-PSB-12', status: 'SUPPORTED', branch: 'PSB', name: 'Tay Boon Huat',
    nature_id: 'nat-fees', description_id: 'desc-warehouse-fee',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Awaiting response', recovery_steps: 'Follow-up letter sent', case_reference: '305729',
    assigned_to_id: 'BRANCH_REP_PSB', reviewer1_id: 'HEAD_PSB', reviewer2_id: null,
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PSB-12-entry-0', amount: 11000, required_paid_date: '2025-02-15' },
  },
  {
    id: 'debtor-gen-PSB-13', status: 'SUPPORTED', branch: 'PSB', name: 'Michelle Wong',
    nature_id: 'nat-fees', description_id: 'desc-warehouse-fee',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'No contact', recovery_steps: 'Law firm', case_reference: '715913',
    assigned_to_id: 'BRANCH_REP_PSB', reviewer1_id: 'DY_HEAD_PSB', reviewer2_id: 'HEAD_PSB',
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PSB-13-entry-0', amount: 9000, required_paid_date: '2019-08-15' },
  },
  {
    id: 'debtor-gen-TIB-2', status: 'SUPPORTED', branch: 'TIB', name: 'Chandra Sekaran',
    nature_id: 'nat-tax', description_id: 'desc-p-offence-motor-vehicle',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Unable to contact', recovery_steps: 'Engagement', case_reference: '446809',
    assigned_to_id: 'BRANCH_REP_TIB', reviewer1_id: 'DY_HEAD_TIB', reviewer2_id: 'HEAD_TIB',
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-TIB-2-entry-0', amount: 45000, required_paid_date: '2024-02-15' },
  },
  {
    id: 'debtor-gen-SIB-1', status: 'SUPPORTED', branch: 'SIB', name: 'Chua Beng Huat',
    nature_id: 'nat-tax', description_id: 'desc-p-offence-motor-vehicle',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Unable to contact', recovery_steps: 'Engagement', case_reference: '288740',
    assigned_to_id: 'BRANCH_REP_SIB', reviewer1_id: 'HEAD_SIB', reviewer2_id: null,
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-SIB-1-entry-0', amount: 4000, required_paid_date: '2026-10-15' },
  },
  {
    id: 'debtor-gen-SIB-2', status: 'SUPPORTED', branch: 'SIB', name: 'Nurul Huda',
    nature_id: 'nat-tax', description_id: 'desc-p-offence-motor-vehicle',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'Unable to contact', recovery_steps: 'Engagement', case_reference: '631489',
    assigned_to_id: 'BRANCH_REP_SIB', reviewer1_id: 'DY_HEAD_SIB', reviewer2_id: 'HEAD_SIB',
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-SIB-2-entry-0', amount: 45000, required_paid_date: '2024-02-15' },
  },
  {
    id: 'debtor-gen-PCB-4', status: 'SUPPORTED', branch: 'PCB', name: 'Devi Krishnan',
    nature_id: 'nat-tax', description_id: 'desc-p-offence-liquor-duty',
    not_in_arrears: 0, arrears_6m: 0, arrears_6to12m: 0, arrears_1to2y: 0, arrears_2to3y: 0,
    arrears_3to4y: 0, arrears_4to5y: 0, arrears_5yplus: 0,
    reason_non_recovery: 'No contact', recovery_steps: 'Law firm', case_reference: '386938',
    assigned_to_id: 'BRANCH_REP_PCB', reviewer1_id: 'DY_HEAD_PCB', reviewer2_id: 'HEAD_PCB',
    required_paid_date: null, total_ar_amount: null, edit_proposal: null,
    ar_entry: { id: 'debtor-gen-PCB-4-entry-0', amount: 15000, required_paid_date: '2026-05-15' },
  },
];

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function rest(path, headers, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, ...options });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`);
  // PostgREST returns an empty body for DELETE/PATCH/POST under
  // Prefer: return=minimal — status code alone (204 vs 201) isn't a
  // reliable signal of that, so just check whether there's anything to parse.
  return text ? JSON.parse(text) : [];
}

/**
 * Restores every debtor in SEED_DEBTORS to its original row (and single AR
 * entry / seed audit log line), discarding any write-offs/payments against
 * it. Signs in fresh each call — cheap, and avoids reasoning about token
 * expiry across a long-running caller.
 */
export async function resetSeedDebtors({ email, password }) {
  const token = await signIn(email, password);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const ids = SEED_DEBTORS.map((d) => `"${d.id}"`).join(',');

  await rest(`debtor_write_offs?debtor_id=in.(${ids})`, headers, { method: 'DELETE' });
  await rest(`debtor_payments?debtor_id=in.(${ids})`, headers, { method: 'DELETE' });
  await rest(`debtor_ar_entries?debtor_id=in.(${ids})`, headers, { method: 'DELETE' });
  await rest(`audit_log?entity_type=eq.debtor&entity_id=in.(${ids})`, headers, { method: 'DELETE' });

  for (const d of SEED_DEBTORS) {
    const { ar_entry, ...debtorFields } = d;
    await rest(`debtors?id=eq.${d.id}`, headers, { method: 'PATCH', body: JSON.stringify(debtorFields) });
    await rest('debtor_ar_entries', headers, {
      method: 'POST',
      body: JSON.stringify({ ...ar_entry, debtor_id: d.id }),
    });
    await rest('audit_log', headers, {
      method: 'POST',
      body: JSON.stringify({
        id: `log-${d.id}-seed`,
        entity_type: 'debtor',
        entity_id: d.id,
        date: '2026-01-01',
        actor: 'Finance',
        action: 'Sample data loaded',
      }),
    });
  }

  return SEED_DEBTORS.map((d) => d.name);
}
