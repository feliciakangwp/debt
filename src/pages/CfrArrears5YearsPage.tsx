import { CfrDebtorReportPage } from './CfrDebtorReportPage';
import type { Debtor } from '../types';

function selectOverFiveYears(debtors: Debtor[]): Debtor[] {
  return debtors.filter((d) => d.arrears5yPlus > 0);
}

interface CfrArrears5YearsPageProps {
  consolidated: boolean;
}

export function CfrArrears5YearsPage({ consolidated }: CfrArrears5YearsPageProps) {
  return (
    <CfrDebtorReportPage
      consolidated={consolidated}
      title={consolidated ? 'Arrears > 5 years ((Fin) Call For Return)' : 'Arrears > 5 years (Call For Return)'}
      selectRows={selectOverFiveYears}
    />
  );
}
