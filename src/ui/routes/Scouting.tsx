import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { fullName, ageOf, formatMoney } from '../format';
import { revealed } from '../../engine/scouting';
import { SCOUT_CAPACITY, scoutStars } from '../../engine/marketScout';
import type { Player } from '../../types/player';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Your scouting department at a glance: every scout, the players he is
 * watching right now and when each report is due, then the reports already
 * filed. Scouts are sent from the Transfer Market or a player's profile.
 */
export function Scouting() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const managerClub = useGameStore((s) => s.managerClub());
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;

  const scouts = (managerClub?.staff ?? []).filter((s) => s.role === 'SCOUT');
  const assignments = meta.playerScoutAssignments ?? [];
  const reports = meta.scoutReports ?? {};
  const out = assignments.length;

  const filed = useMemo(
    () => Object.values(reports)
      .filter((r) => players[r.playerId])
      .sort((a, b) => b.day - a.day),
    [reports, players],
  );

  const clubOf = (p: Player) => (p.contract.clubId ? clubs[p.contract.clubId]?.shortName ?? '—' : 'Free agent');

  // Players watched under the old knowledge system, kept for older saves.
  const legacy = meta.scouting ?? {};
  const legacyPlayers = Object.keys(legacy).map((id) => players[id]).filter(Boolean)
    .sort((a, b) => (legacy[b.id] ?? 0) - (legacy[a.id] ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <h1 className="page-title">Scouting</h1>
        <span className="text-xs text-slate-400">
          {out} player{out === 1 ? '' : 's'} being scouted · room for {Math.max(0, scouts.length * SCOUT_CAPACITY - out)} more
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Send a scout from the Transfer Market or a player's profile. Each scout can watch up to {SCOUT_CAPACITY} players
        at once; a better scout reports back sooner and gets closer to the truth.
      </p>

      {/* Who is watching whom, right now. */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Being scouted now</h2>
        {scouts.length === 0 ? (
          <p className="text-sm text-slate-500">You have no scouts. Hire one on the Club &amp; Staff screen.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {scouts.map((s) => {
              const jobs = assignments
                .filter((a) => a.scoutId === s.id)
                .sort((a, b) => a.dueDay - b.dueDay);
              return (
                <div key={s.id} className="rounded-lg border border-surface-600 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium">
                      {s.name.first} {s.name.last} <span className="text-amber-400/70 text-sm">{stars(scoutStars(s))}</span>
                    </span>
                    <span className={`text-xs ${jobs.length >= SCOUT_CAPACITY ? 'text-sky-300' : 'text-emerald-400'}`}>
                      {jobs.length}/{SCOUT_CAPACITY}{jobs.length >= SCOUT_CAPACITY ? ' · fully booked' : ''}
                    </span>
                  </div>
                  {jobs.length === 0 ? (
                    <p className="text-xs text-slate-500">Free. Send him from the Transfer Market.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {jobs.map((a) => {
                        const p = players[a.playerId];
                        if (!p) return null;
                        const total = Math.max(1, a.dueDay - a.startDay);
                        const done = Math.min(1, Math.max(0, (meta.currentDay - a.startDay) / total));
                        const left = Math.max(0, a.dueDay - meta.currentDay);
                        return (
                          <li key={a.playerId}>
                            <button
                              type="button"
                              className="w-full text-left rounded px-2 py-1.5 bg-surface-700 hover:bg-surface-600"
                              onClick={() => navigate(`/player/${p.id}`)}
                            >
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate">
                                  <span className="font-mono text-slate-400 mr-1.5">{p.position}</span>
                                  <span className="font-medium">{fullName(p)}</span>
                                </span>
                                <span className="text-xs text-slate-400 shrink-0">
                                  {left === 0 ? 'report due today' : `report in ${left} day${left === 1 ? '' : 's'}`}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">{clubOf(p)} · {ageOf(p, year)}</div>
                              <div className="h-1 bg-surface-800 rounded mt-1.5 overflow-hidden">
                                <div className="h-1 bg-sky-500 rounded" style={{ width: `${Math.round(done * 100)}%` }} />
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reports already in. */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Reports filed ({filed.length})</h2>
        {filed.length === 0 ? (
          <p className="text-sm text-slate-500">No reports yet. They appear here, and in your Inbox, when a scout gets back.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Name</th>
                  <th>Club</th>
                  <th className="text-right">Age</th>
                  <th className="text-right">OVR</th>
                  <th className="text-right">POT</th>
                  <th className="text-right">Value</th>
                  <th>Confidence</th>
                  <th className="text-right">Filed</th>
                </tr>
              </thead>
              <tbody>
                {filed.map((r) => {
                  const p = players[r.playerId];
                  const ago = Math.max(0, meta.currentDay - r.day);
                  return (
                    <tr key={r.playerId} className="cursor-pointer" onClick={() => navigate(`/player/${p.id}`)}>
                      <td className="font-mono text-slate-400">{p.position}</td>
                      <td className="font-medium whitespace-nowrap">{fullName(p)}</td>
                      <td className="whitespace-nowrap">{clubOf(p)}</td>
                      <td className="text-right">{ageOf(p, year)}</td>
                      <td className="text-right font-mono">~{r.estOverall}</td>
                      <td className="text-right font-mono text-accent-400">~{r.estPotential}</td>
                      <td className="text-right whitespace-nowrap">{formatMoney(r.estValue)}</td>
                      <td className="text-amber-400/80 whitespace-nowrap" title={`${r.scoutName}'s confidence`}>{stars(r.stars)}</td>
                      <td className="text-right text-xs text-slate-500 whitespace-nowrap">{ago === 0 ? 'today' : `${ago}d ago`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {legacyPlayers.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Earlier observations</h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pos</th><th>Name</th><th>Club</th>
                  <th className="text-right">OVR</th><th className="text-right">POT</th><th>Knowledge</th>
                </tr>
              </thead>
              <tbody>
                {legacyPlayers.map((p) => {
                  const rv = revealed(p, legacy[p.id] ?? 0);
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/player/${p.id}`)}>
                      <td className="font-mono text-slate-400">{p.position}</td>
                      <td className="font-medium">{fullName(p)}</td>
                      <td>{clubOf(p)}</td>
                      <td className="text-right font-mono">{rv.ovrText}</td>
                      <td className="text-right font-mono text-accent-400">{rv.potText}</td>
                      <td className="w-32">
                        <div className="h-1.5 bg-surface-700 rounded">
                          <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.round(rv.knowledge)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
