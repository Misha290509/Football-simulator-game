import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { computeLegacy, careerTotals, managerRepSeed } from '../../game/playerLegacy';
import { IDENTITY_LABEL, IDENTITY_BLURB } from '../../types/playerLegacy';
import { awardMeta } from '../../game/awardMeta';
import { fullName, ageOf } from '../format';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';
import type { CareerTotals } from '../../game/playerLegacy';

const TROPHY_TYPES = new Set(['LEAGUE_CHAMPION', 'DOMESTIC_CUP', 'CONTINENTAL', 'WORLD_CUP', 'EUROS', 'COPA_AMERICA']);

export function Retrospective() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const chooseContinuation = useGameStore((s) => s.chooseContinuation);
  const career = playerCareerOf(meta) ?? meta?.playerCareer;
  const p = career ? players[career.playerId] : undefined;
  const year = season?.year ?? meta?.startYear ?? new Date().getFullYear();
  const [busy, setBusy] = useState(false);

  const legacy = useMemo(() => (career && p && meta) ? (career.legacy ?? computeLegacy(career, p, clubs, players, year)) : null, [career, p, meta, clubs, players, year]);
  const totals = useMemo(() => (career && p) ? careerTotals(career, p, p.born.year) : null, [career, p]);

  if (!meta || !career || !p || !legacy || !totals) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">No player career to look back on.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const retired = career.retirement?.retiredDay != null;
  const trophies = p.awards.filter((a) => TROPHY_TYPES.has(a.awardId));
  const individual = p.awards.filter((a) => !TROPHY_TYPES.has(a.awardId));
  const repSeed = managerRepSeed(legacy, totals);
  const narrative = careerNarrative(career, p, totals, legacy);

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-10">
      {/* Hero */}
      <div className="rounded-2xl overflow-hidden border border-surface-700 bg-gradient-to-br from-accent-900/40 via-surface-900 to-surface-900 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-accent-300/80">Career Retrospective</div>
        <div className="text-3xl font-bold text-white mt-1">{fullName(p)}</div>
        <div className="text-sm text-slate-400 mt-1">{p.position} · {p.nationality} · {career.origin === 'ACADEMY' ? 'Academy graduate' : career.archetype}{retired ? ` · retired ${career.retirement?.finalSeason ?? year}` : ` · age ${ageOf(p, year)}`}</div>
        <div className="flex flex-wrap gap-2 mt-3">
          {legacy.identities.map((id) => <span key={id} className="bg-white/10 text-white rounded-full px-3 py-1 text-xs" title={IDENTITY_BLURB[id]}>{IDENTITY_LABEL[id]}</span>)}
          {legacy.hallOfFame && <span className="bg-amber-400/20 text-amber-200 rounded-full px-3 py-1 text-xs">🏛 Hall of Fame</span>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5">
          <Big label="Legacy" value={`${legacy.score}`} />
          <Big label="World rank" value={`#${legacy.peerRank}`} />
          <Big label="Apps" value={`${totals.apps}`} />
          <Big label="Goals" value={`${totals.goals}`} />
          <Big label="Assists" value={`${totals.assists}`} />
          <Big label="Avg rating" value={totals.avgRating ? totals.avgRating.toFixed(2) : '—'} />
        </div>
      </div>

      {/* Narrative */}
      <div className="card p-5">
        <p className="text-[15px] leading-relaxed text-slate-200">{narrative}</p>
      </div>

      {/* Trophy cabinet */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Trophy cabinet</h2>
          {trophies.length === 0 ? <p className="text-xs text-slate-500">No team honours.</p> : (
            <div className="space-y-1">
              {countBy(trophies).map(([label, n]) => (
                <div key={label} className="flex items-center justify-between text-sm"><span className="text-slate-300">🏆 {label}</span><span className="font-mono text-slate-400">×{n}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Individual awards</h2>
          {individual.length === 0 ? <p className="text-xs text-slate-500">No individual awards.</p> : (
            <div className="space-y-1">
              {countBy(individual).map(([label, n]) => (
                <div key={label} className="flex items-center justify-between text-sm"><span className="text-slate-300">🌟 {label}</span><span className="font-mono text-slate-400">×{n}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* International + big moments */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Caps" value={`${totals.caps}`} />
        <Stat label="Intl goals" value={`${totals.intlGoals}`} />
        <Stat label="Peak OVR" value={`${totals.peakOvr}`} />
        <Stat label="Clubs" value={`${totals.clubs.length}`} />
      </div>
      {career.momentStats && (career.momentStats.bigMomentsWon + career.momentStats.penaltiesScored) > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Standout moments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Stat label="Big moments won" value={`${career.momentStats.bigMomentsWon}`} />
            <Stat label="Pens scored" value={`${career.momentStats.penaltiesScored}`} />
            <Stat label="Decisive" value={`${career.momentStats.decisiveContributions}`} />
            <Stat label="Testimonial" value={career.retirement?.testimonialMatchId ? 'Played' : '—'} />
          </div>
        </div>
      )}

      {/* Season by season */}
      {career.seasonHistory.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Season by season</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs"><th className="text-left py-1">Season</th><th className="text-left">Club</th><th className="text-right">Apps</th><th className="text-right">Gls</th><th className="text-right">Ast</th><th className="text-right">Avg</th><th className="text-left pl-3">Honours</th></tr></thead>
              <tbody>
                {career.seasonHistory.map((s, i) => (
                  <tr key={i} className="border-t border-surface-700">
                    <td className="py-1">{s.season}</td><td>{s.club}</td>
                    <td className="text-right">{s.apps}</td><td className="text-right">{s.goals}</td>
                    <td className="text-right">{s.assists}</td><td className="text-right">{s.avgRating.toFixed(1)}</td>
                    <td className="pl-3 text-xs text-slate-400">{(s.honours ?? []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Milestone timeline */}
      {career.milestones.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Milestones</h2>
          <ul className="space-y-1.5">
            {[...career.milestones].reverse().map((m, i) => (
              <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-slate-600">•</span><span>{m.text}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Continuation — the meta-loop */}
      {retired && !career.continuation && (
        <div className="card p-5 border border-accent/30 bg-accent/5">
          <h2 className="text-base font-semibold text-white mb-1">What next?</h2>
          <p className="text-xs text-slate-400 mb-4">Your playing days are done — but the world you shaped goes on. Your record and reputation carry into whatever you choose.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <button disabled={busy} className="rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/60 p-4 text-left transition-colors" onClick={async () => { setBusy(true); await chooseContinuation('MANAGER'); navigate('/dashboard'); }}>
              <div className="text-sm font-semibold text-white">Continue as manager</div>
              <div className="text-xs text-slate-400 mt-1">Take a dugout in this same world. Starting reputation <span className="text-accent-300 font-mono">{repSeed}</span> — earned on the pitch.</div>
            </button>
            <button disabled={busy} className="rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/60 p-4 text-left transition-colors" onClick={async () => { setBusy(true); await chooseContinuation('AMBASSADOR'); }}>
              <div className="text-sm font-semibold text-white">Club ambassador</div>
              <div className="text-xs text-slate-400 mt-1">Stay on and keep watching the world you shaped unfold.</div>
            </button>
            <button disabled={busy} className="rounded-xl border border-surface-700 hover:border-accent/50 bg-surface-800/60 p-4 text-left transition-colors" onClick={async () => { setBusy(true); await chooseContinuation('END'); }}>
              <div className="text-sm font-semibold text-white">End here</div>
              <div className="text-xs text-slate-400 mt-1">Close the book on a career for the ages.</div>
            </button>
          </div>
        </div>
      )}
      {career.continuation && (
        <div className="card p-4 text-sm text-slate-300">
          {career.continuation.choice === 'MANAGER' ? 'You continued into management — good luck in the dugout.' : career.continuation.choice === 'AMBASSADOR' ? 'You remain a club ambassador, watching the world you shaped.' : 'A legendary career, complete.'}
          {career.continuation.choice === 'MANAGER' && <button className="ml-2 text-accent-300 underline" onClick={() => navigate('/dashboard')}>Go to your dashboard →</button>}
        </div>
      )}
    </div>
  );
}

/** A short, generated summary of the career arc. */
function careerNarrative(career: PlayerCareer, p: Player, t: CareerTotals, legacy: { identities: string[] }): string {
  const name = fullName(p);
  const bits: string[] = [];
  const start = career.seasonHistory[0]?.club ?? p.nationality;
  bits.push(`${name} ${career.retirement?.retiredDay != null ? 'finished' : 'has built'} a career of ${t.apps} appearances and ${t.goals} goals${t.assists ? `, ${t.assists} assists,` : ''} across ${t.clubs.length} club${t.clubs.length === 1 ? '' : 's'}, starting out at ${start}.`);
  if (t.leagueTitles || t.continentalTitles) bits.push(`He lifted ${t.leagueTitles} league title${t.leagueTitles === 1 ? '' : 's'}${t.continentalTitles ? ` and ${t.continentalTitles} continental crown${t.continentalTitles === 1 ? '' : 's'}` : ''}.`);
  else bits.push(`Silverware was harder to come by, but the miles were never in doubt.`);
  if (t.ballonDors) bits.push(`Crowned the best in the world ${t.ballonDors === 1 ? 'once' : `${t.ballonDors} times`}.`);
  else if (t.individualAwards) bits.push(`He collected ${t.individualAwards} individual award${t.individualAwards === 1 ? '' : 's'} along the way.`);
  if (t.caps) bits.push(`For his country he won ${t.caps} caps${t.intlGoals ? ` and scored ${t.intlGoals}` : ''}.`);
  bits.push(`He peaked at ${t.peakOvr} overall${t.peakAge ? ` around ${t.peakAge}` : ''}. Remembered as ${legacy.identities.map((i) => IDENTITY_LABEL[i as keyof typeof IDENTITY_LABEL] ?? i).join(' and ')}.`);
  return bits.join(' ');
}

function countBy(awards: { awardId: string; label?: string }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const a of awards) { const key = a.label ?? awardMeta(a.awardId)?.label ?? a.awardId; m.set(key, (m.get(key) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function Big({ label, value }: { label: string; value: string }) {
  return (
    <div><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-xl font-bold text-white tabular-nums">{value}</div></div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center"><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-lg font-semibold mt-0.5 text-white">{value}</div></div>
  );
}
