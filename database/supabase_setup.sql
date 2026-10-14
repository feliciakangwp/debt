-- Debt Management Module — Supabase setup
--
-- Mirrors the data model the app currently keeps in localStorage
-- (src/context/AppContext.tsx's PersistedState, built from src/types.ts
-- and seeded in src/data/seed.ts). Paste this whole file into the
-- Supabase SQL Editor and run it once on a fresh project.
--
-- What it does, in order:
--   1. Creates the tables, with sensible column types and FKs/checks
--      matching the app's TypeScript types.
--   2. Enables Row Level Security on every table.
--   3. Lets any logged-in (authenticated) user read every table.
--   4. Creates an `editors` table, adds one editor, and restricts
--      insert/update/delete on every table to editors only.
--   5. Adds the data tables to the supabase_realtime publication.
--   6. Inserts the app's existing sample/seed data.
--
-- Note: `personaId`, `simulatedToday` and `dataVersion` are local UI/test
-- controls in the app (which mock persona is selected, the "simulated
-- today" date picker, and the localStorage schema version) — they aren't
-- shared application data, so there's nothing to migrate for them here.

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists public.reference_items (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('nature', 'description')),
  active boolean not null default true,
  -- Only set (and only meaningful) on kind = 'description': the Nature
  -- item it's linked to. Self-referencing, so nature rows just leave it null.
  nature_id text references public.reference_items (id) on delete cascade
);

create table if not exists public.debtors (
  id text primary key,
  status text not null check (status in ('DRAFT', 'PENDING_REVIEW', 'SUPPORTED', 'EDIT_REQUESTED', 'PAID')),
  branch text not null check (branch in ('PSB', 'TIB', 'SIB', 'PCB', 'FIN')),
  name text not null,
  nature_id text references public.reference_items (id),
  description_id text references public.reference_items (id),
  not_in_arrears numeric not null default 0,
  arrears_6m numeric not null default 0,
  arrears_6to12m numeric not null default 0,
  arrears_1to2y numeric not null default 0,
  arrears_2to3y numeric not null default 0,
  arrears_3to4y numeric not null default 0,
  arrears_4to5y numeric not null default 0,
  arrears_5yplus numeric not null default 0,
  reason_non_recovery text not null default '',
  recovery_steps text not null default '',
  case_reference text not null default '',
  -- Persona ids of the Branch Rep / reviewers tagged on this record —
  -- persona ids are a fixed, hardcoded list in the app (src/types.ts),
  -- not a database table, so these are plain text, not foreign keys.
  assigned_to_id text not null,
  reviewer1_id text not null,
  reviewer2_id text,
  -- Legacy single-entry fields, kept for parity with older saved records
  -- that predate multiple AR entries; every seeded debtor uses ar_entries
  -- instead, so these are null for all sample data.
  required_paid_date date,
  total_ar_amount numeric,
  -- Snapshot of a pending "Request to Edit" (only set while status is
  -- EDIT_REQUESTED) — a single nested object, not a repeating list, so a
  -- JSON snapshot is simpler here than another child table.
  edit_proposal jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.debtor_ar_entries (
  id text primary key,
  debtor_id text not null references public.debtors (id) on delete cascade,
  amount numeric not null,
  required_paid_date date not null
);

create table if not exists public.debtor_write_offs (
  id text primary key,
  debtor_id text not null references public.debtors (id) on delete cascade,
  status text not null check (status in ('TO_BE_WRITTEN_OFF', 'PENDING', 'SUPPORTED')),
  date_of_write_off date not null,
  write_off_amount numeric not null,
  days_in_arrears integer not null,
  reason_for_write_off text not null default ''
);

create table if not exists public.debtor_payments (
  id text primary key,
  debtor_id text not null references public.debtors (id) on delete cascade,
  date date not null,
  amount numeric not null,
  voided boolean not null default false
);

-- Shared by debtors and CFR arrears submissions, which both keep an
-- auditLog[] in the app — one table with an entity_type/entity_id pair
-- instead of duplicating the same columns twice.
create table if not exists public.audit_log (
  id text primary key,
  entity_type text not null check (entity_type in ('debtor', 'cfr_submission')),
  entity_id text not null,
  date date not null,
  actor text not null,
  action text not null
);

create table if not exists public.call_for_return_periods (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date not null
);

create table if not exists public.cfr_arrears_submissions (
  id text primary key,
  period_id text not null references public.call_for_return_periods (id) on delete cascade,
  branch text not null check (branch in ('PSB', 'TIB', 'SIB', 'PCB', 'FIN')),
  status text not null check (status in ('DRAFT', 'PENDING_REVIEW', 'SUPPORTED', 'APPROVED'))
);

create table if not exists public.editors (
  email text primary key
);

-- ============================================================
-- 2 & 3 & 4. ROW LEVEL SECURITY + POLICIES
-- ============================================================

-- Helper used by every insert/update/delete policy below: is the
-- logged-in user's email in the editors table? Relies on the "any
-- authenticated user can read" policy on editors (below) rather than
-- SECURITY DEFINER, so it's just a plain, auditable SQL function.
create or replace function public.is_editor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.editors where email = auth.jwt() ->> 'email'
  );
$$;

do $$
declare
  t text;
  all_tables text[] := array[
    'reference_items', 'debtors', 'debtor_ar_entries', 'debtor_write_offs',
    'debtor_payments', 'audit_log', 'call_for_return_periods',
    'cfr_arrears_submissions', 'editors'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "Authenticated can read" on public.%I for select to authenticated using (true)', t
    );
    execute format(
      'create policy "Editors can insert" on public.%I for insert to authenticated with check (public.is_editor())', t
    );
    execute format(
      'create policy "Editors can update" on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())', t
    );
    execute format(
      'create policy "Editors can delete" on public.%I for delete to authenticated using (public.is_editor())', t
    );
  end loop;
end $$;

-- ============================================================
-- 5. REALTIME
-- ============================================================
-- The editors table is access control, not app data the UI displays, so
-- it's deliberately left off the realtime publication.

do $$
declare
  t text;
  data_tables text[] := array[
    'reference_items', 'debtors', 'debtor_ar_entries', 'debtor_write_offs',
    'debtor_payments', 'audit_log', 'call_for_return_periods',
    'cfr_arrears_submissions'
  ];
begin
  foreach t in array data_tables loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- ============================================================
-- 4 (cont'd). EDITOR
-- ============================================================

insert into public.editors (email) values ('wanping0627@gmail.com');

-- ============================================================
-- 6. SAMPLE DATA
-- ============================================================
-- Same sample dataset the app seeds into a fresh browser (NATURE_SEED /
-- DESCRIPTION_SEED / DEBTORS_SEED in src/data/seed.ts): 5 Nature items,
-- 11 Description items, and 20 sample debtors per branch (100 total),
-- three of which carry a seeded write-off. Call For Return periods and
-- submissions start empty in the app too (created on demand), so there's
-- nothing to seed for those two tables.

insert into public.reference_items (id, name, kind, active, nature_id) values
  ('nat-fees', 'Fees', 'nature', true, null),
  ('nat-financial-penalty', 'Financial Penalty', 'nature', true, null),
  ('nat-others', 'Others', 'nature', true, null),
  ('nat-staff-related', 'Staff-Related', 'nature', true, null),
  ('nat-tax', 'Tax', 'nature', true, null),
  ('desc-cert-doc-fee', 'Cert & Doc Fee', 'description', true, 'nat-fees'),
  ('desc-warehouse-fee', 'Warehouse Fee', 'description', true, 'nat-fees'),
  ('desc-other-fees', 'Other Fees', 'description', true, 'nat-fees'),
  ('desc-p-offence-instalment', 'P Offence – Instalment', 'description', true, 'nat-financial-penalty'),
  ('desc-other-non-p-offence-instalment', 'Other non P Offence – Instalment', 'description', true, 'nat-financial-penalty'),
  ('desc-motor-offence-late-instalment', 'Motor Offence – Late instalment', 'description', true, 'nat-financial-penalty'),
  ('desc-miscellaneous-sales', 'Miscellaneous Sales', 'description', true, 'nat-others'),
  ('desc-staff-related-salary-medical', 'Staff Related (Salary/ Medical)', 'description', true, 'nat-staff-related'),
  ('desc-p-offence-liquor-duty', 'P Offence – Liquor Duty', 'description', true, 'nat-tax'),
  ('desc-p-offence-motor-vehicle', 'P Offence – Motor Vehicle', 'description', true, 'nat-tax'),
  ('desc-tobacco-cigarette-recovery', 'Tobacco/ Cigarette – Recovery', 'description', true, 'nat-tax');

insert into public.debtors (id, status, branch, name, nature_id, description_id, not_in_arrears, arrears_6m, arrears_6to12m, arrears_1to2y, arrears_2to3y, arrears_3to4y, arrears_4to5y, arrears_5yplus, reason_non_recovery, recovery_steps, case_reference, assigned_to_id, reviewer1_id, reviewer2_id, required_paid_date, total_ar_amount) values
  ('debtor-gen-PSB-1', 'SUPPORTED', 'PSB', 'Lim Wee Keng', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '147704', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-2', 'SUPPORTED', 'PSB', 'Chong Siew Fong', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '199643', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-3', 'SUPPORTED', 'PSB', 'PQR Engineering Pte Ltd', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '498828', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-4', 'SUPPORTED', 'PSB', 'Rajoo s/o Muniandy', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '655689', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-5', 'PENDING_REVIEW', 'PSB', 'Ng Bee Choo', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '343122', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-6', 'SUPPORTED', 'PSB', 'Faridah binte Rahman', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '219000', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-7', 'DRAFT', 'PSB', 'Koh Teck Whye', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Reminder letter sent', '378231', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-8', 'SUPPORTED', 'PSB', 'Siti Aminah', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '137430', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-9', 'SUPPORTED', 'PSB', 'Global Trading Co', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '466461', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-10', 'PENDING_REVIEW', 'PSB', 'Ravi Chandran', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '128461', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-11', 'DRAFT', 'PSB', 'Ong Bee Hoon', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '222635', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-12', 'SUPPORTED', 'PSB', 'Tay Boon Huat', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Follow-up letter sent', '305729', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-13', 'SUPPORTED', 'PSB', 'Michelle Wong', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '715913', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-14', 'SUPPORTED', 'PSB', 'Silverline Traders', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '243815', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-15', 'SUPPORTED', 'PSB', 'Anand s/o Kumar', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '560187', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-16', 'SUPPORTED', 'PSB', 'Wendy Ho', 'nat-financial-penalty', 'desc-motor-offence-late-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '708431', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-17', 'PENDING_REVIEW', 'PSB', 'Abdul Rahman bin Yusof', 'nat-financial-penalty', 'desc-other-non-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '786918', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-18', 'SUPPORTED', 'PSB', 'Sunrise Enterprises', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '534801', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-PSB-19', 'SUPPORTED', 'PSB', 'Cheng Li Fen', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '664274', 'BRANCH_REP_PSB', 'HEAD_PSB', null, null, null),
  ('debtor-gen-PSB-20', 'DRAFT', 'PSB', 'Kamalesh Naidu', 'nat-others', 'desc-miscellaneous-sales', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '593610', 'BRANCH_REP_PSB', 'DY_HEAD_PSB', 'HEAD_PSB', null, null),
  ('debtor-gen-TIB-1', 'SUPPORTED', 'TIB', 'Yeo Kim Huat', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '957091', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-2', 'SUPPORTED', 'TIB', 'Chandra Sekaran', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '446809', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-3', 'SUPPORTED', 'TIB', 'Delta Logistics Pte Ltd', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '894138', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-4', 'SUPPORTED', 'TIB', 'Nur Aisyah', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '362731', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-5', 'PENDING_REVIEW', 'TIB', 'Teo Ah Kow', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '192686', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-6', 'SUPPORTED', 'TIB', 'Mohamed Yusof', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '324036', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-7', 'DRAFT', 'TIB', 'Lee Poh Choo', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Reminder letter sent', '517289', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-8', 'SUPPORTED', 'TIB', 'Summit Traders', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '342553', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-9', 'SUPPORTED', 'TIB', 'Balasubramaniam s/o Krishnan', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '621855', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-10', 'PENDING_REVIEW', 'TIB', 'Grace Tan', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '952744', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-11', 'DRAFT', 'TIB', 'Swee Keat Trading', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '258363', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-12', 'SUPPORTED', 'TIB', 'Farah binte Ismail', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Follow-up letter sent', '586141', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-13', 'SUPPORTED', 'TIB', 'Jaya Kumar', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '982257', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-14', 'SUPPORTED', 'TIB', 'Redwood Suppliers', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '267773', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-15', 'SUPPORTED', 'TIB', 'Cheryl Ng', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '180290', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-16', 'SUPPORTED', 'TIB', 'Hafiz bin Rosli', 'nat-financial-penalty', 'desc-motor-offence-late-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '558079', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-17', 'PENDING_REVIEW', 'TIB', 'Tan Chin Guan', 'nat-financial-penalty', 'desc-other-non-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '272280', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-18', 'SUPPORTED', 'TIB', 'Northgate Holdings', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '262648', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-TIB-19', 'SUPPORTED', 'TIB', 'Meera d/o Suresh', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '331602', 'BRANCH_REP_TIB', 'HEAD_TIB', null, null, null),
  ('debtor-gen-TIB-20', 'DRAFT', 'TIB', 'Bernard Koh', 'nat-others', 'desc-miscellaneous-sales', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '502542', 'BRANCH_REP_TIB', 'DY_HEAD_TIB', 'HEAD_TIB', null, null),
  ('debtor-gen-SIB-1', 'SUPPORTED', 'SIB', 'Chua Beng Huat', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '288740', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-2', 'SUPPORTED', 'SIB', 'Nurul Huda', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '631489', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-3', 'SUPPORTED', 'SIB', 'Everbright Holdings', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '450142', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-4', 'SUPPORTED', 'SIB', 'Krishnan Pillai', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '288637', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-5', 'PENDING_REVIEW', 'SIB', 'Tay Ah Moi', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '511762', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-6', 'SUPPORTED', 'SIB', 'Zainal Abidin', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '786503', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-7', 'DRAFT', 'SIB', 'Foo Mei Yee', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Reminder letter sent', '928613', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-8', 'SUPPORTED', 'SIB', 'Pacific Rim Traders', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '384541', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-9', 'SUPPORTED', 'SIB', 'Selvam s/o Muthu', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '443868', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-10', 'PENDING_REVIEW', 'SIB', 'Amy Lim', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '114705', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-11', 'DRAFT', 'SIB', 'Oceanview Enterprises', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '404374', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-12', 'SUPPORTED', 'SIB', 'Hamidah binte Yusof', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Follow-up letter sent', '977709', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-13', 'SUPPORTED', 'SIB', 'Vincent Goh', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '995198', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-14', 'SUPPORTED', 'SIB', 'Silver Crest Trading', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '678418', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-15', 'SUPPORTED', 'SIB', 'Aravind Rao', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '357758', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-16', 'SUPPORTED', 'SIB', 'Josephine Tan', 'nat-financial-penalty', 'desc-motor-offence-late-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '595283', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-17', 'PENDING_REVIEW', 'SIB', 'Rosnah binte Ismail', 'nat-financial-penalty', 'desc-other-non-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '123941', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-18', 'SUPPORTED', 'SIB', 'Lakeview Holdings', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '642668', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-SIB-19', 'SUPPORTED', 'SIB', 'Suresh Pillai', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '728636', 'BRANCH_REP_SIB', 'HEAD_SIB', null, null, null),
  ('debtor-gen-SIB-20', 'DRAFT', 'SIB', 'Angela Chua', 'nat-others', 'desc-miscellaneous-sales', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '714100', 'BRANCH_REP_SIB', 'DY_HEAD_SIB', 'HEAD_SIB', null, null),
  ('debtor-gen-PCB-1', 'SUPPORTED', 'PCB', 'Choo Wei Ling', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '480496', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-2', 'SUPPORTED', 'PCB', 'Ibrahim bin Osman', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '814986', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-3', 'SUPPORTED', 'PCB', 'Meridian Supplies', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '845694', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-4', 'SUPPORTED', 'PCB', 'Devi Krishnan', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '386938', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-5', 'PENDING_REVIEW', 'PCB', 'Ong Kim Swee', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '877353', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-6', 'SUPPORTED', 'PCB', 'Aishah binte Karim', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '496809', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-7', 'DRAFT', 'PCB', 'Chan Yew Meng', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Reminder letter sent', '735137', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-8', 'SUPPORTED', 'PCB', 'Highland Trading', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '687092', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-9', 'SUPPORTED', 'PCB', 'Muthu Kumar', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '407651', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-10', 'PENDING_REVIEW', 'PCB', 'Serene Goh', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '215282', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-11', 'DRAFT', 'PCB', 'Vanguard Industries', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '900303', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-12', 'SUPPORTED', 'PCB', 'Rosidah binte Salim', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Follow-up letter sent', '232214', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-13', 'SUPPORTED', 'PCB', 'Timothy Lee', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '444493', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-14', 'SUPPORTED', 'PCB', 'Brightpath Traders', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '164346', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-15', 'SUPPORTED', 'PCB', 'Kavitha d/o Raman', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '204580', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-16', 'SUPPORTED', 'PCB', 'Wilson Ang', 'nat-financial-penalty', 'desc-motor-offence-late-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '770383', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-17', 'PENDING_REVIEW', 'PCB', 'Sazali bin Hamid', 'nat-financial-penalty', 'desc-other-non-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '618429', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-18', 'SUPPORTED', 'PCB', 'Eastwood Enterprises', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '214267', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-PCB-19', 'SUPPORTED', 'PCB', 'Priyanka Nair', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '812641', 'BRANCH_REP_PCB', 'HEAD_PCB', null, null, null),
  ('debtor-gen-PCB-20', 'DRAFT', 'PCB', 'Fabian Teo', 'nat-others', 'desc-miscellaneous-sales', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '775304', 'BRANCH_REP_PCB', 'DY_HEAD_PCB', 'HEAD_PCB', null, null),
  ('debtor-gen-FIN-1', 'SUPPORTED', 'FIN', 'Loh Ah Huat', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '493457', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-2', 'SUPPORTED', 'FIN', 'Zulkifli bin Hassan', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'Unable to contact', 'Engagement', '754577', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-3', 'SUPPORTED', 'FIN', 'Crestwood Ltd', 'nat-tax', 'desc-p-offence-motor-vehicle', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '197770', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-4', 'SUPPORTED', 'FIN', 'Priya Sharma', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '539594', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-5', 'PENDING_REVIEW', 'FIN', 'Tan Beng Watt', 'nat-tax', 'desc-p-offence-liquor-duty', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '960270', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-6', 'SUPPORTED', 'FIN', 'Nadia binte Salim', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '402103', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-7', 'DRAFT', 'FIN', 'Koh Ah Seng', 'nat-tax', 'desc-tobacco-cigarette-recovery', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Reminder letter sent', '215518', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-8', 'SUPPORTED', 'FIN', 'Sterling Traders', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '815940', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-9', 'SUPPORTED', 'FIN', 'Ramesh Pillai', 'nat-fees', 'desc-other-fees', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '707836', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-10', 'PENDING_REVIEW', 'FIN', 'Betty Chua', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '802337', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-11', 'DRAFT', 'FIN', 'Horizon Enterprises', 'nat-fees', 'desc-cert-doc-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '370727', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-12', 'SUPPORTED', 'FIN', 'Suhaila binte Ahmad', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'Awaiting response', 'Follow-up letter sent', '474556', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-13', 'SUPPORTED', 'FIN', 'Gerald Lim', 'nat-fees', 'desc-warehouse-fee', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '145720', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-14', 'SUPPORTED', 'FIN', 'Northpoint Trading', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Disputed amount', 'Under review', '540378', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-15', 'SUPPORTED', 'FIN', 'Kalaivani d/o Muthu', 'nat-financial-penalty', 'desc-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '508634', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-16', 'SUPPORTED', 'FIN', 'Desmond Wong', 'nat-financial-penalty', 'desc-motor-offence-late-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'No contact', 'Law firm', '980823', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-17', 'PENDING_REVIEW', 'FIN', 'Rashid bin Ali', 'nat-financial-penalty', 'desc-other-non-p-offence-instalment', 0, 0, 0, 0, 0, 0, 0, 0, 'Payment plan ongoing', 'Monitoring', '282904', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-18', 'SUPPORTED', 'FIN', 'Meadowbrook Holdings', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '394101', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null),
  ('debtor-gen-FIN-19', 'SUPPORTED', 'FIN', 'Anitha Raj', 'nat-staff-related', 'desc-staff-related-salary-medical', 0, 0, 0, 0, 0, 0, 0, 0, 'Staff resigned', 'HR follow-up', '608504', 'BRANCH_REP_FIN', 'HEAD_FIN', null, null, null),
  ('debtor-gen-FIN-20', 'DRAFT', 'FIN', 'Calvin Ng', 'nat-others', 'desc-miscellaneous-sales', 0, 0, 0, 0, 0, 0, 0, 0, '', '', '720785', 'BRANCH_REP_FIN', 'DY_HEAD_FIN', 'HEAD_FIN', null, null);

insert into public.debtor_ar_entries (id, debtor_id, amount, required_paid_date) values
  ('debtor-gen-PSB-1-entry-0', 'debtor-gen-PSB-1', 4000, '2026-10-15'),
  ('debtor-gen-PSB-2-entry-0', 'debtor-gen-PSB-2', 45000, '2024-02-15'),
  ('debtor-gen-PSB-3-entry-0', 'debtor-gen-PSB-3', 22000, '2019-08-15'),
  ('debtor-gen-PSB-4-entry-0', 'debtor-gen-PSB-4', 15000, '2026-05-15'),
  ('debtor-gen-PSB-5-entry-0', 'debtor-gen-PSB-5', 7000, '2025-11-15'),
  ('debtor-gen-PSB-6-entry-0', 'debtor-gen-PSB-6', 9000, '2025-11-15'),
  ('debtor-gen-PSB-7-entry-0', 'debtor-gen-PSB-7', 6000, '2025-02-15'),
  ('debtor-gen-PSB-8-entry-0', 'debtor-gen-PSB-8', 2500, '2026-05-15'),
  ('debtor-gen-PSB-9-entry-0', 'debtor-gen-PSB-9', 1500, '2026-10-15'),
  ('debtor-gen-PSB-10-entry-0', 'debtor-gen-PSB-10', 5500, '2025-11-15'),
  ('debtor-gen-PSB-11-entry-0', 'debtor-gen-PSB-11', 6200, '2022-02-15'),
  ('debtor-gen-PSB-12-entry-0', 'debtor-gen-PSB-12', 11000, '2025-02-15'),
  ('debtor-gen-PSB-13-entry-0', 'debtor-gen-PSB-13', 9000, '2019-08-15'),
  ('debtor-gen-PSB-14-entry-0', 'debtor-gen-PSB-14', 6500, '2024-02-15'),
  ('debtor-gen-PSB-15-entry-0', 'debtor-gen-PSB-15', 3200, '2026-05-15'),
  ('debtor-gen-PSB-16-entry-0', 'debtor-gen-PSB-16', 18000, '2026-05-15'),
  ('debtor-gen-PSB-17-entry-0', 'debtor-gen-PSB-17', 5000, '2023-02-15'),
  ('debtor-gen-PSB-18-entry-0', 'debtor-gen-PSB-18', 9500, '2022-02-15'),
  ('debtor-gen-PSB-19-entry-0', 'debtor-gen-PSB-19', 4100, '2025-11-15'),
  ('debtor-gen-PSB-20-entry-0', 'debtor-gen-PSB-20', 4000, '2022-02-15'),
  ('debtor-gen-TIB-1-entry-0', 'debtor-gen-TIB-1', 4000, '2026-10-15'),
  ('debtor-gen-TIB-2-entry-0', 'debtor-gen-TIB-2', 45000, '2024-02-15'),
  ('debtor-gen-TIB-3-entry-0', 'debtor-gen-TIB-3', 22000, '2019-08-15'),
  ('debtor-gen-TIB-4-entry-0', 'debtor-gen-TIB-4', 15000, '2026-05-15'),
  ('debtor-gen-TIB-5-entry-0', 'debtor-gen-TIB-5', 7000, '2025-11-15'),
  ('debtor-gen-TIB-6-entry-0', 'debtor-gen-TIB-6', 9000, '2025-11-15'),
  ('debtor-gen-TIB-7-entry-0', 'debtor-gen-TIB-7', 6000, '2025-02-15'),
  ('debtor-gen-TIB-8-entry-0', 'debtor-gen-TIB-8', 2500, '2026-05-15'),
  ('debtor-gen-TIB-9-entry-0', 'debtor-gen-TIB-9', 1500, '2026-10-15'),
  ('debtor-gen-TIB-10-entry-0', 'debtor-gen-TIB-10', 5500, '2025-11-15'),
  ('debtor-gen-TIB-11-entry-0', 'debtor-gen-TIB-11', 6200, '2022-02-15'),
  ('debtor-gen-TIB-12-entry-0', 'debtor-gen-TIB-12', 11000, '2025-02-15'),
  ('debtor-gen-TIB-13-entry-0', 'debtor-gen-TIB-13', 9000, '2019-08-15'),
  ('debtor-gen-TIB-14-entry-0', 'debtor-gen-TIB-14', 6500, '2024-02-15'),
  ('debtor-gen-TIB-15-entry-0', 'debtor-gen-TIB-15', 3200, '2026-05-15'),
  ('debtor-gen-TIB-16-entry-0', 'debtor-gen-TIB-16', 18000, '2026-05-15'),
  ('debtor-gen-TIB-17-entry-0', 'debtor-gen-TIB-17', 5000, '2023-02-15'),
  ('debtor-gen-TIB-18-entry-0', 'debtor-gen-TIB-18', 9500, '2022-02-15'),
  ('debtor-gen-TIB-19-entry-0', 'debtor-gen-TIB-19', 4100, '2025-11-15'),
  ('debtor-gen-TIB-20-entry-0', 'debtor-gen-TIB-20', 4000, '2022-02-15'),
  ('debtor-gen-SIB-1-entry-0', 'debtor-gen-SIB-1', 4000, '2026-10-15'),
  ('debtor-gen-SIB-2-entry-0', 'debtor-gen-SIB-2', 45000, '2024-02-15'),
  ('debtor-gen-SIB-3-entry-0', 'debtor-gen-SIB-3', 22000, '2019-08-15'),
  ('debtor-gen-SIB-4-entry-0', 'debtor-gen-SIB-4', 15000, '2026-05-15'),
  ('debtor-gen-SIB-5-entry-0', 'debtor-gen-SIB-5', 7000, '2025-11-15'),
  ('debtor-gen-SIB-6-entry-0', 'debtor-gen-SIB-6', 9000, '2025-11-15'),
  ('debtor-gen-SIB-7-entry-0', 'debtor-gen-SIB-7', 6000, '2025-02-15'),
  ('debtor-gen-SIB-8-entry-0', 'debtor-gen-SIB-8', 2500, '2026-05-15'),
  ('debtor-gen-SIB-9-entry-0', 'debtor-gen-SIB-9', 1500, '2026-10-15'),
  ('debtor-gen-SIB-10-entry-0', 'debtor-gen-SIB-10', 5500, '2025-11-15'),
  ('debtor-gen-SIB-11-entry-0', 'debtor-gen-SIB-11', 6200, '2022-02-15'),
  ('debtor-gen-SIB-12-entry-0', 'debtor-gen-SIB-12', 11000, '2025-02-15'),
  ('debtor-gen-SIB-13-entry-0', 'debtor-gen-SIB-13', 9000, '2019-08-15'),
  ('debtor-gen-SIB-14-entry-0', 'debtor-gen-SIB-14', 6500, '2024-02-15'),
  ('debtor-gen-SIB-15-entry-0', 'debtor-gen-SIB-15', 3200, '2026-05-15'),
  ('debtor-gen-SIB-16-entry-0', 'debtor-gen-SIB-16', 18000, '2026-05-15'),
  ('debtor-gen-SIB-17-entry-0', 'debtor-gen-SIB-17', 5000, '2023-02-15'),
  ('debtor-gen-SIB-18-entry-0', 'debtor-gen-SIB-18', 9500, '2022-02-15'),
  ('debtor-gen-SIB-19-entry-0', 'debtor-gen-SIB-19', 4100, '2025-11-15'),
  ('debtor-gen-SIB-20-entry-0', 'debtor-gen-SIB-20', 4000, '2022-02-15'),
  ('debtor-gen-PCB-1-entry-0', 'debtor-gen-PCB-1', 4000, '2026-10-15'),
  ('debtor-gen-PCB-2-entry-0', 'debtor-gen-PCB-2', 45000, '2024-02-15'),
  ('debtor-gen-PCB-3-entry-0', 'debtor-gen-PCB-3', 22000, '2019-08-15'),
  ('debtor-gen-PCB-4-entry-0', 'debtor-gen-PCB-4', 15000, '2026-05-15'),
  ('debtor-gen-PCB-5-entry-0', 'debtor-gen-PCB-5', 7000, '2025-11-15'),
  ('debtor-gen-PCB-6-entry-0', 'debtor-gen-PCB-6', 9000, '2025-11-15'),
  ('debtor-gen-PCB-7-entry-0', 'debtor-gen-PCB-7', 6000, '2025-02-15'),
  ('debtor-gen-PCB-8-entry-0', 'debtor-gen-PCB-8', 2500, '2026-05-15'),
  ('debtor-gen-PCB-9-entry-0', 'debtor-gen-PCB-9', 1500, '2026-10-15'),
  ('debtor-gen-PCB-10-entry-0', 'debtor-gen-PCB-10', 5500, '2025-11-15'),
  ('debtor-gen-PCB-11-entry-0', 'debtor-gen-PCB-11', 6200, '2022-02-15'),
  ('debtor-gen-PCB-12-entry-0', 'debtor-gen-PCB-12', 11000, '2025-02-15'),
  ('debtor-gen-PCB-13-entry-0', 'debtor-gen-PCB-13', 9000, '2019-08-15'),
  ('debtor-gen-PCB-14-entry-0', 'debtor-gen-PCB-14', 6500, '2024-02-15'),
  ('debtor-gen-PCB-15-entry-0', 'debtor-gen-PCB-15', 3200, '2026-05-15'),
  ('debtor-gen-PCB-16-entry-0', 'debtor-gen-PCB-16', 18000, '2026-05-15'),
  ('debtor-gen-PCB-17-entry-0', 'debtor-gen-PCB-17', 5000, '2023-02-15'),
  ('debtor-gen-PCB-18-entry-0', 'debtor-gen-PCB-18', 9500, '2022-02-15'),
  ('debtor-gen-PCB-19-entry-0', 'debtor-gen-PCB-19', 4100, '2025-11-15'),
  ('debtor-gen-PCB-20-entry-0', 'debtor-gen-PCB-20', 4000, '2022-02-15'),
  ('debtor-gen-FIN-1-entry-0', 'debtor-gen-FIN-1', 4000, '2026-10-15'),
  ('debtor-gen-FIN-2-entry-0', 'debtor-gen-FIN-2', 45000, '2024-02-15'),
  ('debtor-gen-FIN-3-entry-0', 'debtor-gen-FIN-3', 22000, '2019-08-15'),
  ('debtor-gen-FIN-4-entry-0', 'debtor-gen-FIN-4', 15000, '2026-05-15'),
  ('debtor-gen-FIN-5-entry-0', 'debtor-gen-FIN-5', 7000, '2025-11-15'),
  ('debtor-gen-FIN-6-entry-0', 'debtor-gen-FIN-6', 9000, '2025-11-15'),
  ('debtor-gen-FIN-7-entry-0', 'debtor-gen-FIN-7', 6000, '2025-02-15'),
  ('debtor-gen-FIN-8-entry-0', 'debtor-gen-FIN-8', 2500, '2026-05-15'),
  ('debtor-gen-FIN-9-entry-0', 'debtor-gen-FIN-9', 1500, '2026-10-15'),
  ('debtor-gen-FIN-10-entry-0', 'debtor-gen-FIN-10', 5500, '2025-11-15'),
  ('debtor-gen-FIN-11-entry-0', 'debtor-gen-FIN-11', 6200, '2022-02-15'),
  ('debtor-gen-FIN-12-entry-0', 'debtor-gen-FIN-12', 11000, '2025-02-15'),
  ('debtor-gen-FIN-13-entry-0', 'debtor-gen-FIN-13', 9000, '2019-08-15'),
  ('debtor-gen-FIN-14-entry-0', 'debtor-gen-FIN-14', 6500, '2024-02-15'),
  ('debtor-gen-FIN-15-entry-0', 'debtor-gen-FIN-15', 3200, '2026-05-15'),
  ('debtor-gen-FIN-16-entry-0', 'debtor-gen-FIN-16', 18000, '2026-05-15'),
  ('debtor-gen-FIN-17-entry-0', 'debtor-gen-FIN-17', 5000, '2023-02-15'),
  ('debtor-gen-FIN-18-entry-0', 'debtor-gen-FIN-18', 9500, '2022-02-15'),
  ('debtor-gen-FIN-19-entry-0', 'debtor-gen-FIN-19', 4100, '2025-11-15'),
  ('debtor-gen-FIN-20-entry-0', 'debtor-gen-FIN-20', 4000, '2022-02-15');

insert into public.debtor_write_offs (id, debtor_id, status, date_of_write_off, write_off_amount, days_in_arrears, reason_for_write_off) values
  ('debtor-gen-PSB-3-writeoff-0', 'debtor-gen-PSB-3', 'TO_BE_WRITTEN_OFF', '2026-09-10', 8000, 320, 'Partial recovery unlikely, pending write-off approval'),
  ('debtor-gen-PSB-6-writeoff-0', 'debtor-gen-PSB-6', 'PENDING', '2026-09-20', 3000, 280, 'Submitted for write-off, awaiting Reviewer 1'),
  ('debtor-gen-PSB-9-writeoff-0', 'debtor-gen-PSB-9', 'SUPPORTED', '2026-09-01', 500, 90, 'Approved write-off, balance knocked off'),
  ('debtor-gen-TIB-3-writeoff-0', 'debtor-gen-TIB-3', 'TO_BE_WRITTEN_OFF', '2026-09-10', 8000, 320, 'Partial recovery unlikely, pending write-off approval'),
  ('debtor-gen-TIB-6-writeoff-0', 'debtor-gen-TIB-6', 'PENDING', '2026-09-20', 3000, 280, 'Submitted for write-off, awaiting Reviewer 1'),
  ('debtor-gen-TIB-9-writeoff-0', 'debtor-gen-TIB-9', 'SUPPORTED', '2026-09-01', 500, 90, 'Approved write-off, balance knocked off'),
  ('debtor-gen-SIB-3-writeoff-0', 'debtor-gen-SIB-3', 'TO_BE_WRITTEN_OFF', '2026-09-10', 8000, 320, 'Partial recovery unlikely, pending write-off approval'),
  ('debtor-gen-SIB-6-writeoff-0', 'debtor-gen-SIB-6', 'PENDING', '2026-09-20', 3000, 280, 'Submitted for write-off, awaiting Reviewer 1'),
  ('debtor-gen-SIB-9-writeoff-0', 'debtor-gen-SIB-9', 'SUPPORTED', '2026-09-01', 500, 90, 'Approved write-off, balance knocked off'),
  ('debtor-gen-PCB-3-writeoff-0', 'debtor-gen-PCB-3', 'TO_BE_WRITTEN_OFF', '2026-09-10', 8000, 320, 'Partial recovery unlikely, pending write-off approval'),
  ('debtor-gen-PCB-6-writeoff-0', 'debtor-gen-PCB-6', 'PENDING', '2026-09-20', 3000, 280, 'Submitted for write-off, awaiting Reviewer 1'),
  ('debtor-gen-PCB-9-writeoff-0', 'debtor-gen-PCB-9', 'SUPPORTED', '2026-09-01', 500, 90, 'Approved write-off, balance knocked off'),
  ('debtor-gen-FIN-3-writeoff-0', 'debtor-gen-FIN-3', 'TO_BE_WRITTEN_OFF', '2026-09-10', 8000, 320, 'Partial recovery unlikely, pending write-off approval'),
  ('debtor-gen-FIN-6-writeoff-0', 'debtor-gen-FIN-6', 'PENDING', '2026-09-20', 3000, 280, 'Submitted for write-off, awaiting Reviewer 1'),
  ('debtor-gen-FIN-9-writeoff-0', 'debtor-gen-FIN-9', 'SUPPORTED', '2026-09-01', 500, 90, 'Approved write-off, balance knocked off');

insert into public.audit_log (id, entity_type, entity_id, date, actor, action) values
  ('log-debtor-gen-PSB-1-seed', 'debtor', 'debtor-gen-PSB-1', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-2-seed', 'debtor', 'debtor-gen-PSB-2', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-3-seed', 'debtor', 'debtor-gen-PSB-3', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-4-seed', 'debtor', 'debtor-gen-PSB-4', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-5-seed', 'debtor', 'debtor-gen-PSB-5', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-6-seed', 'debtor', 'debtor-gen-PSB-6', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-7-seed', 'debtor', 'debtor-gen-PSB-7', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-8-seed', 'debtor', 'debtor-gen-PSB-8', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-9-seed', 'debtor', 'debtor-gen-PSB-9', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-10-seed', 'debtor', 'debtor-gen-PSB-10', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-11-seed', 'debtor', 'debtor-gen-PSB-11', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-12-seed', 'debtor', 'debtor-gen-PSB-12', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-13-seed', 'debtor', 'debtor-gen-PSB-13', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-14-seed', 'debtor', 'debtor-gen-PSB-14', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-15-seed', 'debtor', 'debtor-gen-PSB-15', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-16-seed', 'debtor', 'debtor-gen-PSB-16', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-17-seed', 'debtor', 'debtor-gen-PSB-17', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-18-seed', 'debtor', 'debtor-gen-PSB-18', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-19-seed', 'debtor', 'debtor-gen-PSB-19', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PSB-20-seed', 'debtor', 'debtor-gen-PSB-20', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-1-seed', 'debtor', 'debtor-gen-TIB-1', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-2-seed', 'debtor', 'debtor-gen-TIB-2', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-3-seed', 'debtor', 'debtor-gen-TIB-3', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-4-seed', 'debtor', 'debtor-gen-TIB-4', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-5-seed', 'debtor', 'debtor-gen-TIB-5', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-6-seed', 'debtor', 'debtor-gen-TIB-6', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-7-seed', 'debtor', 'debtor-gen-TIB-7', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-8-seed', 'debtor', 'debtor-gen-TIB-8', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-9-seed', 'debtor', 'debtor-gen-TIB-9', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-10-seed', 'debtor', 'debtor-gen-TIB-10', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-11-seed', 'debtor', 'debtor-gen-TIB-11', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-12-seed', 'debtor', 'debtor-gen-TIB-12', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-13-seed', 'debtor', 'debtor-gen-TIB-13', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-14-seed', 'debtor', 'debtor-gen-TIB-14', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-15-seed', 'debtor', 'debtor-gen-TIB-15', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-16-seed', 'debtor', 'debtor-gen-TIB-16', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-17-seed', 'debtor', 'debtor-gen-TIB-17', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-18-seed', 'debtor', 'debtor-gen-TIB-18', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-19-seed', 'debtor', 'debtor-gen-TIB-19', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-TIB-20-seed', 'debtor', 'debtor-gen-TIB-20', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-1-seed', 'debtor', 'debtor-gen-SIB-1', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-2-seed', 'debtor', 'debtor-gen-SIB-2', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-3-seed', 'debtor', 'debtor-gen-SIB-3', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-4-seed', 'debtor', 'debtor-gen-SIB-4', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-5-seed', 'debtor', 'debtor-gen-SIB-5', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-6-seed', 'debtor', 'debtor-gen-SIB-6', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-7-seed', 'debtor', 'debtor-gen-SIB-7', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-8-seed', 'debtor', 'debtor-gen-SIB-8', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-9-seed', 'debtor', 'debtor-gen-SIB-9', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-10-seed', 'debtor', 'debtor-gen-SIB-10', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-11-seed', 'debtor', 'debtor-gen-SIB-11', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-12-seed', 'debtor', 'debtor-gen-SIB-12', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-13-seed', 'debtor', 'debtor-gen-SIB-13', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-14-seed', 'debtor', 'debtor-gen-SIB-14', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-15-seed', 'debtor', 'debtor-gen-SIB-15', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-16-seed', 'debtor', 'debtor-gen-SIB-16', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-17-seed', 'debtor', 'debtor-gen-SIB-17', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-18-seed', 'debtor', 'debtor-gen-SIB-18', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-19-seed', 'debtor', 'debtor-gen-SIB-19', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-SIB-20-seed', 'debtor', 'debtor-gen-SIB-20', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-1-seed', 'debtor', 'debtor-gen-PCB-1', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-2-seed', 'debtor', 'debtor-gen-PCB-2', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-3-seed', 'debtor', 'debtor-gen-PCB-3', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-4-seed', 'debtor', 'debtor-gen-PCB-4', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-5-seed', 'debtor', 'debtor-gen-PCB-5', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-6-seed', 'debtor', 'debtor-gen-PCB-6', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-7-seed', 'debtor', 'debtor-gen-PCB-7', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-8-seed', 'debtor', 'debtor-gen-PCB-8', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-9-seed', 'debtor', 'debtor-gen-PCB-9', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-10-seed', 'debtor', 'debtor-gen-PCB-10', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-11-seed', 'debtor', 'debtor-gen-PCB-11', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-12-seed', 'debtor', 'debtor-gen-PCB-12', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-13-seed', 'debtor', 'debtor-gen-PCB-13', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-14-seed', 'debtor', 'debtor-gen-PCB-14', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-15-seed', 'debtor', 'debtor-gen-PCB-15', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-16-seed', 'debtor', 'debtor-gen-PCB-16', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-17-seed', 'debtor', 'debtor-gen-PCB-17', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-18-seed', 'debtor', 'debtor-gen-PCB-18', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-19-seed', 'debtor', 'debtor-gen-PCB-19', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-PCB-20-seed', 'debtor', 'debtor-gen-PCB-20', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-1-seed', 'debtor', 'debtor-gen-FIN-1', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-2-seed', 'debtor', 'debtor-gen-FIN-2', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-3-seed', 'debtor', 'debtor-gen-FIN-3', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-4-seed', 'debtor', 'debtor-gen-FIN-4', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-5-seed', 'debtor', 'debtor-gen-FIN-5', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-6-seed', 'debtor', 'debtor-gen-FIN-6', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-7-seed', 'debtor', 'debtor-gen-FIN-7', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-8-seed', 'debtor', 'debtor-gen-FIN-8', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-9-seed', 'debtor', 'debtor-gen-FIN-9', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-10-seed', 'debtor', 'debtor-gen-FIN-10', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-11-seed', 'debtor', 'debtor-gen-FIN-11', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-12-seed', 'debtor', 'debtor-gen-FIN-12', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-13-seed', 'debtor', 'debtor-gen-FIN-13', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-14-seed', 'debtor', 'debtor-gen-FIN-14', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-15-seed', 'debtor', 'debtor-gen-FIN-15', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-16-seed', 'debtor', 'debtor-gen-FIN-16', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-17-seed', 'debtor', 'debtor-gen-FIN-17', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-18-seed', 'debtor', 'debtor-gen-FIN-18', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-19-seed', 'debtor', 'debtor-gen-FIN-19', '2026-01-01', 'Finance', 'Sample data loaded'),
  ('log-debtor-gen-FIN-20-seed', 'debtor', 'debtor-gen-FIN-20', '2026-01-01', 'Finance', 'Sample data loaded');


-- ============================================================
-- Done. Point the app's Supabase client at this project and these table
-- names match src/context/AppContext.tsx's PersistedState shape 1:1
-- (minus personaId/simulatedToday/dataVersion, which stay client-side).
-- ============================================================
