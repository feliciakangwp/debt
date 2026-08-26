import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import type { PageKey } from './components/Sidebar';
import { ReferenceListPage } from './pages/ReferenceListPage';
import { DebtorListPage } from './pages/DebtorListPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { ArrearsSummaryPage } from './pages/ArrearsSummaryPage';
import { hasOperationalAccess, isFinanceTeamPersona } from './utils/visibility';

const OPERATIONAL_PAGES: PageKey[] = ['debtor-list', 'debtors', 'arrears'];
const FINANCE_TEAM_PAGES: PageKey[] = ['debtors-fin', 'arrears-fin', 'nature', 'description'];

function Shell() {
  const { persona } = useApp();
  const [page, setPage] = useState<PageKey>('debtor-list');

  useEffect(() => {
    const allowed = OPERATIONAL_PAGES.includes(page)
      ? hasOperationalAccess(persona)
      : FINANCE_TEAM_PAGES.includes(page)
        ? isFinanceTeamPersona(persona)
        : true;
    if (!allowed) {
      setPage(hasOperationalAccess(persona) ? 'debtor-list' : 'debtors-fin');
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
        {page === 'debtors-fin' && <DebtorsPage financeView />}
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
