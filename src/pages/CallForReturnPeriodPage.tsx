import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DataTable } from '../components/DataTable';
import type { ColumnDef } from '../components/DataTable';
import { CallForReturnFormModal } from '../components/CallForReturnFormModal';
import { CallForReturnStatusBadge } from '../components/CfrStatusBadge';
import { computeCallForReturnStatus } from '../utils/callForReturn';
import type { CallForReturnPeriod, CallForReturnStatus } from '../types';

interface Row extends CallForReturnPeriod {
  status: CallForReturnStatus;
}

export function CallForReturnPeriodPage() {
  const { callForReturnPeriods, simulatedToday } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () =>
      [...callForReturnPeriods]
        .map((p) => ({ ...p, status: computeCallForReturnStatus(p.startDate, p.endDate, simulatedToday) }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [callForReturnPeriods, simulatedToday],
  );

  const editingPeriod = editingId ? callForReturnPeriods.find((p) => p.id === editingId) : undefined;

  const columns: ColumnDef<Row>[] = [
    {
      key: 'name',
      header: 'Submission Year-Month',
      accessor: (r) => r.name,
      render: (r) => (
        <button
          onClick={() => setEditingId(r.id)}
          className="font-medium text-brand-navy underline decoration-dotted hover:text-brand-gold"
        >
          {r.name}
        </button>
      ),
      sortType: 'alpha',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      render: (r) => <CallForReturnStatusBadge status={r.status} />,
      sortType: 'alpha',
    },
    { key: 'startDate', header: 'Start Date', accessor: (r) => r.startDate, sortType: 'alpha' },
    { key: 'endDate', header: 'End Date', accessor: (r) => r.endDate, sortType: 'alpha' },
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Call for Return Period</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95"
        >
          + New
        </button>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Latest submission period shown first. Status is live against today's simulated date (
        {simulatedToday}).
      </p>

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />

      {showNew && <CallForReturnFormModal onClose={() => setShowNew(false)} />}
      {editingPeriod && (
        <CallForReturnFormModal period={editingPeriod} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
