import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PERSONAS } from '../types';
import { todayIso } from '../utils/aging';
import { hasCfrAccess, hasOperationalAccess, isFinanceTeamPersona } from '../utils/visibility';

export type PageKey =
  | 'nature'
  | 'description'
  | 'debtor-list'
  | 'debtors'
  | 'arrears'
  | 'arrears-fin'
  | 'write-off'
  | 'to-be-written-off'
  | 'cfr-fin-period'
  | 'cfr-fin-arrears'
  | 'cfr-fin-top10-debtors'
  | 'cfr-fin-arrears-5y'
  | 'cfr-fin-loans-advances'
  | 'cfr-fin-written-off'
  | 'cfr-fin-top10-written-off'
  | 'cfr-fin-to-be-written-off'
  | 'cfr-fin-reports'
  | 'cfr-arrears'
  | 'cfr-top10-debtors'
  | 'cfr-arrears-5y'
  | 'cfr-loans-advances'
  | 'cfr-written-off'
  | 'cfr-top10-written-off'
  | 'cfr-to-be-written-off'
  | 'cfr-reports';

interface NavItem {
  key: PageKey;
  label: string;
  visible: boolean;
}

interface NavGroup {
  header: string;
  items: NavItem[];
}

interface SidebarProps {
  active: PageKey;
  onNavigate: (key: PageKey) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { persona, setPersonaId, simulatedToday, setSimulatedToday } = useApp();
  const operational = hasOperationalAccess(persona);
  const financeTeam = isFinanceTeamPersona(persona);
  const cfr = hasCfrAccess(persona);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (header: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header);
      else next.add(header);
      return next;
    });
  };

  const groups: NavGroup[] = [
    {
      header: 'Debt Management',
      items: [
        { key: 'debtor-list', label: 'List of Debtors', visible: operational },
        { key: 'debtors', label: 'Debtors Report', visible: operational || financeTeam },
        { key: 'arrears', label: 'Arrears Report', visible: operational },
        { key: 'arrears-fin', label: '(Fin) Arrears Report', visible: financeTeam },
        { key: 'write-off', label: 'Write Off', visible: operational || financeTeam },
        { key: 'to-be-written-off', label: 'To Be Written Off', visible: operational || financeTeam },
        { key: 'nature', label: 'Nature of Arrears', visible: financeTeam },
        { key: 'description', label: 'Description', visible: financeTeam },
      ],
    },
    {
      header: '(Fin) Call For Return',
      items: [
        { key: 'cfr-fin-period', label: 'Call for Return Period', visible: financeTeam },
        { key: 'cfr-fin-arrears', label: 'Arrears', visible: financeTeam },
        { key: 'cfr-fin-top10-debtors', label: 'Top 10 Debtors', visible: financeTeam },
        { key: 'cfr-fin-arrears-5y', label: 'Arrears > 5 years', visible: financeTeam },
        { key: 'cfr-fin-loans-advances', label: 'Loans and Advances', visible: financeTeam },
        { key: 'cfr-fin-written-off', label: 'Written Off', visible: financeTeam },
        { key: 'cfr-fin-top10-written-off', label: 'Top 10 Written Off', visible: financeTeam },
        { key: 'cfr-fin-to-be-written-off', label: 'To be Written Off', visible: financeTeam },
        { key: 'cfr-fin-reports', label: 'Reports', visible: financeTeam },
      ],
    },
    {
      header: 'Call For Return',
      items: [
        { key: 'cfr-arrears', label: 'Arrears', visible: cfr },
        { key: 'cfr-top10-debtors', label: 'Top 10 Debtors', visible: cfr },
        { key: 'cfr-arrears-5y', label: 'Arrears > 5 years', visible: cfr },
        { key: 'cfr-loans-advances', label: 'Loans and Advances', visible: cfr },
        { key: 'cfr-written-off', label: 'Written Off', visible: cfr },
        { key: 'cfr-top10-written-off', label: 'Top 10 Written Off', visible: cfr },
        { key: 'cfr-to-be-written-off', label: 'To be Written Off', visible: cfr },
        { key: 'cfr-reports', label: 'Reports', visible: cfr },
      ],
    },
  ];

  return (
    <aside className="flex h-screen w-72 flex-shrink-0 flex-col bg-brand-navy text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-lg font-bold tracking-wide text-brand-gold">Debt Management</div>
        <div className="text-xs text-white/60">Module</div>
      </div>

      <div className="border-b border-white/10 px-5 py-4">
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
          Logged in as
        </label>
        <select
          className="w-full rounded-md border border-white/20 bg-brand-navy-light px-2 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
          value={persona.id}
          onChange={(e) => setPersonaId(e.target.value)}
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id} className="bg-brand-navy-light text-white">
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="border-b border-white/10 px-5 py-4">
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
          Simulated today (testing)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={simulatedToday}
            onChange={(e) => setSimulatedToday(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/20 bg-brand-navy-light px-2 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none [color-scheme:dark]"
          />
          <button
            type="button"
            onClick={() => setSimulatedToday(todayIso())}
            title="Reset to today's actual date"
            className="shrink-0 rounded-md border border-white/20 px-2 py-1.5 text-xs font-semibold text-white/85 hover:bg-brand-gold hover:text-brand-navy"
          >
            Today
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const visibleItems = group.items.filter((i) => i.visible);
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsed.has(group.header);
          return (
            <div key={group.header} className="mb-4 last:mb-0">
              <button
                onClick={() => toggleGroup(group.header)}
                className="mb-2 flex w-full items-center justify-between px-3 text-sm font-bold text-brand-gold"
                aria-expanded={!isCollapsed}
              >
                <span>{group.header}</span>
                <span className={`text-xs text-white/60 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                  ▼
                </span>
              </button>
              {!isCollapsed && (
                <ul className="space-y-1">
                  {visibleItems.map((item) => (
                    <li key={item.key}>
                      <button
                        onClick={() => onNavigate(item.key)}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          active === item.key
                            ? 'bg-brand-gold font-semibold text-brand-navy'
                            : 'text-white/85 hover:bg-white/10'
                        }`}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-3 text-xs text-white/40">
        Role: {persona.role.replace('_', ' ')}
        {persona.branch ? ` · ${persona.branch}` : ''}
      </div>
    </aside>
  );
}
