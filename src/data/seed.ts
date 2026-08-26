import type { Debtor, ReferenceItem } from '../types';

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
): Debtor => ({
  id,
  status: 'SUPPORTED',
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
];
