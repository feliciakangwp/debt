import type { Branch, Debtor, DebtorStatus, ReferenceItem } from '../types';
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

const mk = (
  branch: Debtor['branch'],
  name: string,
  natureId: string,
  descriptionId: string,
  amounts: Partial<
    Pick<
      Debtor,
      | 'notInArrears'
      | 'arrears6m'
      | 'arrears6to12m'
      | 'arrears1to2y'
      | 'arrears2to3y'
      | 'arrears3to4y'
      | 'arrears4to5y'
      | 'arrears5yPlus'
    >
  >,
  reasonNonRecovery: string,
  recoverySteps: string,
  id: string,
  status: DebtorStatus = 'SUPPORTED',
): Debtor => ({
  id,
  status,
  branch,
  name,
  natureId,
  descriptionId,
  notInArrears: amounts.notInArrears ?? 0,
  arrears6m: amounts.arrears6m ?? 0,
  arrears6to12m: amounts.arrears6to12m ?? 0,
  arrears1to2y: amounts.arrears1to2y ?? 0,
  arrears2to3y: amounts.arrears2to3y ?? 0,
  arrears3to4y: amounts.arrears3to4y ?? 0,
  arrears4to5y: amounts.arrears4to5y ?? 0,
  arrears5yPlus: amounts.arrears5yPlus ?? 0,
  reasonNonRecovery,
  recoverySteps,
  caseReference: '',
  auditLog: [{ id: `log-${id}-seed`, date: '2026-01-01', actor: 'Finance', action: 'Sample data loaded' }],
});

/**
 * One profile per row below is applied to every branch (with a
 * branch-specific name from BRANCH_NAME_BANK), so every branch — including
 * TIB, SIB and FIN, which otherwise have no sample data at all — has a
 * substantial, varied set of debtors to test every persona against: every
 * Nature/Description combination, every aging bucket (including a couple of
 * Arrears >= 5 years entries per branch for Top 10 Debtors / Arrears > 5
 * years), and a mix of Draft/Pending Review/Supported statuses so the
 * Debtor List's branch-scoped visibility rules have something to show for
 * Branch Rep, Reviewer 1, CPM and Finance alike.
 */
interface DebtorProfile {
  natureId: string;
  descriptionId: string;
  amounts: Partial<
    Pick<
      Debtor,
      | 'notInArrears'
      | 'arrears6m'
      | 'arrears6to12m'
      | 'arrears1to2y'
      | 'arrears2to3y'
      | 'arrears3to4y'
      | 'arrears4to5y'
      | 'arrears5yPlus'
    >
  >;
  reasonNonRecovery: string;
  recoverySteps: string;
  status?: DebtorStatus;
}

const DEBTOR_PROFILES: DebtorProfile[] = [
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-motor-vehicle',
    amounts: { notInArrears: 4000, arrears6m: 12000 },
    reasonNonRecovery: 'Unable to contact',
    recoverySteps: 'Engagement',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-motor-vehicle',
    amounts: { arrears2to3y: 45000 },
    reasonNonRecovery: 'Unable to contact',
    recoverySteps: 'Engagement',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-p-offence-liquor-duty',
    amounts: { arrears3to4y: 4000, arrears4to5y: 4000, arrears5yPlus: 15000 },
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-tax',
    descriptionId: 'desc-tobacco-cigarette-recovery',
    amounts: { arrears6to12m: 9000 },
    reasonNonRecovery: 'Payment plan ongoing',
    recoverySteps: 'Monitoring',
    status: 'PENDING_REVIEW',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-other-fees',
    amounts: { arrears6m: 2500 },
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-cert-doc-fee',
    amounts: { arrears6to12m: 5500 },
    reasonNonRecovery: '',
    recoverySteps: '',
  },
  {
    natureId: 'nat-fees',
    descriptionId: 'desc-warehouse-fee',
    amounts: { arrears1to2y: 11000 },
    reasonNonRecovery: 'Awaiting response',
    recoverySteps: 'Follow-up letter sent',
    status: 'DRAFT',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-p-offence-instalment',
    amounts: { arrears2to3y: 6500 },
    reasonNonRecovery: 'Disputed amount',
    recoverySteps: 'Under review',
  },
  {
    natureId: 'nat-financial-penalty',
    descriptionId: 'desc-motor-offence-late-instalment',
    amounts: { arrears4to5y: 8000, arrears5yPlus: 18000 },
    reasonNonRecovery: 'No contact',
    recoverySteps: 'Law firm',
  },
  {
    natureId: 'nat-staff-related',
    descriptionId: 'desc-staff-related-salary-medical',
    amounts: { arrears4to5y: 9500 },
    reasonNonRecovery: 'Staff resigned',
    recoverySteps: 'HR follow-up',
    status: 'PENDING_REVIEW',
  },
  {
    natureId: 'nat-others',
    descriptionId: 'desc-miscellaneous-sales',
    amounts: { notInArrears: 1800, arrears6m: 2200 },
    reasonNonRecovery: '',
    recoverySteps: '',
    status: 'DRAFT',
  },
];

const BRANCH_NAME_BANK: Record<Branch, string[]> = {
  PSB: [
    'Lim Wee Keng', 'Chong Siew Fong', 'PQR Engineering Pte Ltd', 'Rajoo s/o Muniandy',
    'Ng Bee Choo', 'Faridah binte Rahman', 'Koh Teck Whye', 'Siti Aminah',
    'Global Trading Co', 'Ravi Chandran', 'Ong Bee Hoon',
  ],
  TIB: [
    'Yeo Kim Huat', 'Chandra Sekaran', 'Delta Logistics Pte Ltd', 'Nur Aisyah',
    'Teo Ah Kow', 'Mohamed Yusof', 'Lee Poh Choo', 'Summit Traders',
    'Balasubramaniam s/o Krishnan', 'Grace Tan', 'Swee Keat Trading',
  ],
  SIB: [
    'Chua Beng Huat', 'Nurul Huda', 'Everbright Holdings', 'Krishnan Pillai',
    'Tay Ah Moi', 'Zainal Abidin', 'Foo Mei Yee', 'Pacific Rim Traders',
    'Selvam s/o Muthu', 'Amy Lim', 'Oceanview Enterprises',
  ],
  PCB: [
    'Choo Wei Ling', 'Ibrahim bin Osman', 'Meridian Supplies', 'Devi Krishnan',
    'Ong Kim Swee', 'Aishah binte Karim', 'Chan Yew Meng', 'Highland Trading',
    'Muthu Kumar', 'Serene Goh', 'Vanguard Industries',
  ],
  FIN: [
    'Loh Ah Huat', 'Zulkifli bin Hassan', 'Crestwood Ltd', 'Priya Sharma',
    'Tan Beng Watt', 'Nadia binte Salim', 'Koh Ah Seng', 'Sterling Traders',
    'Ramesh Pillai', 'Betty Chua', 'Horizon Enterprises',
  ],
};

const GENERATED_DEBTORS: Debtor[] = BRANCHES.flatMap((branch) =>
  DEBTOR_PROFILES.map((profile, i) =>
    mk(
      branch,
      BRANCH_NAME_BANK[branch][i],
      profile.natureId,
      profile.descriptionId,
      profile.amounts,
      profile.reasonNonRecovery,
      profile.recoverySteps,
      `debtor-gen-${branch}-${i + 1}`,
      profile.status ?? 'SUPPORTED',
    ),
  ),
);

export const DEBTORS_SEED: Debtor[] = [
  mk(
    'PSB',
    'Tan Ah Gao',
    'nat-tax',
    'desc-p-offence-motor-vehicle',
    { notInArrears: 5000, arrears6m: 10000 },
    'Unable to contact',
    'Engagement',
    'debtor-1',
  ),
  mk(
    'PSB',
    'Tan Ah Lian',
    'nat-tax',
    'desc-p-offence-motor-vehicle',
    { notInArrears: 0, arrears2to3y: 50000 },
    'Unable to contact',
    'Engagement',
    'debtor-2',
  ),
  mk(
    'PSB',
    'ABC Company',
    'nat-tax',
    'desc-p-offence-liquor-duty',
    { arrears3to4y: 3000, arrears4to5y: 3000, arrears5yPlus: 10000 },
    'No contact',
    'Law firm',
    'debtor-3',
  ),
  mk(
    'PSB',
    'Ah Sia',
    'nat-fees',
    'desc-other-fees',
    { notInArrears: 0, arrears6m: 3000 },
    '',
    '',
    'debtor-4',
  ),
  mk(
    'PSB',
    'Ah Sia',
    'nat-fees',
    'desc-cert-doc-fee',
    { arrears6to12m: 6000 },
    '',
    '',
    'debtor-5',
  ),
  mk(
    'PCB',
    'Tan Ah Siao',
    'nat-tax',
    'desc-p-offence-motor-vehicle',
    { notInArrears: 0, arrears6to12m: 1000 },
    'Unable to contact',
    'Engagement',
    'debtor-6',
  ),
  mk(
    'PCB',
    'XYZ Company',
    'nat-tax',
    'desc-p-offence-liquor-duty',
    { arrears2to3y: 3000 },
    'No contact',
    'Law firm',
    'debtor-7',
  ),
  mk(
    'PCB',
    'Auntie Mao',
    'nat-fees',
    'desc-other-fees',
    { notInArrears: 0, arrears4to5y: 5000 },
    '',
    '',
    'debtor-8',
  ),
  mk(
    'PCB',
    'Uncle Tan',
    'nat-fees',
    'desc-cert-doc-fee',
    { arrears6to12m: 60000 },
    '',
    '',
    'debtor-9',
  ),
  ...GENERATED_DEBTORS,
];
