import { CfrDebtorReportPage } from './CfrDebtorReportPage';
import { selectArrearsOver5Years } from '../utils/cfrReportSelectors';

interface CfrArrears5YearsPageProps {
  consolidated: boolean;
}

export function CfrArrears5YearsPage({ consolidated }: CfrArrears5YearsPageProps) {
  return (
    <CfrDebtorReportPage
      consolidated={consolidated}
      title={consolidated ? 'Arrears > 5 years ((Fin) Call For Return)' : 'Arrears > 5 years (Call For Return)'}
      selectRows={selectArrearsOver5Years}
    />
  );
}
