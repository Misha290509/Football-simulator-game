import { useGameStore } from '../../state/store';

const CATEGORY_COLOR: Record<string, string> = {
  BOARD: 'text-sky-400',
  TRANSFER: 'text-amber-400',
  INJURY: 'text-red-400',
  RESULT: 'text-slate-300',
  AWARD: 'text-emerald-400',
  MILESTONE: 'text-purple-400',
  GENERAL: 'text-slate-400',
};

export function Inbox() {
  const meta = useGameStore((s) => s.meta)!;
  const news = [...meta.news].reverse();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Inbox</h1>
      {news.length === 0 ? (
        <p className="text-slate-500 text-sm">No messages yet.</p>
      ) : (
        <div className="space-y-2">
          {news.map((n) => (
            <div key={n.id} className="card p-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${CATEGORY_COLOR[n.category]}`}>
                  {n.category}
                </span>
              </div>
              <div className="font-medium mt-0.5">{n.title}</div>
              <div className="text-sm text-slate-400">{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
