import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { AGENT_ROSTER } from '../../game/playerOffPitch';
import { formatMoney } from '../format';
import type { SquadStatus } from '../../types/playerCareer';

const ROLE_ORDER: SquadStatus[] = ['YOUTH', 'PROSPECT', 'ROTATION', 'KEY', 'STAR', 'CAPTAIN'];
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function OffPitch() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;

  const hireAgentAction = useGameStore((s) => s.hireAgentAction);
  const fireAgentAction = useGameStore((s) => s.fireAgentAction);
  const setAutoNegotiate = useGameStore((s) => s.setAutoNegotiate);
  const acceptContractOffer = useGameStore((s) => s.acceptContractOffer);
  const rejectContractOffer = useGameStore((s) => s.rejectContractOffer);
  const acceptLoanOffer = useGameStore((s) => s.acceptLoanOffer);
  const rejectLoanOffer = useGameStore((s) => s.rejectLoanOffer);
  const acceptSponsorOffer = useGameStore((s) => s.acceptSponsorOffer);
  const rejectSponsorOffer = useGameStore((s) => s.rejectSponsorOffer);
  const requestTransfer = useGameStore((s) => s.requestTransfer);
  const cancelTransferRequest = useGameStore((s) => s.cancelTransferRequest);
  const setLifestyle = useGameStore((s) => s.setLifestyle);

  const [toast, setToast] = useState<string | null>(null);

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  const lifestyle = career.lifestyle ?? { routine: { TRAINING: 1, REST: 1, MEDIA: 1, COMMUNITY: 1, PERSONAL: 1 }, autoManage: true };
  const interest = (career.transferInterest ?? []).filter((i) => clubs[i.clubId]);
  const offers = career.contractOffers ?? [];
  const loanOffers = career.loanOffers ?? [];
  const sponsorOffers = career.pendingSponsorOffers ?? [];
  const sponsorships = (career.sponsorships ?? []);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="page-title">Off-Pitch</h1>
      {toast && <div className="card p-3 border border-accent/30 bg-accent/5 text-sm text-accent-200">{toast}</div>}

      {/* Wealth + public image */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Career earnings" value={formatMoney(career.careerEarnings ?? 0)} />
        <Stat label="Following" value={compact(career.following ?? 0)} />
        <Stat label="Persona" value={image.persona} />
        <Stat label="Fan rating" value={`${Math.round(career.fanRating ?? 50)}`} tone={(career.fanRating ?? 50) >= 66 ? 'good' : (career.fanRating ?? 50) < 40 ? 'bad' : 'neutral'} />
      </div>
      {image.controversy > 0 && (
        <Meter label="Controversy" value={image.controversy} tone={image.controversy >= 50 ? 'bad' : 'neutral'} />
      )}

      {/* Decisions on the table */}
      {(offers.length > 0 || loanOffers.length > 0 || sponsorOffers.length > 0) && (
        <div className="card p-4 border border-accent/30 bg-accent/5 space-y-3">
          <h2 className="text-sm font-semibold text-accent-300">On the table</h2>
          {offers.map((o) => {
            const club = clubs[o.clubId];
            return (
              <div key={o.id} className="rounded-lg bg-surface-800/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white font-medium">{o.kind === 'RENEWAL' ? 'Contract renewal' : `Move to ${club?.name ?? 'a new club'}`}</div>
                  {o.kind === 'TRANSFER' && o.fee != null && <span className="text-xs text-slate-400">Fee €{(o.fee / 1_000_000).toFixed(1)}M</span>}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {formatMoney(o.wage)}/wk · {o.length}yr · {cap(o.rolePromise)} role · sign-on {formatMoney(o.signingBonus)}
                  {o.releaseClause != null && ` · release €${(o.releaseClause / 1_000_000).toFixed(0)}M`}
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary text-xs" onClick={async () => setToast(await acceptContractOffer(o.id))}>Accept</button>
                  <button className="btn-ghost text-xs" onClick={() => void rejectContractOffer(o.id)}>Reject</button>
                </div>
              </div>
            );
          })}
          {loanOffers.map((o) => {
            const club = clubs[o.clubId];
            return (
              <div key={o.id} className="rounded-lg bg-surface-800/60 p-3">
                <div className="text-sm text-white font-medium">Loan to {club?.name ?? 'a club'}</div>
                <div className="text-xs text-slate-400 mt-1">{o.minutesGuarantee ? 'Guaranteed minutes' : 'No minutes guarantee'} · for regular football</div>
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary text-xs" onClick={async () => setToast(await acceptLoanOffer(o.id))}>Accept</button>
                  <button className="btn-ghost text-xs" onClick={() => void rejectLoanOffer(o.id)}>Reject</button>
                </div>
              </div>
            );
          })}
          {sponsorOffers.map((o) => (
            <div key={o.id} className="rounded-lg bg-surface-800/60 p-3">
              <div className="text-sm text-white font-medium">{o.brand} <span className="text-xs text-slate-500">({o.tier.toLowerCase()})</span></div>
              <div className="text-xs text-slate-400 mt-1">{formatMoney(o.value)}/yr · {o.length}yr endorsement</div>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary text-xs" onClick={async () => { await acceptSponsorOffer(o.id); setToast(`Signed with ${o.brand}.`); }}>Accept</button>
                <button className="btn-ghost text-xs" onClick={() => void rejectSponsorOffer(o.id)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Agent</h2>
        {career.agent ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">{career.agent.name}</div>
                <div className="text-xs text-slate-500">Negotiation {career.agent.negotiation} · Network {career.agent.network} · {career.agent.commissionPct}% commission</div>
              </div>
              <button className="btn-ghost text-xs" onClick={() => void fireAgentAction()}>Release</button>
            </div>
            <div className="rounded-lg bg-surface-800/60 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={career.agent.autoNegotiate.enabled} onChange={(e) => void setAutoNegotiate({ enabled: e.target.checked })} />
                Auto-negotiate — let your agent accept qualifying offers for you
              </label>
              {career.agent.autoNegotiate.enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <label className="text-slate-500">Min wage/wk
                    <input type="number" className="input-field mt-0.5 w-full" value={career.agent.autoNegotiate.minWage}
                      onChange={(e) => void setAutoNegotiate({ minWage: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <label className="text-slate-500">Min role
                    <select className="input-field mt-0.5 w-full" value={career.agent.autoNegotiate.minRole}
                      onChange={(e) => void setAutoNegotiate({ minRole: e.target.value as SquadStatus })}>
                      {ROLE_ORDER.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">You’re self-represented. Hiring an agent brings bigger clubs to the table and sharpens your terms — for a cut of your wage.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {AGENT_ROSTER.map((a) => (
                <div key={a.id} className="rounded-lg bg-surface-800/60 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">{a.name}</div>
                    <div className="text-[11px] text-slate-500">Neg {a.negotiation} · Net {a.network} · {a.commissionPct}%</div>
                  </div>
                  <button className="btn-ghost text-xs" onClick={() => void hireAgentAction(a.id)}>Hire</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transfer interest board */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-400">Who wants you</h2>
          {career.transferRequestPending ? (
            <button className="btn-ghost text-xs" onClick={() => void cancelTransferRequest()}>Withdraw transfer request</button>
          ) : (
            <button className="btn-ghost text-xs text-amber-400" onClick={() => void requestTransfer()}>Hand in transfer request</button>
          )}
        </div>
        {career.transferRequestPending && <p className="text-xs text-amber-400 mb-2">You’ve asked to leave — suitors are circling, but the club’s unimpressed.</p>}
        {interest.length === 0 ? (
          <p className="text-xs text-slate-500">No concrete interest yet. Keep performing — clubs are always watching.</p>
        ) : (
          <ul className="space-y-1.5">
            {interest.map((i) => (
              <li key={i.clubId} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 w-40 truncate">{clubs[i.clubId]?.name}</span>
                <div className="flex-1 h-1.5 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500/70" style={{ width: `${i.level}%` }} /></div>
                <span className="text-xs text-slate-500 w-16 text-right">{i.level >= 68 ? 'Keen' : i.level >= 40 ? 'Watching' : 'Casual'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active sagas */}
      {(career.activeSagas ?? []).filter((s) => s.stage !== 'COLLAPSED' && s.stage !== 'DONE').length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Transfer sagas</h2>
          <ul className="space-y-1.5">
            {(career.activeSagas ?? []).filter((s) => s.stage !== 'COLLAPSED' && s.stage !== 'DONE').map((s) => (
              <li key={s.id} className="text-sm text-slate-300 flex items-center justify-between">
                <span>{clubs[s.clubId]?.shortName ?? 'A club'}</span>
                <span className="text-xs text-slate-500">{sagaLabel(s.stage)}{s.fee > 0 ? ` · €${(s.fee / 1_000_000).toFixed(1)}M` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sponsorships */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Endorsements</h2>
        {sponsorships.length === 0 ? (
          <p className="text-xs text-slate-500">No active deals. Grow your following and the brands will come.</p>
        ) : (
          <ul className="space-y-1">
            {sponsorships.map((s, i) => (
              <li key={i} className="text-sm text-slate-300 flex items-center justify-between">
                <span>{s.brand}</span><span className="text-xs text-slate-500">{formatMoney(s.value)}/yr · to {s.until}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lifestyle */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-400">Lifestyle</h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={lifestyle.autoManage}
              onChange={(e) => void setLifestyle(lifestyle.routine, e.target.checked)} />
            Auto-manage
          </label>
        </div>
        <p className="text-xs text-slate-500 mb-3">Set your weekly focus once and forget it. Training builds professionalism; rest keeps you fresh; media grows your name (and controversy); community warms the fans.</p>
        <div className="space-y-2">
          {(['TRAINING', 'REST', 'MEDIA', 'COMMUNITY', 'PERSONAL'] as const).map((slot) => (
            <div key={slot} className={`flex items-center gap-3 ${lifestyle.autoManage ? 'opacity-50' : ''}`}>
              <span className="text-sm text-slate-300 w-24 capitalize">{slot.toLowerCase()}</span>
              <input type="range" min={0} max={3} step={1} value={lifestyle.routine[slot] ?? 0} disabled={lifestyle.autoManage}
                className="flex-1"
                onChange={(e) => void setLifestyle({ ...lifestyle.routine, [slot]: Number(e.target.value) }, false)} />
              <span className="text-xs text-slate-500 w-6 text-right">{lifestyle.routine[slot] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Personality */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Personality</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {(['professionalism', 'ambition', 'loyalty', 'temperament'] as const).map((k) => (
            <div key={k}><span className="text-slate-500 capitalize">{k}</span><div className="font-mono text-slate-300">{Math.round(career.personality[k])}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function sagaLabel(stage: string): string {
  switch (stage) {
    case 'RUMOUR': return 'Rumours';
    case 'BID': return 'Bid lodged';
    case 'PERSONAL_TERMS': return 'Personal terms — your call';
    default: return stage;
  }
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return `${n}`;
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white';
  return (
    <div className="card p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: 'bad' | 'neutral' }) {
  return (
    <div className="card p-3">
      <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">{label}</span><span className="text-slate-400">{Math.round(value)}</span></div>
      <div className="h-1.5 rounded bg-surface-700 overflow-hidden"><div className={`h-full ${tone === 'bad' ? 'bg-rose-500/70' : 'bg-amber-500/70'}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}
