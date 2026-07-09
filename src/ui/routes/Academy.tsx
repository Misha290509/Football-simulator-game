import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { Rating } from '../components/Rating';
import { ageOf, fullName, formatWage, formatMoney } from '../format';
import { revealed } from '../../engine/scouting';
import { Rng } from '../../engine/rng';
import { PHILOSOPHIES, COUNTRY_NAMES, COUNTRY_YOUTH_INDEX } from '../../data/academyData';
import { recommendsPlayUp, ACADEMY_UPGRADE_COST, generateYouthCoachPool } from '../../engine/academy';
import { MAX_SCOUT_POSITIONS, SCOUT_CONTRACT_MONTHS, SCOUT_CONTRACT_COST } from '../../engine/youthScouting';
import { ALL_POSITIONS } from '../../types/attributes';
import type { AgeGroup } from '../../types/academy';

const GROUPS: AgeGroup[] = ['U16', 'U18', 'U21'];
const COUNTRIES = Object.keys(COUNTRY_YOUTH_INDEX);
const FACILITY_LABEL: Record<string, string> = {
  training: 'Training', coaching: 'Coaching', medical: 'Medical', recruitment: 'Recruitment',
};

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-400 text-lg" title={`${n} / 5 stars`}>
      {'★'.repeat(n)}<span className="text-slate-600">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function Academy() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const club = useGameStore((s) => s.managerClub())!;
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);
  const setPlayUp = useGameStore((s) => s.setPlayUp);
  const setHoldBack = useGameStore((s) => s.setHoldBack);
  const dispatchScout = useGameStore((s) => s.dispatchScout);
  const recallScout = useGameStore((s) => s.recallScout);
  const trialProspect = useGameStore((s) => s.trialProspect);
  const signYouthProspect = useGameStore((s) => s.signYouthProspect);
  const upgradeAcademyFacility = useGameStore((s) => s.upgradeAcademyFacility);
  const hireYouthCoach = useGameStore((s) => s.hireYouthCoach);
  const setMentor = useGameStore((s) => s.setMentor);
  const offerProfessionalTerms = useGameStore((s) => s.offerProfessionalTerms);
  const releaseAcademyPlayer = useGameStore((s) => s.releaseAcademyPlayer);
  const season = useGameStore((s) => s.currentSeason());
  const year = season?.year ?? meta.startYear;
  const [tab, setTab] = useState<'overview' | 'squads' | 'scouting' | 'competitions' | 'history'>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };
  // Dispatch form state.
  const [scoutId, setScoutId] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [country, setCountry] = useState('ES');
  const [months, setMonths] = useState(3);
  // Youth-coach wage negotiation: per-candidate offers. Walk-aways persist in
  // the save (meta.walkedStaff), so an insulted coach stays gone.
  const [coachOffer, setCoachOffer] = useState<Record<string, number>>({});
  const walkedStaff = meta.walkedStaff ?? {};

  const academy = meta.academies?.[club.id];
  const academyPlayers = meta.academyPlayers ?? {};

  const roster = useMemo(
    () =>
      Object.values(academyPlayers)
        .filter((ap) => ap.clubId === club.id && players[ap.playerId])
        .map((ap) => ({ ap, player: players[ap.playerId] }))
        .sort((a, b) => b.player.potential - a.player.potential),
    [academyPlayers, players, club.id],
  );

  const coaches = (club.staff ?? []).filter((s) => academy?.youthCoachIds.includes(s.id));

  // A small rotating youth-coach market (regenerated each visit; not persisted).
  const coachMarket = useMemo(
    () => generateYouthCoachPool(4, new Rng(meta.seed ^ (meta.currentDay + 401))),
    [meta.seed, meta.currentDay],
  );

  // Eligible mentors: veteran first-teamers aged 33 or older.
  const mentors = useMemo(
    () => Object.values(players)
      .filter((p) => p.contract.clubId === club.id && (year - p.born.year) >= 33)
      .sort((a, b) => (b.hidden?.professionalism ?? 0) - (a.hidden?.professionalism ?? 0))
      .slice(0, 12),
    [players, club.id, year],
  );

  if (!academy) {
    return <div className="card p-6 text-slate-400">This club has no academy data yet.</div>;
  }

  const phil = PHILOSOPHIES[academy.philosophyId];
  const byGroup = (g: AgeGroup) => roster.filter((r) => r.ap.ageGroup === g);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Academy</h1>
        <div className="flex gap-1">
          {(['overview', 'squads', 'scouting', 'competitions', 'history'] as const).map((t) => (
            <button key={t} className={tab === t ? 'btn-primary capitalize' : 'btn-ghost capitalize'} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Academy rating</div>
              <Stars n={academy.rating} />
              <div className="text-xs text-slate-500 mt-2">Reputation</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-surface-700 rounded"><div className="h-2 rounded bg-accent" style={{ width: `${academy.reputation}%` }} /></div>
                <span className="font-mono text-sm">{academy.reputation}</span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Philosophy</div>
              <div className="font-semibold text-accent-400">{phil?.name ?? academy.philosophyId}</div>
              <p className="text-xs text-slate-400 mt-1">{phil?.description}</p>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Prospects</div>
              <div className="text-3xl font-bold">{roster.length}</div>
              <div className="text-xs text-slate-500 mt-1">{GROUPS.map((g) => `${g}: ${byGroup(g).length}`).join(' · ')}</div>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Facilities</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['training', 'coaching', 'medical', 'recruitment'] as const).map((f) => (
                <div key={f} className="bg-surface-700 rounded px-3 py-2">
                  <div className="text-sm font-medium">{FACILITY_LABEL[f]}</div>
                  <div className="text-xs text-slate-500 mb-2">Level {academy.facilities[f]} / 5</div>
                  <button
                    className="btn-ghost text-xs w-full"
                    disabled={academy.facilities[f] >= 5}
                    onClick={async () => flash((await upgradeAcademyFacility(f)).message)}
                  >
                    {academy.facilities[f] >= 5 ? 'Max' : `Upgrade (${formatMoney(ACADEMY_UPGRADE_COST(academy.facilities[f]))})`}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">Training &amp; coaching speed development; medical cuts youth injuries; recruitment widens intake reach.</p>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Youth coaches</h2>
            {coaches.length === 0 ? (
              <p className="text-sm text-slate-500">No youth coaches on the books.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {coaches.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{c.name.first} {c.name.last}</div>
                      <div className="text-xs text-slate-500">Youth Coach · {formatWage(c.wage)}</div>
                    </div>
                    <span className="font-mono font-semibold text-accent-400">{c.rating}</span>
                  </div>
                ))}
              </div>
            )}
            {academy.youthCoachIds.length < 5 && (
              <>
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mt-4 mb-2">
                  Available to hire <span className="normal-case text-slate-600">— offer any wage; lowball at your own risk</span>
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {coachMarket.filter((c) => !academy.youthCoachIds.includes(c.id) && walkedStaff[c.id] === undefined).map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 bg-surface-700 rounded px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name.first} {c.name.last}</div>
                        <div className="text-xs text-slate-500">rating {c.rating} · asks {formatWage(c.wage)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" step={100} aria-label="Wage offer"
                          className="w-24 bg-surface-800 border border-surface-600 rounded px-2 py-1 text-xs"
                          value={coachOffer[c.id] ?? c.wage}
                          onChange={(e) => setCoachOffer({ ...coachOffer, [c.id]: Math.max(0, Number(e.target.value)) })}
                        />
                        <button
                          className="btn-primary text-xs"
                          onClick={async () => flash((await hireYouthCoach(c, coachOffer[c.id] ?? c.wage)).message)}
                        >Offer</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'squads' && (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const rows = byGroup(g);
            return (
              <div key={g} className="card p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">{g} <span className="text-slate-600">({rows.length})</span></h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-500">No players in this age group.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th>Pos</th><th>Name</th><th className="text-right">Age</th>
                          <th className="text-right">OVR</th><th className="text-right">POT</th><th>Readiness</th><th>Development</th><th>Mentor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ ap, player }) => {
                          const rec = recommendsPlayUp(ap.ageGroupPerformance, ap.ageGroup, ap.playedUp);
                          return (
                          <tr key={player.id}>
                            <td className="font-mono text-slate-400 cursor-pointer" onClick={() => navigate(`/player/${player.id}`)}>{player.position}</td>
                            <td className="font-medium cursor-pointer" onClick={() => navigate(`/player/${player.id}`)}>
                              {fullName(player)}
                              {ap.isProdigy && <span className="ml-1" title="Once-in-a-generation talent">⭐</span>}
                              {ap.contractStatus === 'professional'
                                ? <span className="ml-1" title="On professional terms — safe from poaching">🛡</span>
                                : player.potential >= 72 && <span className="ml-1 text-orange-400" title="Unprotected talent — a rival could poach him">⚠</span>}
                              {ap.playedUp && <span className="ml-1 text-xs px-1 rounded bg-sky-500/20 text-sky-300" title="Playing up an age group">↑</span>}
                              {ap.heldBack && <span className="ml-1 text-xs px-1 rounded bg-orange-500/20 text-orange-300" title="Held back a level">↓</span>}
                              {rec && <span className="ml-1 text-xs px-1 rounded bg-emerald-500/20 text-emerald-300" title="Recommended to play up">recommend ↑</span>}
                            </td>
                            <td className="text-right">{ageOf(player, year)}</td>
                            <td className="text-right"><Rating value={player.overall} /></td>
                            <td className="text-right"><Rating value={player.potential} /></td>
                            <td className="w-32">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-surface-700 rounded"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${ap.readiness}%` }} /></div>
                                <span className="text-xs font-mono text-slate-400">{ap.readiness}</span>
                              </div>
                            </td>
                            <td>
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className={ap.playedUp ? 'btn-primary text-xs py-0.5 px-2' : 'btn-ghost text-xs py-0.5 px-2'}
                                  disabled={g === 'U21'}
                                  title="Play up an age group (faster growth, tougher test)"
                                  onClick={() => setPlayUp(player.id, !ap.playedUp)}
                                >Play up</button>
                                <button
                                  className={ap.heldBack ? 'btn-primary text-xs py-0.5 px-2' : 'btn-ghost text-xs py-0.5 px-2'}
                                  disabled={g === 'U16'}
                                  title="Hold back a level (steadier, slower)"
                                  onClick={() => setHoldBack(player.id, !ap.heldBack)}
                                >Hold</button>
                                {ap.contractStatus !== 'professional' && (
                                  <button
                                    className="btn-ghost text-xs py-0.5 px-2"
                                    title="Offer professional terms — protects him from poaching"
                                    onClick={async () => flash((await offerProfessionalTerms(player.id)).message)}
                                  >Pro terms</button>
                                )}
                                <button
                                  className="btn-ghost text-xs py-0.5 px-2 text-rose-300"
                                  title="Release this prospect for free"
                                  onClick={async () => {
                                    if (window.confirm(`Release ${player.name.first} ${player.name.last} from the academy? This cannot be undone.`)) {
                                      flash((await releaseAcademyPlayer(player.id)).message);
                                    }
                                  }}
                                >Release</button>
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                className="bg-surface-700 border border-surface-600 rounded px-1 py-0.5 text-xs max-w-[9rem]"
                                value={ap.mentorId ?? ''}
                                onChange={(e) => setMentor(player.id, e.target.value || null)}
                              >
                                <option value="">No mentor</option>
                                {mentors.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name.last} ({m.overall})</option>
                                ))}
                              </select>
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
          })}
        </div>
      )}

      {tab === 'scouting' && (
        <ScoutingTab
          meta={meta}
          club={club}
          year={year}
          onDispatch={async () => {
            const res = await dispatchScout(scoutId, positions, country, months);
            flash(res.message);
            if (res.ok) { setScoutId(''); setPositions([]); }
          }}
          scoutId={scoutId} setScoutId={setScoutId}
          positions={positions} setPositions={setPositions}
          country={country} setCountry={setCountry}
          months={months} setMonths={setMonths}
          onRecall={recallScout}
          onTrial={async (id) => flash((await trialProspect(id)).message)}
          onSign={async (id) => flash((await signYouthProspect(id)).message)}
        />
      )}

      {tab === 'competitions' && (
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">This season's youth competitions</h2>
            {Object.values(meta.youthCompetitions ?? {}).length === 0 ? (
              <p className="text-sm text-slate-500">No youth competitions resolved yet — they run at the end of each season.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full">
                  <thead><tr><th>Competition</th><th>Champion</th><th>Runner-up</th></tr></thead>
                  <tbody>
                    {Object.values(meta.youthCompetitions ?? {}).map((yc) => (
                      <tr key={yc.id} className={yc.championClubId === club.id ? 'text-emerald-300' : ''}>
                        <td>{yc.name}</td>
                        <td className="font-medium">{yc.championClubId ? clubs[yc.championClubId]?.shortName ?? '—' : '—'}</td>
                        <td className="text-slate-400">{yc.runnerUpClubId ? clubs[yc.runnerUpClubId]?.shortName ?? '—' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Youth trophy cabinet</h2>
            {(academy.trophies ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No youth silverware yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...academy.trophies].reverse().map((t, i) => (
                  <div key={i} className="bg-surface-700 rounded px-3 py-2 text-sm">
                    <span className="text-amber-400">🏆</span> {t.competitionName} <span className="text-slate-500">({t.year})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Academy legends</h2>
            {(academy.graduates ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No graduates yet — bring a prospect through to the first team.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full">
                  <thead><tr><th>Name</th><th className="text-right">Graduated</th><th className="text-right">Peak OVR</th><th className="text-right">Awards</th><th className="text-right">Sale fee</th></tr></thead>
                  <tbody>
                    {[...academy.graduates].sort((a, b) => b.peakOvr - a.peakOvr).slice(0, 40).map((g) => (
                      <tr key={g.playerId}>
                        <td className="font-medium">{g.name}</td>
                        <td className="text-right">{g.graduatedYear}</td>
                        <td className="text-right"><Rating value={g.peakOvr} /></td>
                        <td className="text-right">{g.awards || '—'}</td>
                        <td className="text-right">{g.saleFee ? `£${g.saleFee.toLocaleString()}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Graduating cohorts</h2>
            {(academy.cohorts ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No cohorts recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...academy.cohorts].sort((a, b) => b.year - a.year).map((c) => (
                  <div key={c.year} className="bg-surface-700 rounded px-3 py-2 text-sm">
                    <span className="font-medium text-accent-400">{c.label}</span>
                    <span className="text-slate-500"> — {c.playerIds.length} graduate{c.playerIds.length === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}

function ScoutingTab({
  meta, club, year, scoutId, setScoutId, positions, setPositions, country, setCountry,
  months, setMonths, onDispatch, onRecall, onTrial, onSign,
}: {
  meta: ReturnType<typeof useGameStore.getState>['meta'];
  club: ReturnType<typeof useGameStore.getState>['clubs'][string];
  year: number;
  scoutId: string; setScoutId: (s: string) => void;
  positions: string[]; setPositions: (p: string[]) => void;
  country: string; setCountry: (c: string) => void;
  months: number; setMonths: (m: number) => void;
  onDispatch: () => void; onRecall: (id: string) => void;
  onTrial: (id: string) => void; onSign: (id: string) => void;
}) {
  if (!meta) return null;
  const assignments = meta.scoutAssignments ?? [];
  const assignedIds = new Set(assignments.map((a) => a.scoutId));
  const scouts = (club.staff ?? []).filter((s) => s.role === 'SCOUT');
  const freeScouts = scouts.filter((s) => !assignedIds.has(s.id));
  const prospects = (meta.youthProspects ?? []).filter((p) => p.discoveredByClubId === club.id);
  const scoutById = (id: string) => scouts.find((s) => s.id === id);

  const togglePos = (p: string) => {
    if (positions.includes(p)) setPositions(positions.filter((x) => x !== p));
    else if (positions.length < MAX_SCOUT_POSITIONS) setPositions([...positions, p]);
  };

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Sign a scouting contract</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-3">
              <span className="text-slate-400">Scout</span>
              <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
                <option value="">Select a scout…</option>
                {freeScouts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.first} {s.name.last} — rating {s.rating}
                    {s.scoutProfile?.specialization ? ` (spec: ${s.scoutProfile.specialization.positions.join('/')} @ ${COUNTRY_NAMES[s.scoutProfile.specialization.region] ?? s.scoutProfile.specialization.region})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm mb-3">
              <span className="text-slate-400">Target country</span>
              <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}</option>)}
              </select>
            </label>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-1">Target positions ({positions.length}/{MAX_SCOUT_POSITIONS})</div>
            <div className="flex flex-wrap gap-1">
              {ALL_POSITIONS.map((p) => (
                <button
                  key={p}
                  className={positions.includes(p) ? 'btn-primary text-xs py-1 px-2' : 'btn-ghost text-xs py-1 px-2'}
                  disabled={!positions.includes(p) && positions.length >= MAX_SCOUT_POSITIONS}
                  onClick={() => togglePos(p)}
                >{p}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm text-slate-400 mb-1">Contract length</div>
          <div className="flex flex-wrap gap-2">
            {SCOUT_CONTRACT_MONTHS.map((m) => {
              const cost = SCOUT_CONTRACT_COST[m];
              const afford = club.finances.balance >= cost;
              return (
                <button
                  key={m}
                  className={months === m ? 'btn-primary text-sm' : 'btn-ghost text-sm'}
                  disabled={!afford}
                  title={afford ? `${m} monthly reports of 5–8 prospects` : 'Not enough funds'}
                  onClick={() => setMonths(m)}
                >
                  {m} months <span className="opacity-70">· {formatMoney(cost)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">The scout files a report of 5–8 prospects every month until the contract ends.</p>
          <button
            className="btn-primary"
            disabled={!scoutId || positions.length === 0 || club.finances.balance < SCOUT_CONTRACT_COST[months]}
            onClick={onDispatch}
          >Sign scout ({months} months · {formatMoney(SCOUT_CONTRACT_COST[months])})</button>
        </div>
      </div>

      {assignments.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Active contracts</h2>
          <div className="space-y-2">
            {assignments.map((a) => {
              const s = scoutById(a.scoutId);
              // Contract progress = reports filed / term; legacy trips fall back to progress %.
              const pct = a.monthsTotal
                ? Math.round(((a.reportsDelivered ?? 0) / a.monthsTotal) * 100)
                : Math.round(a.progress ?? 0);
              return (
                <div key={a.scoutId} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{s ? `${s.name.first} ${s.name.last}` : a.scoutId}</span>
                    <span className="text-slate-500"> — {COUNTRY_NAMES[a.country] ?? a.country} · {a.positions.join(', ')}</span>
                    {a.monthsTotal && (
                      <span className="text-xs text-slate-500"> · {a.reportsDelivered ?? 0}/{a.monthsTotal} reports</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-28 h-1.5 bg-surface-600 rounded"><div className="h-1.5 rounded bg-sky-500" style={{ width: `${pct}%` }} /></div>
                    <button className="btn-ghost text-xs py-1" title="End the contract early (no refund)" onClick={() => onRecall(a.scoutId)}>Recall</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Prospect reports ({prospects.length})</h2>
        {prospects.length === 0 ? (
          <p className="text-sm text-slate-500">No prospects yet. Sign a scout to a contract and advance time — reports arrive monthly.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Pos</th><th>Name</th><th>From</th><th className="text-right">Age</th>
                  <th className="text-right">OVR</th><th className="text-right">POT</th><th>Knowledge</th><th></th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((pr) => {
                  const r = revealed(pr.player, pr.knowledgePct);
                  return (
                    <tr key={pr.player.id}>
                      <td className="font-mono text-slate-400">{pr.player.position}</td>
                      <td className="font-medium">{fullName(pr.player)}{pr.academy.isProdigy && <span className="ml-1" title="Once-in-a-generation talent">⭐</span>}</td>
                      <td>{COUNTRY_NAMES[pr.player.nationality] ?? pr.player.nationality}</td>
                      <td className="text-right">{ageOf(pr.player, year)}</td>
                      <td className="text-right font-mono">{r.ovrText}</td>
                      <td className="text-right font-mono text-accent-400">{r.potText}</td>
                      <td className="w-28">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-surface-700 rounded"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${pr.knowledgePct}%` }} /></div>
                          <span className="text-xs font-mono text-slate-400">{pr.knowledgePct}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button className="btn-ghost text-xs py-0.5 px-2" disabled={pr.trialled} title="Trial reveals truer ratings (£25,000)" onClick={() => onTrial(pr.player.id)}>{pr.trialled ? 'Trialled' : 'Trial'}</button>
                          <button className="btn-primary text-xs py-0.5 px-2" onClick={() => onSign(pr.player.id)}>Sign</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-2">Reports show rating ranges; better scouts and trials tighten them. Signing adds the player to your academy.</p>
      </div>
    </div>
  );
}
