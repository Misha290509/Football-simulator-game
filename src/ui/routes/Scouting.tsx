import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { fullName, ageOf, formatMoney } from '../format';
import { revealed } from '../../engine/scouting';

export function Scouting() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;

  const scouting = meta.scouting ?? {};
  const scouted = Object.keys(scouting)
    .map((id) => players[id])
    .filter(Boolean)
    .sort((a, b) => (scouting[b.id] ?? 0) - (scouting[a.id] ?? 0));

  return (
    <div className="space-y-4">
      <h1 className="page-title">Scouting</h1>
      <p className="text-sm text-slate-500">
        Assign targets from the Transfer Market or a player's profile. Knowledge
        grows as your scouts watch them, tightening the rating ranges. Better
        scouts learn faster.
      </p>

      {scouted.length === 0 ? (
        <div className="card p-6 text-center text-slate-500">
          No players under observation yet. Open a player and press “Scout”.
        </div>
      ) : (
        <div className="overflow-x-auto card">
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
                <th>Knowledge</th>
              </tr>
            </thead>
            <tbody>
              {scouted.map((p) => {
                const r = revealed(p, scouting[p.id] ?? 0);
                return (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/player/${p.id}`)}>
                    <td className="font-mono text-slate-400">{p.position}</td>
                    <td className="font-medium">{fullName(p)}</td>
                    <td>{p.contract.clubId ? clubs[p.contract.clubId]?.shortName : 'Free agent'}</td>
                    <td className="text-right">{ageOf(p, year)}</td>
                    <td className="text-right font-mono">{r.ovrText}</td>
                    <td className="text-right font-mono text-accent-400">{r.potText}</td>
                    <td className="text-right">{formatMoney(p.value)}</td>
                    <td className="w-32">
                      <div className="h-1.5 bg-surface-700 rounded">
                        <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.round(r.knowledge)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
