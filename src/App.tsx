import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import type { PageKey } from './components/Sidebar';
import { ReferenceListPage } from './pages/ReferenceListPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { ArrearsSummaryPage } from './pages/ArrearsSummaryPage';

function financeOnly(page: PageKey): boolean {
  return page === 'nature' || page === 'description' || page === 'arrears-fin';
}

function Shell() {
  const { persona } = useApp();
  const [page, setPage] = useState<PageKey>('debtors');

  useEffect(() => {
    if (financeOnly(page) && persona.role !== 'FINANCE') {
      setPage('debtors');
    }
  }, [persona, page]);

  return (
    <div className="flex min-h-screen">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="flex-1 overflow-x-auto p-8">
        {page === 'nature' && (
          <ReferenceListPage
            title="Nature of Account/ Arrears"
            description="Reference list used for tagging debtor arrears. Finance can activate/deactivate items or add new ones."
            listKey="nature"
          />
        )}
        {page === 'description' && (
          <ReferenceListPage
            title="Description"
            description="Reference list used for tagging debtor arrears. Finance can activate/deactivate items or add new ones."
            listKey="description"
          />
        )}
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
