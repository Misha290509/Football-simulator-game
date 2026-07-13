import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { matchDate, formatShort } from '../../game/gameCalendar';
import type { Match } from '../../types/match';

function scoreLabel(m: Match): string {
  return m.played ? `${m.homeGoals} – ${m.awayGoals}` : 'v';
}

export function Fixtures() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const matches = useGameStore((s) => s.currentSeasonMatches());
  const season = useGameStore((s) => s.currentSeason());
  const seasonYear = season?.year ?? meta.startYear;
  const managerClubId = meta.managerClubId;

  const competitions = Object.values(meta.competitions).sort((a, b) => a.tier - b.tier);
  // The competition the manager's club plays in.
  const managerComp = competitions.find((c) => c.clubIds.includes(managerClubId)) ?? competitions[0];

  const myFixtures = useMemo(
    () =>
      matches
        .filter(
          (m) => !m.neutral && (m.homeClubId === managerClubId || m.awayClubId === managerClubId),
        )
        .sort((a, b) => a.day - b.day),
    [matches, managerClubId],
  );

  const maxDay = useGameStore((s) => s.seasonRefMaxDay());
  const [browseComp, setBrowseComp] = useState(managerComp.id);
  const [browseIdx, setBrowseIdx] = useState(0);

  // Only the days that actually hold fixtures in the chosen competition — so the
  // browser steps matchday-to-matchday, not through every empty calendar day.
  const compDays = useMemo(
    () => [...new Set(matches.filter((m) => !m.neutral && m.competitionId === browseComp).map((m) => m.day))].sort((a, b) => a - b),
    [matches, browseComp],
  );
  const idx = Math.min(browseIdx, Math.max(0, compDays.length - 1));
  const browseDay = compDays[idx] ?? 0;
  const roundMatches = matches
    .filter((m) => !m.neutral && m.competitionId === browseComp && m.day === browseDay)
    .sort((a, b) => a.homeClubId.localeCompare(b.homeClubId));
  const roundDate = roundMatches[0] ? formatShort(matchDate(roundMatches[0], maxDay, seasonYear, meta)) : '';

  const Row = ({ m }: { m: Match }) => {
    const home = clubs[m.homeClubId];
    const away = clubs[m.awayClubId];
    const isMine = m.homeClubId === managerClubId || m.awayClubId === managerClubId;
    const cont = meta.continental?.[m.competitionId];
    const cup = meta.domesticCups?.[m.competitionId];
    const comp = cont ?? cup;
    return (
      <button
        disabled={!m.played}
        onClick={() => navigate(`/match/${m.id}`)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
          isMine ? 'bg-accent/10' : 'bg-surface-700'
        } ${m.played ? 'hover:bg-surface-600 cursor-pointer' : 'opacity-80'}`}
      >
        <span className="text-[11px] text-slate-500 w-16 text-left shrink-0 hidden sm:block">{formatShort(matchDate(m, maxDay, seasonYear, meta))}</span>
        <span className="text-xs w-24 text-left truncate" title={comp ? `${comp.name} — ${m.stageLabel}` : undefined}>
          {cont ? <span className="text-accent-400">{cont.name.replace(' League', '')}</span>
            : cup ? <span className="text-sky-400">{m.stageLabel}</span>
            : <span className="text-slate-500">MD {Math.floor(m.day / 3) + 1}</span>}
        </span>
        <span className="flex-1 flex items-center justify-end gap-2">
          <span className="truncate">{home.shortName}</span>
          <CrestBadge abbrev={home.abbrev} color={home.primaryColor} size={20} />
        </span>
        <span className="font-mono font-semibold w-16 text-center">{scoreLabel(m)}</span>
        <span className="flex-1 flex items-center gap-2">
          <CrestBadge abbrev={away.abbrev} color={away.primaryColor} size={20} />
          <span className="truncate">{away.shortName}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Fixtures &amp; Results</h1>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">
          {clubs[managerClubId].shortName} — season fixtures
        </h2>
        <div className="space-y-1.5">
          {myFixtures.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-400">League round</h2>
          <div className="flex gap-2">
            {competitions.map((c) => (
              <button
                key={c.id}
                className={`text-xs px-2 py-1 rounded ${
                  browseComp === c.id ? 'bg-accent text-white' : 'bg-surface-700'
                }`}
                onClick={() => { setBrowseComp(c.id); setBrowseIdx(0); }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <button
            className="btn-ghost"
            disabled={idx <= 0}
            onClick={() => setBrowseIdx(Math.max(0, idx - 1))}
          >
            ‹
          </button>
          <span className="text-sm text-slate-400">Matchday {idx + 1} <span className="text-slate-600">of {compDays.length}</span>{roundDate && <span className="text-slate-500 ml-2">· {roundDate}</span>}</span>
          <button
            className="btn-ghost"
            disabled={idx >= compDays.length - 1}
            onClick={() => setBrowseIdx(Math.min(compDays.length - 1, idx + 1))}
          >
            ›
          </button>
        </div>
        <div className="space-y-1.5">
          {roundMatches.length === 0 ? (
            <p className="text-sm text-slate-500">No fixtures this matchday.</p>
          ) : (
            roundMatches.map((m) => <Row key={m.id} m={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
