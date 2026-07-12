import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { Rating } from '../components/Rating';
import { MoneyInput } from '../components/MoneyInput';
import { ageOf, fullName, formatWage, formatMoney } from '../format';
import type { Player, SquadRole } from '../../types/player';
import type { ContractOffer } from '../../game/contracts';

const ROLES: SquadRole[] = ['KEY', 'FIRST', 'ROTATION', 'BACKUP'];

/**
 * Contract-expiry / Bosman hub. Surfaces your own players heading toward the end
 * of their deals (renew or risk losing them for nothing), plus the best players
 * across the world entering their final year or already free — pre-contract
 * targets a shrewd, budget-tight club lives on.
 */
export function Contracts() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const allPlayers = useGameStore((s) => s.players);
  const managerClub = useGameStore((s) => s.managerClub())!;
  const squad = useGameStore((s) => s.getClubPlayers(managerClub.id));
  const triggerLoanOption = useGameStore((s) => s.triggerLoanOption);
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;

  const [renewFor, setRenewFor] = useState<Player | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4500); };

  const yearsLeft = (p: Player) => p.contract.expiresYear - year;

  // Loanees sit in your squad but you don't own their contract — you can only
  // buy them (if an option was agreed), never renew. Keep them out of the renew
  // list and give them their own section.
  const loanees = useMemo(() => squad.filter((p) => p.loan), [squad]);

  // Your OWNED players, nearest expiry first — final-year men are the urgent ones.
  const expiring = useMemo(
    () => squad
      .filter((p) => !p.loan && yearsLeft(p) <= 2)
      .sort((a, b) => yearsLeft(a) - yearsLeft(b) || b.overall - a.overall),
    [squad, year],
  );

  // Bosman board: the best players elsewhere in their final year, or already
  // free — sign them for nothing (frees) or cheaply (expiring) via the market.
  const bosman = useMemo(
    () => Object.values(allPlayers)
      .filter((p) => p.contract.clubId !== managerClub.id && (p.contract.clubId === null || yearsLeft(p) <= 1) && !p.academyClubId)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 40),
    [allPlayers, managerClub.id, year],
  );

  const leftBadge = (n: number) =>
    n <= 0 ? <span className="text-rose-400 font-semibold">expired</span>
      : n === 1 ? <span className="text-amber-400 font-semibold">final year</span>
      : <span className="text-slate-400">{n} yrs</span>;

  return (
    <div className="space-y-5">
      <h1 className="page-title">Contracts</h1>

      {/* Your expiring deals */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Your expiring contracts</h2>
          <span className="text-xs text-slate-500">Renew before the final year or lose them on a free.</span>
        </div>
        {expiring.length === 0 ? (
          <p className="text-sm text-slate-500">No one is within two years of the end of their deal. Nicely tied down.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Pos</th><th>Name</th><th className="text-right">Age</th>
                  <th className="text-right">OVR</th><th className="text-right">Wage</th>
                  <th>Expires</th><th></th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((p) => (
                  <tr key={p.id} className={yearsLeft(p) <= 1 ? 'bg-amber-500/5' : ''}>
                    <td className="font-mono text-slate-400">{p.position}</td>
                    <td className="font-medium cursor-pointer hover:underline" onClick={() => navigate(`/player/${p.id}`)}>{fullName(p)}</td>
                    <td className="text-right">{ageOf(p, year)}</td>
                    <td className="text-right"><Rating value={p.overall} /></td>
                    <td className="text-right font-mono text-slate-400">{formatWage(p.contract.wage)}</td>
                    <td>{p.contract.expiresYear} <span className="ml-1 text-xs">({leftBadge(yearsLeft(p))})</span></td>
                    <td className="text-right"><button className="btn-primary text-xs py-0.5 px-2" onClick={() => setRenewFor(p)}>Renew</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Loan players — owned by another club; buy option, not renewal */}
      {loanees.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-400">On loan at your club</h2>
            <span className="text-xs text-slate-500">You don't hold their contract — trigger the buy option to sign them for good.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Pos</th><th>Name</th><th className="text-right">Age</th>
                  <th className="text-right">OVR</th><th className="text-right">Wage</th>
                  <th>From</th><th>Loan until</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loanees.map((p) => (
                  <tr key={p.id} className="bg-sky-500/5">
                    <td className="font-mono text-slate-400">{p.position}</td>
                    <td className="font-medium cursor-pointer hover:underline" onClick={() => navigate(`/player/${p.id}`)}>
                      {fullName(p)} <span className="ml-1 text-[10px] uppercase tracking-wide text-sky-400 border border-sky-500/30 rounded px-1 py-0.5">Loan</span>
                    </td>
                    <td className="text-right">{ageOf(p, year)}</td>
                    <td className="text-right"><Rating value={p.overall} /></td>
                    <td className="text-right font-mono text-slate-400">{formatWage(p.contract.wage)}</td>
                    <td className="text-slate-400">{p.loan ? clubs[p.loan.parentClubId]?.shortName ?? '—' : '—'}</td>
                    <td className="text-slate-400">{p.loan?.untilYear ?? '—'}</td>
                    <td className="text-right">
                      {p.loan?.optionToBuy != null ? (
                        <button
                          className="btn-primary text-xs py-0.5 px-2"
                          onClick={async () => flash((await triggerLoanOption(p.id)).message)}
                        >
                          Activate buy option ({formatMoney(p.loan.optionToBuy)})
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500" title="This loan was agreed without an option to buy.">No buy option</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bosman board */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Pre-contract &amp; free-agent targets</h2>
          <button className="text-xs text-accent-400 hover:underline" onClick={() => navigate('/transfers')}>Open transfer market ▸</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Players in their final year (cheap now, free next summer) or already without a club. Bid for them on the Transfers screen.
        </p>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Pos</th><th>Name</th><th>Club</th><th className="text-right">Age</th>
                <th className="text-right">OVR</th><th className="text-right">Wage</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bosman.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-700" onClick={() => navigate(`/player/${p.id}`)}>
                  <td className="font-mono text-slate-400">{p.position}</td>
                  <td className="font-medium">{fullName(p)}</td>
                  <td className="text-slate-400">{p.contract.clubId ? clubs[p.contract.clubId]?.shortName ?? '—' : 'Free agent'}</td>
                  <td className="text-right">{ageOf(p, year)}</td>
                  <td className="text-right"><Rating value={p.overall} /></td>
                  <td className="text-right font-mono text-slate-400">{formatWage(p.contract.wage)}</td>
                  <td>{p.contract.clubId === null ? <span className="text-emerald-400">free</span> : leftBadge(yearsLeft(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {renewFor && <RenewModal player={renewFor} onClose={() => setRenewFor(null)} flash={flash} />}
      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent max-w-sm">{toast}</div>}
    </div>
  );
}

function RenewModal({ player, onClose, flash }: {
  player: Player; onClose: () => void; flash: (m: string) => void;
}) {
  const contractDemands = useGameStore((s) => s.contractDemands);
  const offerContract = useGameStore((s) => s.offerContract);
  const demands = useMemo(() => contractDemands(player.id), [player.id, contractDemands]);
  const [terms, setTerms] = useState<ContractOffer | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!demands) return null;
  const active = terms ?? demands;
  const setT = <K extends keyof ContractOffer>(k: K, v: ContractOffer[K]) => setTerms({ ...active, [k]: v });

  const submit = async () => {
    const r = await offerContract(player.id, active);
    setMsg(r.message);
    if (r.outcome === 'ACCEPT') { flash(`${player.name.last} signs a new deal!`); onClose(); }
    else if (r.outcome === 'COUNTER' && r.counter) setTerms(r.counter);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Renew — {fullName(player)}</h2>
        <p className="text-sm text-slate-400 mb-3">{player.position} · expires {player.contract.expiresYear} · currently {formatWage(player.contract.wage)}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2"><span className="text-slate-400">Weekly wage (wants {formatWage(demands.wage)})</span><MoneyInput value={active.wage} onChange={(v) => setT('wage', v)} /></label>
          <label><span className="text-slate-400">Length</span>
            <div className="flex gap-1 mt-1 flex-wrap">{[1, 2, 3, 4, 5].map((y) => <button key={y} className={active.years === y ? 'btn-primary px-2 py-0.5 text-xs' : 'btn-ghost px-2 py-0.5 text-xs'} onClick={() => setT('years', y)}>{y}y</button>)}</div>
          </label>
          <label><span className="text-slate-400">Squad status (wants {demands.squadRole})</span>
            <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1" value={active.squadRole} onChange={(e) => setT('squadRole', e.target.value as SquadRole)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
        </div>
        {msg && <p className="text-sm text-amber-300 mt-3">{msg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={submit}>Offer new deal</button>
        </div>
      </div>
    </div>
  );
}
