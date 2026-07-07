import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { DataTable, type Column } from '../components/DataTable';
import { Rating } from '../components/Rating';
import { MoneyInput } from '../components/MoneyInput';
import { ageOf, fullName, formatMoney, formatWage } from '../format';
import { marketView, eliteKnownIds, scoutStars, clubScoutRating, departmentStars, type MarketView } from '../../engine/marketScout';
import { negotiateFee, clubValuation, type FeeOffer } from '../../game/feeNegotiation';
import { agentDemands, evaluateContractOffer, type ContractOffer } from '../../game/contracts';
import type { Player, SquadRole } from '../../types/player';
import type { Staff } from '../../types/staff';
import { ALL_POSITIONS, POSITION_GROUP } from '../../types/attributes';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function TransferMarket() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);
  const managerClub = useGameStore((s) => s.managerClub())!;
  const assignMarketScout = useGameStore((s) => s.assignMarketScout);
  const loanIn = useGameStore((s) => s.loanIn);
  const acceptOffer = useGameStore((s) => s.acceptOffer);
  const rejectOffer = useGameStore((s) => s.rejectOffer);
  const counterOffer = useGameStore((s) => s.counterOffer);
  const breakOffTalks = useGameStore((s) => s.breakOffTalks);
  const transferWindow = useGameStore((s) => s.transferWindow);
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;

  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [leagueFilter, setLeagueFilter] = useState('ALL');
  const [minAge, setMinAge] = useState(15);
  const [maxAge, setMaxAge] = useState(40);
  const [minVal, setMinVal] = useState(0);
  const [maxVal, setMaxVal] = useState(0);
  const [minOvr, setMinOvr] = useState(0);
  const [minPot, setMinPot] = useState(0);
  const [maxWage, setMaxWage] = useState(0);
  const [foot, setFoot] = useState('ALL');
  const [avail, setAvail] = useState('ALL'); // ALL | LISTED | EXPIRING | FREE
  const [knownOnly, setKnownOnly] = useState(false);
  const [hideExpiring, setHideExpiring] = useState(false);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterVal, setCounterVal] = useState(0);

  const resetFilters = () => {
    setSearch(''); setPosFilter('ALL'); setLeagueFilter('ALL'); setMinAge(15); setMaxAge(40);
    setMinVal(0); setMaxVal(0); setMinOvr(0); setMinPot(0); setMaxWage(0); setFoot('ALL'); setAvail('ALL'); setKnownOnly(false); setHideExpiring(false);
  };
  const [target, setTarget] = useState<Player | null>(null);
  const [scoutFor, setScoutFor] = useState<Player | null>(null);
  const [loanTarget, setLoanTarget] = useState<Player | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4500); };

  const offers = meta.pendingOffers ?? [];
  const eliteIds = useMemo(() => eliteKnownIds(players, 50), [players]);

  // Clubs that broke off talks after an insulting bid refuse to negotiate again
  // until the window moves on (or ~a month passes when it was already shut).
  const winNow = transferWindow();
  const talksOff = (pid: string): boolean => {
    const b = meta.brokenTalks?.[pid];
    if (!b) return false;
    return b.key !== null ? winNow.key === b.key : meta.currentDay - b.day < 25;
  };
  const reports = meta.scoutReports ?? {};
  const assignments = meta.playerScoutAssignments ?? [];
  const assignedPlayerIds = useMemo(() => new Set(assignments.map((a) => a.playerId)), [assignments]);
  const scouts = (managerClub.staff ?? []).filter((s) => s.role === 'SCOUT');

  // Club id → league (competition) name, for the league filter.
  const leagueByClub = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of Object.values(meta.competitions)) for (const id of c.clubIds) m[id] = c.name;
    return m;
  }, [meta.competitions]);
  const leagueNames = useMemo(() => [...new Set(Object.values(leagueByClub))].sort(), [leagueByClub]);

  const scoutRating = useMemo(() => clubScoutRating(managerClub.staff), [managerClub.staff]);
  const viewOf = (p: Player): MarketView => marketView(p, { managerClubId: meta.managerClubId, eliteIds, report: reports[p.id], scoutRating });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { p: Player; v: MarketView }[] = [];
    for (const p of Object.values(players)) {
      if (p.contract.clubId === meta.managerClubId) continue;
      if (p.academyClubId && !p.contract.clubId) continue; // hidden academy prospects
      if (posFilter !== 'ALL') {
        if (['GK', 'DEF', 'MID', 'ATT'].includes(posFilter)) {
          if (POSITION_GROUP[p.position] !== posFilter) continue;
        } else if (p.position !== posFilter) continue;
      }
      const age = ageOf(p, year);
      if (age < minAge || age > maxAge) continue;
      if (leagueFilter !== 'ALL' && (p.contract.clubId ? leagueByClub[p.contract.clubId] : 'Free agents') !== leagueFilter) continue;
      if (q && !`${p.name.first} ${p.name.last}`.toLowerCase().includes(q)) continue;
      if (foot !== 'ALL' && p.preferredFoot !== foot) continue;
      if (maxWage > 0 && p.contract.wage > maxWage) continue;
      if (avail === 'FREE' && p.contract.clubId) continue;
      if (avail === 'LISTED' && !p.transferListed && !p.loanListed) continue;
      if (avail === 'EXPIRING' && !(p.contract.clubId && p.contract.expiresYear - year <= 1)) continue;
      if (hideExpiring && p.contract.clubId && p.contract.expiresYear - year <= 0) continue;
      const v = viewOf(p);
      if (minOvr > 0 && v.ovr < minOvr) continue;
      if (minPot > 0 && v.pot < minPot) continue;
      if (knownOnly && v.level !== 'REPORT' && v.level !== 'OWN' && v.level !== 'ELITE') continue;
      if (minVal > 0 && v.value < minVal) continue;
      if (maxVal > 0 && v.value > maxVal) continue;
      out.push({ p, v });
    }
    // Sort by shown (estimated) value, high to low.
    out.sort((a, b) => b.v.value - a.v.value);
    return out.slice(0, 250);
  }, [players, meta.managerClubId, posFilter, minAge, maxAge, leagueFilter, search, knownOnly, hideExpiring, minVal, maxVal, minOvr, minPot, maxWage, foot, avail, year, reports, eliteIds, leagueByClub, clubs, scoutRating]);

  const RatingCell = ({ v }: { v: MarketView }) => {
    if (v.exact) return <Rating value={v.ovr} />;
    return <span className="text-slate-300" title={`${v.level === 'REPORT' ? 'Scout report' : 'Department estimate'} (${v.stars}★ confidence)`}>{v.ovr}<span className="text-amber-400/70 text-[10px] ml-0.5">~{v.stars}★</span></span>;
  };

  const columns: Column<{ p: Player; v: MarketView }>[] = [
    { key: 'pos', header: 'Pos', render: ({ p }) => <span className="font-mono text-slate-400">{p.position}</span>, sortValue: ({ p }) => p.position },
    { key: 'name', header: 'Name', render: ({ p }) => fullName(p), sortValue: ({ p }) => p.name.last },
    { key: 'club', header: 'Club', render: ({ p }) => (p.contract.clubId ? clubs[p.contract.clubId]?.shortName : 'Free agent'), sortValue: ({ p }) => (p.contract.clubId ? clubs[p.contract.clubId]?.name ?? '' : '') },
    { key: 'age', header: 'Age', render: ({ p }) => ageOf(p, year), sortValue: ({ p }) => ageOf(p, year), align: 'right' },
    { key: 'ovr', header: 'OVR', render: ({ v }) => <RatingCell v={v} />, sortValue: ({ v }) => v.ovr ?? -1, align: 'right' },
    { key: 'pot', header: 'POT', render: ({ v }) => (v.exact ? <Rating value={v.pot} /> : <span className="text-slate-400">{v.pot}</span>), sortValue: ({ v }) => v.pot, align: 'right' },
    { key: 'val', header: 'Value', render: ({ v }) => <span className={v.exact ? '' : 'text-slate-400 italic'}>{formatMoney(v.value)}</span>, sortValue: ({ v }) => v.value, align: 'right' },
    { key: 'wage', header: 'Wage', render: ({ p }) => formatWage(p.contract.wage), sortValue: ({ p }) => p.contract.wage, align: 'right' },
    {
      key: 'act', header: '', align: 'right',
      render: ({ p, v }) => {
        const busy = assignedPlayerIds.has(p.id);
        return (
          <span className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {busy ? <span className="text-xs text-sky-400 px-2">scouting…</span>
              : v.level !== 'OWN' && v.level !== 'ELITE' && (
                <button className="btn-ghost py-0.5 px-2 text-xs" onClick={() => setScoutFor(p)}>{v.level === 'REPORT' ? 'Re-scout' : 'Scout'}</button>
              )}
            {talksOff(p.id)
              ? <span className="text-xs text-rose-400/80 px-2" title="They broke off talks after your last bid — wait for the next window">talks off</span>
              : <button className="btn-primary py-0.5 px-2 text-xs" onClick={() => setTarget(p)}>Bid</button>}
            {p.contract.clubId && (v.ovr ?? 0) < 74 && (
              <button className="btn-ghost py-0.5 px-2 text-xs" onClick={() => setLoanTarget(p)}>Loan</button>
            )}
          </span>
        );
      },
    },
  ];

  const win = winNow;
  const pending = meta.pendingArrivals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Transfer Market</h1>
        {meta.ffp?.embargo ? <span className="text-xs text-rose-400">⛔ Transfer embargo</span>
          : win.open ? <span className="text-xs text-emerald-400">{win.kind === 'WINTER' ? 'January' : 'Summer'} window open</span>
          : <span className="text-xs text-amber-400">Window shut · deals register in {win.nextLabel}</span>}
      </div>

      {!win.open && !meta.ffp?.embargo && (
        <div className="card p-3 text-xs text-amber-200/90 border border-amber-500/20">
          The window is shut. You can still agree deals now — the fee is paid and the player joins your club when the window reopens ({win.nextLabel}), staying with his current club until then.
        </div>
      )}

      {pending.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Agreed — arriving in {pending[0].arriveLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {pending.map((a) => (
              <span key={a.playerId} className="bg-surface-700 rounded px-3 py-1 text-sm">✔ {a.playerName} <span className="text-slate-500 text-xs">{formatMoney(a.fee)}</span></span>
            ))}
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Offers received ({offers.length})</h2>
          <div className="space-y-2">
            {offers.map((o) => {
              const p = players[o.playerId]; const from = clubs[o.fromClubId];
              if (!p) return null;
              return (
                <div key={o.id} className="bg-surface-700 rounded px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{fullName(p)}</span><span className="text-slate-500"> — {from?.shortName} </span>
                      {o.type === 'BUY' ? <span className="text-emerald-400">bid {formatMoney(o.fee)}</span>
                        : <span className="text-sky-400">loan until {o.loanUntilYear}</span>}
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary text-xs py-1" onClick={() => acceptOffer(o.id)}>Accept</button>
                      {o.type === 'BUY' && (
                        <button className="btn-ghost text-xs py-1" onClick={() => { setCounterFor(counterFor === o.id ? null : o.id); setCounterVal(Math.round(o.fee * 1.15)); }}>Negotiate</button>
                      )}
                      <button className="btn-ghost text-xs py-1" onClick={() => rejectOffer(o.id)}>Reject</button>
                    </div>
                  </div>
                  {counterFor === o.id && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-600">
                      <span className="text-xs text-slate-400">Ask for</span>
                      <input type="number" step={100000} className="bg-surface-800 border border-surface-600 rounded px-2 py-1 w-32 text-sm" value={counterVal} onChange={(e) => setCounterVal(Math.max(0, Number(e.target.value)))} />
                      <button className="btn-primary text-xs py-1" onClick={async () => { const r = await counterOffer(o.id, counterVal); flash(r); setCounterFor(null); }}>Send counter</button>
                      <span className="text-xs text-slate-500">they bid {formatMoney(o.fee)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scout summary */}
      <div className="card p-3 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-slate-300 font-semibold">Scouts</span>
        {scouts.length === 0 && <span>No scouts on your books — hire one on the Club screen.</span>}
        {scouts.map((s) => {
          const a = assignments.find((x) => x.scoutId === s.id);
          return <span key={s.id}>{s.name.last} <span className="text-amber-400/70">{stars(scoutStars(s))}</span>{a ? <span className="text-sky-400"> · out ({a.dueDay - meta.currentDay}d)</span> : <span className="text-emerald-400"> · available</span>}</span>;
        })}
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-x-3 gap-y-2 items-center text-sm">
        <input className="bg-surface-700 border border-surface-600 rounded px-3 py-1.5 w-52" placeholder="Search player…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
          <option value="ALL">All positions</option>
          <optgroup label="By line">
            {[['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['ATT', 'Attackers']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </optgroup>
          <optgroup label="Exact">
            {ALL_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </optgroup>
        </select>
        <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5 max-w-[12rem]" value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}>
          <option value="ALL">All leagues</option>
          {leagueNames.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="Free agents">Free agents</option>
        </select>
        <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={foot} onChange={(e) => setFoot(e.target.value)}>
          <option value="ALL">Any foot</option>
          <option value="R">Right</option>
          <option value="L">Left</option>
          <option value="B">Both</option>
        </select>
        <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={avail} onChange={(e) => setAvail(e.target.value)}>
          <option value="ALL">Any status</option>
          <option value="LISTED">Transfer/loan-listed</option>
          <option value="EXPIRING">Contract expiring (≤1y)</option>
          <option value="FREE">Free agents</option>
        </select>
        <label className="flex items-center gap-1"><span className="text-slate-400">Age</span>
          <input type="number" placeholder="min" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-16" value={minAge > 15 ? minAge : ''} onChange={(e) => setMinAge(Number(e.target.value) || 15)} />
          <span className="text-slate-600">–</span>
          <input type="number" placeholder="max" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-16" value={maxAge < 40 ? maxAge : ''} onChange={(e) => setMaxAge(Number(e.target.value) || 40)} />
        </label>
        <label className="flex items-center gap-1"><span className="text-slate-400">Min OVR</span>
          <input type="number" placeholder="0" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-16" value={minOvr || ''} onChange={(e) => setMinOvr(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1"><span className="text-slate-400">Min POT</span>
          <input type="number" placeholder="0" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-16" value={minPot || ''} onChange={(e) => setMinPot(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1"><span className="text-slate-400">Value</span>
          <input type="number" placeholder="min" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-24" value={minVal || ''} onChange={(e) => setMinVal(Number(e.target.value) || 0)} />
          <input type="number" placeholder="max" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-24" value={maxVal || ''} onChange={(e) => setMaxVal(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1"><span className="text-slate-400">Max wage</span>
          <input type="number" placeholder="/wk" className="bg-surface-700 border border-surface-600 rounded px-2 py-1 w-24" value={maxWage || ''} onChange={(e) => setMaxWage(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={knownOnly} onChange={(e) => setKnownOnly(e.target.checked)} /><span className="text-slate-400">Firm reads only</span></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hideExpiring} onChange={(e) => setHideExpiring(e.target.checked)} /><span className="text-slate-400">Hide expiring this season</span></label>
        <button className="btn-ghost text-xs py-1 px-2" onClick={resetFilters}>Reset</button>
        <span className="text-slate-500 ml-auto">{rows.length} shown</span>
      </div>

      <p className="text-xs text-slate-500">Every player in the world is visible. Figures you haven't confirmed are your scouting department's estimates (currently {departmentStars(scoutRating)}/5★ — better scouts read closer to the truth), so a weak department's read can be well off. Dispatch a scout for a sharper report before you bid.</p>

      <DataTable columns={columns} rows={rows} rowKey={({ p }) => p.id} onRowClick={({ p }) => navigate(`/player/${p.id}`)} initialSort={{ key: 'val', dir: 'desc' }} />

      {scoutFor && (
        <ScoutModal player={scoutFor} scouts={scouts} assignments={assignments} onClose={() => setScoutFor(null)}
          onAssign={async (scoutId) => { const r = await assignMarketScout(scoutId, scoutFor.id); flash(r.message); if (r.ok) setScoutFor(null); }} />
      )}

      {target && (
        <SigningModal player={target} buyer={managerClub} seller={target.contract.clubId ? clubs[target.contract.clubId] ?? null : null}
          view={viewOf(target)} year={year} onClose={() => setTarget(null)} flash={flash}
          onBreakOff={() => { void breakOffTalks(target.id); setTarget(null); }} />
      )}

      {loanTarget && (
        <LoanModal player={loanTarget} onClose={() => setLoanTarget(null)}
          onLoan={async (years, withOption) => { const r = await loanIn(loanTarget.id, years, withOption); flash(r.message); if (r.ok) setLoanTarget(null); }} />
      )}

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent max-w-sm">{toast}</div>}
    </div>
  );
}

// --- Scout dispatch --------------------------------------------------------
function ScoutModal({ player, scouts, assignments, onClose, onAssign }: {
  player: Player; scouts: Staff[]; assignments: { scoutId: string }[]; onClose: () => void; onAssign: (scoutId: string) => void;
}) {
  const busy = new Set(assignments.map((a) => a.scoutId));
  return (
    <Modal onClose={onClose} title={`Scout ${fullName(player)}`}>
      <p className="text-sm text-slate-400 mb-3">Send a scout to assess him. A higher-rated scout files a more accurate report.</p>
      {scouts.length === 0 && <p className="text-sm text-slate-500">You have no scouts. Hire one on the Club screen.</p>}
      <div className="space-y-2">
        {scouts.map((s) => {
          const isBusy = busy.has(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2 text-sm">
              <span>{s.name.first} {s.name.last} <span className="text-amber-400/70 ml-1">{stars(scoutStars(s))}</span></span>
              <button className="btn-primary text-xs py-1 disabled:opacity-40" disabled={isBusy} onClick={() => onAssign(s.id)}>{isBusy ? 'On assignment' : 'Send'}</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// --- Two-phase signing -----------------------------------------------------
function SigningModal({ player, buyer, seller, view, year, onClose, flash, onBreakOff }: {
  player: Player; buyer: import('../../types/club').Club; seller: import('../../types/club').Club | null;
  view: MarketView; year: number; onClose: () => void; flash: (m: string) => void;
  onBreakOff: () => void;
}) {
  const completeSigning = useGameStore((s) => s.completeSigning);
  const [phase, setPhase] = useState<'FEE' | 'TERMS'>(seller ? 'FEE' : 'TERMS');
  const [agreedFee, setAgreedFee] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  // Phase 1 — fee (default to the value the manager can see).
  const startFee = view.value ?? clubValuation(player, seller, buyer, year);
  const [offer, setOffer] = useState<FeeOffer>({ fee: startFee, instalmentYears: 1, sellOnPct: 0, addOns: 0 });
  const submitFee = () => {
    const r = negotiateFee(player, seller, buyer, offer, year);
    setMsg(r.message);
    if (r.outcome === 'ACCEPT') { setAgreedFee(offer.fee); setPhase('TERMS'); setMsg(null); }
    else if (r.outcome === 'COUNTER' && r.counterFee) setOffer({ ...offer, fee: r.counterFee });
    else if (r.outcome === 'REJECT') { flash(r.message); onBreakOff(); } // insulting — talks end
  };

  // Phase 2 — personal terms.
  const demands = useMemo(() => agentDemands(player, buyer, year), [player, buyer, year]);
  const [terms, setTerms] = useState<ContractOffer | null>(null);
  const activeTerms = terms ?? demands;
  const setT = <K extends keyof ContractOffer>(k: K, v: ContractOffer[K]) => setTerms({ ...activeTerms, [k]: v });
  const submitTerms = async () => {
    const r = evaluateContractOffer(player, buyer, activeTerms, year);
    setMsg(r.message);
    if (r.outcome === 'ACCEPT') {
      const done = await completeSigning(player.id, agreedFee, activeTerms);
      flash(done.message);
      if (done.ok) onClose();
    } else if (r.outcome === 'COUNTER' && r.counter) setTerms(r.counter);
  };

  const roles: SquadRole[] = ['KEY', 'FIRST', 'ROTATION', 'BACKUP'];
  return (
    <Modal onClose={onClose} title={`${phase === 'FEE' ? 'Bid for' : 'Personal terms —'} ${fullName(player)}`} wide>
      <p className="text-sm text-slate-400 mb-3">
        {player.position} · {seller ? seller.name : 'Free agent'} · {view.exact ? `OVR ${view.ovr}` : `estimated OVR ${view.ovr} (${view.stars}★)`}
      </p>

      <div className="flex gap-2 text-xs mb-3">
        <span className={`px-2 py-0.5 rounded ${phase === 'FEE' ? 'bg-accent text-white' : 'bg-surface-700 text-slate-400'}`}>1 · Club fee</span>
        <span className={`px-2 py-0.5 rounded ${phase === 'TERMS' ? 'bg-accent text-white' : 'bg-surface-700 text-slate-400'}`}>2 · Personal terms</span>
      </div>

      {phase === 'FEE' ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2"><span className="text-slate-400">Transfer fee (guaranteed)</span><MoneyInput value={offer.fee} onChange={(v) => setOffer({ ...offer, fee: v })} /></label>
          <label><span className="text-slate-400">Pay over (years)</span>
            <div className="flex gap-1 mt-1">{[1, 2, 3, 4].map((y) => <button key={y} className={offer.instalmentYears === y ? 'btn-primary px-2 py-0.5 text-xs' : 'btn-ghost px-2 py-0.5 text-xs'} onClick={() => setOffer({ ...offer, instalmentYears: y })}>{y}</button>)}</div>
          </label>
          <label><span className="text-slate-400">Sell-on clause: {offer.sellOnPct}%</span>
            <input type="range" min={0} max={40} step={5} value={offer.sellOnPct} onChange={(e) => setOffer({ ...offer, sellOnPct: Number(e.target.value) })} className="w-full" />
          </label>
          <label className="col-span-2"><span className="text-slate-400">Performance add-ons</span><MoneyInput value={offer.addOns} onChange={(v) => setOffer({ ...offer, addOns: v })} /></label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2"><span className="text-slate-400">Weekly wage (wants {formatWage(demands.wage)})</span><MoneyInput value={activeTerms.wage} onChange={(v) => setT('wage', v)} /></label>
          <label><span className="text-slate-400">Length</span>
            <div className="flex gap-1 mt-1 flex-wrap">{[1, 2, 3, 4, 5].map((y) => <button key={y} className={activeTerms.years === y ? 'btn-primary px-2 py-0.5 text-xs' : 'btn-ghost px-2 py-0.5 text-xs'} onClick={() => setT('years', y)}>{y}y</button>)}</div>
          </label>
          <label><span className="text-slate-400">Squad status (wants {demands.squadRole})</span>
            <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1" value={activeTerms.squadRole} onChange={(e) => setT('squadRole', e.target.value as SquadRole)}>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={activeTerms.releaseClause != null} onChange={(e) => setT('releaseClause', e.target.checked ? (demands.releaseClause ?? Math.round(player.value * 2)) : null)} /><span className="text-slate-400">Release clause</span>{activeTerms.releaseClause != null && <span className="flex-1"><MoneyInput value={activeTerms.releaseClause} onChange={(v) => setT('releaseClause', v)} /></span>}</label>
          <label><span className="text-slate-400">Signing bonus</span><MoneyInput value={activeTerms.signingBonus} onChange={(v) => setT('signingBonus', v)} /></label>
          <label><span className="text-slate-400">Goal bonus</span><MoneyInput value={activeTerms.goalBonus} onChange={(v) => setT('goalBonus', v)} /></label>
        </div>
      )}

      {msg && <p className="text-sm text-amber-300 mt-3">{msg}</p>}
      <div className="flex justify-between items-center gap-2 mt-4">
        <span className="text-xs text-slate-500">{phase === 'TERMS' && agreedFee > 0 ? `Fee agreed: ${formatMoney(agreedFee)}` : ''}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          {phase === 'FEE'
            ? <button className="btn-primary" onClick={submitFee}>Submit bid</button>
            : <button className="btn-primary" onClick={submitTerms}>Offer terms</button>}
        </div>
      </div>
    </Modal>
  );
}

function LoanModal({ player, onClose, onLoan }: { player: Player; onClose: () => void; onLoan: (years: number, withOption: boolean) => void }) {
  const [years, setYears] = useState(1);
  const [withOption, setWithOption] = useState(false);
  return (
    <Modal onClose={onClose} title={`Loan ${fullName(player)}`}>
      <p className="text-sm text-slate-400 mb-4">{player.position} · wages split 50/50 with the parent club</p>
      <label className="block text-sm mb-4"><span className="text-slate-400">Loan length</span>
        <div className="flex gap-2 mt-1">{[1, 2].map((y) => <button key={y} className={years === y ? 'btn-primary' : 'btn-ghost'} onClick={() => setYears(y)}>{y} {y === 1 ? 'year' : 'years'}</button>)}</div>
      </label>
      <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" checked={withOption} onChange={(e) => setWithOption(e.target.checked)} /><span className="text-slate-300">Negotiate an option to buy (~{(player.value * 1.1).toLocaleString()})</span></label>
      <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onLoan(years, withOption)}>Request loan</button></div>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`card p-5 w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">{title}</h2>
        {children}
      </div>
    </div>
  );
}
