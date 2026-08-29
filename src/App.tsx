import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import type { PageKey } from './components/Sidebar';
import { ReferenceListPage } from './pages/ReferenceListPage';
import { DebtorListPage } from './pages/DebtorListPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { ArrearsSummaryPage } from './pages/ArrearsSummaryPage';
import { CallForReturnPeriodPage } from './pages/CallForReturnPeriodPage';
import { CfrArrearsPage } from './pages/CfrArrearsPage';
import { CfrTopDebtorsPage } from './pages/CfrTopDebtorsPage';
import { CfrArrears5YearsPage } from './pages/CfrArrears5YearsPage';
import { CfrReportsPage } from './pages/CfrReportsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { hasCfrAccess, hasOperationalAccess, isFinanceTeamPersona } from './utils/visibility';

// 'debtors' is reachable by both audiences: operational roles see their own
// branch, the finance team sees every branch (handled inside DebtorsPage).
const OPERATIONAL_ONLY_PAGES: PageKey[] = ['debtor-list', 'arrears'];
const FINANCE_TEAM_ONLY_PAGES: PageKey[] = [
  'arrears-fin',
  'nature',
  'description',
  'cfr-fin-period',
  'cfr-fin-arrears',
  'cfr-fin-top10-debtors',
  'cfr-fin-arrears-5y',
  'cfr-fin-loans-advances',
  'cfr-fin-written-off',
  'cfr-fin-top10-written-off',
  'cfr-fin-to-be-written-off',
  'cfr-fin-reports',
];
const CFR_PAGES: PageKey[] = [
  'cfr-arrears',
  'cfr-top10-debtors',
  'cfr-arrears-5y',
  'cfr-loans-advances',
  'cfr-written-off',
  'cfr-top10-written-off',
  'cfr-to-be-written-off',
  'cfr-reports',
];

function Shell() {
  const { persona } = useApp();
  const [page, setPage] = useState<PageKey>('debtor-list');

  useEffect(() => {
    const operational = hasOperationalAccess(persona);
    const financeTeam = isFinanceTeamPersona(persona);
    const allowed =
      page === 'debtors'
        ? operational || financeTeam
        : OPERATIONAL_ONLY_PAGES.includes(page)
          ? operational
          : FINANCE_TEAM_ONLY_PAGES.includes(page)
            ? financeTeam
            : CFR_PAGES.includes(page)
              ? hasCfrAccess(persona)
              : true;
    if (!allowed) {
      setPage(operational ? 'debtor-list' : 'debtors');
    }
  }, [persona, page]);

  return (
    <div className="flex min-h-screen">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="flex-1 overflow-x-auto p-8">
        {page === 'nature' && (
          <ReferenceListPage
            title="Nature of Arrears"
            description="Reference list used for tagging debtor arrears. The finance team can activate/deactivate items or add new ones."
            listKey="nature"
          />
        )}
        {page === 'description' && (
          <ReferenceListPage
            title="Description"
            description="Reference list used for tagging debtor arrears. The finance team can activate/deactivate items or add new ones."
            listKey="description"
          />
        )}
        {page === 'debtor-list' && <DebtorListPage />}
        {page === 'debtors' && <DebtorsPage />}
        {page === 'arrears' && <ArrearsSummaryPage />}
        {page === 'arrears-fin' && <ArrearsSummaryPage financeView />}

        {page === 'cfr-fin-period' && <CallForReturnPeriodPage />}
        {page === 'cfr-fin-arrears' && <CfrArrearsPage consolidated />}
        {page === 'cfr-fin-top10-debtors' && <CfrTopDebtorsPage consolidated />}
        {page === 'cfr-fin-arrears-5y' && <CfrArrears5YearsPage consolidated />}
        {page === 'cfr-fin-loans-advances' && (
          <PlaceholderPage title="Loans and Advances (CFR-FIN)" exportFileName="FinCallForReturn-LoansAndAdvances.xlsx" />
        )}
        {page === 'cfr-fin-written-off' && (
          <PlaceholderPage title="Written Off (CFR-FIN)" exportFileName="FinCallForReturn-WrittenOff.xlsx" />
        )}
        {page === 'cfr-fin-top10-written-off' && (
          <PlaceholderPage title="Top 10 Written Off (CFR-FIN)" exportFileName="FinCallForReturn-Top10WrittenOff.xlsx" />
        )}
        {page === 'cfr-fin-to-be-written-off' && (
          <PlaceholderPage title="To be Written Off (CFR-FIN)" exportFileName="FinCallForReturn-ToBeWrittenOff.xlsx" />
        )}
        {page === 'cfr-fin-reports' && <CfrReportsPage consolidated />}

        {page === 'cfr-arrears' && <CfrArrearsPage consolidated={false} />}
        {page === 'cfr-top10-debtors' && <CfrTopDebtorsPage consolidated={false} />}
        {page === 'cfr-arrears-5y' && <CfrArrears5YearsPage consolidated={false} />}
        {page === 'cfr-loans-advances' && (
          <PlaceholderPage title="Loans and Advances (CFR)" exportFileName="CallForReturn-LoansAndAdvances.xlsx" />
        )}
        {page === 'cfr-written-off' && (
          <PlaceholderPage title="Written Off (CFR)" exportFileName="CallForReturn-WrittenOff.xlsx" />
        )}
        {page === 'cfr-top10-written-off' && (
          <PlaceholderPage title="Top 10 Written Off (CFR)" exportFileName="CallForReturn-Top10WrittenOff.xlsx" />
        )}
        {page === 'cfr-to-be-written-off' && (
          <PlaceholderPage title="To be Written Off (CFR)" exportFileName="CallForReturn-ToBeWrittenOff.xlsx" />
        )}
        {page === 'cfr-reports' && <CfrReportsPage consolidated={false} />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default App;
