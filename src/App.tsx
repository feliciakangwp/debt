import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import type { PageKey } from './components/Sidebar';
import { ReferenceListPage } from './pages/ReferenceListPage';
import { DebtorListPage } from './pages/DebtorListPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { ArrearsSummaryPage } from './pages/ArrearsSummaryPage';
import { hasOperationalAccess, isFinanceTeamPersona } from './utils/visibility';

// 'debtors' is reachable by both audiences: operational roles see their own
// branch, the finance team sees every branch (handled inside DebtorsPage).
const OPERATIONAL_ONLY_PAGES: PageKey[] = ['debtor-list', 'arrears'];
const FINANCE_TEAM_ONLY_PAGES: PageKey[] = ['arrears-fin', 'nature', 'description'];

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
