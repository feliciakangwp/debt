import { useState } from 'react';
import { useApp } from '../context/AppContext';

interface ReferenceListPageProps {
  title: string;
  description: string;
  listKey: 'nature' | 'description';
}

export function ReferenceListPage({ title, description, listKey }: ReferenceListPageProps) {
  const { natureList, descriptionList, addReferenceItem, toggleReferenceItem } = useApp();
  const [newName, setNewName] = useState('');
  const [newNatureId, setNewNatureId] = useState('');
  const [showForm, setShowForm] = useState(false);

  const isDescription = listKey === 'description';
  const items = isDescription ? descriptionList : natureList;
  const activeNature = natureList.filter((n) => n.active);
  const natureName = (id?: string) => natureList.find((n) => n.id === id)?.name ?? '—';

  const handleAdd = () => {
    if (!newName.trim()) return;
    if (isDescription && !newNatureId) return;
    addReferenceItem(listKey, newName, isDescription ? newNatureId : undefined);
    setNewName('');
    setNewNatureId('');
    setShowForm(false);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95"
        >
          + New
        </button>
      </div>
      <p className="mb-5 text-sm text-slate-500">{description}</p>

      {showForm && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-gold/40 bg-brand-gold/10 p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Enter new item name"
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
          />
          {isDescription && (
            <select
              value={newNatureId}
              onChange={(e) => setNewNatureId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-navy focus:outline-none"
            >
              <option value="">Link to Nature…</option>
              {activeNature.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleAdd}
            disabled={isDescription && !newNatureId}
            className="rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowForm(false);
              setNewName('');
              setNewNatureId('');
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-navy text-white">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Item (A–Z)</th>
              {isDescription && (
                <th className="px-4 py-2 text-left font-semibold">
                  Linked Nature of AR/ Arrears
                </th>
              )}
              <th className="px-4 py-2 text-center font-semibold">Status</th>
              <th className="px-4 py-2 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className={`px-4 py-2 ${item.active ? '' : 'text-slate-400 line-through'}`}>
                  {item.name}
                </td>
                {isDescription && (
                  <td className="px-4 py-2 text-slate-600">{natureName(item.natureId)}</td>
                )}
                <td className="px-4 py-2 text-center">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      item.active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {item.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleReferenceItem(listKey, item.id)}
                    className="rounded-md border border-brand-navy/30 px-3 py-1 text-xs font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
                  >
                    {item.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
