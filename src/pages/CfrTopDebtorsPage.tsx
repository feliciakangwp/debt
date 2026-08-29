import { CfrDebtorReportPage } from './CfrDebtorReportPage';
import { totalInArrears } from '../types';
import type { Debtor } from '../types';

function selectTop10(debtors: Debtor[]): Debtor[] {
  return [...debtors]
    .sort((a, b) => totalInArrears(b) - totalInArrears(a))
    .slice(0, 10);
}

interface CfrTopDebtorsPageProps {
  consolidated: boolean;
}

export function CfrTopDebtorsPage({ consolidated }: CfrTopDebtorsPageProps) {
  return (
    <CfrDebtorReportPage
      consolidated={consolidated}
      title={consolidated ? 'Top 10 Debtors ((Fin) Call For Return)' : 'Top 10 Debtors (Call For Return)'}
      selectRows={selectTop10}
    />
  );
}
