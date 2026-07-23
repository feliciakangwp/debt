import { useApp } from '../context/AppContext';
import { PERSONAS } from '../types';
import { todayIso } from '../utils/aging';

export type PageKey =
  | 'nature'
  | 'description'
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
  const isFinance = persona.role === 'FINANCE';

  const items: NavItem[] = [
    { key: 'debtors', label: 'List of Debtors', visible: true },
    { key: 'arrears', label: 'List of AR / Arrears', visible: true },
    { key: 'arrears-fin', label: 'List of AR / Arrears (FIN)', visible: isFinance },
    { key: 'nature', label: 'Nature of Account/ Arrears', visible: isFinance },
    { key: 'description', label: 'Description', visible: isFinance },
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
            <option key={p.id} value={p.id} className="text-black">
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
