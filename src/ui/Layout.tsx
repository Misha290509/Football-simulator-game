import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useGameStore } from '../state/store';
import { isPlayerCareer } from '../game/playerCareer';
import { CrestBadge } from './components/Rating';
import { PlayMenu } from './components/PlayMenu';
import { PlayerPlayMenu } from './components/PlayerPlayMenu';

// Grouped nav: daily club business first, then the market, then the wider
// world, then the manager's own office. God Mode lives apart, by the exit.
const NAV_GROUPS: { title: string; items: { to: string; label: string }[] }[] = [
  {
    title: 'Club',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/squad', label: 'Squad' },
      { to: '/tactics', label: 'Tactics' },
      { to: '/academy', label: 'Academy' },
      { to: '/club', label: 'Club & Staff' },
      { to: '/finances', label: 'Finances' },
    ],
  },
  {
    title: 'Market',
    items: [
      { to: '/transfers', label: 'Transfers' },
      { to: '/contracts', label: 'Contracts' },
      { to: '/scouting', label: 'Scouting' },
      { to: '/compare', label: 'Compare' },
    ],
  },
  {
    title: 'World',
    items: [
      { to: '/standings', label: 'Standings' },
      { to: '/fixtures', label: 'Fixtures' },
      { to: '/continental', label: 'Cups & Europe' },
      { to: '/nations', label: 'Nations' },
      { to: '/records', label: 'Records' },
      { to: '/history', label: 'History' },
    ],
  },
  {
    title: 'Office',
    items: [
      { to: '/manager', label: 'Manager' },
      { to: '/inbox', label: 'Inbox' },
    ],
  },
];

// Player Career gets its own navigation — no squad management, no transfers as a
// buyer; just the player's own game plus a read-only view of the world.
const PLAYER_NAV_GROUPS: { title: string; items: { to: string; label: string }[] }[] = [
  {
    title: 'Me',
    items: [
      { to: '/my-player', label: 'My Player' },
      { to: '/training', label: 'Training' },
      { to: '/career', label: 'Career' },
    ],
  },
  {
    title: 'World',
    items: [
      { to: '/squad', label: 'Teammates' },
      { to: '/standings', label: 'Standings' },
      { to: '/fixtures', label: 'Fixtures' },
      { to: '/records', label: 'Records' },
      { to: '/inbox', label: 'Inbox' },
    ],
  },
];

function NavItem({ to, label, guard }: { to: string; label: string; guard?: (e: React.MouseEvent) => void }) {
  return (
    <NavLink
      to={to}
      onClick={guard}
      className={({ isActive }) =>
        `relative block pl-4 pr-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent/15 text-accent-400 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-accent-400'
            : 'text-slate-300 hover:bg-surface-700 hover:text-white'
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

  // Mobile: the sidebar is an off-canvas drawer. Close it on every navigation.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const season = meta ? Object.values(meta.seasons).find((s) => s.current) : null;
  const playerMode = isPlayerCareer(meta);
  const navGroups = playerMode ? PLAYER_NAV_GROUPS : NAV_GROUPS;

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
      {/* Backdrop behind the mobile drawer. */}
      {navOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-30 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />
      )}

      <aside
        className={`w-64 md:w-56 shrink-0 bg-surface-800/95 border-r border-surface-600/60 flex flex-col
          fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200 ease-out
          safe-l ${navOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="px-4 py-4 border-b border-surface-600/60 flex items-center justify-between safe-t">
          <div>
            <div className="font-display font-semibold uppercase tracking-wide text-lg text-white leading-tight">
              Football <span className="text-accent-400">GM</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{playerMode ? 'Player Career' : 'Sporting Director'}</div>
          </div>
          <button
            className="md:hidden text-slate-400 hover:text-white text-xl leading-none px-2"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {club && (
          <div
            className="px-4 py-3 border-b border-surface-600/60 flex items-center gap-2.5"
            style={{
              backgroundImage: `linear-gradient(115deg, ${club.primaryColor}33, ${club.primaryColor}0d 55%, transparent)`,
            }}
          >
            <CrestBadge abbrev={club.abbrev} color={club.primaryColor} size={34} />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate text-white">{club.shortName}</div>
              <div className="text-[11px] text-slate-400">{season?.label}</div>
            </div>
          </div>
        )}

        <nav className="p-2 flex-1 overflow-y-auto">
          {navGroups.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="section-title px-3 pt-1 pb-1.5">{g.title}</div>
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavItem key={n.to} {...n} guard={guardLive} />
                ))}
              </div>
            </div>
          ))}
          {!playerMode && (
            <div className="mt-2 pt-2 border-t border-surface-600/40">
              <NavLink
                to="/sandbox"
                onClick={guardLive}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-xs font-medium tracking-wide ${
                    isActive ? 'bg-amber-500/15 text-amber-300' : 'text-slate-500 hover:text-amber-300/90 hover:bg-surface-700'
                  }`
                }
              >
                ⚡ God Mode <span className="text-slate-600">· cheats</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="p-2 border-t border-surface-600/60 safe-b">
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
        <header className="h-14 shrink-0 border-b border-surface-600/60 bg-surface-800/80 backdrop-blur flex items-center gap-2 px-3 sm:px-6 safe-t safe-r">
          <button
            className="md:hidden shrink-0 text-slate-300 hover:text-white text-2xl leading-none px-1 -ml-1"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          {club && (
            <span className="md:hidden font-semibold text-sm truncate">{club.shortName}</span>
          )}
          {onLive ? (
            <span className="ml-auto text-xs text-emerald-300 whitespace-nowrap">● Match day — manage the game below</span>
          ) : (
            <div className="ml-auto min-w-0 overflow-x-auto scrollbar-thin">
              {playerMode ? <PlayerPlayMenu /> : <PlayMenu />}
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
