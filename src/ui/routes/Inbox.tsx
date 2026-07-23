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
  // Show the deadline feed while it is fresh (within a couple of weeks).
  const feed = meta.deadlineFeed && meta.currentDay - meta.deadlineFeed.day <= 14 ? meta.deadlineFeed : null;

  return (
    <div className="space-y-4">
      <h1 className="page-title">Inbox</h1>

      {feed && feed.items.length > 0 && (
        <div className="card p-4 border border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-400">⏰ {feed.windowLabel} Deadline Day</h2>
            <span className="text-[11px] text-slate-500">{feed.items.length} deals</span>
          </div>
          <div className="space-y-0 divide-y divide-surface-700">
            {feed.items.map((it, i) => (
              <div key={i} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="font-mono text-xs text-slate-500 w-12 shrink-0">{it.time}</span>
                <span className={it.mine ? 'text-emerald-300 font-medium' : it.big ? 'text-slate-200' : 'text-slate-400'}>
                  {it.big && !it.mine && <span className="text-amber-400 mr-1">🔥</span>}
                  {it.mine && <span className="mr-1">✅</span>}
                  {it.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
