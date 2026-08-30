import { useEffect, useMemo, useState } from 'react';

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

const PAGE_SIZE = 10;

/** Page numbers to render around `current`, collapsing long runs into a
 * single ellipsis: first, last, current, and one neighbour on each side. */
function pageNumbersToShow(current: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const keep = new Set<number>([0, totalPages - 1, current]);
  if (current - 1 >= 0) keep.add(current - 1);
  if (current + 1 < totalPages) keep.add(current + 1);
  const sorted = Array.from(keep).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(page);
  });
  return result;
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(0);

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

  // Reset to page 1 whenever the underlying dataset changes (a persona
  // switch, a filter, a new submission) so pagination never gets stuck
  // showing an empty page from a previous, larger dataset.
  useEffect(() => {
    setPage(0);
  }, [rows]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const startIndex = currentPage * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const pageRows = sortedRows.slice(startIndex, endIndex);

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
    setPage(0);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
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
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">
                  {emptyMessage ?? 'No records found.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={rowKey(row)} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
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

      {totalRows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-sm text-slate-500">
          <span>
            {startIndex + 1}-{endIndex} of {totalRows}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                ‹ Prev
              </button>
              {pageNumbersToShow(currentPage, totalPages).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-current={p === currentPage ? 'page' : undefined}
                    className={`min-w-[1.75rem] rounded-md border px-2 py-1 text-xs font-semibold ${
                      p === currentPage
                        ? 'border-brand-gold bg-brand-gold text-brand-navy'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
