import { useMemo, useState, type ReactNode } from 'react';

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
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    initialSort ?? null,
  );

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
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'cursor-pointer' : ''}
              onClick={() => onRowClick?.(row)}
            >
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
