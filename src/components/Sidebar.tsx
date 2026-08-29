import { useApp } from '../context/AppContext';
import { PERSONAS } from '../types';
import { todayIso } from '../utils/aging';
import { hasOperationalAccess, isFinanceTeamPersona } from '../utils/visibility';

export type PageKey =
  | 'nature'
  | 'description'
  | 'debtor-list'
  | 'debtors'
  | 'arrears'
  | 'arrears-fin';

interface NavItem {
  key: PageKey;
  label: string;
  visible: boolean;
}

interface SidebarProps {
  active: PageKey;
  onNavigate: (key: PageKey) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { persona, setPersonaId, simulatedToday, setSimulatedToday } = useApp();
  const operational = hasOperationalAccess(persona);
  const financeTeam = isFinanceTeamPersona(persona);

  const items: NavItem[] = [
    { key: 'debtor-list', label: 'List of Debtors', visible: operational },
    { key: 'debtors', label: 'Debtors Report', visible: operational || financeTeam },
    { key: 'arrears', label: 'Arrears Report', visible: operational },
    { key: 'arrears-fin', label: '(Fin) Arrears Report', visible: financeTeam },
    { key: 'nature', label: 'Nature of Arrears', visible: financeTeam },
    { key: 'description', label: 'Description', visible: financeTeam },
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
        <div className="mb-2 px-3 text-sm font-bold text-white">Debt Management</div>
        <ul className="space-y-1">
          {items
            .filter((i) => i.visible)
            .map((item) => (
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
      </nav>

      <div className="border-t border-white/10 px-5 py-3 text-xs text-white/40">
        Role: {persona.role.replace('_', ' ')}
        {persona.branch ? ` · ${persona.branch}` : ''}
      </div>
    </aside>
  );
}
