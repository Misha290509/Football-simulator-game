import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useGameStore, lastSaveId } from './state/store';
import { isPlayerCareer } from './game/playerCareer';
import { Layout } from './ui/Layout';
import { MainMenu } from './ui/routes/MainMenu';

// Route-level code splitting keeps the initial bundle small (charts, etc.).
const NewGame = lazy(() => import('./ui/routes/NewGame').then((m) => ({ default: m.NewGame })));
const Dashboard = lazy(() => import('./ui/routes/Dashboard').then((m) => ({ default: m.Dashboard })));
const PlayerHome = lazy(() => import('./ui/routes/PlayerHome').then((m) => ({ default: m.PlayerHome })));
const PlayerTraining = lazy(() => import('./ui/routes/PlayerTraining').then((m) => ({ default: m.PlayerTraining })));
const PlayerCareerScreen = lazy(() => import('./ui/routes/PlayerCareerScreen').then((m) => ({ default: m.PlayerCareerScreen })));
const OffPitch = lazy(() => import('./ui/routes/OffPitch').then((m) => ({ default: m.OffPitch })));
const InteractiveMatch = lazy(() => import('./ui/routes/InteractiveMatch').then((m) => ({ default: m.InteractiveMatch })));
const Squad = lazy(() => import('./ui/routes/Squad').then((m) => ({ default: m.Squad })));
const Tactics = lazy(() => import('./ui/routes/Tactics').then((m) => ({ default: m.Tactics })));
const PlayerProfile = lazy(() => import('./ui/routes/PlayerProfile').then((m) => ({ default: m.PlayerProfile })));
const Standings = lazy(() => import('./ui/routes/Standings').then((m) => ({ default: m.Standings })));
const Fixtures = lazy(() => import('./ui/routes/Fixtures').then((m) => ({ default: m.Fixtures })));
const MatchDetail = lazy(() => import('./ui/routes/MatchDetail').then((m) => ({ default: m.MatchDetail })));
const Inbox = lazy(() => import('./ui/routes/Inbox').then((m) => ({ default: m.Inbox })));
const TransferMarket = lazy(() => import('./ui/routes/TransferMarket').then((m) => ({ default: m.TransferMarket })));
const Contracts = lazy(() => import('./ui/routes/Contracts').then((m) => ({ default: m.Contracts })));
const Finances = lazy(() => import('./ui/routes/Finances').then((m) => ({ default: m.Finances })));
const Scouting = lazy(() => import('./ui/routes/Scouting').then((m) => ({ default: m.Scouting })));
const Club = lazy(() => import('./ui/routes/Club').then((m) => ({ default: m.Club })));
const Academy = lazy(() => import('./ui/routes/Academy').then((m) => ({ default: m.Academy })));
const LiveMatch = lazy(() => import('./ui/routes/LiveMatch').then((m) => ({ default: m.LiveMatch })));
const Manager = lazy(() => import('./ui/routes/Manager').then((m) => ({ default: m.Manager })));
const Compare = lazy(() => import('./ui/routes/Compare').then((m) => ({ default: m.Compare })));
const Nations = lazy(() => import('./ui/routes/Nations').then((m) => ({ default: m.Nations })));
const Continental = lazy(() => import('./ui/routes/Continental').then((m) => ({ default: m.Continental })));
const Records = lazy(() => import('./ui/routes/Records').then((m) => ({ default: m.Records })));
const History = lazy(() => import('./ui/routes/History').then((m) => ({ default: m.History })));
const Sandbox = lazy(() => import('./ui/routes/Sandbox').then((m) => ({ default: m.Sandbox })));

/** In Player-career saves the manager dashboard is meaningless — send the human
 *  to their My Player home instead (covers resume + any /dashboard link). */
function DashboardGate() {
  const isPlayer = useGameStore((s) => isPlayerCareer(s.meta));
  return isPlayer ? <Navigate to="/my-player" replace /> : <Dashboard />;
}

function Protected({ children }: { children: React.ReactNode }) {
  const loaded = useGameStore((s) => s.loaded);
  const load = useGameStore((s) => s.load);
  const location = useLocation();
  // A hard refresh (or a bookmarked deep link) clears the in-memory store, but
  // the career is still on disk — resume the last-played save instead of
  // bouncing the player to the main menu.
  const [resume, setResume] = useState<'trying' | 'failed'>(() =>
    !loaded && lastSaveId() ? 'trying' : 'failed');

  useEffect(() => {
    if (loaded || resume !== 'trying') return;
    const id = lastSaveId();
    if (!id) { setResume('failed'); return; }
    void load(id).then((ok) => { if (!ok) setResume('failed'); });
  }, [loaded, resume, load]);

  if (!loaded) {
    if (resume === 'trying') {
      return (
        <div className="min-h-full flex items-center justify-center text-slate-400">
          Resuming your career…
        </div>
      );
    }
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return (
    <Layout>
      <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>{children}</Suspense>
    </Layout>
  );
}

export default function App() {
  const refreshSavesList = useGameStore((s) => s.refreshSavesList);

  useEffect(() => {
    void refreshSavesList();
  }, [refreshSavesList]);

  return (
    <Routes>
      <Route path="/" element={<MainMenu />} />
      <Route path="/new" element={<Suspense fallback={null}><NewGame /></Suspense>} />
      <Route path="/dashboard" element={<Protected><DashboardGate /></Protected>} />
      <Route path="/my-player" element={<Protected><PlayerHome /></Protected>} />
      <Route path="/training" element={<Protected><PlayerTraining /></Protected>} />
      <Route path="/career" element={<Protected><PlayerCareerScreen /></Protected>} />
      <Route path="/off-pitch" element={<Protected><OffPitch /></Protected>} />
      <Route path="/play-match" element={<Protected><InteractiveMatch /></Protected>} />
      <Route path="/squad" element={<Protected><Squad /></Protected>} />
      <Route path="/tactics" element={<Protected><Tactics /></Protected>} />
      <Route path="/player/:id" element={<Protected><PlayerProfile /></Protected>} />
      <Route path="/standings" element={<Protected><Standings /></Protected>} />
      <Route path="/fixtures" element={<Protected><Fixtures /></Protected>} />
      <Route path="/match/:id" element={<Protected><MatchDetail /></Protected>} />
      <Route path="/transfers" element={<Protected><TransferMarket /></Protected>} />
      <Route path="/contracts" element={<Protected><Contracts /></Protected>} />
      <Route path="/scouting" element={<Protected><Scouting /></Protected>} />
      <Route path="/club" element={<Protected><Club /></Protected>} />
      <Route path="/academy" element={<Protected><Academy /></Protected>} />
      <Route path="/live" element={<Protected><LiveMatch /></Protected>} />
      <Route path="/manager" element={<Protected><Manager /></Protected>} />
      <Route path="/compare" element={<Protected><Compare /></Protected>} />
      <Route path="/nations" element={<Protected><Nations /></Protected>} />
      <Route path="/continental" element={<Protected><Continental /></Protected>} />
      <Route path="/records" element={<Protected><Records /></Protected>} />
      <Route path="/finances" element={<Protected><Finances /></Protected>} />
      <Route path="/history" element={<Protected><History /></Protected>} />
      <Route path="/sandbox" element={<Protected><Sandbox /></Protected>} />
      <Route path="/inbox" element={<Protected><Inbox /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


