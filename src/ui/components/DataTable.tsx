import { Fragment, useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  /** Render the cell. */
  render: (row: T) => ReactNode;
  /** Value used for sorting; if omitted the column is not sortable. */
  sortValue?: (row: T) => number | string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Opt-in: render a detail panel beneath a row, toggled by a leading chevron.
   *  Return null for a row that has nothing to expand (no chevron shown). */
  renderExpanded?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  renderExpanded,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    initialSort ?? null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sv(a);
      const bv = sv(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.key === col.key) {
        return { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key: col.key, dir: 'desc' };
    });
  };

  return (
    <div className="overflow-x-auto card">
      <table className="data-table">
        <thead>
          <tr>
            {renderExpanded && <th className="w-6" aria-hidden />}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.sortValue ? 'sortable' : ''} ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : ''
                }`}
                onClick={() => toggleSort(col)}
              >
                {col.header}
                {sort?.key === col.key && (
                  <span className="ml-1 text-accent-400">
                    {sort.dir === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row);
            const detail = renderExpanded?.(row);
            const isOpen = expanded.has(key);
            return (
              <Fragment key={key}>
                <tr
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={() => onRowClick?.(row)}
                >
                  {renderExpanded && (
                    <td className="text-center align-middle">
                      {detail != null && (
                        <button
                          type="button"
                          className={`text-slate-500 hover:text-accent-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          aria-label={isOpen ? 'Hide season changes' : 'Show season changes'}
                          aria-expanded={isOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                        >
                          ▸
                        </button>
                      )}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : ''
                      } ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {isOpen && detail != null && (
                  <tr>
                    <td colSpan={columns.length + 1} className="bg-surface-800/40 !py-3">
                      {detail}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
