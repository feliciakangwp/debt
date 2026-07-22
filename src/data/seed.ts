import type { Debtor, ReferenceItem } from '../types';

// Alphabetically ordered
export const NATURE_SEED: ReferenceItem[] = [
  { id: 'nat-fees', name: 'Fees', active: true },
  { id: 'nat-financial-penalty', name: 'Financial Penalty', active: true },
  { id: 'nat-others', name: 'Others', active: true },
  { id: 'nat-staff-related', name: 'Staff-Related', active: true },
  { id: 'nat-tax', name: 'Tax', active: true },
];

// Alphabetically ordered
export const DESCRIPTION_SEED: ReferenceItem[] = [
  { id: 'desc-cert-fee', name: 'Cert Fee', active: true },
  { id: 'desc-cig-offence-duty', name: 'Cig Offence – Duty', active: true },
  { id: 'desc-p-offence-alcohol', name: 'P Offence – Alcohol', active: true },
  { id: 'desc-p-offence-motor', name: 'P Offence – Motor', active: true },
  { id: 'desc-p-offence-vapt', name: 'P Offence – VAPT', active: true },
  { id: 'desc-salary', name: 'Salary', active: true },
  { id: 'desc-stat-fee', name: 'Stat Fee', active: true },
];

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
});

export const DEBTORS_SEED: Debtor[] = [
  mk(
    'PSB',
    'Tan Ah Gao',
    'nat-tax',
    'desc-p-offence-vapt',
    { notInArrears: 5000, arrears6m: 10000 },
    'Unable to contact',
    'Engagement',
    'debtor-1',
  ),
  mk(
    'PSB',
    'Tan Ah Lian',
    'nat-tax',
    'desc-p-offence-vapt',
    { notInArrears: 0, arrears2to3y: 50000 },
    'Unable to contact',
    'Engagement',
    'debtor-2',
  ),
  mk(
    'PSB',
    'ABC Company',
    'nat-tax',
    'desc-p-offence-alcohol',
    { arrears3to4y: 3000, arrears4to5y: 3000, arrears5yPlus: 10000 },
    'No contact',
    'Law firm',
    'debtor-3',
  ),
  mk(
    'PSB',
    'Ah Sia',
    'nat-fees',
    'desc-stat-fee',
    { notInArrears: 0, arrears6m: 3000 },
    '',
    '',
    'debtor-4',
  ),
  mk(
    'PSB',
    'Ah Sia',
    'nat-fees',
    'desc-cert-fee',
    { arrears6to12m: 6000 },
    '',
    '',
    'debtor-5',
  ),
  mk(
    'PCB',
    'Tan Ah Siao',
    'nat-tax',
    'desc-p-offence-vapt',
    { notInArrears: 0, arrears6to12m: 1000 },
    'Unable to contact',
    'Engagement',
    'debtor-6',
  ),
  mk(
    'PCB',
    'XYZ Company',
    'nat-tax',
    'desc-p-offence-alcohol',
    { arrears2to3y: 3000 },
    'No contact',
    'Law firm',
    'debtor-7',
  ),
  mk(
    'PCB',
    'Auntie Mao',
    'nat-fees',
    'desc-stat-fee',
    { notInArrears: 0, arrears4to5y: 5000 },
    '',
    '',
    'debtor-8',
  ),
  mk(
    'PCB',
    'Uncle Tan',
    'nat-fees',
    'desc-cert-fee',
    { arrears6to12m: 60000 },
    '',
    '',
    'debtor-9',
  ),
];
