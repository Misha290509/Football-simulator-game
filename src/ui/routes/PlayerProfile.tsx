import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { AttributeRadar } from '../components/AttributeRadar';
import { DevelopmentChart } from '../components/DevelopmentChart';
import { MoneyInput } from '../components/MoneyInput';
import { Rating } from '../components/Rating';
import { ageOf, fullName, formatMoney, formatWage, ratingColor, playerStatus } from '../format';
import { overallAt } from '../../engine/ratings';
import { moodLabel, INTERACT_LABEL, INTERACT_DESC, egoOf, type InteractKind } from '../../engine/morale';
import { traitsOf, TRAIT_LABEL } from '../../engine/traits';
import { awardMeta, isTeamTrophy } from '../../game/awardMeta';
import { marketView, eliteKnownIds, clubScoutRating } from '../../engine/marketScout';
import type { ContractOffer } from '../../game/contracts';
import { ALL_POSITIONS, POSITION_GROUP } from '../../types/attributes';
import type { Attributes, Position } from '../../types/attributes';
import type { Player, SquadRole, PlayerTrainingFocus } from '../../types/player';

function AttrGroup({
  title,
  group,
}: {
  title: string;
  group: Record<string, number>;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <div className="space-y-1">
        {Object.entries(group).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-slate-400 capitalize">
              {k.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span className={`font-mono ${ratingColor(v)}`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const allPlayers = useGameStore((s) => s.players);
  const player = useGameStore((s) => (id ? s.players[id] : undefined));
  const clubs = useGameStore((s) => s.clubs);
  const setTransferListed = useGameStore((s) => s.setTransferListed);
  const setLoanListed = useGameStore((s) => s.setLoanListed);
  const respondToTransferRequest = useGameStore((s) => s.respondToTransferRequest);
  const triggerLoanOption = useGameStore((s) => s.triggerLoanOption);
  const managerClub = useGameStore((s) => s.managerClub());
  const assignMarketScout = useGameStore((s) => s.assignMarketScout);
  const godForceSign = useGameStore((s) => s.godForceSign);
  const godModeEnabled = useGameStore((s) => !!s.meta?.godModeEnabled);
  const promoteToFirstTeam = useGameStore((s) => s.promoteToFirstTeam);
  const dualRegister = useGameStore((s) => s.dualRegister);
  const demoteToAcademy = useGameStore((s) => s.demoteToAcademy);
  const interactWithPlayer = useGameStore((s) => s.interactWithPlayer);
  const toggleShortlist = useGameStore((s) => s.toggleShortlist);
  const shortlisted = useGameStore((s) => (id ? (s.meta?.shortlist ?? []).includes(id) : false));
  const [renewing, setRenewing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  if (!player) {
    return (
      <div className="space-y-4">
        <p className="text-slate-400">Player not found.</p>
        <button className="btn-ghost" onClick={() => navigate(-1)}>Back</button>
      </div>
    );
  }

  const club = player.contract.clubId ? clubs[player.contract.clubId] : player.academyClubId ? clubs[player.academyClubId] : null;
  const season = Object.values(meta.seasons).find((s) => s.current);
  const currentYear = season?.year ?? meta.startYear;
  const attrs: Attributes = player.attributes;
  const status = playerStatus(player);
  const academyEntry = meta.academyPlayers?.[player.id];
  const isFirstTeamOwn = player.contract.clubId === meta.managerClubId;
  const age = currentYear - player.born.year;
  // Fog-of-war view: own/elite exact, a scout report gives a skewed estimate.
  const eliteIds = useMemo(() => eliteKnownIds(allPlayers, 50), [allPlayers]);
  const scoutRating = clubScoutRating(managerClub?.staff);
  const mv = marketView(player, { managerClubId: meta.managerClubId, eliteIds, report: meta.scoutReports?.[player.id], scoutRating });
  // Fog of war: attributes, form/morale, wage and history are only revealed for
  // players you own or the globally-known elite. Scouted/unknown players still
  // show biographical facts (age, nationality, height, foot) in the header.
  const known = mv.exact;

  // OVR at each of the player's listed positions (same player, different OVR).
  const positionOvrs = player.positions.map((p) => ({ p, ovr: overallAt(attrs, p) }));
  const isGk = player.position === 'GK';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
          <button className={shortlisted ? 'btn-primary' : 'btn-ghost'} title="Shortlist" onClick={() => toggleShortlist(player.id)}>{shortlisted ? '★ Shortlisted' : '☆ Shortlist'}</button>
          <button className="btn-ghost" onClick={() => navigate(`/compare?a=${player.id}`)}>Compare</button>
        </div>
        {academyEntry ? (
          <div className="flex flex-wrap gap-2">
            {academyEntry.dualRegistered ? (
              <>
                <button className="btn-primary" onClick={async () => flash((await promoteToFirstTeam(player.id)).message)}>Promote (full)</button>
                <button className="btn-ghost" onClick={async () => flash((await dualRegister(player.id, false)).message)}>Academy-only</button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={async () => flash((await promoteToFirstTeam(player.id)).message)}>Promote to first team</button>
                <button className="btn-ghost" onClick={async () => flash((await dualRegister(player.id, true)).message)}>Dual-register</button>
              </>
            )}
          </div>
        ) : isFirstTeamOwn ? (
          <div className="flex flex-wrap gap-2 items-center">
            {player.transferRequested && (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-rose-300">⚠ Transfer requested:</span>
                <button className="btn-ghost text-xs py-0.5 px-2" onClick={async () => { await respondToTransferRequest(player.id, true); flash('Request granted — he is transfer-listed.'); }}>Grant</button>
                <button className="btn-ghost text-xs py-0.5 px-2" onClick={async () => { await respondToTransferRequest(player.id, false); flash('Request rejected — he is unhappy.'); }}>Reject</button>
              </span>
            )}
            <button className="btn-ghost" onClick={() => setRenewing(true)}>Offer new contract</button>
            <button
              className={player.transferListed ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setTransferListed(player.id, !player.transferListed)}
            >
              {player.transferListed ? '✓ Transfer listed' : 'Transfer list'}
            </button>
            <button
              className={player.loanListed ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setLoanListed(player.id, !player.loanListed)}
            >
              {player.loanListed ? '✓ Loan listed' : 'Loan list'}
            </button>
            {age <= 18 && (
              <button className="btn-ghost" title="Only players 18 or younger" onClick={async () => flash((await demoteToAcademy(player.id)).message)}>Send to academy</button>
            )}
            {player.loan?.optionToBuy != null && (
              <button className="btn-primary" onClick={async () => flash((await triggerLoanOption(player.id)).message)}>
                Sign permanently ({(player.loan.optionToBuy / 1_000_000).toFixed(1)}M)
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            {mv.level !== 'ELITE' && (() => {
              const outOnHim = (meta.playerScoutAssignments ?? []).some((a) => a.playerId === player.id);
              const freeScout = (managerClub?.staff ?? []).find((s) => s.role === 'SCOUT' && !(meta.playerScoutAssignments ?? []).some((a) => a.scoutId === s.id));
              return (
                <button
                  className="btn-ghost"
                  disabled={outOnHim || !freeScout}
                  title={!freeScout ? 'No free scout — hire or free one up' : undefined}
                  onClick={async () => { if (freeScout) flash((await assignMarketScout(freeScout.id, player.id)).message); }}
                >
                  {outOnHim ? 'Scouting…' : mv.level === 'REPORT' ? 'Re-scout' : 'Send scout'}
                </button>
              );
            })()}
            {godModeEnabled && (
              <button className="btn-ghost" onClick={() => godForceSign(player.id)} title="God Mode">
                Force sign (free)
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{fullName(player)}</h1>
            <div className="text-sm text-slate-400 mt-1">
              {player.position} · {ageOf(player, currentYear)} years · {player.nationality} ·{' '}
              {player.preferredFoot}-footed · {player.height_cm}cm
            </div>
            <div className="text-sm text-slate-500 mt-1">{club?.name ?? 'Free agent'}</div>
            <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${status.className}`}>
              {status.label}
            </span>
            {known && traitsOf(player).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {traitsOf(player).map((t) => (
                  <span key={t} className={`text-[11px] px-2 py-0.5 rounded-full border ${t === 'INJURY_PRONE' ? 'border-rose-500/40 text-rose-300' : 'border-surface-500 text-slate-300'}`}>
                    {TRAIT_LABEL[t]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-xs text-slate-500">OVR</div>
              {mv.exact ? (
                <div className="text-3xl"><Rating value={mv.ovr} /></div>
              ) : (
                <div className="text-2xl font-mono font-semibold text-slate-300">{mv.ovr}<span className="text-amber-400/70 text-xs ml-1">~{mv.stars}★</span></div>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500">POT</div>
              {mv.exact ? (
                <div className="text-3xl"><Rating value={mv.pot} /></div>
              ) : (
                <div className="text-2xl font-mono font-semibold text-accent-400">{mv.pot}<span className="text-amber-400/70 text-xs ml-1">~</span></div>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500">Value</div>
              <div className={`text-xl font-semibold mt-1 ${mv.exact ? '' : 'italic text-slate-400'}`}>{formatMoney(mv.value)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trophies and career output are public record — shown for any player. */}
      <CareerRecord player={player} isGk={isGk} />
      <TrophyCabinet player={player} />

      {!known && (
        <div className="card p-6 text-center space-y-1">
          <div className="text-2xl">🔍</div>
          <div className="text-sm text-slate-300 font-medium">Estimated figures</div>
          <div className="text-xs text-slate-500">
            The overall, potential and value above are your scouting department's read ({mv.stars}/5★).
            {mv.level === 'REPORT'
              ? ' A dispatched scout has sharpened it — send another for an even firmer number.'
              : ' Dispatch a scout for a sharper report. Only your own players and the global elite show certain, full detail.'}
          </div>
        </div>
      )}

      {known && (<>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Profile</h2>
          <AttributeRadar attributes={attrs} />
          <div className="mt-3 space-y-2">
            <Bar label="Fitness" value={player.fitness} color="bg-emerald-500" />
            <Bar label="Morale" value={player.morale} color="bg-sky-500" />
            <Bar label="Form" value={50 + player.form / 2} color="bg-purple-500" />
            <Bar label="Ego" value={egoOf(player)} color="bg-amber-500" />
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <Row label="Contract" value={`expires ${player.contract.expiresYear}`} />
            <Row label="Wage" value={formatWage(player.contract.wage)} />
            <Row label="Squad role" value={player.squadRole} />
            {player.loan && <Row label="On loan from" value={clubs[player.loan.parentClubId]?.shortName ?? '—'} />}
          </div>
          {isFirstTeamOwn && (
            <div className="mt-4 pt-3 border-t border-surface-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Dressing room</span>
                <span className={`text-sm font-medium ${moodLabel(player.morale).className}`}>{moodLabel(player.morale).label}</span>
              </div>
              <div className="flex gap-2">
                {(['PRAISE', 'REASSURE', 'WARN'] as InteractKind[]).map((k) => (
                  <button
                    key={k}
                    className="btn-ghost text-xs flex-1"
                    title={INTERACT_DESC[k]}
                    onClick={async () => flash((await interactWithPlayer(player.id, k)).message)}
                  >{INTERACT_LABEL[k]}</button>
                ))}
              </div>
            </div>
          )}
          {isFirstTeamOwn && <TrainingPanel player={player} flash={flash} />}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">OVR by position</h2>
          <div className="grid grid-cols-2 gap-1 mb-4">
            {positionOvrs.map(({ p, ovr }) => (
              <div key={p} className="flex justify-between bg-surface-700 rounded px-2 py-1 text-sm">
                <span className="font-mono text-slate-400">{p}</span>
                <Rating value={ovr} />
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500">
            Reference: best of all {ALL_POSITIONS.length} positions shown for the
            player's listed roles.
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Development</h2>
        <DevelopmentChart log={player.developmentLog} />
      </div>

      <div className="card p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AttrGroup title="Technical" group={attrs.technical} />
        <AttrGroup title="Mental" group={attrs.mental} />
        <AttrGroup title="Physical" group={attrs.physical} />
        {isGk && <AttrGroup title="Goalkeeping" group={attrs.goalkeeping} />}
      </div>
      </>)}

      {renewing && (
        <ContractModal
          player={player}
          onClose={() => setRenewing(false)}
          flash={(m) => { setToast(m); setTimeout(() => setToast(null), 4000); }}
        />
      )}
      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}

function ContractModal({ player, onClose, flash }: { player: Player; onClose: () => void; flash: (m: string) => void }) {
  const contractDemands = useGameStore((s) => s.contractDemands);
  const offerContract = useGameStore((s) => s.offerContract);
  const demands = useMemo(() => contractDemands(player.id), [contractDemands, player.id]);
  const [offer, setOffer] = useState<ContractOffer | null>(demands);
  const [response, setResponse] = useState<string | null>(null);
  if (!offer || !demands) return null;

  const set = <K extends keyof ContractOffer>(k: K, v: ContractOffer[K]) => setOffer({ ...offer, [k]: v });
  const submit = async () => {
    const res = await offerContract(player.id, offer);
    setResponse(res.message);
    if (res.outcome === 'ACCEPT') { flash(res.message); onClose(); }
    else if (res.outcome === 'COUNTER' && res.counter) setOffer(res.counter);
  };

  const roles: SquadRole[] = ['KEY', 'FIRST', 'ROTATION', 'BACKUP'];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Contract talks — {fullName(player)}</h2>
        <p className="text-sm text-slate-400 mb-3">Currently {formatWage(player.contract.wage)} until {player.contract.expiresYear}. His agent is asking for around {formatWage(demands.wage)}/wk over {demands.years} years{demands.releaseClause ? `, with a release clause` : ''}.</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2">
            <span className="text-slate-400">Weekly wage (wants {formatWage(demands.wage)})</span>
            <MoneyInput value={offer.wage} onChange={(v) => set('wage', v)} />
          </label>
          <label>
            <span className="text-slate-400">Length</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <button key={y} className={offer.years === y ? 'btn-primary px-2 py-0.5 text-xs' : 'btn-ghost px-2 py-0.5 text-xs'} onClick={() => set('years', y)}>{y}y</button>
              ))}
            </div>
          </label>
          <label>
            <span className="text-slate-400">Squad status {ROLE_WANT(demands.squadRole)}</span>
            <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-2 py-1" value={offer.squadRole} onChange={(e) => set('squadRole', e.target.value as SquadRole)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={offer.releaseClause != null} onChange={(e) => set('releaseClause', e.target.checked ? (demands.releaseClause ?? Math.round(player.value * 2)) : null)} />
            <span className="text-slate-400">Release clause</span>
            {offer.releaseClause != null && <span className="flex-1"><MoneyInput value={offer.releaseClause} onChange={(v) => set('releaseClause', v)} /></span>}
          </label>
          <label><span className="text-slate-400">Signing bonus</span><MoneyInput value={offer.signingBonus} onChange={(v) => set('signingBonus', v)} /></label>
          <label><span className="text-slate-400">Loyalty bonus</span><MoneyInput value={offer.loyaltyBonus} onChange={(v) => set('loyaltyBonus', v)} /></label>
          <label><span className="text-slate-400">Appearance bonus</span><MoneyInput value={offer.appearanceBonus} onChange={(v) => set('appearanceBonus', v)} /></label>
          <label><span className="text-slate-400">Goal bonus</span><MoneyInput value={offer.goalBonus} onChange={(v) => set('goalBonus', v)} /></label>
        </div>

        {response && <p className="text-sm text-amber-300 mt-3">{response}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={submit}>Submit offer</button>
        </div>
      </div>
    </div>
  );
}

const ROLE_WANT = (r: SquadRole) => `(wants ${r})`;

const FOCUS_OPTIONS: { value: PlayerTrainingFocus; label: string }[] = [
  { value: 'SHOOTING', label: 'Shooting' }, { value: 'PASSING', label: 'Passing & vision' },
  { value: 'DRIBBLING', label: 'Dribbling & control' }, { value: 'DEFENDING', label: 'Defending' },
  { value: 'PHYSICAL', label: 'Physical' }, { value: 'GOALKEEPING', label: 'Goalkeeping' },
];

function TrainingPanel({ player, flash }: { player: Player; flash: (m: string) => void }) {
  const setTraining = useGameStore((s) => s.setTraining);
  const isGk = player.position === 'GK';
  const focusChoices = FOCUS_OPTIONS.filter((o) =>
    isGk ? o.value === 'GOALKEEPING' || o.value === 'PHYSICAL' || o.value === 'PASSING' : o.value !== 'GOALKEEPING');
  const retrainChoices = isGk ? [] : ALL_POSITIONS.filter((p) => p !== 'GK' && !player.positions.includes(p));
  const t = player.training ?? {};
  const progress = t.retrainProgress ?? 0;

  return (
    <div className="mt-4 pt-3 border-t border-surface-700 space-y-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">Individual training</span>
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-400">Focus</span>
        <select
          className="bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm"
          value={t.focus ?? ''}
          onChange={async (e) => { await setTraining(player.id, { focus: (e.target.value || null) as PlayerTrainingFocus | null }); flash(e.target.value ? 'Training focus set — growth will lean that way at season end.' : 'Training focus cleared.'); }}
        >
          <option value="">Balanced</option>
          {focusChoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {retrainChoices.length > 0 && (
        <div className="text-sm">
          <label className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Learn position</span>
            <select
              className="bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm"
              value={t.retrainPosition ?? ''}
              onChange={async (e) => { await setTraining(player.id, { retrainPosition: (e.target.value || null) as Position | null }); flash(e.target.value ? `He starts extra sessions at ${e.target.value} — around four months to master it.` : 'Position retraining stopped.'); }}
            >
              <option value="">—</option>
              {retrainChoices.map((p) => <option key={p} value={p}>{p} ({overallAt(player.attributes, p)} now)</option>)}
            </select>
          </label>
          {t.retrainPosition && (
            <div className="mt-1.5">
              <div className="flex justify-between text-xs text-slate-500 mb-0.5"><span>Learning {t.retrainPosition}</span><span>{Math.floor(progress)}%</span></div>
              <div className="h-1.5 bg-surface-700 rounded"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(100, progress)}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CareerRecord({ player, isGk }: { player: Player; isGk: boolean }) {
  const t = player.stats.reduce(
    (m, s) => {
      m.apps += s.appearances; m.goals += s.goals; m.assists += s.assists;
      m.cleanSheets += s.cleanSheets; m.saves += s.saves ?? 0;
      m.yellow += s.yellowCards; m.red += s.redCards;
      return m;
    },
    { apps: 0, goals: 0, assists: 0, cleanSheets: 0, saves: 0, yellow: 0, red: 0 },
  );
  const isDef = POSITION_GROUP[player.position] === 'DEF';
  const cell = (label: string, value: number, cls = 'text-white') => (
    <div className="bg-surface-700 rounded p-2 text-center">
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3">Career record <span className="text-slate-600 font-normal">(all completed seasons)</span></h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {cell('Games', t.apps)}
        {cell('Goals', t.goals, 'text-emerald-300')}
        {cell('Assists', t.assists, 'text-sky-300')}
        {(isGk || isDef) && cell('Clean sheets', t.cleanSheets, 'text-violet-300')}
        {isGk && cell('Saves', t.saves, 'text-amber-300')}
        {cell('Yellow', t.yellow, 'text-yellow-400')}
        {cell('Red', t.red, 'text-red-400')}
      </div>
      {player.stats.length === 0 && <p className="text-xs text-slate-500 mt-2">No completed seasons yet — stats appear at the end of the season.</p>}
    </div>
  );
}

function TrophyCabinet({ player }: { player: Player }) {
  if (player.awards.length === 0) return null;
  // Aggregate by display label, splitting team trophies from individual awards.
  const tally = (team: boolean) => {
    const m = new Map<string, { label: string; emoji: string; count: number }>();
    for (const a of player.awards) {
      if (isTeamTrophy(a.awardId) !== team) continue;
      const meta = awardMeta(a.awardId);
      const label = a.label ?? meta.label;
      const key = `${meta.emoji}|${label}`;
      const e = m.get(key) ?? { label, emoji: meta.emoji, count: 0 };
      e.count += 1; m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  };
  const trophies = tally(true);
  const awards = tally(false);
  const chips = (rows: { label: string; emoji: string; count: number }[]) => (
    <div className="flex flex-wrap gap-2">
      {rows.map((r) => (
        <span key={r.label} className="bg-surface-700 rounded-full px-3 py-1 text-sm">
          <span className="mr-1">{r.emoji}</span>{r.label}{r.count > 1 && <span className="text-amber-400 ml-1">×{r.count}</span>}
        </span>
      ))}
    </div>
  );
  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-400">🏆 Trophy cabinet</h2>
      {trophies.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Trophies</div>
          {chips(trophies)}
        </div>
      )}
      {awards.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Individual awards</div>
          {chips(awards)}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-0.5">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-surface-700 rounded">
        <div className={`h-1.5 rounded ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
