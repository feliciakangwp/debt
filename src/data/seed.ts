import type { AREntry, Branch, Debtor, DebtorStatus, ReferenceItem } from '../types';
import { BRANCHES } from '../types';

// Alphabetically ordered
export const NATURE_SEED: ReferenceItem[] = [
  { id: 'nat-fees', name: 'Fees', active: true },
  { id: 'nat-financial-penalty', name: 'Financial Penalty', active: true },
  { id: 'nat-others', name: 'Others', active: true },
  { id: 'nat-staff-related', name: 'Staff-Related', active: true },
  { id: 'nat-tax', name: 'Tax', active: true },
];

// Each Description item is linked to a Nature of AR/Arrears item via natureId.
export const DESCRIPTION_SEED: ReferenceItem[] = [
  { id: 'desc-cert-doc-fee', name: 'Cert & Doc Fee', natureId: 'nat-fees', active: true },
  { id: 'desc-warehouse-fee', name: 'Warehouse Fee', natureId: 'nat-fees', active: true },
  { id: 'desc-other-fees', name: 'Other Fees', natureId: 'nat-fees', active: true },
  {
    id: 'desc-p-offence-instalment',
    name: 'P Offence – Instalment',
    natureId: 'nat-financial-penalty',
    active: true,
  },
  {
    id: 'desc-other-non-p-offence-instalment',
    name: 'Other non P Offence – Instalment',
    natureId: 'nat-financial-penalty',
    active: true,
  },
  {
    id: 'desc-motor-offence-late-instalment',
    name: 'Motor Offence – Late instalment',
    natureId: 'nat-financial-penalty',
    active: true,
  },
  { id: 'desc-miscellaneous-sales', name: 'Miscellaneous Sales', natureId: 'nat-others', active: true },
  {
    id: 'desc-staff-related-salary-medical',
    name: 'Staff Related (Salary/ Medical)',
    natureId: 'nat-staff-related',
    active: true,
  },
  {
    id: 'desc-p-offence-liquor-duty',
    name: 'P Offence – Liquor Duty',
    natureId: 'nat-tax',
    active: true,
  },
  {
    id: 'desc-p-offence-motor-vehicle',
    name: 'P Offence – Motor Vehicle',
    natureId: 'nat-tax',
    active: true,
  },
  {
    id: 'desc-tobacco-cigarette-recovery',
    name: 'Tobacco/ Cigarette – Recovery',
    natureId: 'nat-tax',
    active: true,
  },
];

/**
 * Maps description ids retired in the dataset refresh to their closest
 * equivalent in DESCRIPTION_SEED, so debtors saved under the old dataset
 * (in a browser's localStorage) keep pointing at a valid Description.
 */
export const DESCRIPTION_ID_MIGRATION: Record<string, string> = {
  'desc-cert-fee': 'desc-cert-doc-fee',
  'desc-cig-offence-duty': 'desc-tobacco-cigarette-recovery',
  'desc-p-offence-alcohol': 'desc-p-offence-liquor-duty',
  'desc-p-offence-motor': 'desc-p-offence-motor-vehicle',
  'desc-p-offence-vapt': 'desc-p-offence-motor-vehicle',
  'desc-salary': 'desc-staff-related-salary-medical',
  'desc-stat-fee': 'desc-other-fees',
};

// Fixed reference point for every seeded due date, so the seed's bucket
// placement (and its Days in Arrears / due-date-based ledger) is
// reproducible rather than drifting with whatever day the app happens to
// load on.
const TODAY_ANCHOR = '2026-08-29';

/**
 * A due date `monthsBack` months before TODAY_ANCHOR (or after, for a
 * negative value) — always day 15, so subtracting/adding whole months never
 * lands on an invalid day (e.g. Feb 30). Verified to land in the intended
 * aging bucket relative to TODAY_ANCHOR for every value used below.
 */
function dateForMonthsBack(monthsBack: number): string {
  const d = new Date(`${TODAY_ANCHOR}T00:00:00`);
  d.setDate(15);
  d.setMonth(d.getMonth() - monthsBack);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function randomCaseReference(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

interface SeedAmountEntry {
  /** Months before TODAY_ANCHOR this amount fell due; negative = due in the
   * future (not yet in arrears). Picked comfortably inside the intended
   * bucket's range, not on a boundary: -2 (not yet due), 3 (<=6 months), 9
   * (6-12 months), 18 (1-2yrs), 30 (2-3yrs), 42 (3-4yrs), 54 (4-5yrs), 84
   * (>=5 years). */
  monthsBack: number;
  amount: number;
}

const mkDebtor = (
  branch: Debtor['branch'],
  name: string,
  natureId: string,
  descriptionId: string,
  entries: SeedAmountEntry[],
  reasonNonRecovery: string,
  recoverySteps: string,
  id: string,
  status: DebtorStatus = 'SUPPORTED',
): Debtor => {
  const arEntries: AREntry[] = entries.map((e, idx) => ({
    id: `${id}-entry-${idx}`,
    amount: e.amount,
    requiredPaidDate: dateForMonthsBack(e.monthsBack),
  }));
  return {
    id,
    status,
    branch,
    name,
    natureId,
    descriptionId,
    notInArrears: 0,
    arrears6m: 0,
    arrears6to12m: 0,
    arrears1to2y: 0,
    arrears2to3y: 0,
    arrears3to4y: 0,
    arrears4to5y: 0,
    arrears5yPlus: 0,
    reasonNonRecovery,
    recoverySteps,
    caseReference: randomCaseReference(),
    arEntries,
    auditLog: [{ id: `log-${id}-seed`, date: '2026-01-01', actor: 'Finance', action: 'Sample data loaded' }],
  };
};

/**
 * One profile per row below is applied to every branch (with a
 * branch-specific name from BRANCH_NAME_BANK), so every branch has exactly
 * 20 debtors to test every persona against: a mix of shared and distinct
 * Nature/Description combinations, spread across every aging bucket from
 * <=6 months out to >=5 years (including several Arrears >= 5 years entries
 * per branch for Top 10 Debtors / Arrears > 5 years), and a mix of Draft/
 * Pending Review/Supported statuses so the Debtor List's branch-scoped
 * visibility rules have something to show for Branch Rep, Reviewer 1, CPM
 * and Finance alike. Amounts carry a real due date (via `entries`) rather
 * than a static bucket total, so Days in Arrears, the Write Off ledger, and
 * live aging all have something real to compute from.
 */
interface DebtorProfile {
  natureId: string;
  descriptionId: string;
  entries: SeedAmountEntry[];
  reasonNonRecovery: string;
  recoverySteps: string;
  status?: DebtorStatus;
}

// 20 profiles: several nature/description pairs repeat (rows 1-3, 4-5, 6-7,
// 8-9, 10-11, 12-13, 14-15, 18-19) so aggregated reports have real
// same-nature/same-description groups to sum across, mixed in with entries
// on their own nature/description. Aging buckets are deliberately spread
// across all seven, not clustered in one or two.
const DEBTOR_PROFILES: DebtorProfile[] = [
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-motor-vehicle',
    entries: [
      { monthsBack: -2, amount: 4000 },
      { monthsBack: 3, amount: 12000 },
    ],
    reasonNonRecovery: 'Unable to contact',
    recoverySteps: 'Engagement',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-motor-vehicle',
    entries: [{ monthsBack: 30, amount: 45000 }],
    reasonNonRecovery: 'Unable to contact',
    recoverySteps: 'Engagement',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-motor-vehicle',
    entries: [{ monthsBack: 84, amount: 22000 }],
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-liquor-duty',
    entries: [
      { monthsBack: 42, amount: 4000 },
      { monthsBack: 54, amount: 4000 },
      { monthsBack: 84, amount: 15000 },
    ],
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-liquor-duty',
    entries: [{ monthsBack: 9, amount: 7000 }],
    reasonNonRecovery: 'Payment plan ongoing',
    recoverySteps: 'Monitoring',
    status: 'PENDING_REVIEW',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-tobacco-cigarette-recovery',
    entries: [{ monthsBack: 9, amount: 9000 }],
    reasonNonRecovery: 'Payment plan ongoing',
    recoverySteps: 'Monitoring',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-tobacco-cigarette-recovery',
    entries: [{ monthsBack: 18, amount: 6000 }],
    reasonNonRecovery: 'Awaiting response',
    recoverySteps: 'Reminder letter sent',
    status: 'DRAFT',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-other-fees',
    entries: [{ monthsBack: 3, amount: 2500 }],
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-other-fees',
    entries: [
      { monthsBack: -2, amount: 1500 },
      { monthsBack: 18, amount: 3000 },
    ],
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-cert-doc-fee',
    entries: [{ monthsBack: 9, amount: 5500 }],
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-cert-doc-fee',
    entries: [{ monthsBack: 54, amount: 6200 }],
    reasonNonRecovery: 'Disputed amount',
    recoverySteps: 'Under review',
    status: 'PENDING_REVIEW',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-warehouse-fee',
    entries: [{ monthsBack: 18, amount: 11000 }],
    reasonNonRecovery: 'Awaiting response',
    recoverySteps: 'Follow-up letter sent',
    status: 'DRAFT',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-warehouse-fee',
    entries: [{ monthsBack: 84, amount: 9000 }],
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-p-offence-instalment',
    entries: [{ monthsBack: 30, amount: 6500 }],
    reasonNonRecovery: 'Disputed amount',
    recoverySteps: 'Under review',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-p-offence-instalment',
    entries: [{ monthsBack: 3, amount: 3200 }],
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-motor-offence-late-instalment',
    entries: [
      { monthsBack: 54, amount: 8000 },
      { monthsBack: 84, amount: 18000 },
    ],
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-other-non-p-offence-instalment',
    entries: [{ monthsBack: 42, amount: 5000 }],
    reasonNonRecovery: 'Payment plan ongoing',
    recoverySteps: 'Monitoring',
  },
  {
    natureId: 'nat-staff-related',
    descriptionId: 'desc-staff-related-salary-medical',
    entries: [{ monthsBack: 54, amount: 9500 }],
    reasonNonRecovery: 'Staff resigned',
    recoverySteps: 'HR follow-up',
    status: 'PENDING_REVIEW',
  },
  {
    natureId: 'nat-staff-related',
    descriptionId: 'desc-staff-related-salary-medical',
    entries: [{ monthsBack: 9, amount: 4100 }],
    reasonNonRecovery: 'Staff resigned',
    recoverySteps: 'HR follow-up',
  },
  {
    natureId: 'nat-others',
    descriptionId: 'desc-miscellaneous-sales',
    entries: [
      { monthsBack: -2, amount: 1800 },
      { monthsBack: 3, amount: 2200 },
    ],
    reasonNonRecovery: '',
    recoverySteps: '',
    status: 'DRAFT',
  },
];

const BRANCH_NAME_BANK: Record<Branch, string[]> = {
  PSB: [
    'Lim Wee Keng', 'Chong Siew Fong', 'PQR Engineering Pte Ltd', 'Rajoo s/o Muniandy',
    'Ng Bee Choo', 'Faridah binte Rahman', 'Koh Teck Whye', 'Siti Aminah',
    'Global Trading Co', 'Ravi Chandran', 'Ong Bee Hoon', 'Tay Boon Huat',
    'Michelle Wong', 'Silverline Traders', 'Anand s/o Kumar', 'Wendy Ho',
    'Abdul Rahman bin Yusof', 'Sunrise Enterprises', 'Cheng Li Fen', 'Kamalesh Naidu',
  ],
  TIB: [
    'Yeo Kim Huat', 'Chandra Sekaran', 'Delta Logistics Pte Ltd', 'Nur Aisyah',
    'Teo Ah Kow', 'Mohamed Yusof', 'Lee Poh Choo', 'Summit Traders',
    'Balasubramaniam s/o Krishnan', 'Grace Tan', 'Swee Keat Trading', 'Farah binte Ismail',
    'Jaya Kumar', 'Redwood Suppliers', 'Cheryl Ng', 'Hafiz bin Rosli',
    'Tan Chin Guan', 'Northgate Holdings', 'Meera d/o Suresh', 'Bernard Koh',
  ],
  SIB: [
    'Chua Beng Huat', 'Nurul Huda', 'Everbright Holdings', 'Krishnan Pillai',
    'Tay Ah Moi', 'Zainal Abidin', 'Foo Mei Yee', 'Pacific Rim Traders',
    'Selvam s/o Muthu', 'Amy Lim', 'Oceanview Enterprises', 'Hamidah binte Yusof',
    'Vincent Goh', 'Silver Crest Trading', 'Aravind Rao', 'Josephine Tan',
    'Rosnah binte Ismail', 'Lakeview Holdings', 'Suresh Pillai', 'Angela Chua',
  ],
  PCB: [
    'Choo Wei Ling', 'Ibrahim bin Osman', 'Meridian Supplies', 'Devi Krishnan',
    'Ong Kim Swee', 'Aishah binte Karim', 'Chan Yew Meng', 'Highland Trading',
    'Muthu Kumar', 'Serene Goh', 'Vanguard Industries', 'Rosidah binte Salim',
    'Timothy Lee', 'Brightpath Traders', 'Kavitha d/o Raman', 'Wilson Ang',
    'Sazali bin Hamid', 'Eastwood Enterprises', 'Priyanka Nair', 'Fabian Teo',
  ],
  FIN: [
    'Loh Ah Huat', 'Zulkifli bin Hassan', 'Crestwood Ltd', 'Priya Sharma',
    'Tan Beng Watt', 'Nadia binte Salim', 'Koh Ah Seng', 'Sterling Traders',
    'Ramesh Pillai', 'Betty Chua', 'Horizon Enterprises', 'Suhaila binte Ahmad',
    'Gerald Lim', 'Northpoint Trading', 'Kalaivani d/o Muthu', 'Desmond Wong',
    'Rashid bin Ali', 'Meadowbrook Holdings', 'Anitha Raj', 'Calvin Ng',
  ],
};

export const DEBTORS_SEED: Debtor[] = BRANCHES.flatMap((branch) =>
  DEBTOR_PROFILES.map((profile, i) =>
    mkDebtor(
      branch,
      BRANCH_NAME_BANK[branch][i],
      profile.natureId,
      profile.descriptionId,
      profile.entries,
      profile.reasonNonRecovery,
      profile.recoverySteps,
      `debtor-gen-${branch}-${i + 1}`,
      profile.status ?? 'SUPPORTED',
    ),
  ),
);
