import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { formatMoney, formatWage } from '../format';
import { FACILITY_UPGRADE_COST, evaluateStaffTerms } from '../../engine/staff';
import { TRAIT_INFO } from '../../game/clubTraits';
import type { Staff, StaffRole, TrainingFocus } from '../../types/staff';

const FOCI: TrainingFocus[] = ['BALANCED', 'ATTACKING', 'DEFENDING', 'FITNESS', 'YOUTH'];
const ROLE_LABEL: Record<StaffRole, string> = {
  ASSISTANT: 'Assistant Manager',
  COACH: 'Coach',
  SCOUT: 'Scout',
  PHYSIO: 'Physio',
  YOUTH_COACH: 'Youth Coach',
};
// Display order for the grouped staff sections.
const ROLE_ORDER: StaffRole[] = ['ASSISTANT', 'COACH', 'YOUTH_COACH', 'SCOUT', 'PHYSIO'];

export function Club() {
  const meta = useGameStore((s) => s.meta)!;
  const club = useGameStore((s) => s.managerClub())!;
  const hireStaff = useGameStore((s) => s.hireStaff);
  const fireStaff = useGameStore((s) => s.fireStaff);
  const renegotiateStaff = useGameStore((s) => s.renegotiateStaff);
  const refreshStaffMarket = useGameStore((s) => s.refreshStaffMarket);
  const upgradeFacility = useGameStore((s) => s.upgradeFacility);
  const setTrainingFocus = useGameStore((s) => s.setTrainingFocus);
  const expandStadium = useGameStore((s) => s.expandStadium);
  const setTicketLevel = useGameStore((s) => s.setTicketLevel);
  const [toast, setToast] = useState<string | null>(null);
  const [seats, setSeats] = useState(5000);
  const [negotiating, setNegotiating] = useState<{ staff: Staff; mode: 'hire' | 'renew' } | null>(null);

  const transferWindow = useGameStore((s) => s.transferWindow);
  const fac = club.facilities ?? { academy: 2, training: 2 };
  const staff = club.staff ?? [];
  const year = useGameStore((s) => s.currentSeason()?.year) ?? meta.startYear;
  const market = meta.staffMarket ?? [];
  const win = transferWindow();
  const windowOpen = win.open;
  const usedRefreshes = win.key && meta.staffRefreshes?.windowKey === win.key ? meta.staffRefreshes.used : 0;
  const refreshesLeft = Math.max(0, 3 - usedRefreshes);

  // Seed the staff market once if this save has never had one.
  useEffect(() => {
    if (!meta.staffMarket) void refreshStaffMarket();
  }, [meta.staffMarket, refreshStaffMarket]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Club &amp; Backroom</h1>

      {/* Infrastructure & Financial Fair Play */}
      {club.owner && (
        <div className="card p-4 border border-amber-500/30">
          <div className="flex items-center gap-2">
            <span className="text-lg">{club.owner.wealth === 'SUPER_RICH' ? '💎' : '💰'}</span>
            <div>
              <div className="text-sm font-semibold text-amber-300">{club.owner.wealth === 'SUPER_RICH' ? 'Super-rich ownership' : 'Wealthy ownership'}</div>
              <div className="text-xs text-slate-500">Under ambitious owners since {club.owner.since} — the coffers are topped up every summer.</div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Infrastructure &amp; finances</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-sm">Stadium capacity: <strong>{club.stadium.capacity.toLocaleString()}</strong></div>
            <div className="text-xs text-slate-500 mb-2">Expanding raises match-day income (~£3,500/seat).</div>
            <div className="flex items-center gap-2">
              <input type="number" min={0} step={1000} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value)))}
                className="w-28 bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm" />
              <span className="text-xs text-slate-500">≈ {(seats * 3500).toLocaleString()}</span>
              <button className="btn-primary text-sm" onClick={async () => flash((await expandStadium(seats)).message)}>Expand</button>
            </div>
          </div>
          <div>
            {(() => {
              const level = club.ticketLevel ?? 50;
              const label = level < 33 ? 'Cheap — fans love it, less income' : level < 67 ? 'Standard' : 'Premium — more income, fans grumble';
              return (
                <div className="mb-3">
                  <div className="text-sm">Ticket pricing <span className="text-slate-500 text-xs">· {label}</span></div>
                  <input type="range" min={0} max={100} step={5} value={level} onChange={(e) => void setTicketLevel(Number(e.target.value))} className="w-full mt-1" />
                  <div className="flex justify-between text-[9px] text-slate-600"><span>Cheap</span><span>Standard</span><span>Premium</span></div>
                </div>
              );
            })()}
            <div className="text-sm">Financial Fair Play</div>
            {meta.ffp?.embargo ? (
              <div className="text-xs text-rose-300 mt-1">⛔ Transfer embargo in force — you cannot sign players this season.</div>
            ) : (meta.ffp?.strikes ?? 0) > 0 ? (
              <div className="text-xs text-amber-300 mt-1">⚠ On notice ({meta.ffp!.strikes} strike{meta.ffp!.strikes > 1 ? 's' : ''}) — keep wages under 75% of revenue.</div>
            ) : (
              <div className="text-xs text-emerald-300 mt-1">✓ Compliant — wages within FFP limits.</div>
            )}
            {(meta.pointsPenalties?.[club.id] ?? 0) > 0 && (
              <div className="text-xs text-rose-300 mt-1">−{meta.pointsPenalties![club.id]} point deduction active this season.</div>
            )}
          </div>
        </div>
      </div>

      {club.traits && club.traits.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Club DNA</h2>
          <div className="flex flex-wrap gap-3">
            {club.traits.map((t) => (
              <div key={t} className="bg-surface-700 rounded px-3 py-2 max-w-xs">
                <div className="font-medium text-accent-400">{TRAIT_INFO[t].label}</div>
                <div className="text-xs text-slate-400">{TRAIT_INFO[t].blurb}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            A club's reputation in big moments shapes how it performs in specific competitions.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Facilities</h2>
          {(['academy', 'training'] as const).map((which) => (
            <div key={which} className="flex items-center justify-between py-2 border-b border-surface-700 last:border-0">
              <div>
                <div className="capitalize font-medium">{which}</div>
                <div className="text-xs text-slate-500">Level {fac[which]} / 5</div>
              </div>
              <button
                className="btn-ghost text-xs"
                disabled={fac[which] >= 5}
                onClick={async () => flash(await upgradeFacility(which))}
              >
                {fac[which] >= 5 ? 'Max' : `Upgrade (${formatMoney(FACILITY_UPGRADE_COST(fac[which]))})`}
              </button>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Training focus</h2>
          <div className="flex flex-wrap gap-2">
            {FOCI.map((f) => (
              <button
                key={f}
                className={club.trainingFocus === f ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setTrainingFocus(f)}
              >
                {f[0] + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Coaching quality &amp; the training facility accelerate player development;
            a Youth focus nudges prospects on faster.
          </p>
        </div>
      </div>

      {/* Current backroom staff, grouped by role */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Backroom staff</h2>
          <span className="text-xs text-slate-500">Wage bill {formatWage(staff.reduce((s, x) => s + (x.wage ?? 0), 0))}/wk</span>
        </div>
        <div className="space-y-3">
          {ROLE_ORDER.map((role) => {
            const list = staff.filter((s) => s.role === role).sort((a, b) => b.rating - a.rating);
            return (
              <div key={role}>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">{ROLE_LABEL[role]}s <span className="text-slate-600">({list.length})</span></div>
                {list.length === 0 ? (
                  <div className="text-xs text-slate-600 italic px-1">None — hire one below.</div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {list.map((s) => (
                      <div key={s.id} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2 text-sm gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{s.name.first} {s.name.last} <span className="font-mono text-accent-400 ml-1">{s.rating}</span></div>
                          <div className="text-xs text-slate-500">{formatWage(s.wage)} · until {s.expiresYear ?? year + 1}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button className="btn-ghost text-xs py-0.5 px-2" onClick={() => setNegotiating({ staff: s, mode: 'renew' })}>Negotiate</button>
                          <button className="btn-ghost text-xs py-0.5 px-2 text-rose-300" onClick={async () => { if (confirm(`Sack ${s.name.last}? You'll pay up the rest of his contract.`)) flash(await fireStaff(s.id)); }}>Fire</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff market, grouped by role */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Staff market {windowOpen ? <span className="text-emerald-400 text-xs ml-1">open</span> : <span className="text-slate-500 text-xs ml-1">shut</span>}</h2>
          <button className="btn-ghost text-xs disabled:opacity-40" disabled={!windowOpen || refreshesLeft <= 0} onClick={async () => flash(await refreshStaffMarket())}>↻ Refresh ({refreshesLeft} left)</button>
        </div>
        {!windowOpen && <p className="text-xs text-amber-300 mb-3">The staff market is shut. You can hire and refresh candidates during the summer and January transfer windows. You can still fire or renew your own staff any time.</p>}
        <div className="space-y-3">
          {ROLE_ORDER.map((role) => {
            const list = market.filter((s) => s.role === role).sort((a, b) => b.rating - a.rating);
            if (list.length === 0) return null;
            return (
              <div key={role}>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">{ROLE_LABEL[role]}s</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {list.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2 text-sm gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.name.first} {s.name.last} <span className="font-mono text-accent-400 ml-1">{s.rating}</span></div>
                        <div className="text-xs text-slate-500">wants ~{formatWage(s.wage)}</div>
                      </div>
                      <button className="btn-primary text-xs py-0.5 px-2 shrink-0 disabled:opacity-40" disabled={!windowOpen} onClick={() => setNegotiating({ staff: s, mode: 'hire' })}>Negotiate</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {market.length === 0 && <p className="text-xs text-slate-500">Sourcing candidates…</p>}
        </div>
        <p className="text-xs text-slate-500 mt-2">Coaching &amp; scouting quality lifts development, injury recovery and scout accuracy. Refreshing sources a new set of candidates.</p>
      </div>

      {negotiating && (
        <NegotiateModal
          entry={negotiating}
          year={year}
          onClose={() => setNegotiating(null)}
          onSubmit={async (wage, years) => {
            const r = negotiating.mode === 'hire'
              ? await hireStaff(negotiating.staff, { wage, years })
              : await renegotiateStaff(negotiating.staff.id, wage, years);
            flash(r);
            if (!r.includes('wants at least')) setNegotiating(null); // close unless rejected
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>
      )}
    </div>
  );
}

function NegotiateModal({ entry, year, onClose, onSubmit }: {
  entry: { staff: Staff; mode: 'hire' | 'renew' };
  year: number;
  onClose: () => void;
  onSubmit: (wage: number, years: number) => void;
}) {
  const { staff, mode } = entry;
  const [years, setYears] = useState(2);
  const wants = evaluateStaffTerms(staff, 0, years).wants;
  const [wage, setWage] = useState(mode === 'renew' ? Math.max(staff.wage, wants) : wants);
  const ok = wage >= wants;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{mode === 'hire' ? 'Hire' : 'Renew'} — {staff.name.first} {staff.name.last}</h2>
        <p className="text-sm text-slate-400 mb-4">{ROLE_LABEL[staff.role]} · rating {staff.rating} · he wants around {formatWage(wants)} over {years} year{years > 1 ? 's' : ''}.</p>

        <label className="block text-sm mb-3">
          <span className="text-slate-400">Weekly wage</span>
          <input type="number" step={100} className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={wage} onChange={(e) => setWage(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="block text-sm mb-4">
          <span className="text-slate-400">Contract length</span>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3, 4].map((y) => (
              <button key={y} className={years === y ? 'btn-primary px-3 py-0.5 text-xs' : 'btn-ghost px-3 py-0.5 text-xs'} onClick={() => setYears(y)}>{y}y</button>
            ))}
          </div>
        </label>

        <div className="text-xs mb-3">
          {ok ? <span className="text-emerald-300">He'll accept these terms.</span> : <span className="text-amber-300">Below his expectations — he wants at least {formatWage(wants)}.</span>}
          <span className="text-slate-500"> Signed until {year + years}.</span>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSubmit(wage, years)}>{mode === 'hire' ? 'Offer & hire' : 'Offer terms'}</button>
        </div>
      </div>
    </div>
  );
}
