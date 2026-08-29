import { CfrDebtorReportPage } from './CfrDebtorReportPage';
import { selectTop10Debtors } from '../utils/cfrReportSelectors';

interface CfrTopDebtorsPageProps {
  consolidated: boolean;
}

export function CfrTopDebtorsPage({ consolidated }: CfrTopDebtorsPageProps) {
  return (
    <CfrDebtorReportPage
      consolidated={consolidated}
      title={consolidated ? 'Top 10 Debtors ((Fin) Call For Return)' : 'Top 10 Debtors (Call For Return)'}
      selectRows={selectTop10Debtors}
    />
  );
}
