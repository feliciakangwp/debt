import { useMemo, useState } from 'react';

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  accessor: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  /** Value used when exporting this column to Excel, if it should differ
   * from `accessor` (e.g. a status code exported as its display label).
   * Defaults to `accessor`. */
  exportValue?: (row: T) => string | number;
  sortType?: 'alpha' | 'numeric';
  align?: 'left' | 'right' | 'center';
  /** Set to false for non-data columns (e.g. row-selection checkboxes) to disable click-to-sort. Defaults to true. */
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

type SortDir = 'asc' | 'desc' | null;

export function DataTable<T>({ columns, rows, rowKey, emptyMessage }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      let cmp: number;
      if (col.sortType === 'numeric') {
        cmp = Number(av) - Number(bv);
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const handleSort = (col: ColumnDef<T>) => {
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir('asc');
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-brand-navy text-white">
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              return (
                <th
                  key={col.key}
                  onClick={sortable ? () => handleSort(col) : undefined}
                  className={`select-none whitespace-nowrap px-3 py-2 font-semibold ${sortable ? 'cursor-pointer' : ''} ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                  title={sortable ? 'Click to sort' : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortable && (
                      <span className="text-brand-gold">
                        {sortKey === col.key ? (sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '') : '⇅'}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">
                {emptyMessage ?? 'No records found.'}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, idx) => (
              <tr
                key={rowKey(row)}
                className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-3 py-2 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    }`}
                  >
                    {col.render ? col.render(row) : col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
