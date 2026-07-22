import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { Rating, CrestBadge } from '../components/Rating';
import { fullName, ageOf } from '../format';

/**
 * My Player — Tier 1 · Step 2 stub. A minimal landing screen that proves the
 * Player new-game path end to end: it reads the avatar + playerCareer block off
 * the save and shows the core identity. The full dashboard (trust, selection
 * read, objectives, season tallies, personal feed) arrives in Step 5.
 */
export function PlayerHome() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const career = playerCareerOf(meta);
  const currentYear = season?.year ?? meta?.startYear ?? new Date().getFullYear();

  if (!meta || !career) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const p = players[career.playerId];
  const club = p?.contract.clubId ? clubs[p.contract.clubId] : undefined;

  if (!p) {
    return <div className="p-6 text-slate-400">Loading your player…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="page-title">My Player</h1>

      <div className="card p-5 flex items-center gap-4">
        {club && <CrestBadge abbrev={club.abbrev} color={club.primaryColor ?? '#3ba776'} size={44} />}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold text-white truncate">{fullName(p)}</div>
          <div className="text-sm text-slate-400">
            {p.position} · {ageOf(p, currentYear)} yrs · {club?.name ?? 'No club'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{career.archetype} · {career.origin.toLowerCase()} origin</div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">OVR</span>
            <Rating value={p.overall} />
          </div>
          <div className="flex items-center gap-2 justify-end mt-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">POT</span>
            <Rating value={p.potential} />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Squad status" value={career.status} />
        <Stat label="Manager trust" value={`${career.managerTrust}`} />
        <Stat label="Fan rating" value={`${career.fanRating}`} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Career start</h2>
        <ul className="space-y-1">
          {career.milestones.map((m, i) => (
            <li key={i} className="text-sm text-slate-300">• {m.text}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-500">
        Step 2 stub — training, the “will I start?” selection read, objectives and
        your personal match feed land in the next steps.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}
