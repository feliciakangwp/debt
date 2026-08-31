import { CfrWriteOffReportPage } from './CfrWriteOffReportPage';
import { selectTop10WriteOffs } from '../utils/writeOffRows';

interface CfrTopWriteOffPageProps {
  consolidated: boolean;
}

/** Top 10 Written Off — same underlying Supported write-off records as the
 * Written Off tab, narrowed to the 10 largest by amount within whatever the
 * viewer is scoped to (own branch, or every branch for (Fin)/Super Admin). */
export function CfrTopWriteOffPage({ consolidated }: CfrTopWriteOffPageProps) {
  return (
    <CfrWriteOffReportPage
      consolidated={consolidated}
      targetStatus="SUPPORTED"
      title={consolidated ? 'Top 10 Written Off ((Fin) Call For Return)' : 'Top 10 Written Off (Call For Return)'}
      reportLabel="Top 10 Written Off"
      amountColumnLabel="Amount of Write Off"
      selectRows={selectTop10WriteOffs}
    />
  );
}
