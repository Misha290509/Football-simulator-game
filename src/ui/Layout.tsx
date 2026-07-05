import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useGameStore } from '../state/store';
import { CrestBadge } from './components/Rating';
import { PlayMenu } from './components/PlayMenu';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/squad', label: 'Squad' },
  { to: '/tactics', label: 'Tactics' },
  { to: '/transfers', label: 'Transfers' },
  { to: '/compare', label: 'Compare' },
  { to: '/scouting', label: 'Scouting' },
  { to: '/academy', label: 'Academy' },
  { to: '/manager', label: 'Manager' },
  { to: '/nations', label: 'Nations' },
  { to: '/continental', label: 'Cups & Europe' },
  { to: '/club', label: 'Club' },
  { to: '/finances', label: 'Finances' },
  { to: '/standings', label: 'Standings' },
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/history', label: 'History' },
  { to: '/records', label: 'Records' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/sandbox', label: 'God Mode' },
];

function NavItem({ to, label, guard }: { to: string; label: string; guard?: (e: React.MouseEvent) => void }) {
  return (
    <NavLink
      to={to}
      onClick={guard}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-md text-sm font-medium ${
          isActive
            ? 'bg-accent text-white'
            : 'text-slate-300 hover:bg-surface-700'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const meta = useGameStore((s) => s.meta);
  const club = useGameStore((s) => s.managerClub());
  const closeSave = useGameStore((s) => s.closeSave);
  const liveMatch = useGameStore((s) => s.liveMatch);
  const cancelLive = useGameStore((s) => s.cancelLive);
  const navigate = useNavigate();
  const location = useLocation();

  const season = meta ? Object.values(meta.seasons).find((s) => s.current) : null;

  // While a live match is underway, leaving the screen abandons it — make that
  // an explicit choice instead of a silent loss.
  const onLive = location.pathname === '/live';
  const liveRunning = onLive && !!liveMatch && !liveMatch.finished && liveMatch.phase !== 'PREMATCH';
  const guardLive = (e: React.MouseEvent) => {
    if (!liveRunning) return;
    if (window.confirm('Abandon the live match? The score so far will be lost and the game replayed later.')) {
      cancelLive();
    } else {
      e.preventDefault();
    }
  };

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 bg-surface-800 border-r border-surface-600 flex flex-col">
        <div className="px-4 py-4 border-b border-surface-600">
          <div className="text-lg font-bold text-white">Football GM</div>
          <div className="text-xs text-slate-500">Sporting Director</div>
        </div>

        {club && (
          <div className="px-4 py-3 border-b border-surface-600 flex items-center gap-2">
            <CrestBadge abbrev={club.abbrev} color={club.primaryColor} />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{club.shortName}</div>
              <div className="text-xs text-slate-500">{season?.label}</div>
            </div>
          </div>
        )}

        <nav className="p-2 space-y-1 flex-1">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} guard={guardLive} />
          ))}
        </nav>

        <div className="p-2 border-t border-surface-600">
          <button
            className="btn-ghost w-full"
            onClick={() => {
              if (liveRunning && !window.confirm('Abandon the live match? The score so far will be lost.')) return;
              if (liveRunning) cancelLive();
              closeSave();
              navigate('/');
            }}
          >
            Main Menu
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-surface-600 bg-surface-800 flex items-center justify-end px-6">
          {onLive ? (
            <span className="text-xs text-emerald-300">
              ● Match day — manage the game below
            </span>
          ) : (
            <PlayMenu />
          )}
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
